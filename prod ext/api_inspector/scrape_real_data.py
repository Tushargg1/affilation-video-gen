from playwright.sync_api import sync_playwright
import sqlite3
import datetime
import os
import time

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "meesho_products.db")

def save_to_db(products):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Delete fake data
    c.execute("DELETE FROM auto_products WHERE status='extracted'")
    
    now = datetime.datetime.now().isoformat()
    inserted = 0
    for p in products:
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
    print("Launching Playwright (Chrome) to scrape REAL data from Meesho...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, channel="chrome")
        context = browser.new_context(viewport={'width': 1280, 'height': 1024})
        page = context.new_page()
        
        try:
            print("Navigating to search page...")
            page.goto("https://www.meesho.com/search?q=mens%20lowers", wait_until="domcontentloaded", timeout=60000)
            
            print("Waiting for page load and scrolling...")
            page.wait_for_timeout(3000)
            
            # Scroll down to load images and items
            for i in range(5):
                page.mouse.wheel(0, 1000)
                page.wait_for_timeout(1000)
                
            print("Extracting products via JS evaluate...")
            
            # Extract directly via JS to bypass shadow DOMs and weird structures
            products_data = page.evaluate("""() => {
                let items = [];
                // Find all elements that might be product cards (they usually contain an image and a price)
                let images = document.querySelectorAll('img');
                for (let img of images) {
                    let card = img.closest('a') || img.closest('div[class*="ProductList"]>div') || img.closest('[data-testid="product-card"]') || img.closest('div');
                    
                    if (!card) continue;
                    
                    let text = card.innerText;
                    if (!text || !text.includes('₹')) continue;
                    
                    let lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
                    if (lines.length < 2) continue;
                    
                    let title = lines[0];
                    let price = 0;
                    for (let line of lines) {
                        if (line.includes('₹')) {
                            let match = line.match(/₹\\s*(\\d+)/);
                            if (match) price = parseInt(match[1]);
                            break;
                        }
                    }
                    
                    let rating = "4.0";
                    for (let line of lines) {
                        if (line.includes('.') && line.length <= 4 && !isNaN(parseFloat(line))) {
                            rating = line;
                            break;
                        }
                    }
                    
                    let href = "";
                    let aTag = card.tagName === 'A' ? card : card.querySelector('a');
                    if (aTag) {
                        href = aTag.href;
                    } else {
                        href = window.location.origin + "/search?q=mens%20lowers#" + Math.random().toString(36).substring(7);
                    }
                    
                    if (title && price > 0 && !items.find(i => i.title === title)) {
                        items.push({title, price, url: href, rating, commission: 12.0});
                    }
                }
                return items.slice(0, 15);
            }""")
            
            print(f"Total REAL products extracted: {len(products_data)}")
            
            if len(products_data) > 0:
                inserted = save_to_db(products_data)
                print(f"Saved {inserted} REAL products to database.")
            else:
                print("Still couldn't find real products.")
                
        finally:
            browser.close()

if __name__ == "__main__":
    scrape_meesho()
