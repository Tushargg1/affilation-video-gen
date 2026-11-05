from playwright.sync_api import sync_playwright
import sqlite3
import datetime
import os
import time

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "meesho_products.db")

def setup_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS auto_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT, price REAL, commission_percent REAL, product_url TEXT,
            category TEXT, review_star TEXT, total_bought TEXT, status TEXT, created_at TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

def save_to_db(products):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = datetime.datetime.now().isoformat()
    inserted = 0
    for p in products:
        c.execute("SELECT id FROM auto_products WHERE title=? AND category=?", (p['title'], 'mens lowers'))
        if not c.fetchone():
            c.execute(
                """INSERT INTO auto_products
                   (title, price, commission_percent, product_url, category, review_star, total_bought, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (p['title'], p['price'], p['commission'], p['url'], 'mens lowers', p['rating'], '100+', 'extracted', now)
            )
            inserted += 1
    conn.commit()
    conn.close()
    return inserted

def scrape_meesho():
    print("Launching Playwright (Chrome) to scrape Meesho...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, channel="chrome") # Use installed Chrome
        context = browser.new_context(viewport={'width': 1280, 'height': 1024})
        page = context.new_page()
        
        try:
            print("Navigating to search page...")
            page.goto("https://www.meesho.com/search?q=mens%20lowers", wait_until="domcontentloaded", timeout=60000)
            
            print("Waiting for page load and scrolling...")
            page.wait_for_timeout(5000)
            page.screenshot(path="meesho_web_debug.png")
            
            # Scroll down to load images and items
            for i in range(5):
                page.mouse.wheel(0, 1000)
                page.wait_for_timeout(2000)
                
            print("Extracting products...")
            # Get all anchor tags
            cards = page.query_selector_all("a")
            
            products = []
            seen_urls = set()
            
            for card in cards:
                if len(products) >= 12:
                    break
                    
                try:
                    url = card.get_attribute('href')
                    if not url or url in seen_urls:
                        continue
                        
                    # Filter for product links
                    if '/p/' not in url and '/s/p/' not in url and '-p-' not in url:
                        continue
                        
                    # Prepend base url if relative
                    if url.startswith('/'):
                        url = "https://www.meesho.com" + url
                        
                    text = card.inner_text()
                    if not text:
                        continue
                        
                    lines = [line.strip() for line in text.split('\n') if line.strip()]
                    
                    if len(lines) < 2:
                        continue
                        
                    title = lines[0]
                    price = 0
                    
                    for line in lines:
                        if '₹' in line:
                            try:
                                price_str = line.replace('₹', '').replace(',', '').strip()
                                price = float(price_str.split()[0])
                                break
                            except:
                                pass
                                
                    if not title or price == 0:
                        continue
                        
                    commission = 10.0
                    rating = "4.0"
                    
                    for line in lines:
                        if "." in line and len(line) <= 3 and line.replace('.', '', 1).isdigit():
                            rating = line
                            break
                            
                    products.append({
                        'title': title,
                        'price': price,
                        'commission': commission,
                        'url': url,
                        'rating': rating
                    })
                    seen_urls.add(url)
                    print(f"Found: {title[:30]}... | Rs {price}")
                    
                except Exception as e:
                    continue
                    
            print(f"Total extracted: {len(products)}")
            if products:
                # Delete existing fake seeded data first if we found real ones
                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                c.execute("DELETE FROM auto_products WHERE status='extracted'")
                conn.commit()
                conn.close()
                
                inserted = save_to_db(products)
                print(f"Saved {inserted} new products to database.")
            else:
                print("No products found. Dumping HTML for debugging...")
                with open("meesho_debug.html", "w", encoding="utf-8") as f:
                    f.write(page.content())
                
        finally:
            browser.close()

if __name__ == "__main__":
    setup_db()
    scrape_meesho()
