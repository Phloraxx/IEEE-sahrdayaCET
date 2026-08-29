#!/usr/bin/env python3
"""Clean-room smoke for certificate revoke and replacement lifecycle."""
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


def request(method, path, body=None, token=None, expected=(200, 201, 202, 204)):
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


def multipart_request(path, files, token, expected=(200,)):
    boundary = "----ieee-cert-lifecycle-" + uuid.uuid4().hex
    chunks = []
    for name, filename, content, content_type in files:
        chunks += [
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'.encode(),
            f"Content-Type: {content_type}\r\n\r\n".encode(), content, b"\r\n",
        ]
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


super_token = request("POST", "/api/collections/_superusers/auth-with-password", {
    "identity": SUPER_EMAIL, "password": SUPER_PASS,
})["token"]
suffix = str(int(time.time() * 1000))
password = "FixturePass-2026!"


def create_user(label, role="user"):
    return request("POST", "/api/collections/users/records", {
        "email": f"cert-lifecycle-{label}-{suffix}@example.test",
        "verified": True,
        "name": label.replace("-", " ").title(),
        "role": role,
        "password": password,
        "passwordConfirm": password,
    }, super_token)


admin = create_user("admin", "admin")
member = create_user("member")
admin_token = impersonate(super_token, admin["id"])
member_token = impersonate(super_token, member["id"])

society = request("POST", "/api/collections/societies/records", {
    "name": "Certificate Lifecycle Society",
    "slug": f"cert-lifecycle-{suffix}",
    "bio": "Synthetic certificate lifecycle smoke",
    "isHidden": False,
}, super_token)
now = dt.datetime.now(dt.timezone.utc)
event = request("POST", "/api/collections/events/records", {
    "title": f"Certificate Lifecycle Smoke {suffix}",
    "description": "Synthetic certificate lifecycle test event",
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
    "name": "Lifecycle Certificate", "certificateType": "completion",
}, admin_token)["template"]
template = multipart_request(
    f"/api/app/certificate-templates/{template['id']}",
    [("renderBase", "render-base.png", make_png(2400, 1350), "image/png")],
    admin_token,
)["template"]
template = request("POST", f"/api/app/certificate-templates/{template['id']}/publish", token=admin_token)["template"]


def create_registration(label, name, email):
    user = create_user("recipient-" + label)
    return request("POST", "/api/collections/registrations/records", {
        "user": user["id"],
        "event": event["id"],
        "userName": name,
        "userEmail": email,
        "registrationStatus": "confirmed",
        "paymentStatus": "not_required",
        "checkedIn": True,
        "checkedInAt": now.isoformat().replace("+00:00", "Z"),
        "ticketId": "TKT-" + uuid.uuid4().hex[:16],
        "paymentTicketId": uuid.uuid4().hex,
        "registrationDate": now.isoformat().replace("+00:00", "Z"),
    }, super_token)


reg_revoke = create_registration("revoke", "Revoke Recipient", "revoke@example.test")
reg_replace = create_registration("replace", "Replace Recipient", "replace@example.test")
config = {"registrationIds": [reg_revoke["id"], reg_replace["id"]]}
preview = request("POST", f"/api/app/events/{event['id']}/certificates/audience/preview", {
    "templateId": template["id"], "audienceType": "selected", "audienceConfig": config,
}, admin_token)
issued = request("POST", f"/api/app/events/{event['id']}/certificates/issue", {
    "templateId": template["id"],
    "audienceType": "selected",
    "audienceConfig": config,
    "audienceFingerprint": preview["audienceFingerprint"],
}, admin_token)
batch_id = issued["batch"]["id"]
by_registration = {row["registrationId"]: row for row in issued["certificates"]}
revoke_summary = by_registration[reg_revoke["id"]]
replace_summary = by_registration[reg_replace["id"]]
revoke_record = request("GET", f"/api/collections/certificates/records/{revoke_summary['id']}", token=super_token)
replace_record = request("GET", f"/api/collections/certificates/records/{replace_summary['id']}", token=super_token)

send_path = f"/api/app/events/{event['id']}/certificate-batches/{batch_id}/send"
queued = request("POST", send_path, token=admin_token)
assert queued["queuedNow"] == 2

revoke_path = f"/api/app/events/{event['id']}/certificates/{revoke_record['id']}/revoke"
supersede_path = f"/api/app/events/{event['id']}/certificates/{replace_record['id']}/supersede"
request("POST", revoke_path, {"reason": "no"}, admin_token, expected=(400,))
request("POST", revoke_path, {"reason": "Issued in error"}, member_token, expected=(403,))
request("POST", supersede_path, {"reason": "Correct recipient spelling"}, member_token, expected=(403,))

revoked = request("POST", revoke_path, {"reason": "Issued in error"}, admin_token)
assert revoked["idempotent"] is False
assert revoked["certificate"]["status"] == "revoked"
assert revoked["certificate"]["revocationReason"] == "Issued in error"
revoked_replay = request("POST", revoke_path, {"reason": "Issued in error"}, admin_token)
assert revoked_replay["idempotent"] is True

public_fields = {"recipientName", "event", "certificateType", "credentialId", "issueDate", "issuer", "status"}
revoked_public = request("GET", f"/api/app/certificates/verify/{revoke_record['verificationToken']}")
assert set(revoked_public.keys()) == public_fields and revoked_public["status"] == "REVOKED"
assert "revocationReason" not in revoked_public

revoked_job_filter = urllib.parse.quote(f'kind = "certificate" && certificate = "{revoke_record["id"]}"')
revoked_jobs = request("GET", f"/api/collections/notification_outbox/records?filter={revoked_job_filter}", token=super_token)
assert revoked_jobs["totalItems"] == 1
assert revoked_jobs["items"][0]["status"] == "failed" and revoked_jobs["items"][0]["attempts"] == 8

replacement_result = request("POST", supersede_path, {
    "reason": "Correct recipient spelling",
    "recipientName": "Replacement Recipient Corrected",
    "recipientEmail": "corrected@example.test",
}, admin_token)
assert replacement_result["idempotent"] is False
old = replacement_result["superseded"]
replacement = replacement_result["replacement"]
assert old["status"] == "superseded" and replacement["status"] == "active"
assert replacement["recipientName"] == "Replacement Recipient Corrected"
assert replacement["recipientEmail"] == "corrected@example.test"
assert replacement["metadataVersion"] == 2
assert replacement["supersedesId"] == replace_record["id"]
assert old["supersededById"] == replacement["certificateId"]
assert replacement_result["replacementBatchId"] and replacement_result["replacementBatchId"] != batch_id

old_public = request("GET", f"/api/app/certificates/verify/{replace_record['verificationToken']}")
assert set(old_public.keys()) == public_fields and old_public["status"] == "SUPERSEDED"
replacement_record = request("GET", f"/api/collections/certificates/records/{replacement['certificateId']}", token=super_token)
replacement_public = request("GET", f"/api/app/certificates/verify/{replacement_record['verificationToken']}")
assert set(replacement_public.keys()) == public_fields
assert replacement_public["status"] == "ACTIVE" and replacement_public["recipientName"] == "Replacement Recipient Corrected"

old_job_filter = urllib.parse.quote(f'kind = "certificate" && certificate = "{replace_record["id"]}"')
old_jobs = request("GET", f"/api/collections/notification_outbox/records?filter={old_job_filter}", token=super_token)
assert old_jobs["totalItems"] == 1
assert old_jobs["items"][0]["status"] == "failed" and old_jobs["items"][0]["attempts"] == 8

replacement_delivery = request("GET", f"/api/app/events/{event['id']}/certificate-batches/{replacement_result['replacementBatchId']}/delivery", token=admin_token)
assert replacement_delivery["batch"]["status"] == "issued" and replacement_delivery["batch"]["queuedCount"] == 0
assert len(replacement_delivery["certificates"]) == 1
assert replacement_delivery["certificates"][0]["deliveryStatus"] == "not_queued"
certificate_jobs_filter = urllib.parse.quote('kind = "certificate"')
all_certificate_jobs = request("GET", f"/api/collections/notification_outbox/records?filter={certificate_jobs_filter}", token=super_token)
assert all_certificate_jobs["totalItems"] == 2

replacement_replay = request("POST", supersede_path, {
    "reason": "Correct recipient spelling",
    "recipientName": "Replacement Recipient Corrected",
    "recipientEmail": "corrected@example.test",
}, admin_token)
assert replacement_replay["idempotent"] is True
assert replacement_replay["replacement"]["certificateId"] == replacement["certificateId"]

request("PATCH", f"/api/collections/certificates/records/{replace_record['id']}", {"status": "active"}, super_token, expected=(400,))
request("PATCH", f"/api/collections/certificates/records/{replacement['certificateId']}", {"recipientNameSnapshot": "Mutated Name"}, super_token, expected=(400,))

print(json.dumps({
    "ok": True,
    "revoked": revoked["certificate"]["credentialId"],
    "superseded": old["credentialId"],
    "replacement": replacement["credentialId"],
    "replacementBatch": replacement_result["replacementBatchId"],
    "publicStatusCoverage": ["REVOKED", "SUPERSEDED", "ACTIVE"],
}))
