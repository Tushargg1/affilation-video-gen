import requests
import browser_cookie3
from bs4 import BeautifulSoup
import time

TEST_URL = "https://www.meesho.com/s/p/i0wab2"

print("Extracting Chrome cookies...", flush=True)
try:
    cj = browser_cookie3.chrome(domain_name='meesho.com')
    print(f"Extracted {len(cj)} cookies for meesho.com", flush=True)
except Exception as e:
    print(f"Failed to extract cookies: {e}", flush=True)
    cj = None

session = requests.Session()
if cj:
    session.cookies.update(cj)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

print(f"Testing URL with extracted cookies: {TEST_URL}", flush=True)
try:
    r = session.get(TEST_URL, headers=HEADERS, timeout=10)
    print(f"Status: {r.status_code}")
    soup = BeautifulSoup(r.text, "html.parser")
    title = soup.title.string if soup.title else None
    print(f"Title: {title}")

    # Check for image
    img = soup.find("meta", property="og:image")
    if img:
        print(f"og:image: {img.get('content')}")
    else:
        print("No og:image found.")

except Exception as e:
    print(f"Error: {e}")
