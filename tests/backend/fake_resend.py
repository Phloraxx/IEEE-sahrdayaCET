#!/usr/bin/env python3
import json, os, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

PORT = int(os.environ.get("RESEND_FAKE_PORT", "18082"))
API_KEY = os.environ.get("RESEND_API_KEY", "re_ci_certificate_test")
MESSAGES = []
LOCK = threading.Lock()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass
    def body(self):
        size = int(self.headers.get("Content-Length", "0") or 0)
        return self.rfile.read(size) if size else b""
    def send_json(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def do_GET(self):
        if self.path == "/health":
            return self.send_json(200, {"ok": True})
        if self.path == "/__test__/messages":
            with LOCK:
                rows = list(MESSAGES)
            return self.send_json(200, {"messages": rows})
        return self.send_json(404, {"error": "not found"})
    def do_POST(self):
        if self.path != "/emails":
            return self.send_json(404, {"error": "not found"})
        if self.headers.get("Authorization") != "Bearer " + API_KEY:
            return self.send_json(401, {"message": "invalid api key"})
        idem = self.headers.get("Idempotency-Key", "")
        if not idem:
            return self.send_json(400, {"message": "missing idempotency key"})
        try:
            payload = json.loads(self.body().decode() or "{}")
        except Exception:
            return self.send_json(400, {"message": "invalid json"})
        with LOCK:
            for row in MESSAGES:
                if row["idempotencyKey"] == idem:
                    return self.send_json(200, {"id": row["id"]})
            message_id = f"email_ci_{len(MESSAGES)+1:06d}"
            MESSAGES.append({"id": message_id, "idempotencyKey": idem, "payload": payload})
        return self.send_json(200, {"id": message_id})

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
