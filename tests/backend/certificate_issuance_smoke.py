#!/usr/bin/env python3
"""Clean-room smoke for certificate audience review and immutable issuance."""
import datetime as dt
import json
import os
import struct
import time
import urllib.error
import urllib.request
import urllib.parse
import uuid
import zlib

BASE = os.environ.get("PB_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
SUPER_EMAIL = os.environ.get("PB_SUPERUSER_EMAIL", "ci-super@example.test")
SUPER_PASS = os.environ.get("PB_SUPERUSER_PASSWORD", "CI-PocketBase-Smoke-2026!")


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

def multipart_request(path, fields, files, token, expected=(200,)):
    boundary = "----ieee-cert-issue-" + uuid.uuid4().hex
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


def make_png(width, height):
    row = b"\x00" + bytes((248, 251, 255)) * width
    raw = row * height
    return b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b"")


def impersonate(super_token, user_id):
    return request("POST", f"/api/collections/users/impersonate/{user_id}", {"duration": 3600}, super_token)["token"]


super_auth = request("POST", "/api/collections/_superusers/auth-with-password", {"identity": SUPER_EMAIL, "password": SUPER_PASS})
super_token = super_auth["token"]
suffix = str(int(time.time() * 1000))
fixture_password = "FixturePass-2026!"


def create_user(label, role="user"):
    return request("POST", "/api/collections/users/records", {
        "email": f"cert-issue-{label}-{suffix}@example.test",
        "verified": True,
        "name": label.replace("-", " ").title(),
        "role": role,
        "password": fixture_password,
        "passwordConfirm": fixture_password,
    }, super_token)


admin = create_user("admin", "admin")
member = create_user("member")
admin_token = impersonate(super_token, admin["id"])
member_token = impersonate(super_token, member["id"])

society = request("POST", "/api/collections/societies/records", {
    "name": "Certificate Issue Society",
    "slug": f"cert-issue-{suffix}",
    "bio": "Synthetic certificate issuance smoke",
    "isHidden": False,
}, super_token)
now = dt.datetime.now(dt.timezone.utc)
start = (now + dt.timedelta(days=1)).isoformat().replace("+00:00", "Z")
event = request("POST", "/api/collections/events/records", {
    "title": f"Certificate Issue Smoke {suffix}",
    "description": "Synthetic certificate issue test event",
    "date": start,
    "venue": "CI Lab",
    "price": 0,
    "society": society["id"],
    "status": "published",
    "registrationOpen": False,
    "checkInEnabled": True,
    "isDeleted": False,
}, super_token)

template = request("POST", f"/api/app/events/{event['id']}/certificate-templates", {
    "name": "Completion Certificate",
    "certificateType": "completion",
}, admin_token)["template"]
base_png = make_png(2400, 1350)
template = multipart_request(
    f"/api/app/certificate-templates/{template['id']}",
    {
        "layout": json.dumps(template["layout"]),
        "emailSubject": "Your certificate | {{eventTitle}}",
        "emailText": "Hi {{firstName}}\n\nVerify: {{verificationUrl}}\nCredential: {{credentialId}}",
    },
    [("renderBase", "render-base.png", base_png, "image/png")],
    admin_token,
)["template"]
template = request("POST", f"/api/app/certificate-templates/{template['id']}/publish", token=admin_token)["template"]
assert template["status"] == "published" and len(template["contentHash"]) == 64


def create_registration(label, name, email, status="confirmed", checked_in=False):
    user = create_user("recipient-" + label)
    return request("POST", "/api/collections/registrations/records", {
        "user": user["id"],
        "event": event["id"],
        "userName": name,
        "userEmail": email,
        "registrationStatus": status,
        "paymentStatus": "not_required",
        "checkedIn": checked_in,
        "checkedInAt": now.isoformat().replace("+00:00", "Z") if checked_in else "",
        "ticketId": "TKT-" + uuid.uuid4().hex[:16],
        "paymentTicketId": uuid.uuid4().hex,
        "registrationDate": now.isoformat().replace("+00:00", "Z"),
    }, super_token)


reg_checked = create_registration("checked", "Alice Checked", "alice@example.test", checked_in=True)
reg_no_email = create_registration("no-email", "Mohammed Abdul Rahman Kizhakkedath", "", checked_in=True)
reg_confirmed = create_registration("confirmed", "Charlie Confirmed", "charlie@example.test")
reg_cancelled = create_registration("cancelled", "Cancelled Person", "cancelled@example.test", status="cancelled", checked_in=True)
reg_selected = create_registration("selected", "Selected Pending", "selected@example.test", status="pending")
reg_missing_name = create_registration("missing-name", "", "missing@example.test", status="pending")

candidate_path = f"/api/app/events/{event['id']}/certificates/candidates"
request("GET", candidate_path, token=member_token, expected=(403,))
candidate_result = request("GET", candidate_path, token=admin_token)
assert len(candidate_result["candidates"]) == 6
assert {row["id"] for row in candidate_result["candidates"]} == {
    reg_checked["id"], reg_no_email["id"], reg_confirmed["id"], reg_cancelled["id"], reg_selected["id"], reg_missing_name["id"]
}
for row in candidate_result["candidates"]:
    assert set(row) == {"id", "name", "email", "registrationStatus", "checkedIn"}

preview_path = f"/api/app/events/{event['id']}/certificates/audience/preview"
issue_path = f"/api/app/events/{event['id']}/certificates/issue"

request("POST", preview_path, {
    "templateId": template["id"],
    "audienceType": "checked_in",
    "audienceConfig": {},
}, member_token, expected=(403,))

attendance_unavailable = request("POST", preview_path, {
    "templateId": template["id"],
    "audienceType": "attendance_qualified",
    "audienceConfig": {},
}, admin_token, expected=(409,))
assert attendance_unavailable["code"] == "ATTENDANCE_DATA_UNAVAILABLE"

checked_preview = request("POST", preview_path, {
    "templateId": template["id"],
    "audienceType": "checked_in",
    "audienceConfig": {},
}, admin_token)
assert checked_preview["recipientCount"] == 2
assert checked_preview["emailEligibleCount"] == 1
assert checked_preview["missingEmailCount"] == 1
assert {row["id"] for row in checked_preview["recipients"]} == {reg_checked["id"], reg_no_email["id"]}
assert any(row["id"] == reg_cancelled["id"] and row["reason"] == "cancelled" for row in checked_preview["excluded"])
assert any(row["registrationId"] == reg_no_email["id"] and row["code"] == "auto_fit" for row in checked_preview["renderWarnings"])

issued = request("POST", issue_path, {
    "templateId": template["id"],
    "audienceType": "checked_in",
    "audienceConfig": {},
    "audienceFingerprint": checked_preview["audienceFingerprint"],
    "note": "CI checked-in issuance",
}, admin_token)
assert issued["idempotent"] is False
assert issued["batch"]["status"] == "issued"
assert issued["batch"]["issuedCount"] == 2
assert len(issued["certificates"]) == 2

replayed = request("POST", issue_path, {
    "templateId": template["id"],
    "audienceType": "checked_in",
    "audienceConfig": {},
    "audienceFingerprint": checked_preview["audienceFingerprint"],
    "note": "CI checked-in issuance replay",
}, admin_token)
assert replayed["idempotent"] is True
assert replayed["batch"]["id"] == issued["batch"]["id"]
assert len(replayed["certificates"]) == 2

outbox_filter = urllib.parse.quote('kind = "certificate"')
outbox = request("GET", f"/api/collections/notification_outbox/records?filter={outbox_filter}", token=super_token)
assert outbox["totalItems"] == 0

post_issue_preview = request("POST", preview_path, {
    "templateId": template["id"],
    "audienceType": "checked_in",
    "audienceConfig": {},
}, admin_token)
assert post_issue_preview["recipientCount"] == 0
assert sum(1 for row in post_issue_preview["excluded"] if row["reason"] == "already_issued") == 2

selected_preview = request("POST", preview_path, {
    "templateId": template["id"],
    "audienceType": "selected",
    "audienceConfig": {"registrationIds": [reg_selected["id"], reg_missing_name["id"]]},
}, admin_token)
assert selected_preview["recipientCount"] == 1
assert selected_preview["recipients"][0]["id"] == reg_selected["id"]
assert any(row["id"] == reg_missing_name["id"] and row["reason"] == "missing_name" for row in selected_preview["excluded"])

request("PATCH", f"/api/collections/registrations/records/{reg_selected['id']}", {
    "userName": "Selected Pending Renamed",
}, super_token)
changed = request("POST", issue_path, {
    "templateId": template["id"],
    "audienceType": "selected",
    "audienceConfig": {"registrationIds": [reg_selected["id"], reg_missing_name["id"]]},
    "audienceFingerprint": selected_preview["audienceFingerprint"],
}, admin_token, expected=(409,))
assert changed["code"] == "AUDIENCE_CHANGED"
assert changed["preview"]["recipients"][0]["name"] == "Selected Pending Renamed"

fresh_selected = changed["preview"]
selected_issued = request("POST", issue_path, {
    "templateId": template["id"],
    "audienceType": "selected",
    "audienceConfig": {"registrationIds": [reg_selected["id"], reg_missing_name["id"]]},
    "audienceFingerprint": fresh_selected["audienceFingerprint"],
}, admin_token)
assert selected_issued["batch"]["issuedCount"] == 1
assert selected_issued["certificates"][0]["recipientName"] == "Selected Pending Renamed"

certificate_id = issued["certificates"][0]["id"]
certificate = request("GET", f"/api/collections/certificates/records/{certificate_id}", token=super_token)
assert certificate["credentialId"].startswith("IEEESB-")
assert len(certificate["verificationToken"]) == 48
assert certificate["recipientNameSnapshot"] in {"Alice Checked", "Mohammed Abdul Rahman Kizhakkedath"}

request("PATCH", f"/api/collections/certificates/records/{certificate_id}", {
    "recipientNameSnapshot": "Mutated Name",
}, super_token, expected=(400,))
request("DELETE", f"/api/collections/certificates/records/{certificate_id}", token=super_token, expected=(400,))
request("PATCH", f"/api/collections/certificate_batches/records/{issued['batch']['id']}", {
    "audienceFingerprint": "mutated",
}, super_token, expected=(400,))

all_certificates = request("GET", "/api/collections/certificates/records?perPage=200", token=super_token)
credentials = [row["credentialId"] for row in all_certificates["items"]]
tokens = [row["verificationToken"] for row in all_certificates["items"]]
assert len(credentials) == len(set(credentials))
assert len(tokens) == len(set(tokens))

print(json.dumps({
    "ok": True,
    "checkedInBatch": issued["batch"]["id"],
    "selectedBatch": selected_issued["batch"]["id"],
    "issuedCount": len(credentials),
}))
