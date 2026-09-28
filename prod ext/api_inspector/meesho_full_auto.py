"""
meesho_full_auto.py - Meesho affiliate product extractor (search-results-first approach)
KEY INSIGHT (from dump2.xml analysis):
  commission is shown DIRECTLY on each search-result card via:
    resource-id="com.meesho.supply:id/affiliate_commission_text"
    e.g. text="0% Commission" or "12% Commission"
  share icon is also ON each card:
    resource-id="com.meesho.supply:id/share_shop"
New strategy (MUCH faster - no product-page opens needed):
  1. Dump UI on the search results page.
  2. Parse each item_catalog_card_optimised card.
  3. Read commission, price, title from the card directly.
  4. Skip cards with 0% commission without opening them.
  5. Tap the share_shop icon ON the card -> Copy to clipboard -> get affiliate link.
  6. Save to DB. Scroll. Repeat.
"""
import sys, time, sqlite3, re, subprocess as sp, datetime
import xml.etree.ElementTree as ET
from pathlib import Path
from meesho_emulator_collector import AdbClient

DB_PATH = Path("data/meesho_products.db")

def setup_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
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
        """)
        conn.commit()

def init_log(keyword, skip_zero):
    try:
        with open(DB_PATH.parent / "automation.log", "a", encoding="utf-8") as f:
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
            f.write(f"\n\n{'='*60}\n> SESSION STARTED at {now_str}\nKeyword: '{keyword}' | Skip 0%: {skip_zero}\n{'='*60}\n")
    except Exception:
        pass

def log_print(*args):
    msg = " ".join(map(str, args))
    print(msg, flush=True)
    try:
        with open(DB_PATH.parent / "automation.log", "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass

def get_center(bounds_str):
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str or "")
    if m:
        x1, y1, x2, y2 = map(int, m.groups())
        return (x1 + x2) // 2, (y1 + y2) // 2
    return 0, 0

def tap_node(dev, node):
    cx, cy = get_center(node.attrib.get("bounds", ""))
    if cx > 0:
        dev.shell("input", "tap", str(cx), str(cy))
        return True
    return False

def tap_xy(dev, x, y):
    dev.shell("input", "tap", str(x), str(y))

def find_node(root, text_query=None, exact_text=None, resource_id=None, clickable=False):
    for elem in root.iter():
        if clickable and elem.attrib.get("clickable") != "true":
            continue
        if resource_id and elem.attrib.get("resource-id", "") != resource_id:
            continue
        t = elem.attrib.get("text", "").strip().lower()
        c = elem.attrib.get("content-desc", "").strip().lower()
        if exact_text:
            if exact_text.strip().lower() in (t, c):
                return elem
        elif text_query:
            if text_query.strip().lower() in t or text_query.strip().lower() in c:
                return elem
        elif resource_id:
            return elem
    return None

def get_clipboard():
    try:
        res = sp.run(["powershell", "-command", "Get-Clipboard"],
                     capture_output=True, text=True, check=True, timeout=5,
                     creationflags=0x08000000)
        return res.stdout.strip()
    except Exception:
        return ""

def set_clipboard(text):
    try:
        sp.run(["powershell", "-command", f"Set-Clipboard -Value '{text}'"],
               creationflags=0x08000000, timeout=5)
    except Exception:
        pass

EMULATOR_EXE = r"C:\Users\tusha\AppData\Local\Android\Sdk\emulator\emulator.exe"

def launch_android_emulator():
    log_print("Auto-launching Android Studio Pixel 8 emulator...")
    try:
        sp.Popen([EMULATOR_EXE, "-avd", "Pixel_8", "-no-snapshot-load",
                  "-no-boot-anim", "-gpu", "angle_indirect"],
                 stdout=sp.DEVNULL, stderr=sp.DEVNULL)
        log_print("Emulator process started. Waiting for ADB...")
    except Exception as e:
        log_print(f"Failed to launch emulator: {e}")

def _disable_animations(dev):
    try:
        dev.shell("settings", "put", "global", "window_animation_scale", "0")
        dev.shell("settings", "put", "global", "transition_animation_scale", "0")
        dev.shell("settings", "put", "global", "animator_duration_scale", "0")
        log_print("Animations disabled.")
    except Exception as e:
        log_print(f"Could not disable animations (non-fatal): {e}")

def ensure_emulator_running(dev):
    try:
        if "alive" in dev.shell("echo", "alive", timeout=5):
            boot = dev.shell("getprop", "sys.boot_completed", timeout=5).strip()
            if boot == "1":
                log_print("Emulator is ready and fully booted!")
                _disable_animations(dev)
                return True
    except Exception:
        pass
    launch_android_emulator()
    log_print("Waiting up to 4 minutes for emulator-5554 to fully boot...")
    for i in range(120):
        time.sleep(2)
        try:
            alive = dev.shell("echo", "alive", timeout=3)
            if "alive" not in alive:
                continue
            boot = dev.shell("getprop", "sys.boot_completed", timeout=5).strip()
            if boot == "1":
                log_print(f"Emulator booted! ({i*2}s elapsed) Waiting 20s for services...")
                time.sleep(20)
                _disable_animations(dev)
                return True
        except Exception:
            pass
    log_print("Timeout waiting for Android Studio Emulator.")
    return False

def dismiss_popups(dev):
    try:
        xml = dev.dump_ui()
        if not xml:
            return
        root = ET.fromstring(xml)
        anr_wait = find_node(root, "wait", clickable=True)
        anr_close = find_node(root, "close app", clickable=True)
        if anr_wait:
            log_print("ANR dialog - tapping Wait...")
            tap_node(dev, anr_wait)
            time.sleep(5)
            return
        if anr_close:
            log_print("ANR dialog - tapping Close app...")
            tap_node(dev, anr_close)
            time.sleep(3)
            return
        if find_node(root, "real images"):
            log_print("Dismissing Real Images popup...")
            dev.shell("input", "keyevent", "4")
            time.sleep(2)
        for kw in ["got it", "ok", "allow", "skip"]:
            node = find_node(root, kw, clickable=True)
            if node:
                log_print(f"Dismissing dialog: {kw}")
                tap_node(dev, node)
                time.sleep(1)
    except Exception:
        pass

def wait_for_results_loaded(dev, timeout=25):
    for i in range(timeout):
        time.sleep(1)
        try:
            xml = dev.dump_ui()
            if not xml:
                continue
            root = ET.fromstring(xml)
            has_loading = any(
                e.attrib.get("resource-id", "") in (
                    "com.meesho.supply:id/overlay_progress_bar",
                    "com.meesho.supply:id/iv_loading")
                for e in root.iter("node"))
            has_scrim = any("scrim" in e.attrib.get("resource-id", "")
                            for e in root.iter("node"))
            if has_scrim:
                log_print("Autocomplete still showing, tapping below to dismiss...")
                dev.shell("input", "tap", "450", "1400")
                time.sleep(2)
                continue
            cards = [e for e in root.iter("node")
                     if e.attrib.get("resource-id", "") == "com.meesho.supply:id/item_catalog_card_optimised"]
            if not has_loading and len(cards) > 0:
                log_print(f"Results loaded! Found {len(cards)} product cards.")
                return True
            log_print(f"Still loading... ({i+1}s)")
        except Exception as e:
            log_print(f"Wait error: {e}")
    log_print("Timeout waiting for results.")
    return False

def do_search(dev, keyword):
    log_print(f"Searching for '{keyword}'...")
    dev.shell("input", "tap", "450", "350")
    time.sleep(2)
    dev.shell("input", "keyevent", "123")
    backspaces = ["67"] * 40
    dev.shell("input", "keyevent", *backspaces)
    time.sleep(0.5)
    for i, word in enumerate(keyword.split()):
        if i > 0:
            dev.shell("input", "keyevent", "62")
        dev.shell("input", "text", word)
        time.sleep(0.5)
    time.sleep(2)
    dev.shell("input", "tap", "500", "350")
    time.sleep(3)
    loaded = wait_for_results_loaded(dev, timeout=60)
    if not loaded:
        log_print("WARNING: Timeout on first load. Trying Enter key...")
        dev.shell("input", "keyevent", "66")
        time.sleep(4)
        wait_for_results_loaded(dev, timeout=20)
    log_print("On search results feed.")
    return True

SKIP_RIDS = {
    "com.meesho.supply:id/price",
    "com.meesho.supply:id/original_price",
    "com.meesho.supply:id/discount_text",
    "com.meesho.supply:id/ratings_count",
    "com.meesho.supply:id/rating",
    "com.meesho.supply:id/affiliate_commission_text",
    "com.meesho.supply:id/returns_unbundling_text",
}

def parse_card(card_elem):
    """
    Extract title, price, commission_percent, share_bounds from a card element.
    commission_percent = -1 means commission node absent (unknown).
    """
    data = {
        "title": "",
        "price": 0.0,
        "commission_percent": -1.0,
        "bounds": card_elem.attrib.get("bounds", ""),
        "share_bounds": "",
    }
    for elem in card_elem.iter():
        rid = elem.attrib.get("resource-id", "")
        t   = elem.attrib.get("text", "").strip()
        c   = elem.attrib.get("content-desc", "").strip()
        val = t or c

        if rid == "com.meesho.supply:id/affiliate_commission_text":
            m = re.search(r'(\d+(?:\.\d+)?)\s*%', val)
            data["commission_percent"] = float(m.group(1)) if m else 0.0

        elif rid == "com.meesho.supply:id/price" and not data["price"]:
            m = re.search(r'(\d+)', val)
            if m:
                data["price"] = float(m.group(1))

        elif rid == "com.meesho.supply:id/share_shop":
            data["share_bounds"] = elem.attrib.get("bounds", "")

        elif (len(val) > 8 and not data["title"]
              and "http" not in val and "%" not in val and "@" not in val
              and rid not in SKIP_RIDS):
            data["title"] = val

    return data

def get_link_via_card_share(dev, card_data):
    """Tap share icon on the card and copy affiliate link from share sheet."""
    share_bounds = card_data.get("share_bounds", "")
    if not share_bounds:
        m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', card_data["bounds"])
        if m:
            x1, y1, x2, y2 = map(int, m.groups())
            share_x = x2 - 25
            share_y = y1 + 40
        else:
            log_print("No share bounds and no card bounds. Skipping.")
            return ""
    else:
        share_x, share_y = get_center(share_bounds)

    if share_x <= 0:
        log_print("Could not calculate share icon coordinates.")
        return ""

    m_card = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', card_data["bounds"])
    if m_card and int(m_card.group(2)) < 200:
        log_print(f"Card too high (y={m_card.group(2)}), share icon covered. Skipping.")
        return ""

    log_print(f"Tapping share icon at ({share_x}, {share_y})...")
    set_clipboard("empty")
    tap_xy(dev, share_x, share_y)
    time.sleep(4)

    try:
        xml_share = dev.dump_ui()
    except Exception as e:
        log_print(f"Failed to dump share sheet: {e}")
        dev.shell("input", "keyevent", "4")
        time.sleep(2)
        return ""

    if not xml_share:
        log_print("Empty share sheet XML.")
        dev.shell("input", "keyevent", "4")
        time.sleep(2)
        return ""

    root_share = ET.fromstring(xml_share)
    copy_node = None
    for kw in ["copy to clipboard", "copy link", "copy"]:
        copy_node = find_node(root_share, kw, clickable=True)
        if copy_node:
            break

    if copy_node is None:
        log_print("Copy to clipboard not found in share sheet. Closing.")
        dev.shell("input", "keyevent", "4")
        time.sleep(2)
        return ""

    log_print("Tapping Copy to clipboard...")
    tap_node(dev, copy_node)
    time.sleep(3)

    clip = get_clipboard()
    log_print(f"Clipboard: {clip[:120]}")

    for pattern in [
        r'(https://www\.meesho\.com/s/p/[a-zA-Z0-9_-]+)',
        r'(https://meesho\.com[^\s]+)',
        r'(https?://[^\s]+meesho[^\s]+)',
    ]:
        m_link = re.search(pattern, clip)
        if m_link:
            return m_link.group(1)

    log_print("No Meesho link found in clipboard.")
    return ""

def run_automation(target_count=15):
    keyword   = sys.argv[1] if len(sys.argv) > 1 else "mens lowers"
    skip_zero = (len(sys.argv) > 2 and sys.argv[2] == "skip_zero")
    init_log(keyword, skip_zero)
    log_print("Initializing ADB and Android Studio Pixel 8 Emulator...")
    sys.stdout.reconfigure(encoding="utf-8")
    setup_db()
    dev = AdbClient("emulator-5554")

    if not ensure_emulator_running(dev):
        log_print("Error: Could not connect to Emulator. Aborting.")
        return

    set_clipboard("empty")
    log_print("Force-restarting Meesho for a clean state...")
    dev.shell("am", "force-stop", "com.meesho.supply")
    time.sleep(2)
    dev.shell("monkey", "-p", "com.meesho.supply", "-c", "android.intent.category.LAUNCHER", "1")
    time.sleep(10)

    do_search(dev, keyword)

    collected, empty_count, scroll_count = 0, 0, 0
    processed_urls = set()

    while collected < target_count:
        try:
            xml = dev.dump_ui()
        except Exception as e:
            log_print(f"UI dump error: {e}. Retrying...")
            time.sleep(3)
            continue

        if not xml:
            log_print("Empty UI dump, retrying...")
            time.sleep(3)
            continue

        dismiss_popups(dev)
        root = ET.fromstring(xml)

        cards = [e for e in root.iter("node")
                 if e.attrib.get("resource-id", "") == "com.meesho.supply:id/item_catalog_card_optimised"]
        log_print(f"\nFound {len(cards)} product cards. Collected {collected}/{target_count}.")

        if cards:
            empty_count = 0
        else:
            empty_count += 1
            log_print(f"No product cards (attempt {empty_count}).")
            if empty_count >= 5:
                log_print("Stuck! Force-restarting Meesho and re-searching...")
                dev.shell("am", "force-stop", "com.meesho.supply")
                time.sleep(2)
                dev.shell("monkey", "-p", "com.meesho.supply", "-c", "android.intent.category.LAUNCHER", "1")
                time.sleep(8)
                do_search(dev, keyword)
                empty_count = 0
                scroll_count = 0
            elif empty_count >= 3:
                log_print("Trying small swipe to break animation...")
                dev.shell("input", "swipe", "450", "900", "450", "800", "300")
                time.sleep(3)
            else:
                time.sleep(5)
            continue

        for idx, card_elem in enumerate(cards):
            if collected >= target_count:
                break

            card = parse_card(card_elem)
            comm = card["commission_percent"]
            comm_str = f"{comm}%" if comm >= 0 else "not shown"
            log_print(f"\nCard {idx+1}/{len(cards)} | Price: Rs{card['price']} | Commission: {comm_str} | Title: {card['title'][:40]}")

            # Skip 0% commission immediately without opening product
            if comm == 0.0:
                log_print("0% Commission -> SKIPPING (no product page open).")
                continue
            if comm < 0 and skip_zero:
                log_print("Commission not shown on card, skip_zero=True -> SKIPPING.")
                continue

            # Get affiliate link via share icon on card (no product page needed)
            link = get_link_via_card_share(dev, card)
            time.sleep(2)

            # Verify still on search results
            try:
                chk_xml = dev.dump_ui()
                if chk_xml:
                    chk_root = ET.fromstring(chk_xml)
                    chk_cards = [e for e in chk_root.iter("node")
                                 if e.attrib.get("resource-id", "") == "com.meesho.supply:id/item_catalog_card_optimised"]
                    if not chk_cards:
                        log_print("Navigated away from results! Pressing Back...")
                        dev.shell("input", "keyevent", "4")
                        time.sleep(3)
                        wait_for_results_loaded(dev, timeout=15)
            except Exception:
                pass

            if not link or not link.startswith("http"):
                log_print("No affiliate link obtained - skipping.")
                continue

            if link in processed_urls:
                log_print("Already processed this URL, skipping.")
                continue
            processed_urls.add(link)

            title = card["title"] or f"Product @ Rs{card['price']}"

            try:
                with sqlite3.connect(DB_PATH) as conn:
                    cur = conn.execute(
                        "INSERT OR IGNORE INTO auto_products "
                        "(title, price, commission_percent, product_url, category) "
                        "VALUES (?, ?, ?, ?, ?)",
                        (title, card["price"], max(comm, 0.0), link, keyword)
                    )
                    conn.commit()
                    if cur.rowcount > 0:
                        collected += 1
                        log_print(f"SAVED #{collected}: {title[:50]} | {comm}% | {link}")
                    else:
                        log_print("Already in DB (duplicate URL).")
            except Exception as e:
                log_print(f"DB error: {e}")

        if collected < target_count:
            log_print("Scrolling to load more products...")
            dev.shell("input", "swipe", "450", "1400", "450", "400", "600")
            scroll_count += 1
            time.sleep(5)

            if scroll_count > 25:
                log_print("Too many scrolls - re-searching for fresh feed...")
                dev.shell("am", "force-stop", "com.meesho.supply")
                time.sleep(2)
                dev.shell("monkey", "-p", "com.meesho.supply", "-c", "android.intent.category.LAUNCHER", "1")
                time.sleep(8)
                do_search(dev, keyword)
                scroll_count = 0

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    log_print(f"\n{'='*60}")
    log_print(f"SESSION STOPPED at {now_str}")
    log_print(f"Total Products Saved This Run: {collected}")
    log_print("=" * 60)

if __name__ == "__main__":
    run_automation(15)
