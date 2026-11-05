import sys, time

print("Testing psycopg2...", flush=True)
try:
    import psycopg2
    conn = psycopg2.connect("postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require")
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM auto_products WHERE image_url IS NULL")
    count = cur.fetchone()[0]
    print(f"Pending enrichment: {count}", flush=True)
    cur.execute("SELECT id, product_url FROM auto_products WHERE image_url IS NULL LIMIT 3")
    rows = cur.fetchall()
    for r in rows:
        print(f"  Sample: id={r[0]} url={r[1]}", flush=True)
    conn.close()
    print("DB OK", flush=True)
except Exception as e:
    print(f"DB ERROR: {e}", flush=True)
    sys.exit(1)

print("\nTesting playwright (headless)...", flush=True)
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        page = browser.new_page()
        test_url = "https://www.meesho.com/s/p/hyhof4"
        print(f"Navigating to {test_url}", flush=True)
        page.goto(test_url, wait_until="domcontentloaded", timeout=20000)
        time.sleep(3)
        img = page.query_selector("img[src*='images.meesho.com/images/products']")
        if img:
            src = img.get_attribute("src")
            print(f"Image found: {src}", flush=True)
        else:
            print("No image found — trying all imgs:", flush=True)
            imgs = page.query_selector_all("img")
            for i in imgs[:5]:
                print(f"  img src: {i.get_attribute('src')}", flush=True)
        browser.close()
    print("Playwright OK", flush=True)
except Exception as e:
    print(f"Playwright ERROR: {type(e).__name__}: {e}", flush=True)
