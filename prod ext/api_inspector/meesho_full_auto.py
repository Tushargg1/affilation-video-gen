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
import sys, time, psycopg2, re, subprocess as sp, datetime
import xml.etree.ElementTree as ET
import io
from PIL import Image
from pathlib import Path
from meesho_emulator_collector import AdbClient

DB_PATH = Path("data/meesho_products.db")

def setup_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    # Supabase PostgreSQL schema is already initialized.
    pass

session_id = None

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

def get_screencap(dev):
    try:
        cmd = [dev.adb, "-s", dev.serial, "exec-out", "screencap", "-p"]
        r = sp.run(cmd, capture_output=True, timeout=10, creationflags=0x08000000)
        if r.returncode == 0 and len(r.stdout) > 1000:
            return r.stdout
    except Exception as e:
        log_print(f"screencap error: {e}")
    return None

def is_heart_red(png_bytes, bounds_str):
    try:
        if not png_bytes or not bounds_str: return False
        m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str)
        if not m: return False
        x1, y1, x2, y2 = map(int, m.groups())
        
        img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
        crop = img.crop((x1, y1, x2, y2))
        
        red_pixels = 0
        for count, color in crop.getcolors(maxcolors=100000) or []:
            r, g, b = color
            if r > 180 and g < 100 and b < 100:
                red_pixels += count
                
        return red_pixels > 50
    except Exception:
        return False

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

# Resource IDs that are part of normal Meesho UI (NOT popups) - never tap these in dismiss
_NORMAL_UI_CLOSE_IDS = {
    "com.meesho.supply:id/close_button",       # main home screen element
    "com.meesho.supply:id/iv_close",           # close on search bar
    "com.meesho.supply:id/back_button",
    "com.meesho.supply:id/navigate_up",
}

def _is_real_popup(root):
    """Check if there's an actual overlay/dialog on screen (not the main UI)."""
    for e in root.iter():
        cls = e.attrib.get("class", "")
        if cls in ("android.app.Dialog", "android.widget.PopupWindow",
                   "androidx.appcompat.app.AlertDialog"):
            return True
    # If a FrameLayout covers the full screen on top of Meesho content, it's likely a dialog
    return False

def dismiss_popups(dev):
    try:
        xml = dev.dump_ui()
        if not xml:
            return
        root = ET.fromstring(xml)

        # ANR dialogs
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

        # Specific known popup buttons (text-based match)
        popup_dismiss_keywords = [
            "continue shopping",   # "7 Days Easy Returns" popup
            "got it",
            "allow",
            "not now",
            "maybe later",
            "no thanks",
            "skip",
            "close",
            "x"
        ]
        for kw in popup_dismiss_keywords:
            node = find_node(root, exact_text=kw, clickable=True)
            if not node:
                node = find_node(root, text_query=kw, clickable=True)
            if node:
                log_print(f"Dismissing popup via button: '{kw}'")
                tap_node(dev, node)
                time.sleep(1.5)
                return
        
        # Look for typical Ad close buttons by ID
        ad_close_ids = ["com.meesho.supply:id/close", "com.meesho.supply:id/iv_close_button"]
        for rid in ad_close_ids:
            node = find_node(root, resource_id=rid, clickable=True)
            if node:
                log_print(f"Dismissing popup via ID: '{rid}'")
                tap_node(dev, node)
                time.sleep(1.5)
                return

        # "Real images" popup
        if find_node(root, "real images"):
            log_print("Dismissing 'Real Images' popup...")
            dev.shell("input", "keyevent", "4")
            time.sleep(2)
            return

    except Exception as e:
        log_print(f"dismiss_popups error (non-fatal): {e}")

# Recommendation headings that Meesho injects dynamically into search feed
EXCLUDE_HEADINGS = [
    "similar products",
    "you may also like",
    "premium quality",
    "gold premium quality",
    "gold",
    "people also viewed",
    "more like this",
    "recommended for you",
    "trending now",
    "frequently viewed",
]

def parse_bounds_tuple(b_str):
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', b_str or '')
    return tuple(map(int, m.groups())) if m else None

def find_exclusion_zones(root):
    """
    Find vertical zones [y1, y2] on screen that contain recommendation widgets
    or recommendation headings.
    """
    zones = []
    # 1. Any velocity_widget (Meesho's container for carousels & recommendations)
    for e in root.iter("node"):
        rid = e.attrib.get("resource-id", "")
        if rid == "com.meesho.supply:id/velocity_widget":
            b = parse_bounds_tuple(e.attrib.get("bounds"))
            if b:
                zones.append((b[1], b[3], "velocity_widget"))

    # 2. Check for recommendation headings and find their enclosing container
    parent_map = {c: p for p in root.iter() for c in p}
    for e in root.iter("node"):
        t = e.attrib.get("text", "").strip().lower()
        if any(h in t for h in EXCLUDE_HEADINGS):
            hb = parse_bounds_tuple(e.attrib.get("bounds"))
            if not hb:
                continue
            hy1, hy2 = hb[1], hb[3]
            if any(zy1 <= hy1 and hy2 <= zy2 for zy1, zy2, _ in zones):
                continue
            curr = e
            found = False
            while curr in parent_map:
                curr = parent_map[curr]
                cb = parse_bounds_tuple(curr.attrib.get("bounds"))
                if cb and cb[0] <= 60 and cb[2] >= 950 and (cb[3] - cb[1]) > 300:
                    zones.append((cb[1], cb[3], f"heading_container: {t}"))
                    found = True
                    break
            if not found:
                zones.append((hy1, hy1 + 750, f"heading_fallback: {t}"))

    # Merge overlapping zones
    if not zones:
        return []
    zones.sort(key=lambda z: z[0])
    merged = []
    curr_y1, curr_y2, curr_lbl = zones[0]
    for y1, y2, lbl in zones[1:]:
        if y1 <= curr_y2:
            curr_y2 = max(curr_y2, y2)
            curr_lbl += f" + {lbl}"
        else:
            merged.append((curr_y1, curr_y2, curr_lbl))
            curr_y1, curr_y2, curr_lbl = y1, y2, lbl
    merged.append((curr_y1, curr_y2, curr_lbl))
    return merged

# All known resource-ids for product cards across Meesho app versions
CARD_RIDS = {
    "com.meesho.supply:id/item_catalog_card_optimised",
    "com.meesho.supply:id/catalog_card_optimised",
    "com.meesho.supply:id/catalog_recycler_view",  # parent container
}

def _find_cards_in_root(root, exclusion_zones=None):
    """Find product cards using multiple possible resource-ids, strictly excluding recommendation zones."""
    if exclusion_zones is None:
        exclusion_zones = find_exclusion_zones(root)

    raw_cards = [e for e in root.iter("node")
                 if e.attrib.get("resource-id", "") in (
                     "com.meesho.supply:id/item_catalog_card_optimised",
                     "com.meesho.supply:id/catalog_card_optimised",
                 )]
    if not raw_cards:
        # Fallback: look for clickable ViewGroup children of the catalog recycler
        recycler = None
        for e in root.iter("node"):
            if e.attrib.get("resource-id", "") in (
                    "com.meesho.supply:id/catalog_recycler_view",
                    "com.meesho.supply:id/recycler_wrapper",):
                recycler = e
                break
        if recycler is not None:
            raw_cards = [e for e in recycler
                         if e.attrib.get("clickable") == "true"
                         and e.attrib.get("class", "") in (
                             "android.view.ViewGroup",
                             "android.widget.FrameLayout",
                             "android.widget.LinearLayout",)]

    filtered_cards = []
    for c in raw_cards:
        b = parse_bounds_tuple(c.attrib.get("bounds"))
        if not b:
            continue
        cy = (b[1] + b[3]) // 2
        # Check if card center or bounds overlap any exclusion zone
        in_zone = any(zy1 <= cy <= zy2 or (b[1] < zy2 and b[3] > zy1) for zy1, zy2, _ in exclusion_zones)
        if in_zone:
            continue
        filtered_cards.append(c)

    return filtered_cards

def wait_for_results_loaded(dev, timeout=25):
    for i in range(timeout):
        time.sleep(1)
        try:
            xml = dev.dump_ui()
            if not xml:
                continue
            root = ET.fromstring(xml)

            # Dismiss any popups that may be blocking the search results
            if i % 3 == 0:  # check every 3 seconds
                dismiss_popups(dev)

            # If we're not even in Meesho, skip
            meesho_nodes = [e for e in root.iter("node")
                            if e.attrib.get("package", "") == "com.meesho.supply"]
            if not meesho_nodes:
                log_print(f"Not in Meesho yet ({i+1}s)...")
                continue

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

            # Verify it is ACTUALLY the search feed, not the home feed!
            # Search feeds usually have a back button '<' or 'navigate up' in the top bar
            # Or the search bar EditText contains the keyword we searched for!
            is_search_feed = False
            for e in root.iter("node"):
                rid = e.attrib.get("resource-id", "")
                if rid in ("com.meesho.supply:id/back_button", "com.meesho.supply:id/navigate_up"):
                    is_search_feed = True
                    break
                if e.attrib.get("class", "") == "android.widget.EditText":
                    text = e.attrib.get("text", "").lower()
                    if text and text != "search by keyword or product id":
                        is_search_feed = True
                        break

            cards = _find_cards_in_root(root)
            if not has_loading and len(cards) > 0:
                if is_search_feed:
                    log_print(f"Results loaded! Found {len(cards)} product cards.")
                    return True
                else:
                    log_print(f"Cards found, but looks like HOME FEED, not search feed! Still waiting... ({i+1}s)")
                    continue

            # Also check if catalog recycler is present
            has_recycler = any(
                e.attrib.get("resource-id", "") in (
                    "com.meesho.supply:id/catalog_recycler_view",
                    "com.meesho.supply:id/recycler_wrapper",
                    "com.meesho.supply:id/search_recycler_view",)
                for e in root.iter("node"))
            if has_recycler and not has_loading and is_search_feed:
                log_print("Catalog recycler found, assuming results loaded.")
                return True

            log_print(f"Still loading... ({i+1}s)")
        except Exception as e:
            log_print(f"Wait error: {e}")
    log_print("Timeout - proceeding anyway (results may be visible).")
    return False  # Don't block forever, return failure so we can retry search


SEARCH_BAR_RIDS = [
    # Confirmed from actual XML dumps (current_ui.xml = home screen):
    "com.meesho.supply:id/query_edit_text",   # EditText on home screen [148,300][839,405]
    "com.meesho.supply:id/searchBoxHome",     # LinearLayout on home screen
    "com.meesho.supply:id/search_box",        # LinearLayout on search results page
    # Other possible IDs:
    "com.meesho.supply:id/et_search",
    "com.meesho.supply:id/search_src_text",
]

def _find_search_bar(root):
    """Find the Meesho search bar EditText element by resource-id."""
    # Prefer the actual EditText input field
    for e in root.iter():
        rid = e.attrib.get("resource-id", "")
        cls = e.attrib.get("class", "")
        if rid == "com.meesho.supply:id/query_edit_text" and cls == "android.widget.EditText":
            return e
    # Fallback: any of the known container IDs
    for rid_target in SEARCH_BAR_RIDS:
        for e in root.iter():
            if e.attrib.get("resource-id", "") == rid_target:
                return e
    # Last fallback: any EditText with search hint
    for e in root.iter():
        if e.attrib.get("class", "") == "android.widget.EditText":
            hint = (e.attrib.get("text", "") + e.attrib.get("content-desc", "")).lower()
            if "search" in hint or "keyword" in hint or "product" in hint:
                return e
    return None

def wait_for_home_loaded(dev, timeout=30):
    """Wait until the Meesho home screen is fully displayed."""
    for i in range(timeout):
        time.sleep(1)
        try:
            if i % 3 == 0:
                dismiss_popups(dev)
            xml = dev.dump_ui()
            if not xml:
                continue
            root = ET.fromstring(xml)
            bar = _find_search_bar(root)
            if bar is not None:
                bounds = bar.attrib.get("bounds", "")
                log_print(f"Home screen ready! Search bar found: {bar.attrib.get('resource-id')} bounds={bounds}")
                return root, bar
        except Exception as e:
            log_print(f"Home wait error: {e}")
    log_print("Timeout waiting for home screen. Proceeding anyway.")
    return None, None

def do_search(dev, keyword):
    log_print(f"Searching for '{keyword}'...")

    # Wait for home screen to fully load and find search bar
    log_print("Waiting for Meesho home screen to load...")
    root, search_bar = wait_for_home_loaded(dev, timeout=30)

    if search_bar is not None:
        rid = search_bar.attrib.get("resource-id", "")
        log_print(f"Tapping search bar: {rid}")
        tap_node(dev, search_bar)
        time.sleep(1.5)
    else:
        # Ultimate fallback: use the confirmed bounds from XML analysis [148,300][839,405]
        log_print("Search bar not found, tapping confirmed home-screen coords (540, 352)...")
        dev.shell("input", "tap", "540", "352")
        time.sleep(1.5)

    # Clear any existing text
    dev.shell("input", "keyevent", "KEYCODE_CTRL_A")
    time.sleep(0.3)
    dev.shell("input", "keyevent", "67")  # DEL
    time.sleep(0.3)
    dev.shell("input", "keyevent", "123")  # MOVE_END
    backspaces = ["67"] * 60
    dev.shell("input", "keyevent", *backspaces)
    time.sleep(0.5)

    # Also try: clear via clear_search_query button if present
    try:
        xml2 = dev.dump_ui()
        if xml2:
            root2 = ET.fromstring(xml2)
            clear_btn = None
            for e in root2.iter():
                if e.attrib.get("resource-id", "") == "com.meesho.supply:id/clear_search_query":
                    clear_btn = e
                    break
            if clear_btn:
                log_print("Tapping clear_search_query...")
                tap_node(dev, clear_btn)
                time.sleep(0.5)
    except Exception:
        pass

    # Type keyword
    log_print(f"Typing '{keyword}'...")
    for i, word in enumerate(keyword.split()):
        if i > 0:
            dev.shell("input", "keyevent", "62")  # space
        dev.shell("input", "text", word)
        time.sleep(0.4)
    time.sleep(1.5)

    # Press Enter to submit search
    log_print("Pressing Enter to search...")
    dev.shell("input", "keyevent", "66")
    time.sleep(4)

    success = wait_for_results_loaded(dev, timeout=20)
    if not success:
        log_print("Failed to reach search feed! Retrying search...")
        # Press back a few times in case we are stuck in autocomplete or an ad
        dev.shell("input", "keyevent", "4")
        time.sleep(1)
        dev.shell("input", "keyevent", "4")
        time.sleep(2)
        # Try tapping search bar again
        root2, bar2 = wait_for_home_loaded(dev, timeout=10)
        if bar2 is not None:
            tap_node(dev, bar2)
            time.sleep(1.5)
            dev.shell("input", "keyevent", "66")
            time.sleep(4)
            wait_for_results_loaded(dev, timeout=30)
            
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
    "com.meesho.supply:id/dynamicBannerTextTv",
    "com.meesho.supply:id/special_price_txt",
}

BAD_TITLE_PATTERNS = [
    "discount", "applied", "special offer", "repurchased", "best seller",
    "ends in", "free delivery", "rating", "fresh drops", "similar",
    "you may also like", "premium quality", "gold"
]

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
        "wishlist_bounds": "",
        "is_wishlisted": False,
    }
    for elem in card_elem.iter():
        rid = elem.attrib.get("resource-id", "")
        t   = elem.attrib.get("text", "").strip()
        c   = elem.attrib.get("content-desc", "").strip()
        val = t or c

        # Detect Wishlist Heart Icon
        if "wishlist" in rid.lower() or "fav" in rid.lower() or "save" in rid.lower() or "heart" in rid.lower():
            if elem.attrib.get("class", "") in ("android.widget.ImageView", "android.widget.ImageButton"):
                data["wishlist_bounds"] = elem.attrib.get("bounds", "")
                data["is_wishlisted"] = (elem.attrib.get("selected") == "true" or elem.attrib.get("checked") == "true")
        # In case the ID doesn't have those keywords, but content-desc does:
        elif ("wishlist" in c.lower() or "remove" in c.lower() or "added" in c.lower()):
            if elem.attrib.get("class", "") in ("android.widget.ImageView", "android.widget.ImageButton"):
                data["wishlist_bounds"] = elem.attrib.get("bounds", "")
                if "remove" in c.lower() or elem.attrib.get("selected") == "true":
                    data["is_wishlisted"] = True

        if "commission" in val.lower() or rid == "com.meesho.supply:id/affiliate_commission_text":
            m = re.search(r'(\d+(?:\.\d+)?)\s*%', val)
            if m:
                data["commission_percent"] = float(m.group(1))

        elif rid == "com.meesho.supply:id/price" and not data["price"]:
            m = re.search(r'(\d+)', val)
            if m:
                data["price"] = float(m.group(1))

        elif rid == "com.meesho.supply:id/share_shop":
            data["share_bounds"] = elem.attrib.get("bounds", "")

        elif (len(val) > 8 and not data["title"]
              and "http" not in val and "%" not in val and "@" not in val
              and ":" not in val
              and rid not in SKIP_RIDS
              and not any(bp in val.lower() for bp in BAD_TITLE_PATTERNS)):
            data["title"] = val

    return data

def get_link_via_card_share(dev, card_data):
    """
    Get affiliate link by opening the product page (PDP) and tapping the Share button.
    """
    opened_pdp = False

    # Tap the product card center to open Product Details Page (PDP)
    cx, cy = get_center(card_data.get("bounds", ""))
    if cx <= 0 or cy <= 0:
        log_print("Invalid card bounds for opening product.")
        return ""
    log_print(f"Opening product page at ({cx}, {cy})...")
    tap_xy(dev, cx, cy)
    time.sleep(3)
    opened_pdp = True

    # On PDP, find the Share button and full title
    try:
        xml_pdp = dev.dump_ui()
        if xml_pdp:
            root_pdp = ET.fromstring(xml_pdp)
            # Extract exact title from PDP
            title_node = find_node(root_pdp, resource_id="com.meesho.supply:id/product_name_text_with_brand")
            if title_node is None:
                for e in root_pdp.iter("node"):
                    rid = e.attrib.get("resource-id", "")
                    if "product_name" in rid.lower() or "product_title" in rid.lower():
                        title_node = e
                        break
            if title_node is not None and title_node.attrib.get("text"):
                card_data["title"] = title_node.attrib.get("text").strip()
            elif not card_data.get("title") or any(bp in card_data.get("title","").lower() for bp in BAD_TITLE_PATTERNS):
                excluded_pdp_words = [
                    "commission", "off", "order", "return", "offer", "discount",
                    "ends in", "similar", "h :", "m :", "s :", "gold", "quality",
                    "select", "size", "stitch", "fresh drops", "special price",
                    "free delivery", "rating", "buy at", "wishlist", "share"
                ]
                for e in root_pdp.iter("node"):
                    t = e.attrib.get("text", "").strip()
                    rid = e.attrib.get("resource-id", "")
                    if len(t) > 10 and not any(k in t.lower() for k in excluded_pdp_words):
                        if "name" in rid.lower() or "title" in rid.lower() or e.attrib.get("class") == "android.widget.TextView":
                            card_data["title"] = t
                            break

            # Find Share button on PDP
            share_node = find_node(root_pdp, resource_id="com.meesho.supply:id/share_others")
            if share_node is None:
                share_node = find_node(root_pdp, exact_text="Share", clickable=True)
            
            if share_node is not None:
                # Tap top-right area of share button to avoid floating voice assistant mic
                sb = share_node.attrib.get("bounds", "")
                m_sb = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', sb)
                if m_sb:
                    sx1, sy1, sx2, sy2 = map(int, m_sb.groups())
                    tap_xy(dev, sx2 - 30, sy1 + 25)
                else:
                    tap_node(dev, share_node)
            else:
                tap_xy(dev, 1020, 1960)
        else:
            tap_xy(dev, 1020, 1960)
    except Exception as e:
        log_print(f"PDP share dump error: {e}")
        tap_xy(dev, 1020, 1960)

    time.sleep(2.5)

    # Share sheet is open - find and tap "Copy to clipboard"
    set_clipboard("empty")
    try:
        xml_share = dev.dump_ui()
        if xml_share:
            root_share = ET.fromstring(xml_share)
            copy_node = find_node(root_share, resource_id="com.meesho.supply:id/share_channel_copy_to_clipboard")
            if not copy_node:
                for kw in ["copy to clipboard", "copy link", "copy"]:
                    copy_node = find_node(root_share, kw, clickable=True)
                    if copy_node:
                        break
            if copy_node is not None:
                log_print("Tapping Copy to clipboard...")
                tap_node(dev, copy_node)
                time.sleep(2.5)
            else:
                tap_xy(dev, 930, 1828)
                time.sleep(2.5)
    except Exception as e:
        log_print(f"Share sheet error: {e}")
        tap_xy(dev, 930, 1828)
        time.sleep(2.5)

    clip = get_clipboard()
    log_print(f"Clipboard: {clip[:120]}")

    link = ""
    for pattern in [
        r'(https://www\.meesho\.com/s/p/[a-zA-Z0-9_-]+)',
        r'(https://meesho\.com[^\s]+)',
        r'(https?://[^\s]+meesho[^\s]+)',
    ]:
        m_link = re.search(pattern, clip)
        if m_link:
            link = m_link.group(1)
            break

    if not link:
        log_print("No Meesho link found in clipboard.")

    # If we opened PDP, click the Wishlist heart on PDP before returning
    if opened_pdp:
        try:
            xml_pdp2 = dev.dump_ui()
            root_pdp2 = ET.fromstring(xml_pdp2)
            wish_node = find_node(root_pdp2, resource_id="com.meesho.supply:id/wishlist")
            if not wish_node:
                wish_node = find_node(root_pdp2, exact_text="Wishlist", clickable=True)
            
            if wish_node is not None:
                log_print("Tapping Wishlist on PDP...")
                tap_node(dev, wish_node)
                time.sleep(1.0)
            else:
                log_print("Tapping Wishlist on PDP (fallback coords)...")
                tap_xy(dev, 840, 2000)
                time.sleep(1.0)
        except Exception as e:
            log_print(f"Failed to tap wishlist on PDP: {e}")

        log_print("Returning to search results feed...")
        dev.shell("input", "keyevent", "4")
        time.sleep(1.5)
        try:
            curr_xml = dev.dump_ui()
            if curr_xml and "item_catalog_card_optimised" not in curr_xml:
                dev.shell("input", "keyevent", "4")
                time.sleep(1.5)
        except Exception:
            pass

    return link

def run_automation(target_count=9999999):
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
    last_extract_time = time.time()
    processed_urls = set()
    visited_keys_on_screen = set()
    
    global session_id
    try:
        with psycopg2.connect("postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require") as conn:
            cur = conn.cursor()
            cur.execute("INSERT INTO extraction_sessions (keyword) VALUES (%s) RETURNING id", (keyword,))
            session_id = cur.fetchone()[0]
            conn.commit()
    except Exception as e:
        log_print(f"Error creating session: {e}")

    # Pre-populate processed_urls from database to avoid re-scraping existing items
    try:
        with psycopg2.connect("postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require") as conn:
            cur = conn.cursor()
            cur.execute("SELECT product_url FROM auto_products WHERE product_url IS NOT NULL")
            for row in cur.fetchall():
                if row[0]:
                    processed_urls.add(row[0])
        log_print(f"Loaded {len(processed_urls)} existing product URLs from DB for de-duplication.")
    except Exception as e:
        log_print(f"Error loading existing URLs: {e}")

    while collected < target_count:
        if time.time() - last_extract_time > 300:
            log_print("No products extracted for 5 minutes (app may be stuck). Restarting Meesho...")
            dev.shell("am", "force-stop", "com.meesho.supply")
            time.sleep(2)
            dev.shell("monkey", "-p", "com.meesho.supply", "-c", "android.intent.category.LAUNCHER", "1")
            time.sleep(8)
            do_search(dev, keyword)
            empty_count = 0
            scroll_count = 0
            last_extract_time = time.time()
            continue

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

        # Detect recommendation exclusion zones (velocity_widget, headings like Similar Products, You may also like, etc.)
        zones = find_exclusion_zones(root)
        if zones:
            log_print(f"Active exclusion zones: {[z[2] for z in zones]}")

        cards = _find_cards_in_root(root, exclusion_zones=zones)
        log_print(f"\nFound {len(cards)} search cards outside recommendation zones. Collected {collected}/{target_count}.")

        # Find candidate cards that are fully visible and not visited on this scroll position
        valid_candidates = []
        for c in cards:
            b = parse_bounds_tuple(c.attrib.get("bounds"))
            if not b:
                continue
            x1, y1, x2, y2 = b
            # Safe viewport check: top search/filters end ~320, bottom mic/nav starts ~2150
            if y1 < 320 or y2 > 2150 or (y2 - y1) < 350:
                continue

            card = parse_card(c)
            # Spatial/content key for current scroll viewport
            card_key = f"{round(card['price'], 1)}_{round(card['commission_percent'], 1)}_{x1 // 100}_{y1 // 100}"
            if card_key in visited_keys_on_screen:
                continue

            valid_candidates.append((c, card, b, card_key))

        if not valid_candidates:
            empty_count += 1
            log_print(f"No unvisited search cards in current view (attempt {empty_count}). Scrolling down...")
            dev.shell("input", "swipe", "540", "1500", "540", "550", "450")
            scroll_count += 1
            visited_keys_on_screen.clear()
            time.sleep(3.5)

            if empty_count >= 8:
                log_print("End of search results reached (8 consecutive empty scrolls). Stopping automation gracefully.")
                break
            continue

        empty_count = 0

        # Process the topmost unvisited candidate card
        cand_elem, card, b, card_key = valid_candidates[0]
        visited_keys_on_screen.add(card_key)
        
        # Take a screenshot to visually detect if the heart is red
        png = get_screencap(dev)
        if is_heart_red(png, card.get("share_bounds")):
            card["is_wishlisted"] = True

        comm = card["commission_percent"]
        comm_str = f"{comm}%" if comm >= 0 else "not shown"
        log_print(f"\nTargeting Search Card | Price: Rs{card['price']} | Commission: {comm_str} | Title: {card['title'][:40]}")

        # Skip already wishlisted products
        if card.get("is_wishlisted"):
            log_print("Product already wishlisted (red heart visually detected) -> SKIPPING.")
            continue

        # Skip 0% commission immediately without opening product
        if comm == 0.0:
            log_print("0% Commission -> SKIPPING (no product page open).")
            continue
        if comm < 0 and skip_zero:
            log_print("Commission not shown on card, skip_zero=True -> SKIPPING.")
            continue

        # Open PDP, get share link, and return to feed
        link = get_link_via_card_share(dev, card)
        time.sleep(1.5)

        # Verify still on search results
        try:
            chk_xml = dev.dump_ui()
            if chk_xml:
                chk_root = ET.fromstring(chk_xml)
                chk_cards = _find_cards_in_root(chk_root)
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
            log_print(f"URL already processed ({link}), skipping.")
            continue
        processed_urls.add(link)

        title = card["title"] or f"Product @ Rs{card['price']}"

        try:
            with psycopg2.connect("postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require") as conn:
                cur = conn.cursor()
                cur.execute(
                    "INSERT INTO auto_products "
                    "(commission_percent, product_url, category, title, price) "
                    "VALUES (%s, %s, %s, %s, %s) ON CONFLICT (product_url) DO NOTHING",
                    (max(comm, 0.0), link, keyword, title, card.get("price", 0.0))
                )
                conn.commit()
                if cur.rowcount > 0:
                    collected += 1
                    last_extract_time = time.time()
                    log_print(f"SAVED #{collected}: {title[:50]} | {comm}% | {link}")
                    if session_id:
                        cur.execute("UPDATE extraction_sessions SET total_extracted = %s WHERE id = %s", (collected, session_id))
                        conn.commit()
                else:
                    log_print("Already in DB (duplicate URL).")
        except Exception as e:
            log_print(f"DB error: {e}")

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    log_print(f"\n{'='*60}")
    log_print(f"SESSION STOPPED at {now_str}")
    log_print(f"Total Products Saved This Run: {collected}")
    log_print("=" * 60)

if __name__ == "__main__":
    run_automation(9999999)
