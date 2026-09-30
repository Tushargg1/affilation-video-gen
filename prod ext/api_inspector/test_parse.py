from bs4 import BeautifulSoup

with open("meesho_pdp.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, "html.parser")

img = soup.find("img", src=lambda x: x and "images.meesho.com/images/products" in x)
print("Image:", img['src'] if img else None)

# Rating usually inside a span or div with a star
spans = soup.find_all("span")
for s in spans:
    t = s.text.strip()
    if len(t) == 3 and t[1] == "." and t[0].isdigit():
        print("Rating:", t)
        break

# Reviews count
for s in spans:
    t = s.text.strip()
    if "Reviews" in t or "Ratings" in t:
        print("Reviews Text:", t)

# Bought / Sold
for s in soup.find_all(string=True):
    if "bought" in s.lower() or "sold" in s.lower():
        print("Bought Text:", s.strip())
