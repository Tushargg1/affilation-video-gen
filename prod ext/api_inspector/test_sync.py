import sqlite3
import psycopg2
import sys

SUPABASE_URL = "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
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
            
            # Sync extraction_sessions (skipped because table might not exist locally)


            # Sync auto_products
            cur_local.execute("SELECT * FROM auto_products")
            products = cur_local.fetchall()
            print(f"Found {len(products)} products in local DB.")
            for row in products:
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
            print("Sync complete.")
                
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        if conn_supa:
            try:
                conn_supa.close()
            except:
                pass

if __name__ == "__main__":
    sync()
