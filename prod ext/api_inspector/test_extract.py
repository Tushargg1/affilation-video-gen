"""Quick test script: launch Chrome, navigate to product, run extraction JS, print results."""
import time
import undetected_chromedriver as uc

ENRICH_PROFILE = r"C:\Users\tusha\.meesho_uc_profile"
TEST_URL = "https://www.meesho.com/s/p/i490f9"

# Minimal JS -- just test what executes
JS_SIMPLE = """
return {
    title: document.title,
    url: window.location.href,
    imgCount: document.querySelectorAll('img').length,
    h1: document.querySelector('h1') ? document.querySelector('h1').innerText : null
};
"""

JS_IMAGES = """
var imgs = document.querySelectorAll('img');
var meeshoImgs = [];
for (var i = 0; i < imgs.length; i++) {
    var src = imgs[i].src || '';
    if (src && src.indexOf('images.meesho.com') !== -1) {
        meeshoImgs.push(src);
    }
}
return { count: meeshoImgs.length, all: meeshoImgs.slice(0, 10) };
"""

def main():
    print("Launching Chrome...")
    options = uc.ChromeOptions()
    options.add_argument(f"--user-data-dir={ENRICH_PROFILE}")
    options.add_argument("--window-size=1280,900")
    driver = uc.Chrome(options=options)
    print("Chrome launched!")

    print(f"\nNavigating to {TEST_URL}...")
    driver.get(TEST_URL)
    print("Waiting 6s for page load...")
    time.sleep(6)
    print(f"Title: {driver.title}")

    print("\n--- Test 1: Simple JS ---")
    result = driver.execute_script(JS_SIMPLE)
    print("Result:", result)

    print("\n--- Test 2: Image JS ---")
    img_result = driver.execute_script(JS_IMAGES)
    print("Image Result:", img_result)

    print("\n--- Test 3: Page source check ---")
    src = driver.page_source
    print(f"Page source length: {len(src)}")
    print(f"Contains 'images.meesho.com': {'images.meesho.com' in src}")
    print(f"Contains 'Access Denied': {'Access Denied' in src}")

    input("\nPress Enter to close Chrome...")
    driver.quit()

if __name__ == "__main__":
    main()
