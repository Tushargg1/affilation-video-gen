import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
fname = sys.argv[1] if len(sys.argv) > 1 else 'prod ext/api_inspector/data/current_dump.xml'
tree = ET.parse(fname)
root = tree.getroot()

def print_node_summary(e, depth=0):
    indent = '  ' * depth
    cls = e.attrib.get('class', '').split('.')[-1]
    rid = e.attrib.get('resource-id', '')
    txt = e.attrib.get('text', '')
    desc = e.attrib.get('content-desc', '')
    bounds = e.attrib.get('bounds', '')
    clickable = e.attrib.get('clickable', '')
    print(f"{indent}{cls} | id={rid} | click={clickable} | bounds={bounds} | text='{txt}' | desc='{desc}'")
    for child in e:
        print_node_summary(child, depth + 1)

# Check all text nodes in the tree
print("--- ALL TEXT HEADERS/SECTIONS ---")
for e in root.iter('node'):
    t = e.attrib.get('text', '').strip()
    rid = e.attrib.get('resource-id', '')
    b = e.attrib.get('bounds', '')
    if any(k in t.lower() for k in ["you may also like", "similar", "premium", "quality", "gold", "sponsored", "recommended", "trending"]):
        print(f"HEADER: '{t}' | id={rid} | bounds={b}")

# Also check what cards _find_cards_in_root would find
sys.path.append('prod ext/api_inspector')
from meesho_full_auto import _find_cards_in_root, parse_card
cards = _find_cards_in_root(root)
print(f"\n--- FOUND {len(cards)} CARDS ---")
for idx, c in enumerate(cards):
    print(idx, parse_card(c))
