import psutil

def kill_scraper():
    for p in psutil.process_iter(['cmdline', 'name']):
        try:
            cmd = p.info.get('cmdline')
            if cmd:
                cmd_str = ' '.join(cmd).lower()
                if 'meesho_full_auto.py' in cmd_str and 'python' in p.info.get('name', '').lower():
                    print(f"Terminating {p.pid}: {cmd_str}")
                    p.terminate()
        except Exception as e:
            pass

if __name__ == "__main__":
    kill_scraper()
