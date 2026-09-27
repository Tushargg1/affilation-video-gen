import subprocess
import re
import webbrowser
import urllib.request
import json
import sys

print("Starting Cloudflare Tunnel...")
# Use shell=True for npx
p = subprocess.Popen('npx cloudflared tunnel --url http://localhost:3000', shell=True, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True)

opened = False
buffer = ""

print("Waiting for Cloudflare URL...")

while True:
    char = p.stderr.read(1)
    if not char:
        break
        
    sys.stderr.write(char)
    sys.stderr.flush()
    buffer += char
    
    # Check buffer periodically for the URL
    if not opened and 'trycloudflare.com' in buffer:
        match = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', buffer)
        if match:
            url = match.group(0)
            print(f"\n\n[+] Tunnel URL found: {url}")
            print("[+] Syncing securely with Vercel App via Redis...")
            
            try:
                data = json.dumps({"url": url}).encode("utf-8")
                req = urllib.request.Request(
                    "https://nextjs-poster-eta.vercel.app/api/tunnel", 
                    data=data, 
                    headers={'Content-Type': 'application/json'}
                )
                urllib.request.urlopen(req)
                print("[+] Successfully synced! Opening Vercel...")
                webbrowser.open('https://nextjs-poster-eta.vercel.app/')
            except Exception as e:
                print(f"[-] Failed to sync: {e}")
                
            opened = True
            buffer = "" # clear buffer
            
p.wait()
