import time
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth

TEST_URL = "https://www.meesho.com/s/p/i0wab2"

print(f"Testing URL with Stealth: {TEST_URL}", flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=False,
        channel="chrome",
    )
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport={"width": 1280, "height": 900},
    )
    page = context.new_page()
    Stealth().apply_stealth_sync(page)

    page.goto(TEST_URL, wait_until="domcontentloaded", timeout=20000)
    time.sleep(3)
    title = page.title()
    print(f"Title: {title}", flush=True)

    imgs = page.eval_on_selector_all(
        "img[src*='images.meesho.com/images/products']",
        "els => els.map(e => e.src)"
    )
    print(f"Images found: {len(imgs)}")
    if imgs:
        print(f"First image: {imgs[0]}")

    browser.close()
