"""Quick test: launch real Chrome profile and visit a Meesho product page."""
import time
from playwright.sync_api import sync_playwright

CHROME_USER_DATA = r"C:\Users\tusha\AppData\Local\Google\Chrome\User Data"
CHROME_PROFILE   = "Profile 2"
TEST_URL = "https://www.meesho.com/s/p/i0wab2"

with sync_playwright() as p:
    print("Launching real Chrome with Profile 2...", flush=True)
    context = p.chromium.launch_persistent_context(
        user_data_dir=CHROME_USER_DATA,
        channel="chrome",
        headless=False,
        args=[
            f"--profile-directory={CHROME_PROFILE}",
            "--window-position=-32000,-32000",
            "--disable-blink-features=AutomationControlled",
            "--no-first-run",
            "--no-default-browser-check",
        ],
    )
    page = context.new_page()

    print(f"Navigating to {TEST_URL}", flush=True)
    page.goto(TEST_URL, wait_until="domcontentloaded", timeout=20000)
    time.sleep(4)

    title = page.title()
    url   = page.url
    print(f"Title: {title}", flush=True)
    print(f"Final URL: {url}", flush=True)

    imgs = page.eval_on_selector_all(
        "img[src*='images.meesho.com/images/products']",
        "els => els.map(e => e.src)"
    )
    print(f"Product images found: {len(imgs)}", flush=True)
    for s in imgs[:5]:
        print(f"  {s}", flush=True)

    context.close()

print("Done.", flush=True)
