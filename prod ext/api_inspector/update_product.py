import psycopg2, sys

DB_URL = "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

product_id = int(sys.argv[1])
video_created = int(sys.argv[2])

try:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("UPDATE auto_products SET video_created = %s WHERE id = %s", (video_created, product_id))
    conn.commit()
    conn.close()
    print("OK")
except Exception as e:
    sys.stderr.write(str(e) + "\n")
    sys.exit(1)
