import sqlite3, sys
conn = sqlite3.connect(r'c:\Users\tusha\OneDrive\Desktop\affilation video gen\prod ext\api_inspector\data\meesho_products.db')
c = conn.cursor()
c.execute("SELECT count(*) FROM auto_products")
count = c.fetchone()[0]
print(f"Total in DB: {count}")
c.execute("SELECT id, title, price, commission_percent FROM auto_products ORDER BY id DESC LIMIT 5")
for r in c.fetchall():
    print(r)
