#!/usr/bin/env python3
"""Clean-room PayGate integration test using a local fake payment provider."""

import datetime as dt
import hashlib
import hmac
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.environ.get("PB_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
SUPER_EMAIL = os.environ.get("PB_SUPERUSER_EMAIL", "ci-super@example.test")
SUPER_PASS = os.environ.get("PB_SUPERUSER_PASSWORD", "CI-PocketBase-Smoke-2026!")
PAYGATE_API_KEY = os.environ.get("PAYGATE_API_KEY", "CI-PayGate-Api-Key-2026!!!!")
PAYGATE_WEBHOOK_SECRET = os.environ.get(
    "PAYGATE_WEBHOOK_SECRET", "CI-PayGate-Webhook-2026!!!!"
)
FAKE_PORT = int(os.environ.get("PAYGATE_FAKE_PORT", "18080"))


class FakePayGateState:
    def __init__(self):
        self.lock = threading.Lock()
        self.payments = {}
        self.by_idempotency = {}
        self.create_count = 0

    def create(self, amount, external_id, metadata, idempotency_key):
        with self.lock:
            params = {
                "amount": amount,
                "externalId": external_id,
                "metadata": metadata,
            }
            if idempotency_key in self.by_idempotency:
                payment_id = self.by_idempotency[idempotency_key]
                payment = self.payments[payment_id]
                if payment["_params"] != params:
                    return 409, {
                        "code": "IDEMPOTENCY_CONFLICT",
                        "message": "the idempotency key was already used with different payment parameters",
                    }
                return 200, self.create_response(payment)

            self.create_count += 1
            payment_id = f"pg_ci_{self.create_count:04d}"
            requested = amount * 100
            suffix = 30 + self.create_count
            payable = requested + suffix
            expires_at = (
                dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)
            ).isoformat().replace("+00:00", "Z")
            payment = {
                "id": payment_id,
                "requestedAmount": amount,
                "requestedAmountPaise": requested,
                "payableAmount": f"{payable / 100:.2f}",
                "payableAmountPaise": payable,
                "status": "pending",
                "expiresAt": expires_at,
                "paidAt": None,
                "externalId": external_id,
                "upiUri": (
                    "upi://pay?pa=ci%40upi&pn=IEEE+Sahrdaya+CI"
                    f"&am={payable / 100:.2f}&cu=INR&tr={payment_id}"
                ),
                "_params": params,
            }
            self.payments[payment_id] = payment
            self.by_idempotency[idempotency_key] = payment_id
            return 201, self.create_response(payment)

    @staticmethod
    def create_response(payment):
        return {k: v for k, v in payment.items() if not k.startswith("_")}

    @staticmethod
    def public_response(payment):
        return {
            "id": payment["id"],
            "requestedAmount": payment["requestedAmount"],
            "requestedAmountPaise": payment["requestedAmountPaise"],
            "payableAmount": payment["payableAmount"],
            "payableAmountPaise": payment["payableAmountPaise"],
            "status": payment["status"],
            "expiresAt": payment["expiresAt"],
            "paidAt": payment["paidAt"],
        }

    def get(self, payment_id):
        with self.lock:
            payment = self.payments.get(payment_id)
            return None if payment is None else self.public_response(payment)

    def set_status(self, payment_id, status):
        with self.lock:
            payment = self.payments[payment_id]
            payment["status"] = status
            if status in ("paid", "late"):
                payment["paidAt"] = dt.datetime.now(dt.timezone.utc).isoformat().replace(
                    "+00:00", "Z"
                )
            return dict(payment)

    def raw(self, payment_id):
        with self.lock:
            return dict(self.payments[payment_id])


STATE = FakePayGateState()


class FakePayGateHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, _format, *_args):
        return

    def send_json(self, status, payload):
        raw = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if self.path != "/api/payments":
            self.send_json(404, {"code": "NOT_FOUND", "message": "not found"})
            return
        if self.headers.get("Authorization") != f"Bearer {PAYGATE_API_KEY}":
            self.send_json(401, {"code": "UNAUTHORIZED", "message": "unauthorized"})
            return
        idempotency_key = (self.headers.get("Idempotency-Key") or "").strip()
        if not idempotency_key:
            self.send_json(400, {"code": "INVALID_IDEMPOTENCY_KEY", "message": "missing key"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        try:
            body = json.loads(self.rfile.read(length).decode())
        except Exception:
            self.send_json(400, {"code": "INVALID_JSON", "message": "invalid json"})
            return
        amount = body.get("amount")
        if not isinstance(amount, int) or isinstance(amount, bool) or amount <= 0:
            self.send_json(400, {"code": "INVALID_AMOUNT", "message": "invalid amount"})
            return
        status, response = STATE.create(
            amount,
            str(body.get("externalId") or ""),
            body.get("metadata"),
            idempotency_key,
        )
        self.send_json(status, response)

    def do_GET(self):
        prefix = "/api/payments/"
        if not self.path.startswith(prefix):
            self.send_json(404, {"code": "NOT_FOUND", "message": "not found"})
            return
        payment_id = urllib.parse.unquote(self.path[len(prefix) :])
        payment = STATE.get(payment_id)
        if payment is None:
            self.send_json(404, {"code": "PAYMENT_NOT_FOUND", "message": "payment not found"})
            return
        self.send_json(200, payment)


def request(method, path, body=None, token=None, expected=(200, 201, 204), extra_headers=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    if extra_headers:
        headers.update(extra_headers)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            status = response.status
            raw = response.read().decode()
    except urllib.error.HTTPError as error:
        status = error.code
        raw = error.read().decode()
    payload = json.loads(raw) if raw else None
    if status not in expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {payload}")
    return payload


def raw_request(method, path, raw_body, expected=(200,), extra_headers=None):
    headers = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(
        BASE + path, data=raw_body, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            status = response.status
            raw = response.read().decode()
    except urllib.error.HTTPError as error:
        status = error.code
        raw = error.read().decode()
    payload = json.loads(raw) if raw else None
    if status not in expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {payload}")
    return payload


def binary_request(method, path, token=None, expected=(200,), extra_headers=None):
    headers = {}
    if token:
        headers["Authorization"] = token
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(BASE + path, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            status = response.status
            raw = response.read()
            response_headers = dict(response.headers.items())
    except urllib.error.HTTPError as error:
        status = error.code
        raw = error.read()
        response_headers = dict(error.headers.items())
    if status not in expected:
        raise AssertionError(
            f"{method} {path}: expected {expected}, got {status}: {raw[:200]!r}"
        )
    return raw, response_headers


def impersonate(super_token, user_id):
    return request(
        "POST",
        f"/api/collections/users/impersonate/{user_id}",
        {"duration": 3600},
        super_token,
    )["token"]


def signed_paygate_event(event_id, event_type, provider_payment, timestamp=None):
    if timestamp is None:
        timestamp = str(int(time.time()))
    payment = {
        "id": provider_payment["id"],
        "requestedAmountPaise": provider_payment["requestedAmountPaise"],
        "payableAmountPaise": provider_payment["payableAmountPaise"],
        "status": provider_payment["status"],
        "rrn": f"rrn-{event_id}",
        "upiId": "payer@upi",
        "payerName": "CI Payer",
        "paidAt": provider_payment.get("paidAt") or "",
        "externalId": provider_payment["externalId"],
    }
    event = {
        "id": event_id,
        "type": event_type,
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": {"payment": payment},
    }
    raw = json.dumps(event, separators=(",", ":")).encode()
    signature = hmac.new(
        PAYGATE_WEBHOOK_SECRET.encode(),
        timestamp.encode() + b"." + raw,
        hashlib.sha256,
    ).hexdigest()
    headers = {
        "X-PayGate-Event-Id": event_id,
        "X-PayGate-Timestamp": timestamp,
        "X-PayGate-Signature": "v1=" + signature,
    }
    return raw, headers


def create_user(super_token, suffix, label):
    password = "FixturePass-2026!"
    return request(
        "POST",
        "/api/collections/users/records",
        {
            "email": f"paygate-{label}-{suffix}@example.test",
            "verified": True,
            "name": label.title(),
            "role": "user",
            "password": password,
            "passwordConfirm": password,
        },
        super_token,
    )


def register_paid(event_id, user, token):
    return request(
        "POST",
        f"/api/app/events/{event_id}/register",
        {
            "formResponses": {
                "name": user["name"],
                "email": user["email"],
                "phone": "9999999999",
                "college": "CI College",
            }
        },
        token,
    )


def main():
    server = ThreadingHTTPServer(("0.0.0.0", FAKE_PORT), FakePayGateHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        super_auth = request(
            "POST",
            "/api/collections/_superusers/auth-with-password",
            {"identity": SUPER_EMAIL, "password": SUPER_PASS},
        )
        super_token = super_auth["token"]
        suffix = str(int(time.time() * 1000))
        start = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).isoformat().replace(
            "+00:00", "Z"
        )
        end = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1, hours=2)).isoformat().replace(
            "+00:00", "Z"
        )

        society = request(
            "POST",
            "/api/collections/societies/records",
            {
                "name": f"PayGate CI {suffix}",
                "slug": f"paygate-ci-{suffix}",
                "bio": "PayGate integration test",
                "isHidden": False,
            },
            super_token,
        )
        event = request(
            "POST",
            "/api/collections/events/records",
            {
                "title": f"PayGate Paid Event {suffix}",
                "description": "PayGate smoke event",
                "date": start,
                "endDate": end,
                "venue": "CI Lab",
                "price": 100,
                "society": society["id"],
                "status": "published",
                "maxCapacity": 10,
                "registeredCount": 0,
                "checkedInCount": 0,
                "registrationOpen": True,
                "checkInEnabled": True,
                "isDeleted": False,
                "formTemplate": [
                    {"id": "name", "name": "name", "label": "Name", "required": True},
                    {"id": "email", "name": "email", "label": "Email", "required": True},
                ],
            },
            super_token,
        )

        # Polling recovery path: registration is idempotent, payment creation is
        # idempotent, and an authoritative PayGate status can mint the ticket.
        user1 = create_user(super_token, suffix, "polling")
        token1 = impersonate(super_token, user1["id"])
        reg1 = register_paid(event["id"], user1, token1)
        assert reg1["paymentRequired"] is True and reg1["reused"] is False
        assert reg1["registrationStatus"] == "pending"
        reg1_retry = register_paid(event["id"], user1, token1)
        assert reg1_retry["registrationId"] == reg1["registrationId"]
        assert reg1_retry["reused"] is True

        pending_record = request(
            "GET",
            f"/api/collections/registrations/records/{reg1['registrationId']}",
            token=token1,
        )
        assert pending_record["paymentData"]["provider"] == "paygate"
        assert pending_record["paymentData"]["providerStatus"] == "not_initialized"

        anonymous_temp = request(
            "GET",
            "/api/tickets/lookup?ticketId=" + urllib.parse.quote(reg1["ticketId"]),
        )
        assert anonymous_temp["found"] is False
        owner_temp = request(
            "GET",
            "/api/tickets/lookup?ticketId=" + urllib.parse.quote(reg1["ticketId"]),
            token=token1,
        )
        assert owner_temp["found"] is True
        assert owner_temp["registrationId"] == reg1["registrationId"]

        payment1 = request(
            "POST",
            f"/api/app/registrations/{reg1['registrationId']}/payment",
            token=token1,
        )
        assert payment1["provider"] == "paygate"
        assert payment1["providerStatus"] == "pending"
        assert payment1["requestedAmountPaise"] == 10000
        assert payment1["payableAmountPaise"] == 10031
        assert payment1["upiUri"].startswith("upi://pay?")
        assert STATE.create_count == 1

        payment1_replay = request(
            "POST",
            f"/api/app/registrations/{reg1['registrationId']}/payment",
            token=token1,
        )
        assert payment1_replay["paymentId"] == payment1["paymentId"]
        assert STATE.create_count == 1

        STATE.set_status(payment1["paymentId"], "paid")
        reconciled = request(
            "GET",
            f"/api/app/registrations/{reg1['registrationId']}/payment",
            token=token1,
        )
        assert reconciled["registrationStatus"] == "confirmed"
        assert reconciled["paymentStatus"] == "paid"
        assert reconciled["ticketId"].startswith("TKT-")
        real_ticket = reconciled["ticketId"]

        anonymous_real = request(
            "GET",
            "/api/tickets/lookup?ticketId=" + urllib.parse.quote(real_ticket),
        )
        assert anonymous_real["found"] is True
        owner_temp_after_paid = request(
            "GET",
            "/api/tickets/lookup?ticketId=" + urllib.parse.quote(reg1["ticketId"]),
            token=token1,
        )
        assert owner_temp_after_paid["ticket"]["id"] == real_ticket

        # A confirmed paid registration owns two durable notification jobs and
        # exposes its receipt only to the authenticated owner/admin.
        paid_notification_filter = urllib.parse.quote(
            f'registration="{reg1["registrationId"]}"'
        )
        paid_notifications = request(
            "GET",
            f"/api/collections/notification_outbox/records?filter={paid_notification_filter}",
            token=super_token,
        )
        assert paid_notifications["totalItems"] == 2
        assert {row["kind"] for row in paid_notifications["items"]} == {"ticket", "receipt"}
        assert all(row["status"] == "pending" for row in paid_notifications["items"])

        receipt_path = f"/api/app/registrations/{reg1['registrationId']}/receipt"
        request("GET", receipt_path, expected=(401,))
        receipt_pdf, receipt_headers = binary_request("GET", receipt_path, token=token1)
        assert receipt_headers.get("Content-Type", "").startswith("application/pdf")
        assert receipt_pdf.startswith(b"%PDF-1.4")
        assert b"PAYMENT RECEIPT" in receipt_pdf
        assert b"Amount received: INR 100.31" in receipt_pdf
        assert real_ticket.encode() in receipt_pdf

        # Native webhook path: fail closed on bad/stale signatures and monetary
        # mismatch, then confirm exactly once on a valid signed event.
        user2 = create_user(super_token, suffix, "webhook")
        token2 = impersonate(super_token, user2["id"])
        reg2 = register_paid(event["id"], user2, token2)
        payment2 = request(
            "POST",
            f"/api/app/registrations/{reg2['registrationId']}/payment",
            token=token2,
        )
        provider2 = STATE.set_status(payment2["paymentId"], "paid")

        raw2, headers2 = signed_paygate_event("evt_ci_paid", "payment.paid", provider2)
        bad_headers = dict(headers2)
        bad_headers["X-PayGate-Signature"] = "v1=" + "0" * 64
        raw_request("POST", "/api/webhooks/paygate", raw2, expected=(401,), extra_headers=bad_headers)

        stale_timestamp = str(int(time.time()) - 1000)
        raw_stale, stale_headers = signed_paygate_event(
            "evt_ci_stale", "payment.paid", provider2, stale_timestamp
        )
        raw_request(
            "POST",
            "/api/webhooks/paygate",
            raw_stale,
            expected=(401,),
            extra_headers=stale_headers,
        )

        mismatch = dict(provider2)
        mismatch["requestedAmountPaise"] = 9900
        mismatch["payableAmountPaise"] = 9931
        mismatch["payableAmount"] = "99.31"
        raw_bad_amount, bad_amount_headers = signed_paygate_event(
            "evt_ci_amount", "payment.paid", mismatch
        )
        raw_request(
            "POST",
            "/api/webhooks/paygate",
            raw_bad_amount,
            expected=(400,),
            extra_headers=bad_amount_headers,
        )

        accepted = raw_request(
            "POST", "/api/webhooks/paygate", raw2, extra_headers=headers2
        )
        assert accepted["success"] is True and accepted["action"] == "confirm"
        replayed = raw_request(
            "POST", "/api/webhooks/paygate", raw2, extra_headers=headers2
        )
        assert replayed.get("message") == "Already processed"
        reg2_record = request(
            "GET",
            f"/api/collections/registrations/records/{reg2['registrationId']}",
            token=token2,
        )
        assert reg2_record["registrationStatus"] == "confirmed"
        assert reg2_record["paymentStatus"] == "paid"
        assert reg2_record["ticketId"].startswith("TKT-")

        # Expiry is deliberately non-terminal during the IEEE grace window. A
        # later valid paid event can still confirm while the seat is reserved.
        user3 = create_user(super_token, suffix, "delayed")
        token3 = impersonate(super_token, user3["id"])
        reg3 = register_paid(event["id"], user3, token3)
        payment3 = request(
            "POST",
            f"/api/app/registrations/{reg3['registrationId']}/payment",
            token=token3,
        )
        STATE.set_status(payment3["paymentId"], "expired")
        expired_session = request(
            "GET",
            f"/api/app/registrations/{reg3['registrationId']}/payment",
            token=token3,
        )
        assert expired_session["providerStatus"] == "expired"
        assert expired_session["registrationStatus"] == "pending"
        assert expired_session["paymentStatus"] == "pending"

        provider3 = STATE.set_status(payment3["paymentId"], "paid")
        raw3, headers3 = signed_paygate_event(
            "evt_ci_delayed_paid", "payment.paid", provider3
        )
        delayed = raw_request(
            "POST", "/api/webhooks/paygate", raw3, extra_headers=headers3
        )
        assert delayed["action"] == "confirm"
        reg3_record = request(
            "GET",
            f"/api/collections/registrations/records/{reg3['registrationId']}",
            token=token3,
        )
        assert reg3_record["registrationStatus"] == "confirmed"

        # A genuinely late payment never resurrects the seat; it is retained as
        # explicit manual-review evidence instead.
        user4 = create_user(super_token, suffix, "late")
        token4 = impersonate(super_token, user4["id"])
        reg4 = register_paid(event["id"], user4, token4)
        payment4 = request(
            "POST",
            f"/api/app/registrations/{reg4['registrationId']}/payment",
            token=token4,
        )
        provider4 = STATE.set_status(payment4["paymentId"], "late")
        raw4, headers4 = signed_paygate_event("evt_ci_late", "payment.late", provider4)
        late = raw_request(
            "POST", "/api/webhooks/paygate", raw4, extra_headers=headers4
        )
        assert late["action"] == "manual_review"
        reg4_record = request(
            "GET",
            f"/api/collections/registrations/records/{reg4['registrationId']}",
            token=token4,
        )
        assert reg4_record["registrationStatus"] == "cancelled"
        assert reg4_record["paymentStatus"] == "failed"
        assert reg4_record["paymentData"]["manualReview"] is True

        late_owner_state = request(
            "GET", f"/api/app/events/{event['id']}/my-registration", token=token4
        )
        assert late_owner_state["found"] is True
        assert late_owner_state["manualReview"] is True
        assert late_owner_state["registrationId"] == reg4["registrationId"]
        duplicate_after_late = request(
            "POST",
            f"/api/app/events/{event['id']}/register",
            {
                "formResponses": {
                    "name": user4["name"],
                    "email": user4["email"],
                    "phone": "9999999999",
                    "college": "CI College",
                }
            },
            token4,
            expected=(400,),
        )
        assert "under organizer review" in duplicate_after_late["error"]

        crons = request("GET", "/api/crons", token=super_token)
        assert any(c.get("id") == "paygate-registration-expiry" for c in crons)

        assert STATE.create_count == 4
        print(
            json.dumps(
                {
                    "ok": True,
                    "providerPayments": STATE.create_count,
                    "realTicket": real_ticket,
                    "webhookConfirmed": reg2_record["id"],
                    "lateReview": reg4_record["id"],
                }
            )
        )
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
