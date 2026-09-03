#!/usr/bin/env python3
"""Clean-room scale smoke for a 200-recipient certificate issue decision."""
import datetime as dt
import json
import os
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zlib

BASE = os.environ.get("PB_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
SUPER_EMAIL = os.environ.get("PB_SUPERUSER_EMAIL", "ci-super@example.test")
SUPER_PASS = os.environ.get("PB_SUPERUSER_PASSWORD", "CI-PocketBase-Smoke-2026!")
COUNT = 200


def request(method, path, body=None, token=None, expected=(200, 201, 204), timeout=30):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    payload = json.loads(raw.decode()) if raw else None
    if status not in expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {payload}")
    return payload


def multipart_request(path, files, token):
    boundary = "----ieee-cert-bulk-" + uuid.uuid4().hex
    chunks = []
    for name, filename, content, content_type in files:
        chunks += [f"--{boundary}\r\n".encode(), f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode(), f"Content-Type: {content_type}\r\n\r\n".encode(), content, b"\r\n"]
    chunks.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(BASE + path, data=b"".join(chunks), headers={"Authorization": token, "Content-Type": f"multipart/form-data; boundary={boundary}"}, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    payload = json.loads(raw.decode()) if raw else None
    if status != 200:
        raise AssertionError(f"PATCH {path}: expected 200, got {status}: {payload}")
    return payload


def png_chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def make_png(width, height):
    row = b"\x00" + bytes((248, 251, 255)) * width
    raw = row * height
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b"")


super_token = request("POST", "/api/collections/_superusers/auth-with-password", {"identity": SUPER_EMAIL, "password": SUPER_PASS})["token"]
suffix = str(int(time.time() * 1000))
fixture_password = "FixturePass-2026!"


def create_user(label, role="user"):
    email_label = "".join(ch.lower() if ch.isalnum() else "-" for ch in label).strip("-")
    return request("POST", "/api/collections/users/records", {
        "email": f"cert-bulk-{email_label}-{suffix}@example.test",
        "verified": True,
        "name": label,
        "role": role,
        "password": fixture_password,
        "passwordConfirm": fixture_password,
    }, super_token)


admin = create_user("Bulk Admin", "admin")
admin_token = request("POST", f"/api/collections/users/impersonate/{admin['id']}", {"duration": 3600}, super_token)["token"]
society = request("POST", "/api/collections/societies/records", {
    "name": "Certificate Bulk Society",
    "slug": f"cert-bulk-{suffix}",
    "bio": "Synthetic certificate scale smoke",
    "isHidden": False,
}, super_token)
now = dt.datetime.now(dt.timezone.utc)
event = request("POST", "/api/collections/events/records", {
    "title": f"Certificate Bulk Smoke {suffix}",
    "description": "Synthetic 200-recipient certificate issue smoke",
    "date": (now + dt.timedelta(days=1)).isoformat().replace("+00:00", "Z"),
    "venue": "CI Lab",
    "price": 0,
    "society": society["id"],
    "status": "published",
    "registrationOpen": False,
    "checkInEnabled": True,
    "isDeleted": False,
}, super_token)
template = request("POST", f"/api/app/events/{event['id']}/certificate-templates", {
    "name": "Bulk Completion Certificate",
    "certificateType": "completion",
}, admin_token)["template"]
template = multipart_request(
    f"/api/app/certificate-templates/{template['id']}",
    [("renderBase", "render-base.png", make_png(2400, 1350), "image/png")],
    admin_token,
)["template"]
template = request("POST", f"/api/app/certificate-templates/{template['id']}/publish", token=admin_token)["template"]

registration_ids = []
for index in range(COUNT):
    label = f"Recipient {index + 1:03d}"
    user = create_user(label)
    registration = request("POST", "/api/collections/registrations/records", {
        "user": user["id"],
        "event": event["id"],
        "userName": label,
        "userEmail": f"bulk-{index + 1:03d}-{suffix}@example.test",
        "registrationStatus": "confirmed",
        "paymentStatus": "not_required",
        "checkedIn": True,
        "checkedInAt": now.isoformat().replace("+00:00", "Z"),
        "ticketId": "TKT-" + uuid.uuid4().hex[:16],
        "paymentTicketId": uuid.uuid4().hex,
        "registrationDate": now.isoformat().replace("+00:00", "Z"),
    }, super_token)
    registration_ids.append(registration["id"])

preview_path = f"/api/app/events/{event['id']}/certificates/audience/preview"
issue_path = f"/api/app/events/{event['id']}/certificates/issue"
preview_started = time.monotonic()
preview = request("POST", preview_path, {
    "templateId": template["id"],
    "audienceType": "confirmed",
    "audienceConfig": {},
}, admin_token, timeout=60)
preview_seconds = time.monotonic() - preview_started
assert preview["recipientCount"] == COUNT
assert preview["emailEligibleCount"] == COUNT
assert preview["missingEmailCount"] == 0
assert len(preview["recipients"]) == COUNT
assert {row["id"] for row in preview["recipients"]} == set(registration_ids)

issue_started = time.monotonic()
issued = request("POST", issue_path, {
    "templateId": template["id"],
    "audienceType": "confirmed",
    "audienceConfig": {},
    "audienceFingerprint": preview["audienceFingerprint"],
    "note": "CI 200-recipient scale issuance",
}, admin_token, timeout=120)
issue_seconds = time.monotonic() - issue_started
assert issued["idempotent"] is False
assert issued["batch"]["recipientCount"] == COUNT
assert issued["batch"]["issuedCount"] == COUNT
assert len(issued["certificates"]) == COUNT

replayed = request("POST", issue_path, {
    "templateId": template["id"],
    "audienceType": "confirmed",
    "audienceConfig": {},
    "audienceFingerprint": preview["audienceFingerprint"],
    "note": "CI 200-recipient scale issuance replay",
}, admin_token, timeout=60)
assert replayed["idempotent"] is True
assert replayed["batch"]["id"] == issued["batch"]["id"]
assert len(replayed["certificates"]) == COUNT

credential_ids = [row["credentialId"] for row in issued["certificates"]]
assert len(credential_ids) == len(set(credential_ids)) == COUNT
certificate_filter = urllib.parse.quote(f'batch = "{issued["batch"]["id"]}"')
records = request("GET", f"/api/collections/certificates/records?perPage=250&filter={certificate_filter}", token=super_token)
assert records["totalItems"] == COUNT
verification_tokens = [row["verificationToken"] for row in records["items"]]
assert len(verification_tokens) == len(set(verification_tokens)) == COUNT
assert all(len(token) == 48 for token in verification_tokens)

# Registry totals, summary and pagination remain exact at the 200-row scale
# while the implementation is free to keep each request bounded.
registry_path = "/api/app/certificates/registry"
registry_credentials = []
for page in range(1, 6):
    registry = request(
        "GET",
        f"{registry_path}?event={event['id']}&page={page}&perPage=40",
        token=admin_token,
        timeout=30,
    )
    assert registry["total"] == COUNT
    assert registry["totalPages"] == 5
    assert len(registry["certificates"]) == 40
    if page == 1:
        assert registry["summary"]["total"] == COUNT
        assert registry["summary"]["active"] == COUNT
        assert registry["summary"]["emailReady"] == COUNT
        assert registry["summary"]["missingEmail"] == 0
        assert registry["summary"]["notQueued"] == COUNT
        assert any(row["id"] == event["id"] for row in registry["events"])
    registry_credentials.extend(row["credentialId"] for row in registry["certificates"])
assert len(registry_credentials) == len(set(registry_credentials)) == COUNT
assert set(registry_credentials) == set(credential_ids)

registry_search = request(
    "GET",
    f"{registry_path}?event={event['id']}&search={urllib.parse.quote('Recipient 137')}",
    token=admin_token,
)
assert registry_search["total"] == 1
assert registry_search["certificates"][0]["recipientName"] == "Recipient 137"
registry_delivery = request(
    "GET",
    f"{registry_path}?event={event['id']}&delivery=not_queued&perPage=200",
    token=admin_token,
)
assert registry_delivery["total"] == COUNT
assert len(registry_delivery["certificates"]) == COUNT
registry_filtered = request(
    "GET",
    f"{registry_path}?event={event['id']}&status=active&type=completion&perPage=200",
    token=admin_token,
)
assert registry_filtered["total"] == COUNT
assert registry_filtered["summary"]["active"] == COUNT

outbox_filter = urllib.parse.quote(f'kind = "certificate" && certificateBatch = "{issued["batch"]["id"]}"')
outbox = request("GET", f"/api/collections/notification_outbox/records?filter={outbox_filter}", token=super_token)
assert outbox["totalItems"] == 0

audit_filter = urllib.parse.quote(f'action = "certificate.batch-issue" && entityId = "{issued["batch"]["id"]}"')
audit = request("GET", f"/api/collections/admin_audit_log/records?filter={audit_filter}", token=super_token)
assert audit["totalItems"] == 1
assert audit["items"][0]["actor"] == admin["id"]
assert audit["items"][0]["event"] == event["id"]

print(json.dumps({
    "ok": True,
    "recipients": COUNT,
    "batchId": issued["batch"]["id"],
    "previewSeconds": round(preview_seconds, 3),
    "issueSeconds": round(issue_seconds, 3),
    "uniqueCredentials": len(set(credential_ids)),
    "uniqueTokens": len(set(verification_tokens)),
    "outboxJobsBeforeSend": outbox["totalItems"],
}))
