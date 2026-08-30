#!/usr/bin/env python3
"""Clean-room smoke for explicit certificate Send and delivery tracking."""
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
MAIL_WEBHOOK_KEY = os.environ.get("CERTIFICATE_MAIL_WEBHOOK_CAPABILITY_KEY", "")


def request(method, path, body=None, token=None, expected=(200, 201, 202, 204), extra_headers=None):
    headers = {"Content-Type": "application/json"}
    headers.update(extra_headers or {})
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
    boundary = "----ieee-cert-delivery-" + uuid.uuid4().hex
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


super_auth = request("POST", "/api/collections/_superusers/auth-with-password", {"identity": SUPER_EMAIL, "password": SUPER_PASS})
super_token = super_auth["token"]
suffix = str(int(time.time() * 1000))
password = "FixturePass-2026!"


def create_user(label, role="user"):
    return request("POST", "/api/collections/users/records", {
        "email": f"cert-delivery-{label}-{suffix}@example.test",
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
    "name": "Certificate Delivery Society",
    "slug": f"cert-delivery-{suffix}",
    "bio": "Synthetic certificate delivery smoke",
    "isHidden": False,
}, super_token)
now = dt.datetime.now(dt.timezone.utc)
start = (now + dt.timedelta(days=1)).isoformat().replace("+00:00", "Z")
event = request("POST", "/api/collections/events/records", {
    "title": f"Certificate Delivery Smoke {suffix}",
    "description": "Synthetic certificate delivery test event",
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
    "name": "Delivery Certificate",
    "certificateType": "completion",
}, admin_token)["template"]
template = multipart_request(
    f"/api/app/certificate-templates/{template['id']}",
    [("renderBase", "render-base.png", make_png(2400, 1350), "image/png")],
    admin_token,
)["template"]
template = request("POST", f"/api/app/certificate-templates/{template['id']}/publish", token=admin_token)["template"]
assert template["status"] == "published"


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


reg_email = create_registration("email", "Delivery Recipient", "delivery@example.test")
create_registration("missing", "Missing Email Recipient", "")
preview = request("POST", f"/api/app/events/{event['id']}/certificates/audience/preview", {
    "templateId": template["id"], "audienceType": "confirmed", "audienceConfig": {},
}, admin_token)
assert preview["recipientCount"] == 2 and preview["emailEligibleCount"] == 1 and preview["missingEmailCount"] == 1
issued = request("POST", f"/api/app/events/{event['id']}/certificates/issue", {
    "templateId": template["id"],
    "audienceType": "confirmed",
    "audienceConfig": {},
    "audienceFingerprint": preview["audienceFingerprint"],
}, admin_token)
batch_id = issued["batch"]["id"]
assert issued["batch"]["status"] == "issued"

certificate_outbox_filter = urllib.parse.quote('kind = "certificate"')
assert request("GET", f"/api/collections/notification_outbox/records?filter={certificate_outbox_filter}", token=super_token)["totalItems"] == 0

readiness_path = f"/api/app/events/{event['id']}/certificate-mail/readiness"
batches_path = f"/api/app/events/{event['id']}/certificate-batches"
delivery_path = f"/api/app/events/{event['id']}/certificate-batches/{batch_id}/delivery"
send_path = f"/api/app/events/{event['id']}/certificate-batches/{batch_id}/send"
retry_path = f"/api/app/events/{event['id']}/certificate-batches/{batch_id}/retry-failed"
request("GET", readiness_path, token=member_token, expected=(403,))
request("GET", batches_path, token=member_token, expected=(403,))
request("GET", delivery_path, token=member_token, expected=(403,))
request("POST", send_path, token=member_token, expected=(403,))

readiness = request("GET", readiness_path, token=admin_token)
assert readiness["provider"] == "resend" and readiness["deliveryMode"] == "redirect"
assert readiness["safetyReady"] is True and readiness["transportReady"] is True and readiness["readyToQueue"] is True
assert readiness["trackingReady"] is True and readiness["trackingMode"] == "delivery_tracked"
batches = request("GET", batches_path, token=admin_token)["batches"]
assert any(row["id"] == batch_id and row["status"] == "issued" for row in batches)
initial_delivery = request("GET", delivery_path, token=admin_token)
assert initial_delivery["batch"]["queuedCount"] == 0
assert {row["deliveryStatus"] for row in initial_delivery["certificates"]} == {"not_queued", "missing_email"}

queued = request("POST", send_path, token=admin_token)
assert queued["idempotent"] is False and queued["queuedNow"] == 1
assert queued["delivery"]["batch"]["queuedCount"] == 1
replayed = request("POST", send_path, token=admin_token)
assert replayed["idempotent"] is True and replayed["queuedNow"] == 0
send_audit_filter = urllib.parse.quote(f'action = "certificate.batch-send" && entityId = "{batch_id}"')
send_audit = request("GET", f"/api/collections/admin_audit_log/records?filter={send_audit_filter}&perPage=10", token=super_token)
assert send_audit["totalItems"] == 2
assert all(row["actor"] == admin["id"] and row["event"] == event["id"] for row in send_audit["items"])

outbox = request("GET", f"/api/collections/notification_outbox/records?filter={certificate_outbox_filter}", token=super_token)
assert outbox["totalItems"] == 1
job = outbox["items"][0]
assert job["dedupeKey"].startswith("certificate:")
assert job["certificate"] and job["registration"] == reg_email["id"]
certificate = request("GET", f"/api/collections/certificates/records/{job['certificate']}", token=super_token)
assert certificate["recipientEmailSnapshot"] == "delivery@example.test"

sent_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
request("PATCH", f"/api/collections/notification_outbox/records/{job['id']}", {
    "status": "sent", "attempts": 1, "sentAt": sent_at, "nextAttemptAt": "", "lastError": "",
}, super_token)
sent = request("GET", delivery_path, token=admin_token)
assert sent["batch"]["status"] == "sent"
assert sent["batch"]["sentCount"] == 1 and sent["batch"]["failedCount"] == 0
assert next(row for row in sent["certificates"] if row["certificateId"] == certificate["id"])["deliveryStatus"] == "sent"

# Provider observability: acceptance is not delivery. Simulate verified Resend
# webhook events through the capability-gated internal route.
assert len(MAIL_WEBHOOK_KEY) >= 32
provider_id = "resend-ci-" + suffix
accepted_at = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=10)).isoformat().replace("+00:00", "Z")
request("PATCH", f"/api/collections/notification_outbox/records/{job['id']}", {
    "deliveryProvider": "resend", "providerMessageId": provider_id, "providerStatus": "accepted",
    "providerUpdatedAt": accepted_at, "providerSendSequence": 0,
}, super_token)
provider_headers = {"X-Certificate-Mail-Webhook-Capability": MAIL_WEBHOOK_KEY}
delivered_at = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
delivered_event = {
    "providerEventId": "evt-delivered-" + suffix, "providerMessageId": provider_id,
    "eventType": "email.delivered", "eventCreatedAt": delivered_at,
    "messageId": f"<ci-{suffix}@example.test>", "error": "",
}
provider_result = request("POST", "/api/internal/certificate-mail/provider-event", delivered_event, extra_headers=provider_headers)
assert provider_result["matched"] is True and provider_result["updated"] is True and provider_result["providerStatus"] == "delivered"
provider_duplicate = request("POST", "/api/internal/certificate-mail/provider-event", delivered_event, extra_headers=provider_headers)
assert provider_duplicate["duplicate"] is True
provider_delivery = request("GET", delivery_path, token=admin_token)
provider_row = next(row for row in provider_delivery["certificates"] if row["certificateId"] == certificate["id"])
assert provider_delivery["batch"]["deliveredCount"] == 1
assert provider_row["providerStatus"] == "delivered" and provider_row["deliveredAt"]

# Older events are recorded for audit but may not downgrade the current state.
older = (dt.datetime.fromisoformat(delivered_at.replace("Z", "+00:00")) - dt.timedelta(seconds=30)).isoformat().replace("+00:00", "Z")
out_of_order = request("POST", "/api/internal/certificate-mail/provider-event", {
    "providerEventId": "evt-old-bounce-" + suffix, "providerMessageId": provider_id,
    "eventType": "email.bounced", "eventCreatedAt": older, "error": "Synthetic old bounce",
}, extra_headers=provider_headers)
assert out_of_order.get("outOfOrder") is True
still_delivered = request("GET", f"/api/collections/notification_outbox/records/{job['id']}", token=super_token)
assert still_delivered["providerStatus"] == "delivered"

# A newer bounce is a real delivery issue and becomes manually retryable.
bounced_at = (dt.datetime.fromisoformat(delivered_at.replace("Z", "+00:00")) + dt.timedelta(seconds=30)).isoformat().replace("+00:00", "Z")
request("POST", "/api/internal/certificate-mail/provider-event", {
    "providerEventId": "evt-bounce-" + suffix, "providerMessageId": provider_id,
    "eventType": "email.bounced", "eventCreatedAt": bounced_at, "error": "Synthetic mailbox rejection",
}, extra_headers=provider_headers)
bounced_delivery = request("GET", delivery_path, token=admin_token)
bounced_row = next(row for row in bounced_delivery["certificates"] if row["certificateId"] == certificate["id"])
assert bounced_delivery["batch"]["status"] == "partial_failure"
assert bounced_delivery["batch"]["deliveryIssueCount"] == 1 and bounced_row["providerStatus"] == "bounced"
provider_retry = request("POST", retry_path, token=admin_token)
assert provider_retry["retried"] == 1
provider_job_retry = request("GET", f"/api/collections/notification_outbox/records/{job['id']}", token=super_token)
assert provider_job_retry["status"] == "pending" and provider_job_retry["providerSendSequence"] == 1
assert not provider_job_retry["providerStatus"] and not provider_job_retry["providerMessageId"]

request("PATCH", f"/api/collections/notification_outbox/records/{job['id']}", {
    "status": "failed", "attempts": 8, "sentAt": "", "nextAttemptAt": sent_at, "lastError": "Synthetic terminal delivery failure",
}, super_token)
failed = request("GET", delivery_path, token=admin_token)
assert failed["batch"]["status"] == "partial_failure"
assert failed["batch"]["failedCount"] == 1
retried = request("POST", retry_path, token=admin_token)
assert retried["retried"] == 1 and retried["delivery"]["batch"]["status"] == "sending"
job_after_retry = request("GET", f"/api/collections/notification_outbox/records/{job['id']}", token=super_token)
assert job_after_retry["status"] == "pending" and job_after_retry["attempts"] == 0

revoked = request(
    "POST",
    f"/api/app/events/{event['id']}/certificates/{certificate['id']}/revoke",
    {"reason": "Synthetic delivery retry revocation"},
    admin_token,
)
assert revoked["certificate"]["status"] == "revoked"
job_after_revoke = request("GET", f"/api/collections/notification_outbox/records/{job['id']}", token=super_token)
assert job_after_revoke["status"] == "failed" and job_after_revoke["attempts"] == 8
no_retry = request("POST", retry_path, token=admin_token, expected=(409,))
assert no_retry["code"] == "NO_FAILED_DELIVERIES"
revoked_delivery = request("GET", delivery_path, token=admin_token)
revoked_row = next(row for row in revoked_delivery["certificates"] if row["certificateId"] == certificate["id"])
assert revoked_row["certificateStatus"] == "revoked" and revoked_row["deliveryStatus"] == "failed"

print(json.dumps({
    "ok": True,
    "batchId": batch_id,
    "queued": queued["queuedNow"],
    "missingEmail": issued["batch"]["missingEmailCount"],
    "dedupeKey": job["dedupeKey"],
}))
