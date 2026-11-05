import sqlite3
conn = sqlite3.connect(r'data/meesho_products.db')
c = conn.cursor()
c.execute("SELECT COUNT(*) FROM products")
print('Total products:', c.fetchone()[0])
c.execute("SELECT COUNT(*) FROM products WHERE category='mens lowers'")
print('Mens lowers:', c.fetchone()[0])
c.execute("SELECT name, price, commission_percent FROM products WHERE category='mens lowers' ORDER BY id")
for row in c.fetchall():
    print(f'  {str(row[0])[:50]} | Rs{row[1]} | {row[2]}%')
conn.close()
