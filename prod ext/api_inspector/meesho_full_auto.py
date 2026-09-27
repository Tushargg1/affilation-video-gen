import sys
import time
import sqlite3
import xml.etree.ElementTree as ET
import re
import subprocess as sp
import datetime
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
        conn.commit()

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

def get_center(bounds_str):
    if not bounds_str:
        return 0, 0
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str)
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

def tap_center_of_product(dev, node):
    """Tap the image area of a product card (upper ~60% of the card)."""
    bounds_str = node.attrib.get("bounds", "")
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str)
    if m:
        x1, y1, x2, y2 = map(int, m.groups())
        
        # If the card is too high up on the screen, it's obscured by the search bar
        if y1 < 200:
            return False
            
        cx = (x1 + x2) // 2
        # Tap at 30% from the top of the card (image area, not the price bar)
        cy = y1 + int((y2 - y1) * 0.3)
            
        dev.shell("input", "tap", str(cx), str(cy))
        return True
    return False

def get_clipboard():
    try:
        res = sp.run(
            ["powershell", "-command", "Get-Clipboard"],
            capture_output=True, text=True, check=True, timeout=5,
            creationflags=0x08000000
        )
        return res.stdout.strip()
    except Exception:
        return ""

def dismiss_popups(dev):
    try:
        xml = dev.dump_ui()
        if not xml:
            return
        root = ET.fromstring(xml)
        # Handle ANR "isn't responding" dialog - tap "Wait"
        anr_wait = find_node(root, "wait", clickable=True)
        anr_close = find_node(root, "close app", clickable=True)
        if anr_wait:
            log_print("ANR dialog detected! Tapping 'Wait'...")
            tap_node(dev, anr_wait)
            time.sleep(5)
            return
        if anr_close:
            log_print("ANR dialog detected! Tapping 'Close app' and restarting Meesho...")
            tap_node(dev, anr_close)
            time.sleep(3)
            return
        if find_node(root, "real images"):
            log_print("Dismissing 'Real Images' popup...")
            dev.shell("input", "keyevent", "4")
            time.sleep(2)
        # Dismiss any 'Got it' or 'OK' dialogs
        for kw in ["got it", "ok", "allow", "skip"]:
            node = find_node(root, kw, clickable=True)
            if node:
                log_print(f"Dismissing dialog: '{kw}'")
                tap_node(dev, node)
                time.sleep(1)
    except Exception:
        pass

def wait_for_results_loaded(dev, timeout=25):
    """Wait until search results are fully loaded (loading spinner gone)."""
    for i in range(timeout):
        time.sleep(1)
        try:
            xml = dev.dump_ui()
            if not xml:
                continue
            root = ET.fromstring(xml)
            # Loading is done when overlay_progress_bar is gone AND catalog cards exist
            has_loading = any(
                e.attrib.get('resource-id', '') in (
                    'com.meesho.supply:id/overlay_progress_bar',
                    'com.meesho.supply:id/iv_loading'
                )
                for e in root.iter('node')
            )
            # Check if scrim (autocomplete dropdown) is still there - tap below to dismiss
            has_scrim = any(
                'scrim' in e.attrib.get('resource-id', '')
                for e in root.iter('node')
            )
            if has_scrim:
                log_print("Autocomplete still showing, tapping below to dismiss...")
                dev.shell("input", "tap", "450", "1400")  # tap below keyboard
                time.sleep(2)
                continue
            # Only count ACTUAL clickable product cards (not the recycler container)
            cards = [e for e in root.iter('node')
                     if e.attrib.get('resource-id', '') in (
                         'com.meesho.supply:id/item_catalog_card_optimised',
                         'com.meesho.supply:id/catalog_card_optimised',
                         'item_0', 'container_0'
                     )]
            if not has_loading and len(cards) > 0:
                log_print(f"Results loaded! Found {len(cards)} product cards.")
                return True
            log_print(f"Still loading... ({i+1}s)")
        except Exception as e:
            log_print(f"Wait error: {e}")
    log_print("Timeout waiting for results.")
    return False

def init_log(keyword, skip_zero):
    try:
        with open(DB_PATH.parent / "automation.log", "a", encoding="utf-8") as f:
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
            f.write(f"\n\n{'='*50}\n▶ SESSION STARTED at {now_str}\nKeyword: '{keyword}' | Skip 0%: {skip_zero}\n{'='*50}\n")
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

EMULATOR_EXE = r"C:\Users\tusha\AppData\Local\Android\Sdk\emulator\emulator.exe"

def launch_android_emulator():
    """Launch the Pixel_8 AVD with angle_indirect GPU (stable on this machine)."""
    log_print("Auto-launching Android Studio Pixel 8 emulator (angle_indirect GPU)...")
    try:
        sp.Popen(
            [EMULATOR_EXE, "-avd", "Pixel_8", "-no-snapshot-load", "-no-boot-anim", "-gpu", "angle_indirect"],
            stdout=sp.DEVNULL,
            stderr=sp.DEVNULL,
        )
        log_print("Emulator process started. Waiting for ADB...")
    except Exception as e:
        log_print(f"Failed to launch emulator: {e}")

def ensure_emulator_running(dev):
    # First quick check - already fully booted?
    try:
        if "alive" in dev.shell("echo", "alive", timeout=5):
            boot = dev.shell("getprop", "sys.boot_completed", timeout=5).strip()
            if boot == "1":
                log_print("Emulator is ready and fully booted!")
                _disable_animations(dev)
                return True
    except Exception:
        pass

    # Auto-launch the emulator and wait for full boot
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
                log_print(f"Emulator booted! ({i*2}s elapsed) Waiting 20s for services to initialize...")
                time.sleep(20)  # Wait for settings/activity services to be ready
                _disable_animations(dev)
                return True
        except Exception:
            pass

    log_print("Timeout waiting for Android Studio Emulator.")
    return False

def _disable_animations(dev):
    """Disable Android animations for faster UI automation."""
    try:
        dev.shell("settings", "put", "global", "window_animation_scale", "0")
        dev.shell("settings", "put", "global", "transition_animation_scale", "0")
        dev.shell("settings", "put", "global", "animator_duration_scale", "0")
        log_print("Animations disabled.")
    except Exception as e:
        log_print(f"Could not disable animations (non-fatal): {e}")

def do_search(dev, keyword):
    """Search for keyword in Meesho. Returns True if search was submitted."""
    log_print(f"Searching for '{keyword}'...")
    # Tap the search bar (coordinates tuned for the Tiramisu instance)
    dev.shell("input", "tap", "450", "350")
    time.sleep(2)

    # Clear existing text
    dev.shell("input", "keyevent", "123")   # MOVE_END
    # Pass many 67 (BACKSPACE) keyevents in a single call to speed up
    backspaces = ["67"] * 40
    dev.shell("input", "keyevent", *backspaces)
    time.sleep(0.5)

    for i, word in enumerate(keyword.split()):
        if i > 0:
            dev.shell("input", "keyevent", "62") # Space
        dev.shell("input", "text", word)
        time.sleep(0.5)
    time.sleep(2)
    
    # Tap the first autocomplete suggestion directly (Y=350)
    dev.shell("input", "tap", "500", "350")
    time.sleep(3)
    # Wait for the search results to fully load
    loaded = wait_for_results_loaded(dev, timeout=60)
    if not loaded:
        log_print("WARNING: Timeout on first load. Trying tap on first search suggestion...")
        try:
            xml_hint = dev.dump_ui()
            if xml_hint:
                root_hint = ET.fromstring(xml_hint)
                for e in root_hint.iter('node'):
                    txt = e.attrib.get('text', '')
                    if e.attrib.get('clickable') == 'true' and txt and keyword.split()[0].lower() in txt.lower():
                        log_print(f"Tapping suggestion: {txt}")
                        tap_node(dev, e)
                        time.sleep(5)
                        break
        except Exception as ex:
            log_print(f"Suggestion tap failed: {ex}")
        wait_for_results_loaded(dev, timeout=20)

    # Verify we reached the results page by checking the UI
    try:
        xml = dev.dump_ui()
        if xml:
            root = ET.fromstring(xml)
            # Check for item cards or search result indicators
            cards = [e for e in root.iter('node')
                     if e.attrib.get('resource-id') == 'com.meesho.supply:id/item_catalog_card_optimised']
            if cards:
                log_print(f"Search successful! Found {len(cards)} products on first load.")
                return True
            # Also check if still on search suggestion screen (scrim overlay visible)
            scrim = find_node(root, "scrim")
            if scrim:
                log_print("Still on autocomplete, pressing Enter again...")
                dev.shell("input", "keyevent", "66")
                time.sleep(4)
    except Exception as e:
        log_print(f"Search verify error: {e}")

    log_print("On search results feed. Starting extraction...")
    return True

def run_automation(target_count=15):
    keyword = sys.argv[1] if len(sys.argv) > 1 else "mens lowers"
    skip_zero = (len(sys.argv) > 2 and sys.argv[2] == "skip_zero")
    init_log(keyword, skip_zero)
    log_print("Initializing ADB and Android Studio Pixel 8 Emulator...")
    sys.stdout.reconfigure(encoding='utf-8')
    setup_db()
    dev = AdbClient('emulator-5554')

    if not ensure_emulator_running(dev):
        log_print("Error: Could not connect to Emulator. Aborting.")
        return

    # Clear clipboard to avoid stale links
    sp.run(["powershell", "-command", "Set-Clipboard -Value 'empty'"], creationflags=0x08000000)

    log_print("Force restarting Meesho to ensure clean state...")
    dev.shell("am", "force-stop", "com.meesho.supply")
    time.sleep(2)
    dev.shell("monkey", "-p", "com.meesho.supply", "-c", "android.intent.category.LAUNCHER", "1")
    time.sleep(10)  # Wait for Meesho to fully load its home screen

    do_search(dev, keyword)

    collected = 0
    empty_count = 0
    processed_urls = set()
    scroll_count = 0

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

        root = ET.fromstring(xml)

        # Find product cards - try both resource-ids (layout can vary by app version)
        products = [
            e for e in root.iter('node')
            if e.attrib.get('resource-id', '') in (
                'com.meesho.supply:id/item_catalog_card_optimised',
                'com.meesho.supply:id/catalog_card_optimised',
                'item_0', 'container_0'
            )
        ]

        log_print(f"\nFound {len(products)} product cards. Collected {collected}/{target_count}.")

        if products:
            empty_count = 0
        else:
            empty_count += 1
            log_print(f"No products (attempt {empty_count}).")

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

        for idx, p in enumerate(products):
            if collected >= target_count:
                break

            log_print(f"\nProcessing card {idx+1}/{len(products)}...")

            # Tap the image area of the card (upper portion)
            if not tap_center_of_product(dev, p):
                log_print("Could not calculate tap coordinates. Skipping.")
                continue
            time.sleep(7)  # Wait for product detail page to load

            # Swipe horizontally on the image carousel to pause its auto-rotation
            log_print("Swiping horizontally to pause carousel animations...")
            dev.shell("input", "swipe", "800", "600", "200", "600", "500")
            time.sleep(2)

            dismiss_popups(dev)

            # Dump product detail page
            try:
                xml_detail = dev.dump_ui()
            except Exception as e:
                log_print(f"Failed to dump product details: {e}")
                xml_detail = ""
                
            if not xml_detail:
                log_print("Empty XML returned. Skipping product.")
                dev.shell("input", "keyevent", "4")
                time.sleep(2)
                continue

            if not xml_detail:
                dev.shell("input", "keyevent", "4")
                time.sleep(3)
                continue

            root_detail = ET.fromstring(xml_detail)

            # ── Extract product data ──────────────────────────────────────
            data = {"title": "", "price": 0.0, "commission_percent": 0.0, "product_url": ""}

            for elem in root_detail.iter():
                t = elem.attrib.get('text', '') or elem.attrib.get('content-desc', '')
                rid = elem.attrib.get('resource-id', '')

                # Title: first long text node that isn't a URL or email
                if len(t) > 15 and not data["title"] and "http" not in t and "@" not in t:
                    data["title"] = t.strip()

                # Price: via resource-id (robust against ₹ encoding corruption)
                if rid == 'com.meesho.supply:id/price' and not data["price"]:
                    m = re.search(r'(\d+)', t)
                    if m:
                        data["price"] = float(m.group(1))

                # Commission: look for % near "commission" keyword
                if "commission" in t.lower() and not data["commission_percent"]:
                    m = re.search(r'(\d+(?:\.\d+)?)\s*%', t)
                    if m:
                        data["commission_percent"] = float(m.group(1))

            log_print(f"Title: {data['title'][:40]} | Price: ₹{data['price']} | Commission: {data['commission_percent']}%")

            # ── Filters ───────────────────────────────────────────────────
            if not data["title"] or len(data["title"]) < 5:
                log_print("No valid title extracted, skipping.")
                dev.shell("input", "keyevent", "4")
                time.sleep(3)
                continue

            # Skip ad pages and bundle pages - but for "Similar Products", try tapping into the first product
            if any(kw in data["title"].lower() for kw in ["search for games", "install", "buy now"]):
                log_print(f"Skipping non-product page: '{data['title'][:30]}'")
                dev.shell("input", "keyevent", "4")
                time.sleep(3)
                continue



            if skip_zero and data["commission_percent"] == 0.0:
                log_print("0% commission, skipping.")
                dev.shell("input", "keyevent", "4")
                time.sleep(3)
                continue

            # ── Get affiliate link via Share → Copy ───────────────────────
            # Scroll down slightly to reveal Share button if it's below fold
            dev.shell("input", "swipe", "450", "1200", "450", "700", "400")
            time.sleep(2)

            try:
                xml2 = dev.dump_ui()
                if xml2:
                    root_detail = ET.fromstring(xml2)
            except Exception:
                pass

            share_node = find_node(root_detail, exact_text="share")
            if share_node is None:
                # Try broader search
                share_node = find_node(root_detail, "share")

            if share_node is not None:
                log_print("Tapping Share button...")
                tap_node(dev, share_node)
                time.sleep(4)

                try:
                    xml_share = dev.dump_ui()
                except Exception:
                    xml_share = None

                if xml_share:
                    root_share = ET.fromstring(xml_share)
                    copy_node = find_node(root_share, "copy to clipboard")
                    if copy_node is not None:
                        log_print("Tapping 'Copy to clipboard'...")
                        tap_node(dev, copy_node)
                        time.sleep(3)
                        clip = get_clipboard()
                        m_link = re.search(r'(https://www\.meesho\.com/s/p/[a-zA-Z0-9_-]+)', clip)
                        if m_link:
                            data["product_url"] = m_link.group(1)
                            log_print(f"Link: {data['product_url']}")
                        else:
                            # Sometimes the full URL has a different pattern
                            m_link2 = re.search(r'(https://meesho\.com[^\s]+)', clip)
                            if m_link2:
                                data["product_url"] = m_link2.group(1)
                                log_print(f"Link (alt): {data['product_url']}")
                            else:
                                log_print(f"No link in clipboard: {clip[:80]}")
                    else:
                        log_print("'Copy to clipboard' not found in share sheet.")
                        # Close share sheet
                        dev.shell("input", "keyevent", "4")
                        time.sleep(2)
                else:
                    log_print("Could not dump share sheet.")
            else:
                log_print("Share button not found.")

            # Navigate back to search results
            dev.shell("input", "keyevent", "4")
            time.sleep(2)
            # Dismiss share sheet if still open
            dev.shell("input", "keyevent", "4")
            time.sleep(2)
            # Smart wait: poll until product cards are visible again
            wait_for_results_loaded(dev, timeout=20)

            if not data["product_url"] or not data["product_url"].startswith("http"):
                log_print("No affiliate URL — not saving this product.")
                continue

            if data["product_url"] in processed_urls:
                log_print("Already processed this URL in this session, skipping.")
                continue
            processed_urls.add(data["product_url"])

            # ── Save to DB ────────────────────────────────────────────────
            try:
                with sqlite3.connect(DB_PATH) as conn:
                    cur = conn.execute(
                        'INSERT OR IGNORE INTO auto_products (title, price, commission_percent, product_url, category) VALUES (?, ?, ?, ?, ?)',
                        (data["title"], data["price"], data["commission_percent"], data["product_url"], keyword)
                    )
                    conn.commit()
                    if cur.rowcount > 0:
                        collected += 1
                        log_print(f"✅ SAVED #{collected}: {data['title'][:40]}")
                    else:
                        log_print("Already in DB (duplicate URL).")
            except Exception as e:
                log_print(f"DB error: {e}")

        # ── Scroll down to load more products ─────────────────────────────
        if collected < target_count:
            log_print("Scrolling to load more products...")
            dev.shell("input", "swipe", "450", "1400", "450", "400", "600")
            scroll_count += 1
            time.sleep(6)  # Give extra time for images to load after scroll

            # After many scrolls, re-search to get a fresh feed
            if scroll_count > 20:
                log_print("Too many scrolls. Re-searching for fresh feed...")
                dev.shell("am", "force-stop", "com.meesho.supply")
                time.sleep(2)
                dev.shell("monkey", "-p", "com.meesho.supply", "-c", "android.intent.category.LAUNCHER", "1")
                time.sleep(8)
                do_search(dev, keyword)
                scroll_count = 0

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    log_print(f"\n{'='*50}")
    log_print(f"⏹ SESSION STOPPED at {now_str}")
    log_print(f"Total Products Saved This Run: {collected}")
    log_print("="*50)

if __name__ == "__main__":
    run_automation(15)
