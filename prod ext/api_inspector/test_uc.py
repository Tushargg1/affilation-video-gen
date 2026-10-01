import undetected_chromedriver as uc
import time
from bs4 import BeautifulSoup

TEST_URL = "https://www.meesho.com/s/p/i15e4l"

print(f"Testing URL with undetected-chromedriver: {TEST_URL}", flush=True)

options = uc.ChromeOptions()
options.add_argument("--window-size=1280,900")

# Note: Using Profile 3 so it doesn't conflict
options.add_argument(r"--user-data-dir=C:\Users\tusha\.meesho_uc_profile")

try:
    driver = uc.Chrome(options=options)
    driver.get(TEST_URL)
    time.sleep(5)
    
    title = driver.title
    print(f"Title: {title}", flush=True)
    
    # Scroll to trigger lazy loading
    driver.execute_script("window.scrollTo(0, 500);")
    time.sleep(2)
    
    html = driver.page_source
    soup = BeautifulSoup(html, "html.parser")
    
    # Get all images
    imgs = soup.find_all("img")
    for img in imgs:
        src = img.get('src')
        if src and "images.meesho.com/images/products" in src:
            print(f"Product Image: {src}")
            break
            
    # Also extract price
    h4s = soup.find_all("h4")
    for pt in h4s:
        print(f"H4: {pt.text}")
        
    driver.quit()
except Exception as e:
    print(f"Error: {e}")
