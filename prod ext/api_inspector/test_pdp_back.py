import sys
import time
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
sys.path.append('prod ext/api_inspector')
from meesho_emulator_collector import AdbClient

dev = AdbClient('emulator-5554')

print("1. Tapping card center to open PDP...")
dev.shell('input', 'tap', '270', '1200')
time.sleep(4)

print("2. Now pressing Back to return to feed...")
dev.shell('input', 'keyevent', '4')
time.sleep(3)

print("3. Dumping UI...")
xml = dev.dump_ui()
open('prod ext/api_inspector/data/pdp_back_dump.xml', 'w', encoding='utf-8').write(xml)
print(f"Dump saved: {len(xml)} bytes")

root = ET.fromstring(xml)
for e in root.iter('node'):
    t = e.attrib.get('text', '').strip()
    rid = e.attrib.get('resource-id', '')
    b = e.attrib.get('bounds', '')
    if t and any(k in t.lower() for k in ["you may also like", "similar", "premium", "gold", "kurti", "top", "combo"]):
        print(f"Node: '{t[:40]}' | id={rid} | bounds={b}")
