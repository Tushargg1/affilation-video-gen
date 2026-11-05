"""
One-shot: Open BlueStacks visibly, scrape exactly 5 shoes, print results.
"""
import sys, time, sqlite3, re, subprocess as sp, xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0, '.')
from meesho_emulator_collector import AdbClient

# Force UTF-8 output so rupee symbol doesn't crash on Windows
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

KEYWORD  = "shoes"
TARGET   = 5
DB_PATH  = Path("data/meesho_products.db")
BS_EXE   = r"C:\Program Files\BlueStacks_nxt\HD-Player.exe"
BS_INST  = "Tiramisu64_36"
ADB_ADDR = "127.0.0.1:5915"

def log(msg):
    print(msg, flush=True)
    try:
        with open(DB_PATH.parent / "automation.log", "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except: pass

def bring_to_front():
    sp.run(["powershell", "-command",
        "(New-Object -ComObject WScript.Shell).AppActivate('BlueStacks App Player')"],
        capture_output=True)

def get_center(bounds_str):
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str or "")
    if m:
        x1,y1,x2,y2 = map(int,m.groups())
        return (x1+x2)//2, (y1+y2)//2
    return 0, 0

def find_node(root, text_query):
    for e in root.iter():
        for attr in ('text','content-desc'):
            if text_query.lower() in e.attrib.get(attr,'').lower():
                return e
    return None

def clean_xml(raw):
    raw = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','', raw)
    return raw

def setup_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as c:
        c.execute('''CREATE TABLE IF NOT EXISTS auto_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT, price REAL, commission_percent REAL,
            product_url TEXT UNIQUE,
            category TEXT,
            review_star TEXT,
            total_bought TEXT,
            image_url TEXT,
            image_prompt TEXT,
            video_prompt TEXT,
            downloaded_image_path TEXT,
            downloaded_video_path TEXT,
            status TEXT DEFAULT 'extracted',
            video_created INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        # Migration: drop unique_id column if it exists (ignore error if not)
        try:
            c.execute('ALTER TABLE auto_products DROP COLUMN unique_id')
        except: pass

def ensure_bluestacks(dev):
    try:
        if "alive" in dev.shell("echo", "alive", timeout=4):
            log("BlueStacks ADB connected. Bringing window to front...")
            bring_to_front()
            return True
    except: pass

    log("BlueStacks not running. Launching now...")
    sp.Popen([BS_EXE, "--instance", BS_INST])
    for i in range(50):
        time.sleep(1)
        try:
            if "alive" in dev.shell("echo", "alive", timeout=2):
                log(f"BlueStacks up after {i+1}s! Waiting 6s for Android UI...")
                time.sleep(6)
                bring_to_front()
                return True
        except: pass
    log("ERROR: BlueStacks failed to start!")
    return False

def get_clipboard():
    try:
        r = sp.run(["powershell","-command","Get-Clipboard"], capture_output=True, text=True, timeout=5)
        return r.stdout.strip()
    except: return ""

def main():
    setup_db()
    # Clear the log
    try:
        open(DB_PATH.parent / "automation.log", "w").close()
    except: pass

    dev = AdbClient(ADB_ADDR)
    if not ensure_bluestacks(dev):
        log("ABORT: Cannot connect to BlueStacks.")
        return

    # Clear clipboard
    sp.run(["powershell","-command","Set-Clipboard -Value 'empty'"], capture_output=True)

    log(f"Force-restarting Meesho...")
    dev.shell("am","force-stop","com.meesho.supply")
    time.sleep(2)
    dev.shell("monkey","-p","com.meesho.supply","-c","android.intent.category.LAUNCHER","1")
    time.sleep(7)
    bring_to_front()

    log(f"Searching for '{KEYWORD}'...")
    dev.shell("input","tap","450","174")
    time.sleep(2)
    for _ in range(30): dev.shell("input","keyevent","67")
    dev.shell("input","text", KEYWORD.replace(" ","%s"))
    time.sleep(1)
    dev.shell("input","keyevent","66")
    time.sleep(8)  # Give search results more time to fully load

    log("On search results. Starting extraction...")
    collected = 0
    processed_titles = set()
    empty_count = 0

    while collected < TARGET:
        try:
            raw = dev.dump_ui()
            if not raw:
                empty_count += 1
                if empty_count > 5:
                    log("Too many empty dumps. Aborting.")
                    break
                time.sleep(3)
                continue
            root = ET.fromstring(clean_xml(raw))
            empty_count = 0
        except Exception as ex:
            log(f"XML parse error: {ex}")
            time.sleep(3)
            continue

        products = []
        for elem in root.iter('node'):
            if elem.attrib.get('clickable') == 'true':
                for child in elem.iter():
                    if '₹' in (child.attrib.get('text','') + child.attrib.get('content-desc','')):
                        products.append(elem)
                        break

        log(f"Found {len(products)} clickable products on screen. Collected so far: {collected}/{TARGET}")

        for p in products:
            if collected >= TARGET: break

            # Check DB duplicate by URL — but we don't have URL yet at this stage.
            # We'll check after extracting URL below. Just skip if feed texts already seen.
            feed_texts = [c.attrib.get('text','') or c.attrib.get('content-desc','') for c in p.iter() if c.attrib.get('text','') or c.attrib.get('content-desc','')]
            feed_sig = "|".join(feed_texts[:5])  # short signature for in-session dedup only

            cx, cy = get_center(p.attrib.get("bounds",""))
            if not cx: continue

            log(f"Tapping product at ({cx},{cy})...")
            dev.shell("input","tap",str(cx),str(cy))
            time.sleep(7)
            bring_to_front()

            # Dismiss popups / ads - look for any close/cross button or known popup text
            try:
                xd = clean_xml(dev.dump_ui() or "")
                rd = ET.fromstring(xd) if xd else None
                if rd is not None:
                    # Try to find and tap a close/cross/dismiss button
                    CLOSE_HINTS = ["real images", "close", "dismiss", "cancel", "✕", "×", "not now", "skip", "no thanks"]
                    for hint in CLOSE_HINTS:
                        node = find_node(rd, hint)
                        if node is not None:
                            ccx, ccy = get_center(node.attrib.get("bounds",""))
                            if ccx:
                                log(f"Dismissing popup via '{hint}' button...")
                                dev.shell("input","tap",str(ccx),str(ccy))
                                time.sleep(1.5)
                                break
                    else:
                        # Fallback: if a full-screen overlay, press back
                        if find_node(rd, "real images"):
                            dev.shell("input","keyevent","4"); time.sleep(2)
            except: pass

            try:
                xd = clean_xml(dev.dump_ui() or "")
                if not xd: raise Exception("empty detail dump")
                rd = ET.fromstring(xd)
            except Exception as ex:
                log(f"Detail dump failed: {ex}")
                dev.shell("input","keyevent","4"); time.sleep(3); continue

            data = {"title":"","price":0.0,"commission_percent":0.0,"product_url":""}
            texts = [e.attrib.get('text','') or e.attrib.get('content-desc','') for e in rd.iter()]

            for t in texts:
                if len(t)>20 and not data["title"] and "http" not in t and "@" not in t:
                    data["title"] = t.strip()
                if "₹" in t and not data["price"]:
                    m = re.search(r'₹\s*(\d+)', t)
                    if m: data["price"] = float(m.group(1))
                if "commission" in t.lower() and not data["commission_percent"]:
                    m = re.search(r'(\d+(?:\.\d+)?)\s*%', t)
                    if m: data["commission_percent"] = float(m.group(1))

            if not data["title"] or data["title"] in processed_titles:
                log("Duplicate or empty title, skipping.")
                dev.shell("input","keyevent","4"); time.sleep(3); continue

            # Filter out ads and junk
            AD_KEYWORDS = ["search for games", "install", "download", "play store", "ad by"]
            if any(kw in data["title"].lower() for kw in AD_KEYWORDS) or data["price"] == 0:
                log(f"Filtering ad/junk: {data['title'][:30]}")
                dev.shell("input","keyevent","4"); time.sleep(3); continue

            processed_titles.add(data["title"])
            log(f"Title: {data['title'][:40]} | Price: Rs{data['price']} | Comm: {data['commission_percent']}%")

            # Try to get URL via Share
            dev.shell("input","swipe","450","1200","450","800","300"); time.sleep(2)
            try:
                xs = clean_xml(dev.dump_ui() or "")
                rs = ET.fromstring(xs) if xs else None
                share_node = find_node(rs, "share") if rs else None
                if share_node:
                    scx, scy = get_center(share_node.attrib.get("bounds",""))
                    if scx:
                        dev.shell("input","tap",str(scx),str(scy)); time.sleep(4)
                        xs2 = clean_xml(dev.dump_ui() or "")
                        rs2 = ET.fromstring(xs2) if xs2 else None
                        copy_node = find_node(rs2,"copy to clipboard") if rs2 else None
                        if copy_node:
                            ccx,ccy = get_center(copy_node.attrib.get("bounds",""))
                            if ccx: dev.shell("input","tap",str(ccx),str(ccy)); time.sleep(3)
                            clip = get_clipboard()
                            m_link = re.search(r'(https://www\.meesho\.com/[^\s]+)', clip)
                            if m_link: data["product_url"] = m_link.group(1)
                        # Dismiss share sheet
                        dev.shell("input","keyevent","4"); time.sleep(1)
            except Exception as ex:
                log(f"Share error: {ex}")

            # Only save if we got a real Meesho URL
            if not data["product_url"] or not data["product_url"].startswith("http"):
                log("No real product URL found — skipping this product.")
                dev.shell("input","keyevent","4"); time.sleep(3); continue

            # Check DB by URL before saving
            with sqlite3.connect(DB_PATH) as conn:
                if conn.execute('SELECT 1 FROM auto_products WHERE product_url=?',(data["product_url"],)).fetchone():
                    log(f"URL already in DB, skipping: {data['product_url'][:40]}")
                    dev.shell("input","keyevent","4"); time.sleep(3); continue

            try:
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute('''INSERT OR IGNORE INTO auto_products
                        (title,price,commission_percent,product_url,category)
                        VALUES(?,?,?,?,?)''',
                        (data["title"],data["price"],data["commission_percent"],
                         data["product_url"],KEYWORD))
                    if conn.execute('SELECT changes()').fetchone()[0]:
                        collected += 1
                        log(f"SAVED #{collected}: {data['title'][:30]} | {data['product_url'][:50]}")
                    else:
                        log("Duplicate URL already in DB.")
            except Exception as ex:
                log(f"DB error: {ex}")

            dev.shell("input","keyevent","4"); time.sleep(4)

        if collected < TARGET:
            log("Swiping to load more...")
            dev.shell("input","swipe","450","1500","450","300","500")
            time.sleep(4)

    log(f"\n{'='*50}")
    log(f"DONE! Collected {collected} shoes products.")
    log("="*50)

    # Print final results
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute("SELECT title,price,commission_percent,product_url FROM auto_products ORDER BY id").fetchall()
        for i,r in enumerate(rows,1):
            log(f"{i}. {r[0][:50]} | ₹{r[1]} | {r[2]}% | {r[3][:50]}")

if __name__ == "__main__":
    main()
