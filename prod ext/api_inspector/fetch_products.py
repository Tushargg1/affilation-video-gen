import psycopg2, json, sys

sys.stdout.reconfigure(encoding='utf-8')

DB_URL = "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

try:
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, price, commission_percent, product_url,
               image_url, review_star, total_bought, video_created, created_at
        FROM auto_products
        ORDER BY id DESC
        LIMIT 100
    """)
    columns = [d[0] for d in cur.description]
    rows = cur.fetchall()
    result = []
    for row in rows:
        d = dict(zip(columns, row))
        if d.get('created_at'):
            d['created_at'] = str(d['created_at'])
        # Skip FAILED placeholder images
        if d.get('image_url') == 'FAILED':
            d['image_url'] = None
        result.append(d)
    print(json.dumps(result))
    conn.close()
except Exception as e:
    sys.stderr.write(str(e) + "\n")
    print(json.dumps([]))
