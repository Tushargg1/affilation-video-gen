import sys, xml.etree.ElementTree as ET
sys.path.insert(0, r'c:\Users\tusha\OneDrive\Desktop\affilation video gen\prod ext\api_inspector')
from meesho_emulator_collector import AdbClient
dev = AdbClient('127.0.0.1:5915')
xml = dev.dump_ui()
root = ET.fromstring(xml)
print("=== TEXT NODES ===")
for e in root.iter('node'):
    txt = e.attrib.get('text', '') or e.attrib.get('content-desc', '')
    if txt and len(txt) > 2:
        rid = e.attrib.get('resource-id', '')
        # replace rupeee symbol with RS
        txt = txt.replace('\u20b9', 'RS')
        print(f"[{rid}] {txt}")
