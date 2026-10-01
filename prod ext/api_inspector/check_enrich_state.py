import psycopg2

DB = "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
conn = psycopg2.connect(DB)
cur = conn.cursor()

print("=== image_url status breakdown ===")
cur.execute("SELECT CASE WHEN image_url IS NULL THEN 'NULL' WHEN image_url='FAILED' THEN 'FAILED' ELSE 'HAS_IMAGE' END as status, COUNT(*) FROM auto_products GROUP BY 1")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

print("\n=== Sample FAILED products ===")
cur.execute("SELECT id, product_url FROM auto_products WHERE image_url='FAILED' LIMIT 5")
for r in cur.fetchall():
    print(f"  id={r[0]} url={r[1]}")

print("\n=== Sample HAS_IMAGE products ===")
cur.execute("SELECT id, product_url, image_url FROM auto_products WHERE image_url IS NOT NULL AND image_url != 'FAILED' LIMIT 3")
for r in cur.fetchall():
    print(f"  id={r[0]} url={r[1]} img={r[2]}")

conn.close()
