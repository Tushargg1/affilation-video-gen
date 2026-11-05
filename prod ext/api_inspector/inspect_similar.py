import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')
tree = ET.parse('prod ext/api_inspector/data/pdp_back_dump.xml')
root = tree.getroot()

def print_tree(elem, depth=0):
    indent = "  " * depth
    cls = elem.attrib.get("class", "").split(".")[-1]
    rid = elem.attrib.get("resource-id", "")
    txt = elem.attrib.get("text", "").strip()
    desc = elem.attrib.get("content-desc", "").strip()
    bounds = elem.attrib.get("bounds", "")
    click = elem.attrib.get("clickable", "")
    print(f"{indent}<{cls} id='{rid}' click='{click}' bounds='{bounds}' text='{txt[:30]}' desc='{desc[:30]}'>")
    for ch in elem:
        print_tree(ch, depth + 1)

# Find 'Similar Products' node and print its ancestors and siblings
for parent in root.iter():
    for child in parent:
        if child.attrib.get("text") == "Similar Products":
            print("=== PARENT OF 'Similar Products' ===")
            print_tree(parent)
            break

print("\n" + "="*50 + "\n")

# Check _find_cards_in_root
sys.path.append('prod ext/api_inspector')
from meesho_full_auto import _find_cards_in_root, parse_card
cards = _find_cards_in_root(root)
print(f"Cards found by _find_cards_in_root: {len(cards)}")
for idx, c in enumerate(cards):
    print(f"Card {idx}: {parse_card(c)}")
