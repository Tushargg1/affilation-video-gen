import sqlite3
import psycopg2
import time
import traceback
import sys

SUPABASE_URL = "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x"
LOCAL_DB = "data/meesho_products.db"

def sync():
    conn_supa = None
    try:
        conn_supa = psycopg2.connect(SUPABASE_URL)
        conn_supa.autocommit = True
        cur_supa = conn_supa.cursor()
        
        with sqlite3.connect(LOCAL_DB) as conn_local:
            conn_local.row_factory = sqlite3.Row
            cur_local = conn_local.cursor()
            
            # Sync extraction_sessions
            cur_local.execute("SELECT * FROM extraction_sessions")
            for row in cur_local.fetchall():
                cur_supa.execute("""
                    INSERT INTO extraction_sessions (id, start_time, keyword, total_extracted)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET total_extracted = EXCLUDED.total_extracted
                """, (row['id'], row['start_time'], row['keyword'], row['total_extracted']))

            # Sync auto_products
            cur_local.execute("SELECT * FROM auto_products")
            for row in cur_local.fetchall():
                cur_supa.execute("""
                    INSERT INTO auto_products 
                    (id, title, price, commission_percent, product_url, created_at, category, video_created, 
                     review_star, total_bought, image_url, image_prompt, video_prompt, downloaded_image_path, 
                     downloaded_video_path, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (product_url) DO UPDATE SET 
                        title = EXCLUDED.title,
                        price = EXCLUDED.price,
                        commission_percent = EXCLUDED.commission_percent,
                        category = EXCLUDED.category,
                        video_created = EXCLUDED.video_created,
                        review_star = EXCLUDED.review_star,
                        total_bought = EXCLUDED.total_bought,
                        image_url = EXCLUDED.image_url,
                        image_prompt = EXCLUDED.image_prompt,
                        video_prompt = EXCLUDED.video_prompt,
                        status = EXCLUDED.status
                """, (row['id'], row['title'], row['price'], row['commission_percent'], row['product_url'], 
                      row['created_at'], row['category'], row['video_created'], row['review_star'], 
                      row['total_bought'], row['image_url'], row['image_prompt'], row['video_prompt'], 
                      row['downloaded_image_path'], row['downloaded_video_path'], row['status']))
                
    except Exception as e:
        print("Sync Error:", e)
    finally:
        if conn_supa:
            try:
                conn_supa.close()
            except:
                pass

if __name__ == "__main__":
    print("Starting continuous sync to Supabase...")
    while True:
        sync()
        time.sleep(5)
