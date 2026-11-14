"""Local server for the end-of-term calendar.

Serves this folder and accepts POST /api/save, which writes data.json
(previous version kept as data.json.bak). Stdlib only, binds to 127.0.0.1.

    python serve.py              # finds a free port from 8555 up, opens browser
    python serve.py --port 9000 --no-browser
"""
import argparse
import http.server
import json
import os
import shutil
import socket
import sys
import threading
import webbrowser
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data.json")
MAX_BODY = 2_000_000


def log(msg):
    print(f"[serve {datetime.now():%H:%M:%S}] {msg}", flush=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/ping":
            return self._json(200, {"ok": True, "mode": "server"})
        super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/save":
            return self._json(404, {"ok": False, "error": "not found"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self._json(400, {"ok": False, "error": f"bad body size {n}"})
        try:
            obj = json.loads(self.rfile.read(n))
            if not isinstance(obj, dict) or not isinstance(obj.get("items"), list):
                raise ValueError("missing items[]")
        except Exception as e:  # noqa: BLE001
            log(f"REJECTED save: {e}")
            return self._json(400, {"ok": False, "error": str(e)})
        if os.path.exists(DATA):
            shutil.copy2(DATA, DATA + ".bak")
        tmp = DATA + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(obj, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        os.replace(tmp, DATA)
        done = sum(1 for i in obj["items"] if i.get("done"))
        log(f"saved data.json · {len(obj['items'])} items · {done} done")
        return self._json(200, {"ok": True, "items": len(obj["items"])})

    def log_message(self, fmt, *args):
        if self.command == "GET" and args and str(args[1]).startswith(("2", "3")):
            return  # keep the console quiet for normal static hits
        log(fmt % args)


def free_port(start, tries=50):
    for p in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                log(f"port {p} busy, trying next…")
    sys.exit(f"no free port in {start}-{start + tries - 1}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8555)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(DATA):
        sys.exit(f"data.json not found in {ROOT}")
    port = free_port(a.port)
    url = f"http://127.0.0.1:{port}/"
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    log(f"serving {ROOT}")
    log(f"open {url}   (Ctrl+C to stop)")
    if not a.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log("stopped")


if __name__ == "__main__":
    main()
