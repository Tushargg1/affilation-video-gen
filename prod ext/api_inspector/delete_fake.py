import sqlite3
conn = sqlite3.connect(r'data/meesho_products.db')
c = conn.cursor()
c.execute("DELETE FROM auto_products WHERE category='mens lowers' OR title LIKE 'Men %'")
deleted = c.rowcount
conn.commit()
c.execute('SELECT COUNT(*) FROM auto_products')
remaining = c.fetchone()[0]
print(f'Deleted {deleted} fake seeded rows. Remaining auto_products: {remaining}')
conn.close()
