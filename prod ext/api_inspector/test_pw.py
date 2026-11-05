from playwright.sync_api import sync_playwright
import time

def test_pw():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, channel="chrome")
        page = browser.new_page()
        try:
            page.goto("https://www.meesho.com/s/p/fm8xrz", wait_until="domcontentloaded")
            time.sleep(3)
            with open("meesho_pdp.html", "w", encoding="utf-8") as f:
                f.write(page.content())
            print("Dumped HTML.")
        except Exception as e:
            print(e)
        finally:
            browser.close()

if __name__ == "__main__":
    test_pw()
