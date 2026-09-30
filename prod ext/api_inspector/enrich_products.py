import sqlite3
import time
import os
import re
from playwright.sync_api import sync_playwright

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "meesho_products.db")

def enrich_single_product(page, url):
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=15000)
        time.sleep(2.5) # Wait for elements
        
        # Image
        img_elem = page.query_selector("img[src*='images.meesho.com/images/products']")
        img_url = img_elem.get_attribute("src") if img_elem else None
        if img_url and "?" in img_url:
            img_url = img_url.split("?")[0] # Get full res image
            
        # Price
        price = None
        price_h4 = page.query_selector("h4:has-text('₹')")
        if price_h4:
            price_text = price_h4.inner_text().replace('₹', '').replace(',', '').strip()
            match = re.search(r'\d+', price_text)
            if match:
                price = float(match.group())

        # Rating and Reviews
        rating = None
        reviews = None
        spans = page.query_selector_all("span")
        for s in spans:
            t = s.inner_text().strip()
            if len(t) == 3 and t[1] == '.' and t[0].isdigit():
                rating = t
            if "Ratings," in t and "Reviews" in t:
                reviews = t
                break
        
        return {
            "image_url": img_url,
            "price": price,
            "rating": rating,
            "reviews": reviews
        }
    except Exception as e:
        print(f"Error extracting {url}: {e}")
        return None

def run_enrichment_loop():
    print("Starting Background Product Enrichment Daemon...")
    with sync_playwright() as p:
        # Hide window off-screen to prevent distraction
        browser = p.chromium.launch(headless=False, channel="chrome", args=["--window-position=-32000,-32000"])
        page = browser.new_page()
        
        while True:
            try:
                conn = sqlite3.connect(DB_PATH)
                cur = conn.cursor()
                # Find up to 10 products that haven't been enriched yet
                cur.execute("SELECT id, product_url FROM auto_products WHERE image_url IS NULL AND product_url IS NOT NULL LIMIT 10")
                rows = cur.fetchall()
                
                if not rows:
                    conn.close()
                    time.sleep(10)
                    continue
                    
                for row_id, url in rows:
                    print(f"Enriching product #{row_id}: {url}")
                    data = enrich_single_product(page, url)
                    if data and data['image_url']:
                        print(f" -> Found Image: {data['image_url']} | Rating: {data['rating']}")
                        
                        updates = ["image_url = ?"]
                        params = [data['image_url']]
                        
                        if data['rating']:
                            updates.append("review_star = ?")
                            params.append(data['rating'])
                            
                        if data['reviews']:
                            updates.append("total_bought = ?")
                            params.append(data['reviews'])
                            
                        if data['price']:
                            updates.append("price = ?")
                            params.append(data['price'])
                            
                        params.append(row_id)
                        
                        query = f"UPDATE auto_products SET {', '.join(updates)} WHERE id = ?"
                        cur.execute(query, tuple(params))
                        conn.commit()
                    else:
                        print(" -> Failed to extract key details. Will retry later or skip.")
                        # Mark it as failed so we don't infinitely loop on it immediately
                        cur.execute("UPDATE auto_products SET image_url = 'FAILED' WHERE id = ?", (row_id,))
                        conn.commit()
                        
                conn.close()
            except Exception as e:
                print(f"Database error: {e}")
                time.sleep(5)
                
if __name__ == "__main__":
    run_enrichment_loop()
