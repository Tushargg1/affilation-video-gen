from meesho_emulator_collector import AdbClient
import xml.etree.ElementTree as ET

dev = AdbClient("emulator-5554")
xml = dev.dump_ui()
root = ET.fromstring(xml)

print("=== ALL INTERACTIVE ELEMENTS ===")
for e in root.iter():
    rid = e.attrib.get("resource-id", "")
    t = e.attrib.get("text", "")
    cls = e.attrib.get("class", "")
    bounds = e.attrib.get("bounds", "")
    clickable = e.attrib.get("clickable", "false")
    
    if ("search" in rid.lower() or "query" in rid.lower() or 
        cls == "android.widget.EditText" or
        "search" in t.lower() or "keyword" in t.lower()):
        print(f"RID: {rid}")
        print(f"  class: {cls}, text: {t!r}, bounds: {bounds}, clickable: {clickable}")
        print()

print("=== DONE ===")
