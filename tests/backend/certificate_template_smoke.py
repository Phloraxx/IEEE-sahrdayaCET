#!/usr/bin/env python3
"""Clean-room smoke test for certificate template commands and immutability."""
import datetime as dt
import json
import os
import struct
import time
import urllib.error
import urllib.request
import uuid
import zlib

BASE = os.environ.get("PB_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
SUPER_EMAIL = os.environ.get("PB_SUPERUSER_EMAIL", "ci-super@example.test")
SUPER_PASS = os.environ.get("PB_SUPERUSER_PASSWORD", "CI-PocketBase-Smoke-2026!")
RESEND_FAKE_URL = os.environ.get("RESEND_FAKE_URL", "").rstrip("/")


def request(method, path, body=None, token=None, expected=(200, 201, 204)):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    payload = json.loads(raw.decode()) if raw else None
    if status not in expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {payload}")
    return payload
def raw_request(method, path, token=None, expected=(200,)):
    headers = {}
    if token:
        headers["Authorization"] = token
    req = urllib.request.Request(BASE + path, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    if status not in expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {raw[:200]!r}")
    return raw


def multipart_request(path, fields, files, token, expected=(200,)):
    boundary = "----ieee-cert-" + uuid.uuid4().hex
    chunks = []
    for name, value in fields.items():
        chunks += [f"--{boundary}\r\n".encode(), f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(), str(value).encode(), b"\r\n"]
    for name, filename, content, content_type in files:
        chunks += [f"--{boundary}\r\n".encode(), f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode(), f"Content-Type: {content_type}\r\n\r\n".encode(), content, b"\r\n"]
    chunks.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(BASE + path, data=b"".join(chunks), headers={
        "Authorization": token,
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    payload = json.loads(raw.decode()) if raw else None
    if status not in expected:
        raise AssertionError(f"PATCH {path}: expected {expected}, got {status}: {payload}")
    return payload
def png_chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def make_png(width, height, rgb=(247, 251, 255)):
    row = b"\x00" + bytes(rgb) * width
    raw = row * height
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b"")


def impersonate(super_token, user_id):
    return request("POST", f"/api/collections/users/impersonate/{user_id}", {"duration": 3600}, super_token)["token"]


super_auth = request("POST", "/api/collections/_superusers/auth-with-password", {"identity": SUPER_EMAIL, "password": SUPER_PASS})
super_token = super_auth["token"]
suffix = str(int(time.time() * 1000))
fixture_password = "FixturePass-2026!"


def create_user(label, role):
    return request("POST", "/api/collections/users/records", {
        "email": f"cert-{label}-{suffix}@example.test", "verified": True, "name": label.title(), "role": role,
        "password": fixture_password, "passwordConfirm": fixture_password,
    }, super_token)


admin = create_user("admin", "admin")
member = create_user("member", "user")
admin_token = impersonate(super_token, admin["id"])
member_token = impersonate(super_token, member["id"])

society = request("POST", "/api/collections/societies/records", {
    "name": "Certificate Smoke Society", "slug": f"cert-smoke-{suffix}", "bio": "Certificate template smoke", "isHidden": False,
}, super_token)
now = dt.datetime.now(dt.timezone.utc)
start = (now + dt.timedelta(days=1)).isoformat().replace("+00:00", "Z")
event = request("POST", "/api/collections/events/records", {
    "title": f"Certificate Template Smoke {suffix}", "description": "Synthetic certificate test event",
    "date": start, "venue": "CI Lab", "price": 0, "society": society["id"], "status": "published",
    "registrationOpen": False, "checkInEnabled": False, "isDeleted": False,
}, super_token)

# Certificate administration is a command surface, not direct collection CRUD.
request("POST", f"/api/app/events/{event['id']}/certificate-templates", {
    "name": "Workshop Certificate", "certificateType": "participation",
}, member_token, expected=(403,))
created = request("POST", f"/api/app/events/{event['id']}/certificate-templates", {
    "name": "Workshop Certificate", "certificateType": "participation",
}, admin_token)
template = created["template"]
assert template["status"] == "draft" and template["version"] == 1
assert template["layout"]["name"]["maxWidth"] == 0.50
assert template["layout"]["qr"]["enabled"] is False

not_ready = request("POST", f"/api/app/certificate-templates/{template['id']}/publish", token=admin_token, expected=(422,))
assert "render-base" in " ".join(not_ready["errors"]).lower()

layout = template["layout"]
base_png = make_png(2400, 1350)
deprecated_upload = multipart_request(
    f"/api/app/certificate-templates/{template['id']}",
    {"layout": json.dumps(layout), "emailSubject": template["emailSubject"], "emailText": template["emailText"]},
    [("sourceBackground", "legacy-background.png", base_png, "image/png")],
    admin_token, expected=(400,),
)
assert "no longer supported" in deprecated_upload["error"]
updated = multipart_request(
    f"/api/app/certificate-templates/{template['id']}",
    {
        "layout": json.dumps(layout),
        "emailSubject": "Your certificate | {{eventTitle}}",
        "emailText": "Hi {{firstName}}\n\nVerify: {{verificationUrl}}\nCredential: {{credentialId}}",
    },
    [
        ("renderBase", "render-base.png", base_png, "image/png"),
    ],
    admin_token,
)["template"]
assert updated["canvasWidth"] == 2400 and updated["canvasHeight"] == 1350
assert updated["files"]["renderBase"]["name"]
assert any(row["code"] == "auto_fit" for row in updated["preflightWarnings"])
render_name = updated["files"]["renderBase"]["name"]
asset_path = updated["files"]["renderBase"]["url"]
raw_request("GET", asset_path, token=member_token, expected=(403,))
assert raw_request("GET", asset_path, token=admin_token)[:8] == b"\x89PNG\r\n\x1a\n"

# Test email is self-addressed, sample-only, and cannot create certificate/outbox state.
test_email_path = f"/api/app/certificate-templates/{template['id']}/test-email"
request("POST", test_email_path, token=member_token, expected=(403,))
before_certificates = request("GET", "/api/collections/certificates/records?perPage=1", token=super_token)["totalItems"]
before_outbox = request("GET", "/api/collections/notification_outbox/records?perPage=1", token=super_token)["totalItems"]
test_sent = request("POST", test_email_path, token=admin_token)
assert test_sent["success"] is True and test_sent["provider"] == "resend"
assert test_sent["deliveryMode"] == "redirect" and test_sent["recipient"] == admin["email"]
assert request("GET", "/api/collections/certificates/records?perPage=1", token=super_token)["totalItems"] == before_certificates
assert request("GET", "/api/collections/notification_outbox/records?perPage=1", token=super_token)["totalItems"] == before_outbox
assert RESEND_FAKE_URL, "CI fake Resend endpoint must be configured"
with urllib.request.urlopen(RESEND_FAKE_URL + "/__test__/messages", timeout=10) as response:
    fake_messages = json.loads(response.read().decode())["messages"]
assert fake_messages, "certificate test email must reach the configured provider"
last_message = fake_messages[-1]["payload"]
assert last_message["to"] == ["ci-certificate-sink@example.test"]
assert last_message["subject"].startswith("[STAGING TEST] [TEST / NOT VALID]")
assert "TEST / NOT VALID" in last_message["html"] and "TEST / NOT VALID" in last_message["text"]

published = request("POST", f"/api/app/certificate-templates/{template['id']}/publish", token=admin_token)["template"]
assert published["status"] == "published" and len(published["contentHash"]) == 64

# Both the command route and the lower-level model invariant reject mutation.
request("PATCH", f"/api/app/certificate-templates/{template['id']}", {"emailSubject": "Changed"}, admin_token, expected=(409,))
request("PATCH", f"/api/collections/certificate_templates/records/{template['id']}", {"emailSubject": "Bypass attempt"}, super_token, expected=(400,))

archived = request("POST", f"/api/app/certificate-templates/{template['id']}/archive", token=admin_token)["template"]
assert archived["status"] == "archived"
request("DELETE", f"/api/app/certificate-templates/{template['id']}", token=admin_token, expected=(409,))

version_two = request("POST", f"/api/app/certificate-templates/{template['id']}/new-version", token=admin_token)["template"]
assert version_two["status"] == "draft" and version_two["version"] == 2
assert version_two["files"]["renderBase"]["name"]
assert set(version_two["files"]) == {"renderBase"}
request("DELETE", f"/api/app/certificate-templates/{version_two['id']}", token=admin_token)

listed = request("GET", f"/api/app/events/{event['id']}/certificate-templates", token=admin_token)
assert len(listed["templates"]) == 1 and listed["templates"][0]["status"] == "archived"
print(json.dumps({"ok": True, "templateId": template["id"], "contentHash": published["contentHash"]}))
