import xml.etree.ElementTree as ET
try:
    tree = ET.parse('dump2.xml')
    root = tree.getroot()
    for e in root.iter():
        bounds = e.attrib.get('bounds')
        text = e.attrib.get('text')
        res = e.attrib.get('resource-id')
        if text or res:
            print(f"{res} | {text} | {bounds}")
except Exception as e:
    print(e)
