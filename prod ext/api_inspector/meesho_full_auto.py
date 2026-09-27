import sys
import time
import sqlite3
import xml.etree.ElementTree as ET
import re
import subprocess as sp
from pathlib import Path
from meesho_emulator_collector import AdbClient

DB_PATH = Path("data/meesho_products.db")

def setup_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS auto_products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                price REAL,
                commission_percent REAL,
                product_url TEXT UNIQUE,
                category TEXT,
                video_created INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        try:
            conn.execute('ALTER TABLE auto_products DROP COLUMN unique_id')
        except: pass

def find_node(root, text_query=None, exact_text=None, clickable=False):
    for elem in root.iter():
        if clickable and elem.attrib.get("clickable") != "true":
            continue
        c = elem.attrib.get('content-desc', '').strip().lower()
        t = elem.attrib.get('text', '').strip().lower()
        
        if exact_text:
            if exact_text.strip().lower() == c or exact_text.strip().lower() == t:
                return elem
        elif text_query:
            if text_query.strip().lower() in c or text_query.strip().lower() in t:
                return elem
    return None

def get_center_and_height(bounds_str):
    if not bounds_str: return 0, 0, 0
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str)
    if m:
        x1, y1, x2, y2 = map(int, m.groups())
        return (x1+x2)//2, (y1+y2)//2, (y2-y1)
    return 0, 0, 0

def tap_node(dev, node, offset_small=False):
    cx, cy, h = get_center_and_height(node.attrib.get("bounds", ""))
    if cx > 0:
        if offset_small and h < 200:
            print(f"Node is small (height {h}), offsetting Y by -150 to hit image...")
            cy = max(0, cy - 150)
        dev.shell("input", "tap", str(cx), str(cy))
        return True
    return False
    
def get_clipboard():
    try:
        res = sp.run(["powershell", "-command", "Get-Clipboard"], capture_output=True, text=True, check=True, timeout=5, creationflags=0x08000000)
        return res.stdout.strip()
    except Exception:
        return ""

def dismiss_popups(dev):
    try:
        xml = dev.dump_ui()
    except Exception:
        return False
    if not xml: return False
    root = ET.fromstring(xml)
    if find_node(root, "real images"):
        log_print("Dismissing 'Real Images' popup...")
        dev.shell("input", "keyevent", "4")
        time.sleep(2)
import datetime

def init_log(keyword, skip_zero):
    try:
        with open(DB_PATH.parent / "automation.log", "a", encoding="utf-8") as f:
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
            f.write(f"\n\n{'='*50}\n▶ SESSION STARTED at {now_str}\nKeyword: '{keyword}' | Skip 0%: {skip_zero}\n{'='*50}\n")
    except Exception:
        pass

def log_print(*args):
    msg = " ".join(map(str, args))
    print(msg)
    try:
        with open(DB_PATH.parent / "automation.log", "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass

def ensure_bluestacks_running(dev):
    try:
        if "alive" in dev.shell("echo", "alive", timeout=3):
            # Already running — bring window to front
            sp.Popen(["powershell", "-command",
                "(New-Object -ComObject WScript.Shell).AppActivate('BlueStacks App Player')"],
                stdout=sp.DEVNULL, stderr=sp.DEVNULL, creationflags=0x08000000)
            return True
    except Exception:
        pass
        
    log_print("BlueStacks App Player 36 is not running. Launching it automatically...")
    try:
        sp.Popen([r"C:\Program Files\BlueStacks_nxt\HD-Player.exe", "--instance", "Tiramisu64_36"])
        log_print("Waiting up to 40 seconds for BlueStacks to fully boot...")
        for i in range(40):
            time.sleep(1)
            try:
                if "alive" in dev.shell("echo", "alive", timeout=2):
                    log_print("BlueStacks is ready!")
                    time.sleep(5)  # Extra buffer for Android UI to settle
                    # Bring window to front
                    sp.Popen(["powershell", "-command",
                        "(New-Object -ComObject WScript.Shell).AppActivate('BlueStacks App Player')"],
                        stdout=sp.DEVNULL, stderr=sp.DEVNULL, creationflags=0x08000000)
                    return True
            except Exception:
                pass
    except Exception as e:
        log_print(f"Failed to launch BlueStacks: {e}")
        
    return False

def run_automation(target_count=10):
    keyword = sys.argv[1] if len(sys.argv) > 1 else "kurti"
    skip_zero = (len(sys.argv) > 2 and sys.argv[2] == "skip_zero")
    init_log(keyword, skip_zero)
    log_print(f"Initializing ADB and BlueStacks...")
    sys.stdout.reconfigure(encoding='utf-8')
    setup_db()
    dev = AdbClient('127.0.0.1:5915')
    
    if not ensure_bluestacks_running(dev):
        log_print("Error: Could not connect to BlueStacks. Aborting.")
        return
    
    # 1. Clear clipboard to avoid stale links
    sp.run(["powershell", "-command", "Set-Clipboard -Value 'empty'"], creationflags=0x08000000)
    
    log_print("Force restarting Meesho to ensure clean state...")
    dev.shell("am", "force-stop", "com.meesho.supply")
    time.sleep(2)
    dev.shell("monkey", "-p", "com.meesho.supply", "-c", "android.intent.category.LAUNCHER", "1")
    time.sleep(6)
    
    log_print(f"Searching for '{keyword}'...")
    dev.shell("input", "tap", "450", "174")
    time.sleep(2)
    
    # Clear any existing text from previous searches
    dev.shell("input", "keyevent", "123") # MOVE_END
    for _ in range(25):
        dev.shell("input", "keyevent", "67")
        
    dev.shell("input", "text", keyword.replace(" ", "%s"))
    time.sleep(1)
    dev.shell("input", "keyevent", "66")
    time.sleep(4)
    
    log_print("On search results feed. Starting extraction...")
    
    collected = 0
    empty_count = 0
    processed_titles = set()
    
    while collected < target_count:
        try:
            xml = dev.dump_ui()
        except Exception:
            log_print("Error: Could not get UI dump from emulator. Retrying...")
            time.sleep(2)
            continue
            
        if not xml:
            log_print("Empty dump, retrying...")
            time.sleep(2)
            continue
            
        root = ET.fromstring(xml)
        products = []
        
        for elem in root.iter('node'):
            if elem.attrib.get('clickable') == 'true':
                res_id = elem.attrib.get('resource-id', '')
                if res_id == 'com.meesho.supply:id/item_catalog_card_optimised':
                    products.append(elem)
                        
        log_print(f"\nFound {len(products)} products on screen. Processing...")
        if len(products) > 0:
            empty_count = 0
        
        for idx, p in enumerate(products):
            if collected >= target_count:
                break
                
            log_print(f"\nProcessing product on screen {idx+1}/{len(products)}...")
            
            # Generate unique ID from the feed container's text
            feed_texts = []
            for child in p.iter():
                val = child.attrib.get('text', '') or child.attrib.get('content-desc', '')
                if val and val.strip():
                    feed_texts.append(val.strip())
            unique_id = "|".join(feed_texts)
            
            # Check if this product is already in the database
            already_exists = False
            try:
                with sqlite3.connect(DB_PATH) as conn:
                    cursor = conn.cursor()
                    cursor.execute('SELECT 1 FROM auto_products WHERE unique_id = ?', (unique_id,))
                    if cursor.fetchone():
                        already_exists = True
            except Exception:
                pass
                
            if already_exists:
                log_print("Product already in database! Skipping click to save time.")
                continue
                
            tap_node(dev, p, offset_small=True)
            time.sleep(7)  # Wait for page load
            
            dismiss_popups(dev)
            
            try:
                xml_detail = dev.dump_ui()
            except Exception:
                log_print("Failed to get detail page UI. Skipping.")
                dev.shell("input", "keyevent", "4")
                time.sleep(3)
                continue
                
            if not xml_detail:
                dev.shell("input", "keyevent", "4")
                time.sleep(3)
                continue
                
            root_detail = ET.fromstring(xml_detail)
            
            # Extract basic data
            data = {"title": "", "price": 0.0, "commission_percent": 0.0, "product_url": ""}
            
            texts = []
            for elem in root_detail.iter():
                t = elem.attrib.get('text', '') or elem.attrib.get('content-desc', '')
                if not t: continue
                texts.append(t)
                
                # Robust price extraction via resource-id
                if elem.attrib.get('resource-id') == 'com.meesho.supply:id/price' and not data["price"]:
                    m = re.search(r'(\d+)', t)
                    if m: data["price"] = float(m.group(1))
                
            for t in texts:
                if len(t) > 20 and not data["title"] and "http" not in t and "@" not in t:
                    data["title"] = t.strip()
                if "commission" in t.lower() and not data["commission_percent"]:
                    m = re.search(r'(\d+(?:\.\d+)?)\s*%', t)
                    if m: data["commission_percent"] = float(m.group(1))
            
            # Anti-ad filter
            if "search for games" in data["title"].lower() or "install" in data["title"].lower():
                log_print("Hit an Ad! Backing out...")
                dev.shell("input", "keyevent", "4")
                time.sleep(4)
                continue
                
            # Strict Relevance Filter (Ignore unrelated sponsored items)
            kw_words = [w.lower() for w in keyword.split() if len(w) > 2]
            title_lower = data["title"].lower()
            if kw_words and not any(w in title_lower for w in kw_words):
                log_print(f"Skipping '{data['title'][:20]}...' (Not related to '{keyword}')")
                dev.shell("input", "keyevent", "4")
                time.sleep(3)
                continue
                
            # Skip 0% Commission
            if skip_zero and data["commission_percent"] == 0.0:
                log_print(f"Skipping product '{data['title'][:20]}...' because commission is 0%.")
                dev.shell("input", "keyevent", "4")
                time.sleep(3)
                continue
                
            # Deduplication
            if data["title"] in processed_titles:
                log_print(f"Already processed this product recently ({data['title'][:20]}...). Navigating back.")
                dev.shell("input", "keyevent", "4")
                time.sleep(3)
                continue
                
            processed_titles.add(data["title"])
            
            # Swipe slightly down just in case the Share button is off-screen
            dev.shell("input", "swipe", "450", "1200", "450", "800", "300")
            time.sleep(2)
            
            # Re-dump after swipe to find Share button
            try:
                xml_detail_swiped = dev.dump_ui()
                if xml_detail_swiped:
                    root_detail = ET.fromstring(xml_detail_swiped)
            except Exception:
                pass
            
            # Find Share button
            share_node = find_node(root_detail, exact_text="share")
            if share_node is not None:
                log_print("Tapping Share button...")
                tap_node(dev, share_node)
                time.sleep(4)
                
                xml_share = dev.dump_ui()
                if xml_share:
                    root_share = ET.fromstring(xml_share)
                    copy_node = find_node(root_share, "copy to clipboard")
                    if copy_node is not None:
                        # Copy node might not be clickable itself, tap parent or its bounds center
                        log_print("Tapping Copy to Clipboard...")
                        tap_node(dev, copy_node)
                        time.sleep(3)
                        
                        clip = get_clipboard()
                        m_link = re.search(r'(https://www\.meesho\.com/s/p/[a-zA-Z0-9]+)', clip)
                        if m_link:
                            data["product_url"] = m_link.group(1)
                            log_print(f"Extracted Link: {data['product_url']}")
                        else:
                            log_print(f"No link found in clipboard: {clip}")
                    else:
                        log_print("Could not find 'Copy to clipboard' button.")
                else:
                    log_print("Failed to dump share sheet.")
            else:
                log_print("Could not find Share button.")
                
            # Skip and go back if no real URL
            if not data["product_url"] or not data["product_url"].startswith("http"):
                log_print(f"No real product URL found — skipping '{data['title'][:20]}'.")
                dev.shell("input", "keyevent", "4")
                time.sleep(4)
                continue

            # Check DB by URL before saving
            already_exists = False
            try:
                with sqlite3.connect(DB_PATH) as conn:
                    cursor = conn.cursor()
                    cursor.execute('SELECT 1 FROM auto_products WHERE product_url = ?', (data["product_url"],))
                    if cursor.fetchone():
                        already_exists = True
            except Exception:
                pass

            if already_exists:
                log_print(f"URL already in DB, skipping.")
                dev.shell("input", "keyevent", "4")
                time.sleep(4)
                continue

            # Skip 0% commission if requested
            if skip_zero and float(data["commission_percent"]) == 0.0:
                log_print(f"Skipping 0% commission product.")
                dev.shell("input", "keyevent", "4")
                time.sleep(4)
                continue

            # Save to DB
            try:
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute('''
                        INSERT OR IGNORE INTO auto_products (title, price, commission_percent, product_url, category)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (data["title"], data["price"], data["commission_percent"], data["product_url"], keyword))
                    conn.commit()
                    if conn.execute('SELECT changes()').fetchone()[0]:
                        collected += 1
                        log_print(f"SAVED #{collected}: {data['title'][:30]} | {data['product_url'][:50]}")
                    else:
                        log_print("Duplicate URL, not saved.")
            except Exception as e:
                log_print("DB Insert error:", e)
            
            log_print("Navigating back to feed...")
            dev.shell("input", "keyevent", "4")
            time.sleep(4)
            
        if len(products) == 0:
            empty_count += 1
            log_print(f"No products found in this dump (count {empty_count}). It might be animating or on a bad screen. Waiting 5s...")
            time.sleep(5)
            
            if empty_count >= 5:
                log_print("Stuck on 0 products for too long! Attempting to force-restart Meesho...")
                dev.shell("am", "force-stop", "com.meesho.supply")
                time.sleep(2)
                dev.shell("monkey", "-p", "com.meesho.supply", "-c", "android.intent.category.LAUNCHER", "1")
                time.sleep(5)
                # re-search keyword
                dev.shell("input", "tap", "450", "174")
                time.sleep(2)
                dev.shell("input", "keyevent", "123")
                for _ in range(25):
                    dev.shell("input", "keyevent", "67")
                dev.shell("input", "text", keyword.replace(" ", "%s"))
                time.sleep(1)
                dev.shell("input", "keyevent", "66")
                time.sleep(3)
                empty_count = 0
            elif empty_count >= 3:
                log_print("Attempting to press BACK to recover...")
                dev.shell("input", "keyevent", "4")
            else:
                # Try a small scroll to break animations sometimes
                dev.shell("input", "swipe", "450", "1000", "450", "950", "200")
            
        elif collected < target_count:
            print("Swiping down to load more products...")
            dev.shell("input", "swipe", "450", "1500", "450", "300", "500")
            time.sleep(4)
            
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    log_print(f"\n{'='*50}")
    log_print(f"⏹ SESSION STOPPED at {now_str}")
    log_print(f"Total Products Saved This Run: {collected}")
    log_print("="*50)

if __name__ == "__main__":
    run_automation(10)
