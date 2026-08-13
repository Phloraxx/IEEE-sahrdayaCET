#!/usr/bin/env python3
"""Regression test for abandoned PayGate sessions with a missed expiry webhook."""

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


def impersonate(super_token, user_id):
    return request(
        "POST",
        f"/api/collections/users/impersonate/{user_id}",
        {"duration": 3600},
        super_token,
    )["token"]


def signed_paid_event(registration_id, payment_id, event_id):
    now = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    event = {
        "id": event_id,
        "type": "payment.paid",
        "createdAt": now,
        "data": {
            "payment": {
                "id": payment_id,
                "requestedAmountPaise": 10000,
                "payableAmountPaise": 10037,
                "status": "paid",
                "rrn": "123456789012",
                "upiId": "payer@upi",
                "payerName": "CI Payer",
                "paidAt": now,
                "externalId": f"ieee-registration:{registration_id}",
            }
        },
    }
    raw = json.dumps(event, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(
        WEBHOOK_SECRET.encode(),
        timestamp.encode() + b"." + raw,
        hashlib.sha256,
    ).hexdigest()
    return raw, {
        "X-PayGate-Event-Id": event_id,
        "X-PayGate-Timestamp": timestamp,
        "X-PayGate-Signature": "v1=" + signature,
    }


def main():
    super_auth = request(
        "POST",
        "/api/collections/_superusers/auth-with-password",
        {"identity": SUPER_EMAIL, "password": SUPER_PASS},
    )
    super_token = super_auth["token"]
    suffix = str(int(time.time() * 1000))
    now = dt.datetime.now(dt.timezone.utc)
    start = (now + dt.timedelta(days=1)).isoformat().replace("+00:00", "Z")
    end = (now + dt.timedelta(days=1, hours=2)).isoformat().replace("+00:00", "Z")

    society = request(
        "POST",
        "/api/collections/societies/records",
        {
            "name": f"PayGate Stale CI {suffix}",
            "slug": f"paygate-stale-ci-{suffix}",
            "bio": "Missed expiry webhook regression",
            "isHidden": False,
        },
        super_token,
    )
    event = request(
        "POST",
        "/api/collections/events/records",
        {
            "title": f"PayGate Stale Pending Event {suffix}",
            "description": "stale pending recovery",
            "date": start,
            "endDate": end,
            "venue": "CI Lab",
            "price": 100,
            "society": society["id"],
            "status": "published",
            "paymentProvider": "kotak",
            "maxCapacity": 1,
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

    password = "FixturePass-2026!"
    user = request(
        "POST",
        "/api/collections/users/records",
        {
            "email": f"paygate-stale-{suffix}@example.test",
            "verified": True,
            "name": "Stale Pending Payer",
            "role": "user",
            "password": password,
            "passwordConfirm": password,
        },
        super_token,
    )
    user_token = impersonate(super_token, user["id"])
    registration = request(
        "POST",
        f"/api/app/events/{event['id']}/register",
        {
            "formResponses": {
                "name": user["name"],
                "email": user["email"],
            }
        },
        user_token,
    )
    assert registration["paymentRequired"] is True
    assert registration["registrationStatus"] == "pending"
    assert request("GET", f"/api/collections/events/records/{event['id']}")["registeredCount"] == 1

    payment_id = "pg_stale_pending_" + suffix
    stale_expiry = (now - dt.timedelta(minutes=20)).isoformat().replace("+00:00", "Z")
    request(
        "PATCH",
        f"/api/collections/registrations/records/{registration['registrationId']}",
        {
            "paymentData": {
                "provider": "paygate",
                "providerStatus": "pending",
                "paymentId": payment_id,
                "requestedAmountPaise": 10000,
                "payableAmountPaise": 10037,
                "payableAmount": "100.37",
                "expiresAt": stale_expiry,
                "paidAt": "",
                "upiUri": "upi://pay?pa=ci%40upi&pn=IEEE+CI&am=100.37&cu=INR",
                "manualReview": False,
            }
        },
        super_token,
    )

    crons = request("GET", "/api/crons", token=super_token)
    assert any(cron.get("id") == "paygate-stale-pending-expiry" for cron in crons)
    request(
        "POST",
        "/api/crons/paygate-stale-pending-expiry",
        token=super_token,
        expected=(204,),
    )

    released = None
    for _ in range(30):
        released = request(
            "GET",
            f"/api/collections/registrations/records/{registration['registrationId']}",
            token=user_token,
        )
        if released["registrationStatus"] == "cancelled":
            break
        time.sleep(0.1)

    assert released is not None
    assert released["registrationStatus"] == "cancelled"
    assert released["paymentStatus"] == "failed"
    assert not released.get("ticketId")
    assert "remained pending" in released["paymentData"]["releaseReason"].lower()
    assert request("GET", f"/api/collections/events/records/{event['id']}")["registeredCount"] == 0

    # Simulate bank evidence arriving after IEEE already released the seat. The
    # financial truth must be retained, but ticket/capacity state stays terminal.
    raw, headers = signed_paid_event(
        registration["registrationId"],
        payment_id,
        "evt_stale_pending_paid_" + suffix,
    )
    paid_result = raw_request("/api/webhooks/paygate", raw, headers)
    assert paid_result["action"] == "paid_manual_review"

    reviewed = request(
        "GET",
        f"/api/collections/registrations/records/{registration['registrationId']}",
        token=user_token,
    )
    assert reviewed["registrationStatus"] == "cancelled"
    assert reviewed["paymentStatus"] == "paid"
    assert not reviewed.get("ticketId")
    assert reviewed["paymentData"]["providerStatus"] == "paid"
    assert reviewed["paymentData"]["manualReview"] is True
    assert request("GET", f"/api/collections/events/records/{event['id']}")["registeredCount"] == 0

    print(
        json.dumps(
            {
                "ok": True,
                "registrationId": registration["registrationId"],
                "released": True,
                "latePaidManualReview": True,
            }
        )
    )


if __name__ == "__main__":
    main()
