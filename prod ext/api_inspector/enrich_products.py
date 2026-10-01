# enrich_products.py - Product data enrichment daemon
# Uses undetected-chromedriver with injected real Chrome cookies to bypass Akamai.
# Automatically extracts: product name, first image, price, star rating, review count.
# Runs in a loop -- processes all products missing data, then waits for new ones.

import psycopg2
import time
import os
import random
import shutil
import subprocess
import sys
from pathlib import Path

import undetected_chromedriver as uc

DB_URL = "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
ENRICH_PROFILE = r"C:\Users\tusha\.meesho_uc_profile"
CHROME_COOKIES_SRC = r"C:\Users\tusha\AppData\Local\Google\Chrome\User Data\Profile 2\Network\Cookies"

def log(msg):
    print(msg, flush=True)

def get_db():
    return psycopg2.connect(DB_URL)

def sync_cookies():
    """Copy real Chrome cookies into the UC profile to bypass Akamai."""
    try:
        dest = Path(ENRICH_PROFILE) / "Default" / "Network"
        dest.mkdir(parents=True, exist_ok=True)
        src = Path(CHROME_COOKIES_SRC)
        if src.exists():
            shutil.copy2(str(src), str(dest / "Cookies"))
            log("[OK] Cookies synced from real Chrome profile.")
        else:
            log("[WARN] Chrome cookies file not found -- using existing cached cookies.")
    except Exception as e:
        log(f"[WARN] Cookie sync skipped (Chrome may be open, using cached): {e}")

def kill_existing():
    """Kill any stale chromedriver or chrome instances that might hold the profile lock."""
    try:
        subprocess.run(
            ["taskkill", "/F", "/IM", "undetected_chromedriver.exe", "/T"],
            capture_output=True
        )
        subprocess.run(
            ["taskkill", "/F", "/IM", "chrome.exe", "/T"],
            capture_output=True
        )
    except Exception:
        pass

# JavaScript extraction script -- stored separately to avoid Python escape issues
# NOTE: No IIFE wrapper! Selenium execute_script requires a top-level 'return'.
JS_EXTRACT = """
var name = null;
var imgUrl = null;
var price = null;
var rating = null;
var reviews = null;

// 1. Try JSON-LD (Schema.org Product)
try {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
        var raw = scripts[i].innerText;
        var data = JSON.parse(raw);
        var items = Array.isArray(data) ? data : [data];
        
        if (!Array.isArray(data) && data['@graph']) {
            items = data['@graph'];
        }
        
        for (var j = 0; j < items.length; j++) {
            var item = items[j];
            if (item['@type'] === 'Product' || item['@type'] === 'ProductGroup') {
                if (!name && item.name) name = item.name;
                if (!imgUrl && item.image) {
                    imgUrl = Array.isArray(item.image) ? item.image[0] : item.image;
                    if (typeof imgUrl === 'object' && imgUrl.url) imgUrl = imgUrl.url;
                }
                if (!price && item.offers) {
                    var offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
                    if (offer.price) price = offer.price;
                }
                if (!rating && item.aggregateRating) {
                    rating = item.aggregateRating.ratingValue;
                    reviews = item.aggregateRating.reviewCount;
                }
            }
        }
    }
} catch(e) {}

// 2. Try OpenGraph / Meta tags
if (!name) {
    var ogTitle = document.querySelector('meta[property="og:title"], meta[name="og:title"], meta[name="twitter:title"]');
    if (ogTitle) name = ogTitle.content;
}
if (!imgUrl) {
    var ogImg = document.querySelector('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]');
    if (ogImg) imgUrl = ogImg.content;
}
if (!price) {
    var ogPrice = document.querySelector('meta[property="product:price:amount"], meta[name="product:price:amount"]');
    if (ogPrice) price = ogPrice.content;
}

// 3. Fallback to generic & Meesho DOM scraping
if (!name) {
    var nameEls = ['h1', '[class*="ProductTitle"]', '[class*="product-title"]', '[class*="pdp-title"]', 'span[class*="Title"]'];
    for (var i = 0; i < nameEls.length; i++) {
        var el = document.querySelector(nameEls[i]);
        if (el && el.innerText && el.innerText.trim().length > 5) {
            name = el.innerText.trim();
            break;
        }
    }
    if (!name && document.title) {
        name = document.title.replace(/\\|.*|-.*|Buy.*/i, '').trim();
    }
}

if (!imgUrl) {
    var imgs = document.querySelectorAll('img');
    for (var j = 0; j < imgs.length; j++) {
        var src = imgs[j].src || imgs[j].getAttribute('data-src') || '';
        if (src && (src.indexOf('images.meesho.com/images/products') !== -1 || src.indexOf('media/catalog') !== -1 || src.indexOf('images-na.ssl-images-amazon') !== -1 || src.indexOf('rukminim') !== -1)) {
            imgUrl = src;
            break;
        }
    }
    if (!imgUrl) {
        for (var k = 0; k < imgs.length; k++) {
            var src = imgs[k].src || imgs[k].getAttribute('data-src') || '';
            if (src && imgs[k].width > 200 && imgs[k].height > 200 && src.indexOf('logo') === -1) {
                imgUrl = src;
                break;
            }
        }
    }
}

if (!price) {
    var priceSelectors = ['h4', '[class*="price"]', '[class*="Price"]', 'strong'];
    for (var k = 0; k < priceSelectors.length && !price; k++) {
        var priceEls = document.querySelectorAll(priceSelectors[k]);
        for (var m = 0; m < priceEls.length && !price; m++) {
            var txt = priceEls[m].innerText || '';
            var digits = txt.replace(/,/g, '').match(/[0-9]+/);
            if (digits) {
                var num = parseInt(digits[0]);
                if (num > 10 && num < 1000000) {
                    price = num;
                    break;
                }
            }
        }
        if (price) break;
    }
}

if (!rating) {
    var spans = document.querySelectorAll('span, div');
    for (var n = 0; n < spans.length; n++) {
        var t = (spans[n].innerText || '').trim();
        if (t.length === 3 && t.charAt(1) === '.' &&
            t.charAt(0) >= '1' && t.charAt(0) <= '5' &&
            t.charAt(2) >= '0' && t.charAt(2) <= '9') {
            rating = t;
            break;
        }
    }
}

if (!reviews) {
    var allEls = document.querySelectorAll('span, p');
    for (var p2 = 0; p2 < allEls.length; p2++) {
        var st = (allEls[p2].innerText || '').trim();
        if (st.indexOf('\\n') === -1 && st.length < 40 && (
            (st.indexOf('Rating') !== -1 && st.match(/[0-9]/)) ||
            (st.indexOf('Review') !== -1 && st.match(/[0-9]/))
        )) {
            reviews = st;
            break;
        }
    }
}

if (price) price = parseInt(String(price).replace(/[^0-9]/g, ''), 10);

return { name: name, imgUrl: imgUrl, price: price, rating: rating, reviews: reviews };
"""


def enrich_one(driver, row_id, url):
    """
    Navigate to the product page and extract image, name, price, rating, reviews.
    Returns dict, "blocked", or None.
    """
    try:
        driver.get(url)
        time.sleep(4)

        page_title = driver.title
        if "Access Denied" in page_title or "403" in page_title:
            log(f"  -> ACCESS DENIED -- Akamai blocked us.")
            return "blocked"

        # Scroll to trigger lazy-loaded images
        driver.execute_script("window.scrollTo(0, 300);")
        time.sleep(1)

        # Wait longer for React/dynamic content to render
        time.sleep(3)

        data = None
        try:
            data = driver.execute_script(JS_EXTRACT)
        except Exception as js_err:
            log(f"  -> JS error: {js_err}")
            data = None

        if data is None:
            log(f"  -> JS returned None -- page may not have loaded properly")
            return None

        log(f"  -> name={str(data.get('name') or '')[:40]} | img={'OK' if data.get('imgUrl') else 'None'} | price={data.get('price')} | rating={data.get('rating')} | reviews={str(data.get('reviews') or '')[:30]}")

        if not data.get('imgUrl'):
            log(f"  -> No product image found on page. Marking FAILED.")
            return {
                "image_url": "FAILED",
                "title": data.get("name"),
                "price": data.get("price"),
                "rating": data.get("rating"),
                "reviews": data.get("reviews"),
            }

        return {
            "image_url": data.get("imgUrl"),
            "title": data.get("name"),
            "price": data.get("price"),
            "rating": data.get("rating"),
            "reviews": data.get("reviews"),
        }

    except Exception as e:
        log(f"  -> ERROR {type(e).__name__}: {e}")
        return None


def run_enrichment_loop():
    log("=" * 60)
    log("Product Enrichment Daemon -- Auto Chrome (undetected)")
    log(f"Profile: {ENRICH_PROFILE}")
    log("=" * 60)

    # Step 1: Kill stale drivers
    kill_existing()
    time.sleep(1)

    # Step 2: Sync real Chrome cookies to bypass Akamai
    sync_cookies()

    # Step 3: Launch undetected Chrome
    os.makedirs(ENRICH_PROFILE, exist_ok=True)
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1280,900")
    options.add_argument(f"--user-data-dir={ENRICH_PROFILE}")

    try:
        log("\nLaunching Chrome browser...")
        driver = uc.Chrome(options=options)
        log("Chrome launched successfully!")
    except Exception as e:
        log(f"FATAL: Failed to launch Chrome: {e}")
        return

    # Warmup visit to establish session
    log("\nWarm-up: opening Meesho homepage...")
    try:
        driver.get("https://www.meesho.com")
        time.sleep(5)
        log(f"Warmup OK -- Title: {driver.title}")
    except Exception as e:
        log(f"Warmup error (continuing): {e}")

    block_sleep = 300   # 5 min sleep when blocked
    consecutive_blocked = 0

    log("\nStarting product enrichment loop. Will process all pending products...\n")

    while True:
        try:
            conn = get_db()
            cur = conn.cursor()
            cur.execute("""
                SELECT id, product_url FROM auto_products
                WHERE (image_url IS NULL OR image_url = 'FAILED')
                AND product_url IS NOT NULL
                LIMIT 10
            """)
            rows = cur.fetchall()

            if not rows:
                conn.close()
                log("\nNo pending products. Sleeping 30s and checking again...")
                time.sleep(30)
                continue

            log(f"\n--- Batch: {len(rows)} product(s) to enrich ---")

            for row_id, url in rows:
                log(f"\n[#{row_id}] {url}")
                result = enrich_one(driver, row_id, url)

                if result == "blocked":
                    consecutive_blocked += 1
                    log(f"  Blocked {consecutive_blocked} time(s). Sleeping {block_sleep // 60} min...")
                    conn.close()
                    time.sleep(block_sleep)
                    break

                elif result and result.get("image_url"):
                    consecutive_blocked = 0
                    updates = ["image_url = %s"]
                    params = [result["image_url"]]

                    if result.get("title"):
                        updates.append("title = %s")
                        params.append(result["title"])
                    if result.get("rating"):
                        updates.append("review_star = %s")
                        params.append(result["rating"])
                    if result.get("reviews"):
                        updates.append("total_bought = %s")
                        params.append(result["reviews"])
                    if result.get("price"):
                        updates.append("price = %s")
                        params.append(float(result["price"]))

                    params.append(row_id)
                    cur.execute(
                        f"UPDATE auto_products SET {', '.join(updates)} WHERE id = %s",
                        tuple(params)
                    )
                    conn.commit()
                    log(f"  -> SAVED to DB: image, title, price, rating, reviews")

                else:
                    log(f"  -> Extraction failed -- will retry next loop.")

                delay = random.uniform(4, 10)
                log(f"  (waiting {delay:.1f}s...)")
                time.sleep(delay)

            else:
                conn.close()

        except Exception as e:
            log(f"Loop error: {type(e).__name__}: {e}")
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(15)


if __name__ == "__main__":
    run_enrichment_loop()
