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
PAYGATE_API_KEY = os.environ.get("PAYGATE_API_KEY", "CI-PayGate-Api-Key-2026-Only-Test-32")
PAYGATE_WEBHOOK_SECRET = os.environ.get(
    "PAYGATE_WEBHOOK_SECRET", "CI-PayGate-Webhook-2026-Only-Test-32"
)
FAKE_PORT = int(os.environ.get("PAYGATE_FAKE_PORT", "18080"))


class FakePayGateState:
    def __init__(self):
        self.lock = threading.Lock()
        self.payments = {}
        self.by_idempotency = {}
        self.create_count = 0

    def create(self, amount, name, external_id, metadata, idempotency_key):
        with self.lock:
            params = {"amount": amount, "name": name, "external_id": external_id, "metadata": metadata}
            if idempotency_key in self.by_idempotency:
                payment_id = self.by_idempotency[idempotency_key]
                payment = self.payments[payment_id]
                if payment["_params"] != params:
                    return 409, {"error": {"code": "IDEMPOTENCY_CONFLICT", "message": "idempotency conflict"}}
                return 200, self.public_response(payment)

            self.create_count += 1
            payment_id = f"pg_ci_{self.create_count:04d}"
            suffix = 30 + self.create_count
            requested_paise = amount * 100
            payable_paise = requested_paise + suffix
            expires = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)
            payment = {
                "id": payment_id,
                "object": "payment",
                "name": name,
                "requested_amount": f"{amount:.2f}",
                "payable_amount": f"{payable_paise / 100:.2f}",
                "adjustment": f"{suffix / 100:.2f}",
                "status": "pending",
                "expires_at": expires.isoformat().replace("+00:00", "Z"),
                "grace_until": (expires + dt.timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
                "paid_at": None,
                "external_id": external_id,
                "metadata": metadata or {},
                "payer": {"name": "", "upi_id": ""},
                "upi_uri": "upi://pay?am=" + f"{payable_paise / 100:.2f}" + f"&cu=INR&pa=ci%40upi&pn=IEEE%20Sahrdaya%20CI&tn=PayGate%20{payment_id}",
                "transaction_note": f"PayGate {payment_id}",
                "_params": params,
            }
            self.payments[payment_id] = payment
            self.by_idempotency[idempotency_key] = payment_id
            return 201, self.public_response(payment)

    @staticmethod
    def public_response(payment):
        return {k: v for k, v in payment.items() if not k.startswith("_")}

    def get(self, payment_id):
        with self.lock:
            payment = self.payments.get(payment_id)
            return None if payment is None else self.public_response(payment)

    def set_status(self, payment_id, status):
        with self.lock:
            payment = self.payments[payment_id]
            payment["status"] = status
            if status in ("paid", "late"):
                payment["paid_at"] = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
                payment["payer"] = {"name": "CI Payer", "upi_id": "payer@upi"}
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
        if self.path != "/v1/payments":
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
            str(body.get("name") or ""),
            str(body.get("external_id") or ""),
            body.get("metadata"),
            idempotency_key,
        )
        self.send_json(status, response)

    def do_GET(self):
        prefix = "/v1/payments/"
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
    payment = STATE.public_response(provider_payment)
    event = {
        "id": event_id,
        "type": event_type,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": {"payment": payment},
    }
    raw = json.dumps(event, separators=(",", ":")).encode()
    signature = hmac.new(PAYGATE_WEBHOOK_SECRET.encode(), timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
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
            token=super_token,
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
        assert owner_temp["registration"]["id"] == reg1["registrationId"]
        assert owner_temp["registration"]["registrationStatus"] == "pending"
        assert set(owner_temp["registration"].keys()) == {
            "id", "userName", "userEmail", "userPhone", "registrationStatus",
            "paymentStatus", "registrationDate", "amount",
        }
        request(
            "GET",
            f"/api/collections/registrations/records/{reg1['registrationId']}",
            token=token1,
            expected=(403, 404),
        )

        payment1 = request(
            "POST",
            f"/api/app/registrations/{reg1['registrationId']}/payment",
            token=token1,
        )
        assert payment1["provider"] == "paygate"
        assert payment1["providerStatus"] == "pending"
        assert payment1["requestedAmountPaise"] == 10000
        assert payment1["payableAmountPaise"] == 10031
        assert payment1["upiUri"] == STATE.get(payment1["paymentId"])["upi_uri"]
        assert payment1["transactionNote"] == f"PayGate {payment1['paymentId']}"
        assert STATE.create_count == 1

        ledger_filter = urllib.parse.quote(f'registration = "{reg1["registrationId"]}"')
        ledger_list = request(
            "GET",
            "/api/collections/payments/records?perPage=10&filter=" + ledger_filter,
            token=super_token,
        )
        assert ledger_list["totalItems"] == 1
        ledger_pending = ledger_list["items"][0]
        assert ledger_pending["provider"] == "paygate"
        assert ledger_pending["providerOrderId"] == payment1["paymentId"]
        assert ledger_pending["status"] == "pending"
        assert ledger_pending["finalFeePaise"] == 10000
        assert ledger_pending["collectedPaise"] == 0

        payment1_replay = request(
            "POST",
            f"/api/app/registrations/{reg1['registrationId']}/payment",
            token=token1,
        )
        assert payment1_replay["paymentId"] == payment1["paymentId"]
        assert STATE.create_count == 1

        STATE.set_status(payment1["paymentId"], "paid")
        time.sleep(4.1)
        reconciled = request(
            "POST",
            f"/api/app/registrations/{reg1['registrationId']}/payment/reconcile",
            token=token1,
        )
        assert reconciled["registrationStatus"] == "confirmed"
        assert reconciled["paymentStatus"] == "paid"
        assert reconciled["ticketId"].startswith("TKT-")
        real_ticket = reconciled["ticketId"]

        ledger_paid_list = request(
            "GET",
            "/api/collections/payments/records?perPage=10&filter=" + ledger_filter,
            token=super_token,
        )
        assert ledger_paid_list["totalItems"] == 1
        ledger_paid = ledger_paid_list["items"][0]
        assert ledger_paid["status"] == "captured"
        assert ledger_paid["collectedPaise"] == payment1["payableAmountPaise"]
        assert ledger_paid["confirmationSource"] == "paygate"

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

        # A correctly signed v4 callback from another IEEE environment must be
        # acknowledged but ignored. Environment-scoped metadata is the hard
        # boundary when one PayGate service receives events for multiple clients.
        foreign_provider = dict(provider2)
        foreign_provider["metadata"] = dict(provider2.get("metadata") or {})
        foreign_provider["metadata"]["environment"] = "production"
        foreign_raw, foreign_headers = signed_paygate_event(
            "evt_ci_foreign", "payment.paid", foreign_provider
        )
        foreign = raw_request(
            "POST", "/api/webhooks/paygate", foreign_raw, extra_headers=foreign_headers
        )
        assert foreign["success"] is True and foreign["ignored"] is True

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
        mismatch["requested_amount"] = "99.00"
        mismatch["payable_amount"] = "99.31"
        mismatch["adjustment"] = "0.31"
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
            token=super_token,
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
        time.sleep(4.1)
        expired_session = request(
            "POST",
            f"/api/app/registrations/{reg3['registrationId']}/payment/reconcile",
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
            token=super_token,
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
            token=super_token,
        )
        assert reg4_record["registrationStatus"] == "cancelled"
        assert reg4_record["paymentStatus"] == "failed"
        assert reg4_record["paymentData"]["manualReview"] is True

        # If the event is cancelled after a PayGate session was issued, a real
        # later credit is retained as paid/manual-review evidence without
        # resurrecting the seat or minting a ticket.
        user5 = create_user(super_token, suffix, "event-cancelled")
        token5 = impersonate(super_token, user5["id"])
        reg5 = register_paid(event["id"], user5, token5)
        payment5 = request(
            "POST",
            f"/api/app/registrations/{reg5['registrationId']}/payment",
            token=token5,
        )
        provider5 = STATE.set_status(payment5["paymentId"], "paid")
        cancel_admin = create_user(super_token, suffix, "cancel-admin")
        request(
            "PATCH",
            f"/api/collections/users/records/{cancel_admin['id']}",
            {"role": "admin"},
            super_token,
        )
        cancel_admin_token = impersonate(super_token, cancel_admin["id"])
        request(
            "POST",
            f"/api/admin/events/{event['id']}/cancel",
            {"reason": "CI verifies late PayGate payment after event cancellation"},
            cancel_admin_token,
        )
        raw5, headers5 = signed_paygate_event(
            "evt_ci_event_cancelled", "payment.paid", provider5
        )
        cancelled_paid = raw_request(
            "POST", "/api/webhooks/paygate", raw5, extra_headers=headers5
        )
        assert cancelled_paid["action"] == "paid_manual_review"
        reg5_record = request(
            "GET",
            f"/api/collections/registrations/records/{reg5['registrationId']}",
            token=super_token,
        )
        assert reg5_record["registrationStatus"] == "cancelled"
        assert reg5_record["paymentStatus"] == "paid"
        assert not reg5_record.get("ticketId")
        assert reg5_record["paymentData"]["manualReview"] is True

        crons = request("GET", "/api/crons", token=super_token)
        assert any(c.get("id") == "paygate-registration-expiry" for c in crons)

        assert STATE.create_count == 5

        # Dedicated untouched Browser E2E fixture. Its provider session is created
        # while the local fake PayGate is alive, then left pending so Playwright
        # exercises the real payment page without contacting a live payment rail.
        browser_event = request(
            "POST",
            "/api/collections/events/records",
            {
                "title": f"E2E PayGate Checkout {suffix}",
                "description": "browser payment-page fixture",
                "date": start,
                "endDate": end,
                "venue": "E2E Payments Lab",
                "price": 125,
                "society": society["id"],
                "status": "published",
                "maxCapacity": 5,
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
        browser_user = create_user(super_token, suffix, "browser-checkout")
        browser_token = impersonate(super_token, browser_user["id"])
        browser_registration = register_paid(browser_event["id"], browser_user, browser_token)
        browser_payment = request(
            "POST",
            f"/api/app/registrations/{browser_registration['registrationId']}/payment",
            token=browser_token,
        )
        assert browser_payment["provider"] == "paygate"
        assert browser_payment["providerStatus"] == "pending"
        assert browser_payment["payableAmountPaise"] > browser_payment["requestedAmountPaise"]
        assert STATE.create_count == 6
        if github_env := os.environ.get("GITHUB_ENV"):
            with open(github_env, "a", encoding="utf-8") as env_file:
                env_file.write(f"E2E_PAYMENT_TOKEN={browser_token}\n")
                env_file.write(f"E2E_PAYMENT_REGISTRATION_ID={browser_registration['registrationId']}\n")
                env_file.write(f"E2E_PAYMENT_EVENT_TITLE={browser_event['title']}\n")
                env_file.write(f"E2E_PAYMENT_PAYABLE={browser_payment['payableAmount']}\n")

        print(
            json.dumps(
                {
                    "ok": True,
                    "providerPayments": STATE.create_count,
                    "realTicket": real_ticket,
                    "webhookConfirmed": reg2_record["id"],
                    "lateReview": reg4_record["id"],
                    "cancelledEventPaidReview": reg5_record["id"],
                }
            )
        )
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
