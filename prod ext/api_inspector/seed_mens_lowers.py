import sqlite3
import datetime
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "meesho_products.db")

PRODUCTS = [
    ("mens_lower_001", "Men Relaxed Fit Track Pants Navy Blue",      "https://meesho.com/p/mens-track-navy/7a8b1c",      349.0, 399.0, 13.0, 4.2, 1240, "YES", 12.0, "mens lowers"),
    ("mens_lower_002", "Men Cotton Jogger Pants Dark Grey Melange",  "https://meesho.com/p/mens-jogger-grey/8b9c2d",     399.0, 499.0, 20.0, 4.3, 985,  "YES", 14.0, "mens lowers"),
    ("mens_lower_003", "Men Regular Fit Pyjama Blue Check Print",    "https://meesho.com/p/mens-pyjama-blue/9c0d3e",     299.0, 349.0, 14.0, 4.1, 2310, "YES", 10.0, "mens lowers"),
    ("mens_lower_004", "Men Slim Fit Casual Trousers Olive Green",   "https://meesho.com/p/mens-trouser-olive/0d1e4f",   549.0, 699.0, 21.0, 4.4, 760,  "YES", 15.0, "mens lowers"),
    ("mens_lower_005", "Men Lounge Pants with Pockets Maroon",       "https://meesho.com/p/mens-lounge-maroon/1e2f5g",   279.0, 329.0, 15.0, 4.0, 1890, "YES", 11.0, "mens lowers"),
    ("mens_lower_006", "Men Cargo Jogger Pants Black Zip Pockets",   "https://meesho.com/p/mens-cargo-black/2f3g6h",     599.0, 799.0, 25.0, 4.5, 540,  "YES", 16.0, "mens lowers"),
    ("mens_lower_007", "Men Cotton Blend Lower Light Grey",          "https://meesho.com/p/mens-lower-grey/3g4h7i",      249.0, 299.0, 17.0, 4.0, 3420, "YES",  9.0, "mens lowers"),
    ("mens_lower_008", "Men Drawstring Pyjama White Stripes",        "https://meesho.com/p/mens-pyjama-stripes/4h5i8j",  319.0, 399.0, 20.0, 4.2, 1670, "YES", 12.0, "mens lowers"),
    ("mens_lower_009", "Men Sports Track Pant Royal Blue",           "https://meesho.com/p/mens-track-royal/5i6j9k",     449.0, 549.0, 18.0, 4.3, 920,  "YES", 13.0, "mens lowers"),
    ("mens_lower_010", "Men Printed Lounge Pant Camouflage Green",   "https://meesho.com/p/mens-lounge-camo/6j7k0l",     369.0, 449.0, 18.0, 4.1, 1450, "YES", 11.0, "mens lowers"),
    ("mens_lower_011", "Men Slim Fit Lycra Track Pants Charcoal",    "https://meesho.com/p/mens-lycra-charcoal/7k8l1m",  479.0, 599.0, 20.0, 4.4, 680,  "YES", 14.0, "mens lowers"),
    ("mens_lower_012", "Men Terry Cotton Jogger Rust Orange",        "https://meesho.com/p/mens-jogger-rust/8l9m2n",     429.0, 529.0, 19.0, 4.2, 810,  "YES", 13.0, "mens lowers"),
    ("mens_lower_013", "Men Fleece Lower with Zip Pockets Black",    "https://meesho.com/p/mens-fleece-black/9m0n3o",    499.0, 649.0, 23.0, 4.5, 430,  "YES", 15.0, "mens lowers"),
    ("mens_lower_014", "Men Regular Fit Cotton Lower Beige",         "https://meesho.com/p/mens-cotton-beige/0n1o4p",    259.0, 299.0, 13.0, 4.0, 2780, "YES", 10.0, "mens lowers"),
    ("mens_lower_015", "Men Elasticated Waist Casual Pant Teal",     "https://meesho.com/p/mens-casual-teal/1o2p5q",     389.0, 479.0, 19.0, 4.3, 1120, "YES", 12.0, "mens lowers"),
]

def seed():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    now = datetime.datetime.now().isoformat()

    c.execute("SELECT COUNT(*) FROM products")
    print(f"Total products before: {c.fetchone()[0]}")
    c.execute("SELECT COUNT(*) FROM products WHERE category='mens lowers'")
    print(f"Mens lowers before: {c.fetchone()[0]}")

    inserted = 0
    for pid, name, link, price, orig, disc, rating, rcnt, aff, comm, cat in PRODUCTS:
        c.execute("SELECT id FROM products WHERE product_id=?", (pid,))
        if c.fetchone():
            print(f"  SKIP: {name[:50]}")
            continue
        c.execute(
            """INSERT INTO products
               (product_id, name, product_link, price, original_price, discount_percent,
                rating, rating_count, affiliate_status, commission_percent, category,
                source, first_seen, last_seen)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (pid, name, link, price, orig, disc, rating, rcnt, aff, comm, cat, "SEED", now, now)
        )
        inserted += 1
        print(f"  SAVED #{inserted}: {name[:55]} | Rs{price} | {comm}%")

    conn.commit()
    c.execute("SELECT COUNT(*) FROM products WHERE category='mens lowers'")
    total = c.fetchone()[0]
    print(f"\n==> Done! Inserted {inserted}. Total mens lowers in DB: {total}")
    conn.close()

if __name__ == "__main__":
    seed()
