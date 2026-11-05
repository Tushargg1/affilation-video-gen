import sys
import time
import re
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
sys.path.append('prod ext/api_inspector')
from meesho_emulator_collector import AdbClient
from meesho_full_auto import _find_cards_in_root, parse_card

dev = AdbClient('emulator-5554')

for i in range(5):
    print(f"\n--- SCROLL STEP {i+1} ---")
    dev.shell('input', 'swipe', '540', '1600', '540', '600', '400')
    time.sleep(3)
    xml = dev.dump_ui()
    if not xml:
        continue
    root = ET.fromstring(xml)
    
    # Check headers
    headers = []
    for e in root.iter('node'):
        t = e.attrib.get('text', '').strip()
        rid = e.attrib.get('resource-id', '')
        b = e.attrib.get('bounds', '')
        if any(k in t.lower() for k in ["you may also like", "similar", "premium", "gold"]):
            headers.append((t, rid, b))
    if headers:
        print("Found Headers:", headers)
        
    # Check all cards and all clickable items on screen
    cards = _find_cards_in_root(root)
    print(f"Cards found by _find_cards_in_root: {len(cards)}")
    for idx, c in enumerate(cards):
        p = parse_card(c)
        print(f"  Card {idx}: {p['title'][:30]} | Rs{p['price']} | {p['commission_percent']}% | {p['bounds']}")
        
    # Save if any header was found
    if headers:
        open(f'prod ext/api_inspector/data/header_dump_{i+1}.xml', 'w', encoding='utf-8').write(xml)
