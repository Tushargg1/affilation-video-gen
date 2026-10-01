import psycopg2

DB_URL = "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()
cur.execute("UPDATE auto_products SET image_url = NULL WHERE image_url = 'FAILED'")
affected = cur.rowcount
conn.commit()
conn.close()
print(f"Reset {affected} FAILED products back to NULL — ready for re-enrichment.")
