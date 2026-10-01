import requests
from bs4 import BeautifulSoup
import time, re

TEST_URLS = [
    "https://www.meesho.com/s/p/i0wab2",
    "https://www.meesho.com/s/p/hki82u",
    "https://www.meesho.com/s/p/hrrxat",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}

session = requests.Session()
session.headers.update(HEADERS)

for url in TEST_URLS:
    print(f"\nTesting: {url}", flush=True)
    try:
        r = session.get(url, allow_redirects=True, timeout=10)
        print(f"  Status: {r.status_code} | Final URL: {r.url}", flush=True)
        soup = BeautifulSoup(r.text, "html.parser")

        # Try og:image
        og = soup.find("meta", property="og:image")
        print(f"  og:image = {og['content'] if og else None}", flush=True)

        # Try og:price
        price_meta = soup.find("meta", property="product:price:amount")
        print(f"  og:price = {price_meta['content'] if price_meta else None}", flush=True)

        # Try page title
        print(f"  Title = {soup.title.string if soup.title else None}", flush=True)

    except Exception as e:
        print(f"  ERROR: {type(e).__name__}: {e}", flush=True)
    time.sleep(1)

print("\nDone.", flush=True)
