import sqlite3
conn = sqlite3.connect(r'data/meesho_products.db')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
print('Tables:', [r[0] for r in c.fetchall()])
conn.close()
