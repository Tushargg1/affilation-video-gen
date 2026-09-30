import sys
import re
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

REC_KEYWORDS = [
    "similar products",
    "you may also like",
    "premium quality",
    "gold premium quality",
    "people also viewed",
    "more like this",
    "recommended for you",
    "trending now",
    "frequently viewed",
]

def parse_bounds(b_str):
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', b_str or '')
    if m:
        return tuple(map(int, m.groups()))
    return None

def find_exclusion_zones(root):
    """
    Find vertical zones [y1, y2] on screen that contain recommendation widgets
    or recommendation headings.
    """
    zones = []
    
    # 1. Any velocity_widget (Meesho's container for carousels & recs)
    for e in root.iter('node'):
        rid = e.attrib.get('resource-id', '')
        if rid == 'com.meesho.supply:id/velocity_widget':
            b = parse_bounds(e.attrib.get('bounds'))
            if b:
                x1, y1, x2, y2 = b
                zones.append((y1, y2, "velocity_widget"))
                
    # 2. Any node with text matching recommendation headings
    for e in root.iter('node'):
        t = e.attrib.get('text', '').strip().lower()
        if any(kw in t for kw in REC_KEYWORDS):
            b = parse_bounds(e.attrib.get('bounds'))
            if b:
                hx1, hy1, hx2, hy2 = b
                # If inside an existing zone, skip
                already_covered = any(zy1 <= hy1 and hy2 <= zy2 for zy1, zy2, _ in zones)
                if not already_covered:
                    # The widget extends below the heading, typically by ~700-900px
                    zones.append((hy1, hy1 + 850, f"heading: {t}"))
                    
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

for fname in ['prod ext/api_inspector/data/pdp_back_dump.xml', 'prod ext/api_inspector/data/header_dump_3.xml', 'prod ext/api_inspector/data/current_dump.xml']:
    tree = ET.parse(fname)
    root = tree.getroot()
    zones = find_exclusion_zones(root)
    print(f"\nFile: {fname}")
    print(f"Exclusion zones found: {zones}")
    
    # Check all product cards
    cards = [e for e in root.iter("node") if e.attrib.get("resource-id", "") in (
        "com.meesho.supply:id/item_catalog_card_optimised",
        "com.meesho.supply:id/catalog_card_optimised",
    )]
    print(f"Total cards before filter: {len(cards)}")
    valid_cards = []
    for c in cards:
        cb = parse_bounds(c.attrib.get('bounds'))
        if not cb:
            continue
        cx = (cb[0] + cb[2]) // 2
        cy = (cb[1] + cb[3]) // 2
        # Check if card center or overlap is in any exclusion zone
        in_rec = any(zy1 <= cy <= zy2 or (cb[1] < zy2 and cb[3] > zy1) for zy1, zy2, _ in zones)
        if in_rec:
            print(f"  SKIPPING CARD in rec zone: bounds={cb}, center=({cx}, {cy})")
        else:
            valid_cards.append((c, cb, (cx, cy)))
            print(f"  VALID SEARCH CARD: bounds={cb}, center=({cx}, {cy})")
