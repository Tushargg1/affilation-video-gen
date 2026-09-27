import time
import xml.etree.ElementTree as ET
from meesho_emulator_collector import AdbClient

def run():
    dev = AdbClient('127.0.0.1:5915')
    xml = dev.dump_ui()
    root = ET.fromstring(xml.encode('utf-8'))
    print("ALL TEXT NODES:")
    for elem in root.iter('node'):
        text = elem.attrib.get('text', '')
        if text:
            print(text, elem.attrib.get('resource-id'), elem.attrib.get('bounds'))

if __name__ == '__main__':
    run()
