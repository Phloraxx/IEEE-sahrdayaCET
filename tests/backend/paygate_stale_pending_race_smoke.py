#!/usr/bin/env python3
"""Race the stale PayGate cleanup against a valid paid webhook."""

import datetime as dt
import hashlib
import hmac
import json
import os
import threading
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
        with urllib.request.urlopen(req, timeout=20) as response:
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
        with urllib.request.urlopen(req, timeout=20) as response:
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
                "upiId": "race-payer@upi",
                "payerName": "CI Race Payer",
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
    stale_expiry = (now - dt.timedelta(minutes=20)).isoformat().replace("+00:00", "Z")
    password = "FixturePass-2026!"

    society = request(
        "POST",
        "/api/collections/societies/records",
        {
            "name": f"PayGate Race CI {suffix}",
            "slug": f"paygate-race-ci-{suffix}",
            "bio": "Expiry/payment race regression",
            "isHidden": False,
        },
        super_token,
    )

    outcomes = {"confirmed": 0, "manual_review": 0}
    for iteration in range(6):
        event = request(
            "POST",
            "/api/collections/events/records",
            {
                "title": f"PayGate Race Event {suffix}-{iteration}",
                "description": "expiry/payment race",
                "date": start,
                "endDate": end,
                "venue": "CI Lab",
                "price": 100,
                "society": society["id"],
                "status": "published",
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
        user = request(
            "POST",
            "/api/collections/users/records",
            {
                "email": f"paygate-race-{iteration}-{suffix}@example.test",
                "verified": True,
                "name": f"Race Payer {iteration}",
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
            {"formResponses": {"name": user["name"], "email": user["email"]}},
            user_token,
        )
        payment_id = f"pg_race_{iteration}_{suffix}"
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

        raw, webhook_headers = signed_paid_event(
            registration["registrationId"],
            payment_id,
            f"evt_race_paid_{iteration}_{suffix}",
        )
        barrier = threading.Barrier(3)
        errors = []

        def run_cron():
            try:
                barrier.wait(timeout=5)
                request(
                    "POST",
                    "/api/crons/paygate-stale-pending-expiry",
                    token=super_token,
                    expected=(204,),
                )
            except Exception as exc:  # noqa: BLE001 - propagate from worker
                errors.append(exc)

        def run_webhook():
            try:
                barrier.wait(timeout=5)
                raw_request("/api/webhooks/paygate", raw, webhook_headers)
            except Exception as exc:  # noqa: BLE001 - propagate from worker
                errors.append(exc)

        cron_thread = threading.Thread(target=run_cron)
        webhook_thread = threading.Thread(target=run_webhook)
        cron_thread.start()
        webhook_thread.start()
        barrier.wait(timeout=5)
        cron_thread.join(timeout=20)
        webhook_thread.join(timeout=20)
        if cron_thread.is_alive() or webhook_thread.is_alive():
            raise AssertionError("Race workers did not finish")
        if errors:
            raise errors[0]

        final = request(
            "GET",
            f"/api/collections/registrations/records/{registration['registrationId']}",
            token=user_token,
        )
        count = request("GET", f"/api/collections/events/records/{event['id']}")["registeredCount"]

        if final["registrationStatus"] == "confirmed":
            assert final["paymentStatus"] == "paid"
            assert final.get("ticketId")
            assert final["paymentData"].get("manualReview") is not True
            assert count == 1
            outcomes["confirmed"] += 1
        elif final["registrationStatus"] == "cancelled":
            # If expiry wins the writer lock, the paid callback must observe the
            # terminal cancellation and retain the financial truth for review.
            assert final["paymentStatus"] == "paid"
            assert not final.get("ticketId")
            assert final["paymentData"].get("providerStatus") == "paid"
            assert final["paymentData"].get("manualReview") is True
            assert count == 0
            outcomes["manual_review"] += 1
        else:
            raise AssertionError(f"Unexpected race result: {final}")

    print(json.dumps({"ok": True, "iterations": 6, "outcomes": outcomes}))


if __name__ == "__main__":
    main()
