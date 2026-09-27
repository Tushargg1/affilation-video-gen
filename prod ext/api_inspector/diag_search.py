import time
import xml.etree.ElementTree as ET
from meesho_emulator_collector import AdbClient

def run():
    dev = AdbClient('127.0.0.1:5915')
    dev.shell('am', 'force-stop', 'com.meesho.supply')
    time.sleep(2)
    dev.shell('monkey', '-p', 'com.meesho.supply', '-c', 'android.intent.category.LAUNCHER', '1')
    time.sleep(8)
    
    # Click search bar (approx coordinate)
    dev.shell('input', 'tap', '450', '150')
    time.sleep(2)
    
    # Type keyword
    dev.shell('input', 'text', 'mens%slowers')
    time.sleep(2)
    dev.shell('input', 'keyevent', '66') # Enter
    time.sleep(5)
    
    xml = dev.dump_ui()
    if not xml:
        print("Failed to dump UI")
        return
        
    root = ET.fromstring(xml.encode('utf-8'))
    print("Clickable nodes with their resource-ids:")
    for elem in root.iter('node'):
        if elem.attrib.get('clickable') == 'true':
            rid = elem.attrib.get('resource-id', '')
            text = elem.attrib.get('text', '') or elem.attrib.get('content-desc', '')
            print(f"ID: {rid} | Text: {text[:30]}")

if __name__ == '__main__':
    run()
