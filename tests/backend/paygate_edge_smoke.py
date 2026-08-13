#!/usr/bin/env python3
"""PayGate edge-state smoke tests that don't require a live provider process."""

import datetime as dt
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request

BASE = os.environ.get("PB_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
SUPER_EMAIL = os.environ.get("PB_SUPERUSER_EMAIL", "ci-super@example.test")
SUPER_PASS = os.environ.get("PB_SUPERUSER_PASSWORD", "CI-PocketBase-Smoke-2026!")
WEBHOOK_SECRET = os.environ.get("PAYGATE_WEBHOOK_SECRET", "CI-PayGate-Webhook-2026!!!!")


def request(method, path, body=None, token=None, expected=(200, 201, 204), headers=None):
    request_headers = {"Content-Type": "application/json"}
    if token:
        request_headers["Authorization"] = token
    if headers:
        request_headers.update(headers)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=request_headers, method=method)
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


def raw_request(path, raw_body, headers, expected=(200,)):
    req = urllib.request.Request(
        BASE + path,
        data=raw_body,
        headers={"Content-Type": "application/json", **headers},
        method="POST",
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
        raise AssertionError(f"POST {path}: expected {expected}, got {status}: {payload}")
    return payload


def sign_event(event):
    raw = json.dumps(event, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(
        WEBHOOK_SECRET.encode(), timestamp.encode() + b"." + raw, hashlib.sha256
    ).hexdigest()
    return raw, {
        "X-PayGate-Event-Id": event["id"],
        "X-PayGate-Timestamp": timestamp,
        "X-PayGate-Signature": "v1=" + signature,
    }


def create_user(super_token, suffix, label):
    password = "FixturePass-2026!"
    return request(
        "POST",
        "/api/collections/users/records",
        {
            "email": f"paygate-edge-{label}-{suffix}@example.test",
            "verified": True,
            "name": label.title(),
            "role": "user",
            "password": password,
            "passwordConfirm": password,
        },
        super_token,
    )


def impersonate(super_token, user_id):
    return request(
        "POST",
        f"/api/collections/users/impersonate/{user_id}",
        {"duration": 3600},
        super_token,
    )["token"]


def register(event_id, user, token):
    return request(
        "POST",
        f"/api/app/events/{event_id}/register",
        {"formResponses": {"name": user["name"], "email": user["email"]}},
        token,
    )


def attach_payment(super_token, registration_id, payment_id, suffix):
    expires = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)).isoformat().replace(
        "+00:00", "Z"
    )
    data = {
        "provider": "paygate",
        "providerStatus": "pending",
        "paymentId": payment_id,
        "requestedAmountPaise": 10000,
        "payableAmountPaise": 10037,
        "payableAmount": "100.37",
        "expiresAt": expires,
        "paidAt": "",
        "upiUri": "upi://pay?pa=ci%40upi&pn=IEEE+CI&am=100.37&cu=INR",
        "manualReview": False,
        "createdAt": suffix,
    }
    request(
        "PATCH",
        f"/api/collections/registrations/records/{registration_id}",
        {"paymentData": data},
        super_token,
    )
    return data


def paid_event(event_id, registration_id, payment_id, event_name):
    return {
        "id": event_name,
        "type": "payment.paid",
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": {
            "payment": {
                "id": payment_id,
                "requestedAmountPaise": 10000,
                "payableAmountPaise": 10037,
                "status": "paid",
                "rrn": "123456789012",
                "upiId": "payer@upi",
                "payerName": "CI Payer",
                "paidAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
                "externalId": f"ieee-registration:{registration_id}",
            }
        },
        "_eventIdForTest": event_id,
    }


def main():
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
            "name": f"PayGate Edge CI {suffix}",
            "slug": f"paygate-edge-ci-{suffix}",
            "bio": "PayGate edge integration test",
            "isHidden": False,
        },
        super_token,
    )
    event = request(
        "POST",
        "/api/collections/events/records",
        {
            "title": f"PayGate Edge Event {suffix}",
            "description": "PayGate cancellation state test",
            "date": start,
            "endDate": end,
            "venue": "CI Lab",
            "price": 100,
            "society": society["id"],
            "status": "published",
            "paymentProvider": "kotak",
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

    # Valid signed non-payment events are authenticated then acknowledged as
    # irrelevant, so PayGate does not endlessly retry refund notifications.
    refund_event = {
        "id": f"evt_refund_{suffix}",
        "type": "refund.requested",
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": {"refund": {"id": "refund_ci", "status": "requested"}},
    }
    refund_raw, refund_headers = sign_event(refund_event)
    refund_result = raw_request("/api/webhooks/paygate", refund_raw, refund_headers)
    assert refund_result["success"] is True and refund_result["ignored"] is True

    # Event cancelled after QR/session issuance: money is recorded as paid, but
    # no ticket is minted and the released seat stays released.
    user1 = create_user(super_token, suffix, "event-cancelled")
    token1 = impersonate(super_token, user1["id"])
    reg1 = register(event["id"], user1, token1)
    attach_payment(super_token, reg1["registrationId"], "pg_event_cancelled", suffix)
    request(
        "PATCH",
        f"/api/collections/events/records/{event['id']}",
        {"status": "cancelled"},
        super_token,
    )
    event_paid = paid_event(
        event["id"], reg1["registrationId"], "pg_event_cancelled", f"evt_event_cancelled_{suffix}"
    )
    event_paid.pop("_eventIdForTest", None)
    raw, headers = sign_event(event_paid)
    result = raw_request("/api/webhooks/paygate", raw, headers)
    assert result["action"] == "paid_manual_review"
    row = request(
        "GET",
        f"/api/collections/registrations/records/{reg1['registrationId']}",
        token=token1,
    )
    assert row["registrationStatus"] == "cancelled"
    assert row["paymentStatus"] == "paid"
    assert not row.get("ticketId")
    assert row["paymentData"]["providerStatus"] == "paid"
    assert row["paymentData"]["manualReview"] is True
    assert "event was cancelled" in row["paymentData"]["reviewReason"].lower()
    event_after = request("GET", f"/api/collections/events/records/{event['id']}", token=super_token)
    assert event_after["registeredCount"] == 0

    # Individual registration cancelled after QR/session issuance: same financial
    # truth, same no-resurrection behavior, independent of event cancellation.
    event2 = request(
        "POST",
        "/api/collections/events/records",
        {
            "title": f"PayGate Edge Event 2 {suffix}",
            "description": "PayGate registration cancellation test",
            "date": start,
            "endDate": end,
            "venue": "CI Lab",
            "price": 100,
            "society": society["id"],
            "status": "published",
            "paymentProvider": "kotak",
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
    user2 = create_user(super_token, suffix, "registration-cancelled")
    token2 = impersonate(super_token, user2["id"])
    reg2 = register(event2["id"], user2, token2)
    attach_payment(super_token, reg2["registrationId"], "pg_registration_cancelled", suffix)
    request(
        "PATCH",
        f"/api/collections/registrations/records/{reg2['registrationId']}",
        {"registrationStatus": "cancelled"},
        super_token,
    )
    registration_paid = paid_event(
        event2["id"],
        reg2["registrationId"],
        "pg_registration_cancelled",
        f"evt_registration_cancelled_{suffix}",
    )
    registration_paid.pop("_eventIdForTest", None)
    raw2, headers2 = sign_event(registration_paid)
    result2 = raw_request("/api/webhooks/paygate", raw2, headers2)
    assert result2["action"] == "paid_manual_review"
    row2 = request(
        "GET",
        f"/api/collections/registrations/records/{reg2['registrationId']}",
        token=token2,
    )
    assert row2["registrationStatus"] == "cancelled"
    assert row2["paymentStatus"] == "paid"
    assert not row2.get("ticketId")
    assert row2["paymentData"]["manualReview"] is True
    assert "seat was released" in row2["paymentData"]["reviewReason"].lower()
    event2_after = request("GET", f"/api/collections/events/records/{event2['id']}", token=super_token)
    assert event2_after["registeredCount"] == 0

    print(
        json.dumps(
            {
                "ok": True,
                "refundIgnored": True,
                "cancelledEventPayment": row["id"],
                "cancelledRegistrationPayment": row2["id"],
            }
        )
    )


if __name__ == "__main__":
    main()
