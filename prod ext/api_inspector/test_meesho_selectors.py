import time
from playwright.sync_api import sync_playwright

TEST_URL = "https://www.meesho.com/s/p/hki82u"

print(f"Testing URL: {TEST_URL}", flush=True)

with sync_playwright() as p:
    # Use same settings as enrich_products.py (non-headless, off-screen)
    browser = p.chromium.launch(
        headless=False,
        channel="chrome",
        args=["--window-position=-32000,-32000"]
    )
    page = browser.new_page()
    page.goto(TEST_URL, wait_until="domcontentloaded", timeout=20000)
    print("Page loaded (domcontentloaded), waiting 4s...", flush=True)
    time.sleep(4)

    print("\n--- All img srcs on page ---", flush=True)
    imgs = page.eval_on_selector_all("img", "els => els.map(e => e.src)")
    for src in imgs:
        print(f"  {src}", flush=True)

    print("\n--- Trying selectors ---", flush=True)
    selectors = [
        "img[src*='images.meesho.com/images/products']",
        "img[src*='meesho.com']",
        "img.sc-",
        "img[class*='product']",
        "div[class*='product'] img",
        "picture img",
        "img[loading]",
    ]
    for sel in selectors:
        try:
            el = page.query_selector(sel)
            if el:
                print(f"  FOUND [{sel}]: {el.get_attribute('src')}", flush=True)
            else:
                print(f"  none  [{sel}]", flush=True)
        except Exception as e:
            print(f"  ERR   [{sel}]: {e}", flush=True)

    print("\n--- Page title ---", flush=True)
    print(page.title(), flush=True)

    print("\n--- Price h4 ---", flush=True)
    h4 = page.query_selector("h4")
    if h4:
        print(h4.inner_text(), flush=True)

    browser.close()
print("Done.", flush=True)
