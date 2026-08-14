#!/usr/bin/env python3
import base64, json, os, time, urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_ieee")
KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "test_secret_ieee_2026")
ORDERS = {}
PAYMENTS = {}
REFUNDS = {}
COUNTERS = {"order": 0, "payment": 0, "refund": 0}

def ident(kind, prefix):
    COUNTERS[kind] += 1
    return f"{prefix}_{COUNTERS[kind]:014d}"

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass
    def body(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        return self.rfile.read(n) if n else b""
    def json_body(self):
        raw = self.body()
        return json.loads(raw.decode() or "{}")
    def send_json(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)
    def authorized(self):
        if self.path.startswith("/__test__/"):
            return True
        expected = "Basic " + base64.b64encode(f"{KEY_ID}:{KEY_SECRET}".encode()).decode()
        return self.headers.get("Authorization") == expected
    def do_GET(self):
        if not self.authorized():
            return self.send_json(401, {"error": {"description": "bad auth"}})
        parsed = urllib.parse.urlparse(self.path)
        path, query = parsed.path, urllib.parse.parse_qs(parsed.query)
        if path == "/v1/orders":
            receipt = query.get("receipt", [""])[0]
            items = [o for o in ORDERS.values() if not receipt or receipt in o["receipt"]]
            return self.send_json(200, {"entity": "collection", "count": len(items), "items": items})
        if path.startswith("/v1/orders/") and path.endswith("/payments"):
            order_id = path.split("/")[3]
            items = [p for p in PAYMENTS.values() if p["order_id"] == order_id]
            return self.send_json(200, {"entity": "collection", "count": len(items), "items": items})
        if path.startswith("/v1/orders/"):
            order = ORDERS.get(path.split("/")[3])
            return self.send_json(200 if order else 400, order or {"error": "missing"})
        if path.startswith("/v1/payments/") and "/refunds/" in path:
            refund_id = path.rsplit("/", 1)[-1]
            refund = REFUNDS.get(refund_id)
            return self.send_json(200 if refund else 400, refund or {"error": "missing"})
        if path.startswith("/v1/payments/"):
            payment = PAYMENTS.get(path.split("/")[3])
            return self.send_json(200 if payment else 400, payment or {"error": "missing"})
        return self.send_json(404, {"error": "not found"})
    def do_POST(self):
        if not self.authorized():
            return self.send_json(401, {"error": {"description": "bad auth"}})
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/v1/orders":
            body = self.json_body()
            receipt = str(body.get("receipt", ""))
            for order in ORDERS.values():
                if order["receipt"] == receipt:
                    return self.send_json(400, {"error": {"description": "receipt already exists"}})
            order_id = ident("order", "order")
            amount = int(body.get("amount", 0))
            order = {"id": order_id, "entity": "order", "amount": amount, "amount_paid": 0,
                     "amount_due": amount, "currency": body.get("currency", "INR"), "receipt": receipt,
                     "status": "created", "attempts": 0, "notes": body.get("notes", {}), "created_at": int(time.time())}
            ORDERS[order_id] = order
            return self.send_json(201, order)
        if path == "/__test__/payments":
            body = self.json_body(); order = ORDERS[body["order_id"]]
            payment_id = ident("payment", "pay")
            status = body.get("status", "captured")
            payment = {"id": payment_id, "entity": "payment", "amount": order["amount"], "currency": "INR",
                       "status": status, "order_id": order["id"], "method": body.get("method", "upi"),
                       "amount_refunded": int(body.get("amount_refunded", 0)),
                       "captured": status in ("captured", "refunded"), "created_at": int(time.time())}
            PAYMENTS[payment_id] = payment; order["attempts"] += 1
            if status in ("captured", "refunded"):
                order["status"] = "paid"; order["amount_paid"] = order["amount"]; order["amount_due"] = 0
            elif status == "failed": order["status"] = "attempted"
            return self.send_json(201, payment)
        if path.startswith("/v1/payments/") and path.endswith("/refund"):
            payment_id = path.split("/")[3]; payment = PAYMENTS.get(payment_id)
            if not payment: return self.send_json(400, {"error": "missing payment"})
            body = self.json_body(); amount = int(body.get("amount", payment["amount"]))
            idem = self.headers.get("X-Refund-Idempotency", "")
            for refund in REFUNDS.values():
                if refund.get("_idem") == idem:
                    visible = {k:v for k,v in refund.items() if k != "_idem"}
                    return self.send_json(200, visible)
            refund_id = ident("refund", "rfnd")
            refund = {"id": refund_id, "entity": "refund", "amount": amount, "currency": "INR",
                      "payment_id": payment_id, "notes": body.get("notes", {}), "created_at": int(time.time()),
                      "status": "processed", "speed_processed": "normal", "speed_requested": "normal", "_idem": idem}
            REFUNDS[refund_id] = refund
            payment["amount_refunded"] = min(payment["amount"], payment.get("amount_refunded", 0) + amount)
            if payment["amount_refunded"] >= payment["amount"]: payment["status"] = "refunded"
            visible = {k:v for k,v in refund.items() if k != "_idem"}
            return self.send_json(200, visible)
        return self.send_json(404, {"error": "not found"})

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("RAZORPAY_FAKE_PORT", "18080"))), Handler).serve_forever()
