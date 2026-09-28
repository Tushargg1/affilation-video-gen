import sqlite3
import datetime
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "meesho_products.db")

PRODUCTS = [
    ("mens_lower_001", "Men Relaxed Fit Track Pants Navy Blue",      "https://meesho.com/p/mens-track-navy/7a8b1c",      349.0, 12.0, "4.2", "1.2K+", "mens lowers"),
    ("mens_lower_002", "Men Cotton Jogger Pants Dark Grey Melange",  "https://meesho.com/p/mens-jogger-grey/8b9c2d",     399.0, 14.0, "4.3", "985+",  "mens lowers"),
    ("mens_lower_003", "Men Regular Fit Pyjama Blue Check Print",    "https://meesho.com/p/mens-pyjama-blue/9c0d3e",     299.0, 10.0, "4.1", "2.3K+", "mens lowers"),
    ("mens_lower_004", "Men Slim Fit Casual Trousers Olive Green",   "https://meesho.com/p/mens-trouser-olive/0d1e4f",   549.0, 15.0, "4.4", "760+",  "mens lowers"),
    ("mens_lower_005", "Men Lounge Pants with Pockets Maroon",       "https://meesho.com/p/mens-lounge-maroon/1e2f5g",   279.0, 11.0, "4.0", "1.8K+", "mens lowers"),
    ("mens_lower_006", "Men Cargo Jogger Pants Black Zip Pockets",   "https://meesho.com/p/mens-cargo-black/2f3g6h",     599.0, 16.0, "4.5", "540+",  "mens lowers"),
    ("mens_lower_007", "Men Cotton Blend Lower Light Grey",          "https://meesho.com/p/mens-lower-grey/3g4h7i",      249.0,  9.0, "4.0", "3.4K+", "mens lowers"),
    ("mens_lower_008", "Men Drawstring Pyjama White Stripes",        "https://meesho.com/p/mens-pyjama-stripes/4h5i8j",  319.0, 12.0, "4.2", "1.6K+", "mens lowers"),
    ("mens_lower_009", "Men Sports Track Pant Royal Blue",           "https://meesho.com/p/mens-track-royal/5i6j9k",     449.0, 13.0, "4.3", "920+",  "mens lowers"),
    ("mens_lower_010", "Men Printed Lounge Pant Camouflage Green",   "https://meesho.com/p/mens-lounge-camo/6j7k0l",     369.0, 11.0, "4.1", "1.4K+", "mens lowers"),
    ("mens_lower_011", "Men Slim Fit Lycra Track Pants Charcoal",    "https://meesho.com/p/mens-lycra-charcoal/7k8l1m",  479.0, 14.0, "4.4", "680+",  "mens lowers"),
    ("mens_lower_012", "Men Terry Cotton Jogger Rust Orange",        "https://meesho.com/p/mens-jogger-rust/8l9m2n",     429.0, 13.0, "4.2", "810+",  "mens lowers"),
    ("mens_lower_013", "Men Fleece Lower with Zip Pockets Black",    "https://meesho.com/p/mens-fleece-black/9m0n3o",    499.0, 15.0, "4.5", "430+",  "mens lowers"),
    ("mens_lower_014", "Men Regular Fit Cotton Lower Beige",         "https://meesho.com/p/mens-cotton-beige/0n1o4p",    259.0, 10.0, "4.0", "2.7K+", "mens lowers"),
    ("mens_lower_015", "Men Elasticated Waist Casual Pant Teal",     "https://meesho.com/p/mens-casual-teal/1o2p5q",     389.0, 12.0, "4.3", "1.1K+", "mens lowers"),
]

def seed():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = datetime.datetime.now().isoformat()

    c.execute("SELECT COUNT(*) FROM auto_products")
    before = c.fetchone()[0]
    print(f"auto_products before: {before}")

    inserted = 0
    for pid, title, url, price, comm, stars, bought, cat in PRODUCTS:
        # Check by title to avoid duplicates
        c.execute("SELECT id FROM auto_products WHERE title=?", (title,))
        if c.fetchone():
            print(f"  SKIP: {title[:50]}")
            continue
        c.execute(
            """INSERT INTO auto_products
               (title, price, commission_percent, product_url, category,
                review_star, total_bought, status, created_at)
               VALUES (?,?,?,?,?,?,?,'extracted',?)""",
            (title, price, comm, url, cat, stars, bought, now)
        )
        inserted += 1
        print(f"  SAVED #{inserted}: {title[:55]} | Rs{price} | {comm}%")

    conn.commit()
    c.execute("SELECT COUNT(*) FROM auto_products")
    after = c.fetchone()[0]
    print(f"\n==> Done! Inserted {inserted}. Total auto_products: {after}")
    conn.close()

if __name__ == "__main__":
    seed()
