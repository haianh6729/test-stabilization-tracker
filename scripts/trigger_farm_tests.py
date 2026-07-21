#!/usr/bin/env python3
"""Trigger SDF farm tests for script files changed in a merge to main.

Chạy trong GitHub Actions (self-hosted runner Windows). Nhận danh sách file
đã thay đổi, lọc ra file script test, ánh xạ sang testFilePath của Script Store,
build request theo API test-manager/v1/test-group và POST lên farm.

Chỉ dùng thư viện chuẩn (urllib) — không cần pip install, khớp phong cách app.py.

Cách dùng:
    python scripts/trigger_farm_tests.py --changed-files changed.txt --config farm_config.json

Biến môi trường (đặt qua GitHub Secrets):
    FARM_API_TOKEN   -> gửi header "Authorization: Bearer <token>" (nếu có)
    FARM_COOKIE      -> gửi header "Cookie: <cookie>" (nếu farm dùng cookie SSO)
    FARM_BASE        -> override farm_base trong config (tuỳ chọn)
    DRY_RUN=1        -> in body ra, KHÔNG gọi API (để test workflow)
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error

# Console Windows mặc định là cp1252 -> ép UTF-8 để in được tiếng Việt / log farm.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


# ------------------------------------------------------------------ config ---
def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    # cho phép override base URL qua env
    if os.environ.get("FARM_BASE"):
        cfg["farm_base"] = os.environ["FARM_BASE"].rstrip("/")
    else:
        cfg["farm_base"] = cfg["farm_base"].rstrip("/")
    return cfg


# --------------------------------------------------------- changed files -----
def read_changed_files(path):
    """Đọc danh sách file thay đổi (1 dòng / file). Bỏ qua rỗng, chuẩn hoá / ."""
    out = []
    with open(path, "r", encoding="utf-8-sig") as f:
        for line in f:
            p = line.strip().strip('"')
            if p:
                out.append(p.replace("\\", "/"))
    return out


def filter_scripts(files, cfg):
    """Giữ lại file .py nằm trong watch_prefixes (nếu cấu hình)."""
    exts = tuple(cfg.get("script_extensions", [".py"]))
    prefixes = [p.strip("/").lower() for p in cfg.get("watch_prefixes", [])]
    contains = [c.lower() for c in cfg.get("watch_contains", [])]
    kept = []
    for p in files:
        lp = p.lower()
        if not lp.endswith(exts):
            continue
        if prefixes and not any(lp.startswith(pre + "/") or lp == pre
                                for pre in prefixes):
            continue
        if contains and not any(c in lp for c in contains):
            continue
        kept.append(p)
    return kept


# ----------------------------------------------------------- path mapping ----
def to_store_path(repo_path, cfg):
    """Đổi đường dẫn repo -> testFilePath kiểu Windows của Script Store.

    repo_root  : thư mục gốc chứa script trong repo (bị cắt bỏ)
    store_prefix: tiền tố trong Script Store, ví dụ "\\Challenge\\test case"
    """
    p = repo_path.replace("\\", "/").strip("/")
    root = cfg.get("repo_root", "").strip("/")
    if root and (p == root or p.startswith(root + "/")):
        p = p[len(root):].strip("/")
    win = p.replace("/", "\\")
    prefix = cfg.get("store_prefix", "").rstrip("\\/")
    if prefix:
        return prefix + "\\" + win
    return "\\" + win


def resolve_store(repo_path, cfg):
    """Chọn Script Store cho 1 file (store_map override, else default)."""
    p = repo_path.replace("\\", "/").strip("/").lower()
    for m in cfg.get("store_map", []):
        if p.startswith(m["match"].strip("/").lower()):
            return m
    return cfg["script_store"]


# --------------------------------------------------------------- devices -----
def build_devices(cfg):
    """Dựng danh sách device.

    mode == "dynamic" (mặc định): chỉ mô tả model + agentType, farm tự chọn máy
                                  READY khớp -> KHÔNG cần gọi Device API.
    mode == "static" : gọi Device API lấy object device thật (state READY).
    """
    mode = cfg.get("mode", "dynamic")
    agent_type = cfg["agent_type"]
    if mode == "dynamic":
        devs = []
        for m in cfg["models"]:
            model = m["model"] if isinstance(m, dict) else m
            d = {"model": model, "agentPartialInfo": {"agentType": agent_type}}
            sales = m.get("salesCode") if isinstance(m, dict) else None
            if sales:
                d["mobile"] = {"salesCode": sales}
            devs.append(d)
        return devs

    # static: 1 device READY / model
    devs = []
    for m in cfg["models"]:
        model = m["model"] if isinstance(m, dict) else m
        url = (f"{cfg['farm_base']}/resource-manager/v1/device/pages/agent-infos"
               f"?state=READY&type=MOBILE&size=1&page=0&sort=model,asc"
               f"&agentType={agent_type}&model={model}")
        data = http_json("GET", url)
        content = (data.get("data") or {}).get("content") or []
        if not content:
            raise SystemExit(f"[static] Không có device READY cho model {model}")
        devs.append(content[0])
    return devs


# ------------------------------------------------------------------ http -----
def _headers():
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    tok = os.environ.get("FARM_API_TOKEN")
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    cookie = os.environ.get("FARM_COOKIE")
    if cookie:
        h["Cookie"] = cookie
    return h


def http_json(method, url, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        raise SystemExit(f"HTTP {e.code} {method} {url}\n{detail}")
    except urllib.error.URLError as e:
        raise SystemExit(f"Không kết nối được farm ({url}): {e.reason}")


# ---------------------------------------------------------------- request ----
def build_request(scripts, devices, cfg, title):
    """1 testGroup; mỗi Script Store -> 1 entry testList chạy trên MỌI device."""
    # gom file theo store
    by_store = {}
    for path in scripts:
        store = resolve_store(path, cfg)
        by_store.setdefault(store["id"], {"store": store, "files": []})
        by_store[store["id"]]["files"].append(to_store_path(path, cfg))

    dev_index = list(range(len(devices)))
    test_list = []
    for group in by_store.values():
        store = group["store"]
        test_list.append({
            "sourceFrom": "SCRIPT_STORE",
            "scriptStoreId": store["id"],
            "scriptStoreName": store["name"],
            "scriptVersion": store.get("version", "1.0.0"),
            "testFilePath": group["files"],
            "runnerList": cfg.get("runner_list", ["FDM", "MAP", "PYTHON"]),
            "type": "SCRIPT",
            "deviceIndexList": dev_index,
            "deviceList": devices,
            "stopOnFailure": cfg.get("stop_on_failure", False),
        })

    return [{
        "testGroup": {
            "deviceList": devices,
            "title": title,
            "recipientIdList": cfg.get("recipient_id_list", []),
            "isNotification": cfg.get("is_notification", True),
            "dynamic": cfg.get("mode", "dynamic") == "dynamic",
            "requestType": cfg.get("request_type", "R_DX_GENERAL"),
        },
        "testList": test_list,
    }]


# ------------------------------------------------------------------ main -----
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--changed-files", required=True,
                    help="File text, mỗi dòng 1 đường dẫn đã thay đổi")
    ap.add_argument("--config", default="farm_config.json")
    ap.add_argument("--title", default=None, help="Tiêu đề test group")
    args = ap.parse_args()

    cfg = load_config(args.config)
    changed = read_changed_files(args.changed_files)
    scripts = filter_scripts(changed, cfg)

    if not scripts:
        print("Không có file script test nào thay đổi -> bỏ qua, không tạo test.")
        return 0

    print(f"Sẽ chạy {len(scripts)} script trên farm:")
    for s in scripts:
        print("  -", s)

    devices = build_devices(cfg)
    print(f"Device ({cfg.get('mode', 'dynamic')}): "
          + ", ".join(d.get("model", "?") for d in devices))

    title = args.title or cfg.get("title") or "Auto-run on merge to main"
    body = build_request(scripts, devices, cfg, title)

    if os.environ.get("DRY_RUN") == "1":
        print("\n[DRY_RUN] Request body:\n" + json.dumps(body, indent=2, ensure_ascii=False))
        return 0

    url = f"{cfg['farm_base']}/test-manager/v1/test-group"
    print(f"\nPOST {url}")
    resp = http_json("POST", url, body)
    print("Tạo test thành công. Response:")
    print(json.dumps(resp, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
