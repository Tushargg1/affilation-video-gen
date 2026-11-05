import time
from playwright.sync_api import sync_playwright

TEST_URL = "https://www.meesho.com/s/p/i0wab2"

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=False,
        channel="chrome",
        args=["--window-position=-32000,-32000"]
    )
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport={"width": 1280, "height": 900},
    )
    page = context.new_page()

    print(f"Navigating to {TEST_URL}", flush=True)
    try:
        page.goto(TEST_URL, wait_until="domcontentloaded", timeout=25000)
    except Exception as e:
        print(f"goto error: {e}", flush=True)

    time.sleep(5)

    # Check what actually loaded
    final_url = page.url
    title = page.title()
    print(f"Final URL: {final_url}", flush=True)
    print(f"Title: {title}", flush=True)

    # Screenshot
    page.screenshot(path="debug_page.png", full_page=False)
    print("Screenshot saved to debug_page.png", flush=True)

    # Check all imgs
    imgs = page.eval_on_selector_all("img", "els => els.map(e => e.src)")
    print(f"\nAll img srcs ({len(imgs)}):", flush=True)
    for s in imgs[:10]:
        print(f"  {s}", flush=True)

    # Page text snippet (first 500 chars)
    body = page.inner_text("body")
    print(f"\nBody text (first 500):\n{body[:500]}", flush=True)

    browser.close()
print("Done.", flush=True)
