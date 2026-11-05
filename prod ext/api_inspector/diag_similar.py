"""
Diagnostic: Search for 'mens lowers', tap first card, dump the Similar Products page structure
"""
import sys, time, xml.etree.ElementTree as ET
sys.path.insert(0, r'c:\Users\tusha\OneDrive\Desktop\affilation video gen\prod ext\api_inspector')
from meesho_emulator_collector import AdbClient
import re

dev = AdbClient('127.0.0.1:5915')
print("[1] Restarting Meesho...")
dev.shell('am', 'force-stop', 'com.meesho.supply')
time.sleep(2)
dev.shell('monkey', '-p', 'com.meesho.supply', '-c', 'android.intent.category.LAUNCHER', '1')
time.sleep(10)

print("[2] Searching...")
dev.shell('input', 'tap', '450', '174')
time.sleep(2)
dev.shell('input', 'keyevent', '123')
for _ in range(40): dev.shell('input', 'keyevent', '67')
time.sleep(0.5)
dev.shell('input', 'text', 'mens%slowers')
time.sleep(2)
dev.shell('input', 'keyevent', '66')
time.sleep(8)

# Wait for results
for attempt in range(20):
    xml = dev.dump_ui()
    root = ET.fromstring(xml)
    cards = [e for e in root.iter('node')
             if 'item_catalog_card_optimised' in e.attrib.get('resource-id','')
             and e.attrib.get('clickable') == 'true']
    if cards:
        print(f"Found {len(cards)} cards!")
        break
    print(f"Still loading ({attempt+1}s)...")
    time.sleep(1)

print(f"[3] Tapping first card: bounds={cards[0].attrib.get('bounds')}")
bounds = cards[0].attrib.get('bounds', '')
m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
if m:
    x1,y1,x2,y2 = map(int, m.groups())
    cx = (x1+x2)//2
    cy = y1 + int((y2-y1)*0.3)
    print(f"Tapping at ({cx}, {cy})")
    dev.shell('input', 'tap', str(cx), str(cy))
time.sleep(6)

print("[4] Dumping Similar Products page...")
xml2 = dev.dump_ui()
root2 = ET.fromstring(xml2)

print("\n=== ALL CLICKABLE NODES ===")
for e in root2.iter('node'):
    if e.attrib.get('clickable') == 'true':
        rid = e.attrib.get('resource-id','')
        txt = e.attrib.get('text','') or e.attrib.get('content-desc','')
        bounds = e.attrib.get('bounds','')
        print(f"  rid={rid:<60} txt={txt[:30]:<30} bounds={bounds}")

print("\n=== ALL TEXT NODES ===")
for e in root2.iter('node'):
    txt = e.attrib.get('text','')
    if txt and len(txt) > 3:
        print(f"  [{e.attrib.get('resource-id','')}] {txt[:60]}")
