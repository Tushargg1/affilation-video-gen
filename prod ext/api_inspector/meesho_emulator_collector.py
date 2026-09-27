# -*- coding: utf-8 -*-
"""
meesho_emulator_collector.py  --  Emulator-based Meesho product UI collector
=============================================================================
Phases:
  Phase 1: --diagnose       Detect emulator environment (BlueStacks 5)
  Phase 2: --start          Launch BlueStacks instance, wait for ADB boot
  Phase 3: --install        Install Meesho APK (or guide Play Store install)
  Phase 4: --inspect        UIAutomator dump + annotated node summary
  Phase 7: --scan-current   Scroll + collect loop -> SQLite
  Phase 8: --search QUERY   Navigate search, then scan
           --category CAT   Navigate category, then scan

Security constraints enforced:
  - No network interception.
  - No TLS bypass or certificate pinning bypass.
  - No modification of Meesho security mechanisms.
  - All data extracted only from visibly rendered UI.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT       = Path(__file__).resolve().parents[2]
ADB_LOCAL  = ROOT / "platform-tools" / "adb.exe"

BS_INSTALL_DIR = Path(r"C:\Program Files\BlueStacks_nxt")
BS_DATA_DIR    = Path(r"C:\ProgramData\BlueStacks_nxt")
BS_CONF        = BS_DATA_DIR / "bluestacks.conf"
BS_ADB         = BS_INSTALL_DIR / "HD-Adb.exe"
BS_AAPT        = BS_INSTALL_DIR / "HD-Aapt.exe"
BS_PLAYER      = BS_INSTALL_DIR / "HD-Player.exe"

MEESHO_APK     = ROOT / "meesho_base.apk"
MEESHO_PACKAGE = "com.meesho.supply"

DEFAULT_DB     = ROOT / "data" / "meesho_products.db"
DUMP_DIR       = ROOT / "debug" / "ui_dumps"
LOG_PATH       = ROOT / "logs" / "meesho_emulator_collector.log"

LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
DUMP_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# BlueStacks config reader
# ---------------------------------------------------------------------------

def read_bs_conf() -> dict[str, str]:
    conf: dict[str, str] = {}
    if not BS_CONF.exists():
        return conf
    with BS_CONF.open(encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            conf[key.strip()] = value.strip().strip('"')
    return conf


def list_bs_instances(conf: dict[str, str]) -> list[dict]:
    instances: dict[str, dict] = {}
    prefix = "bst.instance."
    for key, value in conf.items():
        if not key.startswith(prefix):
            continue
        remainder = key[len(prefix):]
        parts = remainder.split(".", 1)
        name = parts[0]
        field = parts[1] if len(parts) > 1 else ""
        if name not in instances:
            instances[name] = {"name": name}
        if field:
            instances[name][field] = value
    return list(instances.values())


def _pick_instance(conf: dict[str, str], preferred: str | None) -> dict | None:
    instances = list_bs_instances(conf)
    if preferred:
        for inst in instances:
            if inst["name"] == preferred:
                return inst
        return None
    for name in ("Tiramisu64_36", "Tiramisu64"):
        for inst in instances:
            if inst["name"] == name:
                return inst
    for inst in instances:
        if inst.get("adb_port"):
            return inst
    return None


# ---------------------------------------------------------------------------
# ADB client
# ---------------------------------------------------------------------------

def _find_adb() -> str:
    if ADB_LOCAL.exists():
        return str(ADB_LOCAL)
    if BS_ADB.exists():
        return str(BS_ADB)
    which = shutil.which("adb")
    if which:
        return which
    return "adb"


def _check_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


class AdbClient:
    def __init__(self, serial: str | None = None, adb: str | None = None) -> None:
        self.adb = adb or _find_adb()
        self.serial = serial

    def run(self, *args: str, timeout: int = 30, check: bool = False) -> str:
        cmd = [self.adb]
        if self.serial:
            cmd += ["-s", self.serial]
        cmd += list(args)
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                               timeout=timeout, check=False)
            if r.stderr.strip():
                log.warning("ADB stderr for %s: %s", args[0] if args else "cmd", r.stderr.strip())
                if "device" in r.stderr and "not found" in r.stderr and self.serial and ":" in self.serial and args and args[0] != "connect":
                    host, port = self.serial.split(":")
                    self.connect(host, int(port))
                    return self.run(*args, timeout=timeout, check=check)
            if check and r.returncode != 0:
                raise RuntimeError(f"ADB error ({r.returncode}): {r.stderr.strip()}")
            return r.stdout.strip()
        except FileNotFoundError:
            raise RuntimeError(f"ADB binary not found: {self.adb}")
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"ADB command timed out: {' '.join(args)}")

    def connect(self, host: str, port: int) -> str:
        out = self.run("connect", f"{host}:{port}", timeout=10)
        log.info("ADB connect %s:%d -> %s", host, port, out)
        return out

    def devices(self) -> list[dict]:
        output = self.run("devices", "-l")
        result = []
        for line in output.splitlines()[1:]:
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            meta = {"serial": parts[0], "state": parts[1]}
            for token in parts[2:]:
                if ":" in token:
                    k, _, v = token.partition(":")
                    meta[k] = v
            result.append(meta)
        return result

    def shell(self, *args: str, timeout: int = 30) -> str:
        return self.run("shell", *args, timeout=timeout)

    def get_prop(self, prop: str) -> str:
        return self.shell("getprop", prop).strip()

    def wait_for_boot(self, timeout_s: int = 180) -> bool:
        log.info("Waiting for Android boot (timeout=%ds)...", timeout_s)
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            try:
                if self.get_prop("sys.boot_completed") == "1":
                    log.info("Boot completed.")
                    return True
            except Exception:
                pass
            time.sleep(4)
        return False

    def is_package_installed(self, package: str) -> bool:
        return "package:" in self.shell("pm", "path", package, timeout=15)

    def package_version(self, package: str) -> str | None:
        out = self.shell("dumpsys", "package", package, timeout=20)
        m = re.search(r"versionName=([^\s\r\n]+)", out)
        return m.group(1) if m else None

    def foreground_package(self) -> str:
        out = self.shell("dumpsys", "activity", "activities", timeout=15)
        for marker in ("mResumedActivity", "mFocusedApp", "topResumedActivity"):
            for line in out.splitlines():
                if marker in line:
                    m = re.search(r"\b([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)/", line, re.I)
                    if m:
                        return m.group(1)
        return ""

    def dump_ui(self, save_path: Path | None = None) -> str:
        remote = "/sdcard/window_dump.xml"
        out = self.shell("uiautomator", "dump", remote, timeout=30)
        log.info("uiautomator dump output: %s", out)
        xml = self.run("exec-out", "cat", remote, timeout=20)
        
        # FIX ADB BUG: Strip adb server warning logs if present
        if "<?xml" in xml:
            xml = xml[xml.index("<?xml"):]
            
        if not xml.strip().startswith("<?xml"):
            log.error("XML output was: %s", repr(xml[:100]))
            raise RuntimeError("UIAutomator did not return valid XML")
        if save_path:
            save_path.parent.mkdir(parents=True, exist_ok=True)
            save_path.write_text(xml, encoding="utf-8")
        return xml

    def tap(self, x: int, y: int) -> None:
        self.shell("input", "tap", str(x), str(y), timeout=10)

    def swipe(self, x1: int, y1: int, x2: int, y2: int, dur: int = 500) -> None:
        self.shell("input", "swipe", str(x1), str(y1), str(x2), str(y2), str(dur), timeout=10)

    def scroll_down(self, screen_w: int = 1080, screen_h: int = 1920) -> None:
        cx = screen_w // 2
        self.swipe(cx, int(screen_h * 0.80), cx, int(screen_h * 0.25), dur=500)

    def type_text(self, text: str) -> None:
        escaped = text.replace(" ", "%s")
        self.shell("input", "text", escaped, timeout=10)

    def key_event(self, keycode: int) -> None:
        self.shell("input", "keyevent", str(keycode), timeout=10)

    def press_back(self) -> None:
        self.key_event(4)

    def press_home(self) -> None:
        self.key_event(3)

    def get_screen_size(self) -> tuple[int, int]:
        out = self.shell("wm", "size")
        m = re.search(r"(\d+)x(\d+)", out)
        if m:
            return int(m.group(1)), int(m.group(2))
        return 1080, 1920


# ---------------------------------------------------------------------------
# PHASE 1: DIAGNOSE
# ---------------------------------------------------------------------------

def cmd_diagnose(args: argparse.Namespace) -> None:
    """Inspect emulator environment. Does NOT modify anything."""
    report: dict = {}
    adb_path = _find_adb()

    report["adb"] = {"path": adb_path}
    try:
        ver = subprocess.run([adb_path, "version"], capture_output=True, text=True, timeout=5)
        report["adb"]["version"] = ver.stdout.splitlines()[0] if ver.stdout else "?"
        report["adb"]["exists"] = True
    except Exception as e:
        report["adb"]["error"] = str(e)
        report["adb"]["exists"] = False

    report["bluestacks"] = {
        "install_dir": str(BS_INSTALL_DIR),
        "install_dir_exists": BS_INSTALL_DIR.exists(),
        "hd_adb_exists": BS_ADB.exists(),
        "hd_aapt_exists": BS_AAPT.exists(),
        "hd_player_exists": BS_PLAYER.exists(),
        "conf_exists": BS_CONF.exists(),
    }

    conf = read_bs_conf()
    instances = list_bs_instances(conf)
    report["bluestacks_instances"] = instances

    running = []
    adb = AdbClient(adb=adb_path)
    for inst in instances:
        port_s = inst.get("adb_port") or inst.get("status.adb_port", "")
        if not port_s:
            continue
        try:
            port = int(port_s)
        except ValueError:
            continue
        open_ = _check_port_open("127.0.0.1", port)
        if open_:
            adb.connect("127.0.0.1", port)
        running.append({
            "instance": inst.get("name"),
            "adb_port": port,
            "display_name": inst.get("display_name", ""),
            "port_open": open_,
        })
    report["running_emulator_ports"] = running

    devs = adb.devices()
    report["adb_devices"] = devs
    device_info = []
    for dev in devs:
        if dev.get("state") != "device":
            continue
        c = AdbClient(serial=dev["serial"], adb=adb_path)
        try:
            info = {
                "serial": dev["serial"],
                "android_version": c.get_prop("ro.build.version.release"),
                "sdk_version": c.get_prop("ro.build.version.sdk"),
                "abi": c.get_prop("ro.product.cpu.abi"),
                "abi_list": c.get_prop("ro.product.cpu.abilist"),
                "model": c.get_prop("ro.product.model"),
                "manufacturer": c.get_prop("ro.product.manufacturer"),
                "meesho_installed": c.is_package_installed(MEESHO_PACKAGE),
                "meesho_version": c.package_version(MEESHO_PACKAGE),
            }
        except Exception as exc:
            info = {"serial": dev["serial"], "error": str(exc)}
        device_info.append(info)
    report["device_properties"] = device_info

    apk_info: dict = {"path": str(MEESHO_APK), "exists": MEESHO_APK.exists()}
    if MEESHO_APK.exists():
        apk_info["size_mb"] = round(MEESHO_APK.stat().st_size / 1024 / 1024, 2)
        if BS_AAPT.exists():
            try:
                aapt = subprocess.run(
                    [str(BS_AAPT), "dump", "badging", str(MEESHO_APK)],
                    capture_output=True, text=True, timeout=20,
                )
                for ln in aapt.stdout.splitlines():
                    if ln.startswith("package:"):
                        m = re.search(r"versionName='([^']+)'", ln)
                        if m:
                            apk_info["version_name"] = m.group(1)
                        m = re.search(r"versionCode='([^']+)'", ln)
                        if m:
                            apk_info["version_code"] = m.group(1)
                    elif ln.startswith("sdkVersion:"):
                        apk_info["min_sdk"] = ln.split("'")[1]
                    elif ln.startswith("targetSdkVersion:"):
                        apk_info["target_sdk"] = ln.split("'")[1]
                    elif ln.startswith("native-code:"):
                        apk_info["native_abis"] = (
                            ln.split(":", 1)[1].strip().replace("'", "").split()
                        )
                if "native_abis" not in apk_info:
                    apk_info["native_abis"] = ["arm64-v8a", "armeabi-v7a"]
                    apk_info["native_abis_note"] = (
                        "Not listed by aapt; assumed. BlueStacks uses Houdini for arm translation."
                    )
            except Exception as exc:
                apk_info["aapt_error"] = str(exc)
    report["meesho_apk"] = apk_info
    report["virtualization"] = {
        "bluestacks_hypervisor": conf.get("bst.status.hypervisor", "unknown"),
    }

    sdk_root = Path(os.environ.get("ANDROID_HOME", r"C:\Users\tusha\AppData\Local\Android\Sdk"))
    report["android_studio_sdk"] = {
        "sdk_root_exists": sdk_root.exists(),
        "emulator_exists": (sdk_root / "emulator" / "emulator.exe").exists(),
        "system_images_exists": (sdk_root / "system-images").exists(),
        "verdict": "Android Studio emulator NOT installed. BlueStacks 5 is the active emulator.",
    }

    best = _pick_instance(conf, None)
    report["recommendation"] = {
        "emulator": "BlueStacks 5 (BlueStacks_nxt) v5.22.241.1001",
        "preferred_instance": best.get("name") if best else "Tiramisu64_36",
        "preferred_adb_port": best.get("adb_port") if best else "5915",
        "android_api": "33 (Android 13 / Tiramisu)",
        "abi_support": "x86, x64, arm, arm64 via Houdini",
        "apk_compatible": True,
        "split_apk_note": "Try base APK first; install via Play Store if split error.",
        "next_step": (
            "1. Open BlueStacks 5 -> Tiramisu64_36  "
            "2. Settings -> Preferences -> Enable ADB  "
            "3. python -m app.tools.meesho_emulator_collector --start  "
            "4. python -m app.tools.meesho_emulator_collector --install"
        ),
    }

    output = json.dumps(report, indent=2, ensure_ascii=False)
    print(output)
    out_path = ROOT / "debug" / "emulator_diagnostics.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(output, encoding="utf-8")
    print(f"\n[SAVED] {out_path}", flush=True)


# ---------------------------------------------------------------------------
# PHASE 2: START
# ---------------------------------------------------------------------------

def _connect_bs(adb: AdbClient, host: str, port: int, wait_s: int = 180) -> bool:
    log.info("Waiting for ADB port %d (timeout=%ds)...", port, wait_s)
    deadline = time.time() + wait_s
    while time.time() < deadline:
        if _check_port_open(host, port):
            break
        time.sleep(3)
    else:
        return False
    out = adb.connect(host, port)
    return "connected" in out or "already connected" in out


def cmd_start(args: argparse.Namespace) -> None:
    """Phase 2: Launch BlueStacks instance and wait for ADB boot."""
    conf = read_bs_conf()
    inst = _pick_instance(conf, args.instance)
    if not inst:
        log.error("No suitable BlueStacks instance found.")
        sys.exit(1)

    name = inst["name"]
    port_s = args.adb_port or inst.get("adb_port") or inst.get("status.adb_port")
    if not port_s:
        log.error("No ADB port found for instance %s", name)
        sys.exit(1)
    port = int(port_s)
    log.info("Instance: %s  ADB port: %d", name, port)

    if _check_port_open("127.0.0.1", port):
        log.info("Instance already running on port %d.", port)
    else:
        if not BS_PLAYER.exists():
            log.error("HD-Player.exe not found: %s", BS_PLAYER)
            sys.exit(1)
        log.info("Launching BlueStacks instance: %s", name)
        subprocess.Popen(
            [str(BS_PLAYER), "--instance", name],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        log.info("Waiting for port %d to open (30-90 seconds)...", port)

    adb = AdbClient(adb=_find_adb())
    if not _connect_bs(adb, "127.0.0.1", port, wait_s=180):
        log.error(
            "Could not connect to port %d.\n"
            "Enable ADB: BlueStacks Settings > Preferences > Enable ADB.", port
        )
        sys.exit(1)

    serial = f"127.0.0.1:{port}"
    dev = AdbClient(serial=serial, adb=_find_adb())
    if not dev.wait_for_boot(timeout_s=180):
        log.error("Android did not finish booting within 3 minutes.")
        sys.exit(1)

    result = {
        "status": "ready",
        "serial": serial,
        "instance": name,
        "android_version": dev.get_prop("ro.build.version.release"),
        "sdk_version": dev.get_prop("ro.build.version.sdk"),
        "abi_list": dev.get_prop("ro.product.cpu.abilist"),
        "model": dev.get_prop("ro.product.model"),
    }
    print(json.dumps(result, indent=2))
    log.info("Emulator ready: %s", result)


# ---------------------------------------------------------------------------
# PHASE 3: INSTALL
# ---------------------------------------------------------------------------

def _resolve_serial(args: argparse.Namespace) -> tuple[str, AdbClient]:
    adb_path = _find_adb()
    adb = AdbClient(adb=adb_path)

    if args.serial:
        dev = AdbClient(serial=args.serial, adb=adb_path)
        if ":" in args.serial:
            h, p = args.serial.split(":")
            dev.connect(h, int(p))
        return args.serial, dev

    conf = read_bs_conf()
    inst = _pick_instance(conf, getattr(args, "instance", None))
    if inst:
        port_s = inst.get("adb_port") or inst.get("status.adb_port", "")
        if port_s:
            port = int(port_s)
            if _check_port_open("127.0.0.1", port):
                serial = f"127.0.0.1:{port}"
                adb.connect("127.0.0.1", port)
                return serial, AdbClient(serial=serial, adb=adb_path)

    devs = adb.devices()
    ready = [d for d in devs if d.get("state") == "device"]
    if not ready:
        log.error("No ADB device. Run --start first, or pass --serial.")
        sys.exit(1)
    serial = ready[0]["serial"]
    return serial, AdbClient(serial=serial, adb=adb_path)


def cmd_install(args: argparse.Namespace) -> None:
    """Phase 3: Install Meesho APK onto the running emulator."""
    serial, device = _resolve_serial(args)
    log.info("Target device: %s", serial)

    if device.is_package_installed(MEESHO_PACKAGE):
        ver = device.package_version(MEESHO_PACKAGE)
        log.info("Meesho already installed: version %s", ver)
        print(json.dumps({"status": "already_installed", "version": ver, "serial": serial}, indent=2))
        return

    if not MEESHO_APK.exists():
        log.error("APK not found: %s", MEESHO_APK)
        sys.exit(1)

    log.info("Installing %s on %s...", MEESHO_APK.name, serial)
    r = subprocess.run(
        [_find_adb(), "-s", serial, "install", "-r", str(MEESHO_APK)],
        capture_output=True, text=True, timeout=120,
    )
    stdout = r.stdout.strip()
    stderr = r.stderr.strip()
    log.info("stdout: %s", stdout)
    if stderr:
        log.info("stderr: %s", stderr)

    if "Success" in stdout:
        ver = device.package_version(MEESHO_PACKAGE)
        log.info("Installed. Version: %s", ver)
        print(json.dumps({"status": "installed", "version": ver, "serial": serial}, indent=2))
        return

    if "INSTALL_FAILED_MISSING_SPLIT" in stdout + stderr:
        print(json.dumps({
            "status": "split_apk_required",
            "instructions": (
                "Install Meesho from the Play Store inside BlueStacks. "
                "Google account tusharrup323@gmail.com is already signed in."
            ),
        }, indent=2))
        return

    log.error("Installation failed: %s | %s", stdout, stderr)
    print(json.dumps({
        "status": "failed",
        "stdout": stdout,
        "stderr": stderr,
        "suggestion": "Install via Play Store in BlueStacks, or provide a full XAPK bundle.",
    }, indent=2))
    sys.exit(1)


# ---------------------------------------------------------------------------
# PHASE 4: INSPECT
# ---------------------------------------------------------------------------

def cmd_inspect(args: argparse.Namespace) -> None:
    """Phase 4: Dump UIAutomator XML and print annotated summary."""
    serial, device = _resolve_serial(args)
    log.info("Dumping UI on %s...", serial)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dump_path = DUMP_DIR / f"dump_{stamp}.xml"
    xml = device.dump_ui(save_path=dump_path)

    canonical = ROOT / "window_dump.xml"
    canonical.write_text(xml, encoding="utf-8")
    log.info("UI dumped: %s  (%d bytes)", dump_path, len(xml))

    from app.tools.meesho_emulator_parser import parse_ui_xml, summarize_nodes
    nodes = parse_ui_xml(xml)
    summary = summarize_nodes(nodes)

    result = {
        "serial": serial,
        "dump_path": str(dump_path),
        "total_nodes": len(nodes),
        "foreground_package": device.foreground_package(),
        "node_summary": summary,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    log.info("Inspect done. %d nodes, %d product candidates.",
             len(nodes), len(summary.get("product_candidates", [])))


# ---------------------------------------------------------------------------
# Affiliate status determination
# ---------------------------------------------------------------------------

def _determine_affiliate_status(product: dict) -> str:
    """
    Determine affiliate status strictly from visible UI text.
    YES   - UI clearly says earn/commission/affiliate eligible.
    NO    - UI clearly says not eligible / no commission.
    UNKNOWN - Everything else (including absence of info).
    Never guess. Never infer from field absence.
    """
    comm_text = (product.get("commission_text") or "").strip()
    if not comm_text:
        return "UNKNOWN"
    if re.search(r"\bnot\s+eligible\b|\bno\s+commission\b|\bineligible\b", comm_text, re.I):
        return "NO"
    if re.search(r"\b(?:earn|eligible|commission|affiliate)\b", comm_text, re.I):
        return "YES"
    return "UNKNOWN"


# ---------------------------------------------------------------------------
# PHASE 7: SCAN-CURRENT
# ---------------------------------------------------------------------------

def cmd_scan_current(args: argparse.Namespace) -> None:
    """
    Phase 7: Scroll through current screen, extract product cards, save to DB.
    Stops when no new products for several scrolls or Ctrl+C.
    """
    from app.tools.meesho_emulator_parser import extract_products
    from app.tools.meesho_database import MeeshoDatabase

    serial, device = _resolve_serial(args)
    db = MeeshoDatabase(args.db)
    category_label = getattr(args, "category_label", None)
    source = f"emulator_ui:{serial}"

    session_id = db.start_session(search_term=category_label, source=source)
    log.info("Session %d started. serial=%s max_scrolls=%d", session_id, serial, args.max_scrolls)

    w, h = device.get_screen_size()
    consecutive_empty = 0
    max_empty = 5
    total_new = 0
    total_dup = 0
    screens = 0
    seen_ids: set[str] = set(db.all_product_ids())

    stop_flag = {"stop": False}

    def _sigint(sig, frame):
        stop_flag["stop"] = True
        print("\n[Ctrl+C] Stopping after this screen...", flush=True)

    signal.signal(signal.SIGINT, _sigint)

    try:
        for scroll_n in range(args.max_scrolls + 1):
            if stop_flag["stop"]:
                break

            stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            dump_path = DUMP_DIR / f"dump_{stamp}.xml"
            try:
                xml = device.dump_ui(save_path=dump_path)
            except RuntimeError as exc:
                log.warning("UI dump failed on scroll %d: %s", scroll_n, exc)
                time.sleep(args.scroll_delay)
                continue

            screens += 1
            products = extract_products(xml)
            log.info("Screen %d: %d candidates.", screens, len(products))

            new_this_screen = 0
            for p in products:
                pid = p.get("product_id")
                if pid and pid in seen_ids:
                    total_dup += 1
                    db.touch_product(pid)
                    continue
                p["category"] = p.get("category") or category_label
                p["source"] = source
                p["affiliate_status"] = _determine_affiliate_status(p)
                db.save_product(p)
                if pid:
                    seen_ids.add(pid)
                new_this_screen += 1
                total_new += 1

            if new_this_screen == 0:
                consecutive_empty += 1
                log.info("No new products. Consecutive empty: %d/%d", consecutive_empty, max_empty)
            else:
                consecutive_empty = 0
                log.info("New this scroll: %d  Total new: %d", new_this_screen, total_new)

            if consecutive_empty >= max_empty:
                log.info("Stopping: %d consecutive empty scrolls.", max_empty)
                break

            if scroll_n < args.max_scrolls and not stop_flag["stop"]:
                device.scroll_down(w, h)
                time.sleep(args.scroll_delay)

    finally:
        db.finish_session(session_id,
                          screens_scanned=screens,
                          products_new=total_new,
                          products_duplicate=total_dup)
        signal.signal(signal.SIGINT, signal.SIG_DFL)

    result = {
        "session_id": session_id,
        "screens_scanned": screens,
        "new_products": total_new,
        "duplicate_products": total_dup,
        "db": args.db,
    }
    print(json.dumps(result, indent=2))
    log.info("Scan complete: %s", result)


# ---------------------------------------------------------------------------
# PHASE 8: SEARCH / CATEGORY
# ---------------------------------------------------------------------------

_SEARCH_HINTS = [
    "search",
    "com.meesho.supply:id/search",
    "com.meesho.supply:id/search_bar",
    "com.meesho.supply:id/searchBar",
    "com.meesho.supply:id/et_search",
    "com.meesho.supply:id/searchEditText",
    "com.meesho.supply:id/tv_search",
]


def _find_node_center(xml: str, hints: list[str]) -> tuple[int, int] | None:
    try:
        root = ET.fromstring(xml)
    except Exception:
        return None
    for elem in root.iter():
        rid  = elem.attrib.get("resource-id", "").lower()
        txt  = elem.attrib.get("text", "").lower()
        desc = elem.attrib.get("content-desc", "").lower()
        for hint in hints:
            h = hint.lower()
            if h in rid or h in txt or h in desc:
                bounds = elem.attrib.get("bounds", "")
                m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
                if m:
                    x1, y1, x2, y2 = map(int, m.groups())
                    return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def _navigate_to_search(device: AdbClient, query: str) -> bool:
    pkg = device.foreground_package()
    if pkg != MEESHO_PACKAGE:
        device.shell("monkey", "-p", MEESHO_PACKAGE,
                     "-c", "android.intent.category.LAUNCHER", "1", timeout=10)
        time.sleep(4)

    for attempt in range(3):
        xml = device.dump_ui()
        center = _find_node_center(xml, _SEARCH_HINTS)
        if center:
            device.tap(*center)
            time.sleep(1.5)
            # Select all + delete existing text
            device.shell("input", "keyevent", "--longpress", "29", timeout=5)
            device.shell("input", "keyevent", "67", timeout=5)
            device.type_text(query)
            time.sleep(0.5)
            device.key_event(66)  # ENTER / Search
            time.sleep(3)
            log.info("Search submitted: %r", query)
            return True
        w, h = device.get_screen_size()
        device.tap(int(w * 0.85), int(h * 0.04))
        time.sleep(1.5)

    log.warning("Could not locate search bar after 3 attempts.")
    return False


def cmd_search(args: argparse.Namespace) -> None:
    """Phase 8: Navigate to search results and scan."""
    serial, device = _resolve_serial(args)
    log.info("Search: %r on %s", args.search, serial)
    if not _navigate_to_search(device, args.search):
        log.error("Failed to navigate to search.")
        sys.exit(1)
    args.category_label = f"search:{args.search}"
    cmd_scan_current(args)


def cmd_category(args: argparse.Namespace) -> None:
    """Phase 8: Navigate to a category and scan."""
    serial, device = _resolve_serial(args)
    log.info("Category: %r on %s", args.category, serial)

    pkg = device.foreground_package()
    if pkg != MEESHO_PACKAGE:
        device.shell("monkey", "-p", MEESHO_PACKAGE,
                     "-c", "android.intent.category.LAUNCHER", "1", timeout=10)
        time.sleep(4)

    xml = device.dump_ui()
    cat_lower = args.category.lower()
    try:
        root = ET.fromstring(xml)
        for elem in root.iter():
            txt  = elem.attrib.get("text", "").strip()
            desc = elem.attrib.get("content-desc", "").strip()
            if cat_lower in txt.lower() or cat_lower in desc.lower():
                bounds = elem.attrib.get("bounds", "")
                m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds)
                if m:
                    x1, y1, x2, y2 = map(int, m.groups())
                    device.tap((x1 + x2) // 2, (y1 + y2) // 2)
                    time.sleep(3)
                    log.info("Tapped category: %r", txt or desc)
                    break
        else:
            log.warning(
                "Category %r not found in current UI. Scanning current screen.", args.category
            )
    except Exception as exc:
        log.warning("Category nav error: %s", exc)

    args.category_label = f"category:{args.category}"
    cmd_scan_current(args)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m app.tools.meesho_emulator_collector",
        description=(
            "Emulator-based Meesho product UI collector. "
            "No network interception. No TLS bypass. No security bypass."
        ),
    )
    p.add_argument("--diagnose",     action="store_true", help="[Phase 1] Print diagnostics.")
    p.add_argument("--start",        action="store_true", help="[Phase 2] Start BlueStacks instance.")
    p.add_argument("--install",      action="store_true", help="[Phase 3] Install Meesho APK.")
    p.add_argument("--inspect",      action="store_true", help="[Phase 4] Dump UIAutomator XML.")
    p.add_argument("--scan-current", action="store_true", help="[Phase 7] Scroll + collect products.")
    p.add_argument("--search",       metavar="QUERY",     help="[Phase 8] Search and scan.")
    p.add_argument("--category",     metavar="CATEGORY",  help="[Phase 8] Category feed and scan.")
    p.add_argument("--serial",       default=None,        help="ADB device serial (e.g. 127.0.0.1:5915).")
    p.add_argument("--adb-port",     type=int, default=None, help="Override BlueStacks ADB port.")
    p.add_argument("--instance",     default=None,        help="BlueStacks instance name.")
    p.add_argument("--db",           default=str(DEFAULT_DB), help="SQLite DB path.")
    p.add_argument("--max-scrolls",  type=int, default=100, help="Max scroll steps.")
    p.add_argument("--scroll-delay", type=float, default=2.0, help="Seconds to wait after scroll.")
    p.add_argument("--output",       default=None,        help="JSON output file.")
    p.add_argument("--category-label", default=None,      help="Category tag for products.")
    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    actions = [
        args.diagnose, args.start, args.install, args.inspect,
        args.scan_current, bool(args.search), bool(args.category),
    ]
    if sum(actions) != 1:
        parser.print_help()
        sys.exit(1)

    if args.diagnose:        cmd_diagnose(args)
    elif args.start:         cmd_start(args)
    elif args.install:       cmd_install(args)
    elif args.inspect:       cmd_inspect(args)
    elif args.scan_current:  cmd_scan_current(args)
    elif args.search:        cmd_search(args)
    elif args.category:      cmd_category(args)


if __name__ == "__main__":
    main()
