"""
Live diagnostic - searches for mens lowers, waits, then dumps ALL node resource-ids
from the results page so we can see the ACTUAL structure.
"""
import sys
import time
import xml.etree.ElementTree as ET
from collections import Counter
sys.path.insert(0, r'c:\Users\tusha\OneDrive\Desktop\affilation video gen\prod ext\api_inspector')
from meesho_emulator_collector import AdbClient

dev = AdbClient('emulator-5554')

print("[1] Opening Meesho...")
dev.shell('am', 'force-stop', 'com.meesho.supply')
time.sleep(2)
dev.shell('monkey', '-p', 'com.meesho.supply', '-c', 'android.intent.category.LAUNCHER', '1')
time.sleep(10)

print("[2] Tapping search bar...")
dev.shell('input', 'tap', '450', '174')
time.sleep(2)

print("[3] Clearing & typing keyword...")
dev.shell('input', 'keyevent', '123')
for _ in range(40):
    dev.shell('input', 'keyevent', '67')
time.sleep(0.5)
dev.shell('input', 'text', 'mens%slowers')
time.sleep(2)
dev.shell('input', 'keyevent', '66')
time.sleep(8)

print("[4] Dumping search results UI...")
xml = dev.dump_ui()
root = ET.fromstring(xml)

# Count all resource-ids
rids = Counter()
for e in root.iter('node'):
    rid = e.attrib.get('resource-id', '(none)')
    if rid != '(none)':
        rids[rid] += 1

print("\n=== RESOURCE-IDs ON SEARCH RESULTS PAGE ===")
for rid, count in rids.most_common(30):
    print(f"  {count}x  {rid}")

# Check specifically for catalog cards
cards = [e for e in root.iter('node') if 'catalog_card' in e.attrib.get('resource-id', '')]
print(f"\nCatalog card nodes found: {len(cards)}")
for c in cards:
    print(f"  -> {c.attrib.get('resource-id')} | clickable={c.attrib.get('clickable')} | bounds={c.attrib.get('bounds')}")

# Check clickable nodes near price info
print("\n=== CLICKABLE NODES WITH PRICE-LIKE CHILDREN ===")
for e in root.iter('node'):
    if e.attrib.get('clickable') != 'true':
        continue
    for child in e.iter():
        txt = child.attrib.get('text','')
        if txt and any(c.isdigit() for c in txt) and '?' in txt or ('price' in child.attrib.get('resource-id','').lower()):
            print(f"  -> parent-id: {e.attrib.get('resource-id','')} | child-id: {child.attrib.get('resource-id','')} | text: {txt}")
            break
