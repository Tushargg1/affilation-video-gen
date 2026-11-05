import sqlite3
import sys
import os

if len(sys.argv) < 2:
    print("No IDs provided")
    sys.exit(1)

ids = sys.argv[1].split(',')
db_path = os.path.join(os.path.dirname(__file__), '../../data/meesho_products.db')

try:
    conn = sqlite3.connect(db_path)
    placeholders = ','.join('?' * len(ids))
    conn.execute(f'DELETE FROM auto_products WHERE id IN ({placeholders})', ids)
    conn.commit()
    print(conn.total_changes)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
finally:
    conn.close()
