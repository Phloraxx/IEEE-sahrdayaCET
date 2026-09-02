#!/usr/bin/env python3
"""Clean-room smoke for public certificate verification and protected render inputs."""
import datetime as dt
import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("PB_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
SUPER_EMAIL = os.environ.get("PB_SUPERUSER_EMAIL", "ci-super@example.test")
SUPER_PASS = os.environ.get("PB_SUPERUSER_PASSWORD", "CI-PocketBase-Smoke-2026!")
RENDER_KEY = os.environ.get("CERTIFICATE_RENDER_CAPABILITY_KEY", "")
RENDER_HEADER = "X-Certificate-Render-Capability"
PUBLIC_FIELDS = {"recipientName", "event", "certificateType", "credentialId", "issueDate", "issuer", "status"}


def _headers(response):
    return {str(key).lower(): str(value) for key, value in response.headers.items()}


def json_request(method, path, body=None, token=None, expected=(200, 201, 204), extra_headers=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    headers.update(extra_headers or {})
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status, raw, response_headers = response.status, response.read(), _headers(response)
    except urllib.error.HTTPError as error:
        status, raw, response_headers = error.code, error.read(), _headers(error)
    payload = json.loads(raw.decode()) if raw else None
    if status not in expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {payload}")
    return payload, response_headers


def impersonate(super_token, user_id):
    payload, _ = json_request("POST", f"/api/collections/users/impersonate/{user_id}", {"duration": 3600}, token=super_token)
    return payload["token"]


def raw_request(path, extra_headers=None, expected=(200,)):
    req = urllib.request.Request(BASE + path, headers=extra_headers or {}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status, raw, response_headers = response.status, response.read(), _headers(response)
    except urllib.error.HTTPError as error:
        status, raw, response_headers = error.code, error.read(), _headers(error)
    if status not in expected:
        raise AssertionError(f"GET {path}: expected {expected}, got {status}: {raw[:500]!r}")
    return raw, response_headers


assert len(RENDER_KEY) >= 32, "CI render capability key must be configured"
super_auth, _ = json_request("POST", "/api/collections/_superusers/auth-with-password", {
    "identity": SUPER_EMAIL,
    "password": SUPER_PASS,
})
super_token = super_auth["token"]

records, _ = json_request("GET", "/api/collections/certificates/records?perPage=200&sort=created", token=super_token)
active = [row for row in records["items"] if row.get("status") == "active"]
assert len(active) >= 3, "certificate issuance smoke must create at least three active credentials"

primary, revoked_fixture, superseded_fixture = active[0], active[1], active[2]


def verify(record, expected_status):
    payload, headers = json_request("GET", f"/api/app/certificates/verify/{record['verificationToken']}")
    assert set(payload) == PUBLIC_FIELDS, payload
    assert payload == {
        "recipientName": record["recipientNameSnapshot"],
        "event": record["eventTitleSnapshot"],
        "certificateType": record["certificateType"],
        "credentialId": record["credentialId"],
        "issueDate": record["issuedAt"],
        "issuer": record["issuerNameSnapshot"] or "IEEE Sahrdaya Student Branch",
        "status": expected_status,
    }
    assert headers.get("cache-control") == "no-store"
    assert headers.get("x-content-type-options") == "nosniff"
    by_id, by_id_headers = json_request("GET", f"/api/app/certificates/verify-id/{record['credentialId']}")
    assert by_id == payload
    assert set(by_id) == PUBLIC_FIELDS
    assert by_id_headers.get("cache-control") == "no-store"


verify(primary, "ACTIVE")

# Browser My Events must use a credential that this smoke deliberately keeps
# active. Earlier issuance order is not a stable contract because the public
# verification smoke revokes/supersedes two other active fixtures below.
primary_registration, _ = json_request(
    "GET", f"/api/collections/registrations/records/{primary['registration']}", token=super_token
)
primary_user_token = impersonate(super_token, primary_registration["user"])
primary_event, _ = json_request(
    "GET", f"/api/collections/events/records/{primary['event']}", token=super_token
)
primary_my_events, _ = json_request("GET", "/api/app/my-events", token=primary_user_token)
primary_item = next(row for row in primary_my_events["items"] if row["event"]["id"] == primary["event"])
assert any(row["verificationToken"] == primary["verificationToken"] for row in primary_item["certificates"])
if github_env := os.environ.get("GITHUB_ENV"):
    with open(github_env, "a", encoding="utf-8") as env_file:
        env_file.write(f"E2E_MY_EVENTS_CERT_TOKEN={primary_user_token}\n")
        env_file.write(f"E2E_MY_EVENTS_CERT_EVENT_TITLE={primary_event['title']}\n")
        env_file.write(f"E2E_MY_EVENTS_CERT_TOKEN_ID={primary['verificationToken']}\n")

invalid, invalid_headers = json_request("GET", "/api/app/certificates/verify/000000000000000000000000000000000000000000000000", expected=(404,))
assert invalid == {"status": "INVALID"}
assert invalid_headers.get("cache-control") == "no-store"
malformed, _ = json_request("GET", "/api/app/certificates/verify/short", expected=(404,))
assert malformed == {"status": "INVALID"}
invalid_id, _ = json_request("GET", "/api/app/certificates/verify-id/IEEESB-2026-COMP-0000000000", expected=(404,))
assert invalid_id == {"status": "INVALID"}
malformed_id, _ = json_request("GET", "/api/app/certificates/verify-id/not-a-credential", expected=(404,))
assert malformed_id == {"status": "INVALID"}

manifest_path = f"/api/app/certificates/render/{primary['verificationToken']}/manifest"
missing_capability, _ = json_request("GET", manifest_path, expected=(403,))
assert missing_capability["code"] == "RENDER_CAPABILITY_REQUIRED"
wrong_capability, _ = json_request("GET", manifest_path, expected=(403,), extra_headers={RENDER_HEADER: "wrong-capability-value-that-is-long-enough"})
assert wrong_capability["code"] == "RENDER_CAPABILITY_REQUIRED"
manifest, manifest_headers = json_request("GET", manifest_path, extra_headers={RENDER_HEADER: RENDER_KEY})
assert set(manifest) == {"recipientName", "credentialId", "canvasWidth", "canvasHeight", "layout", "templateContentHash"}
assert manifest["recipientName"] == primary["recipientNameSnapshot"]
assert manifest["credentialId"] == primary["credentialId"]
assert manifest["canvasWidth"] == 2400 and manifest["canvasHeight"] == 1350
assert isinstance(manifest["layout"], dict) and set(manifest["layout"]) == {"name", "credentialId", "qr"}
assert len(manifest["templateContentHash"]) == 64
assert manifest_headers.get("cache-control") == "no-store"

render_base, render_headers = raw_request(
    f"/api/app/certificates/render/{primary['verificationToken']}/render-base",
    extra_headers={RENDER_HEADER: RENDER_KEY},
)
assert render_base.startswith(b"\x89PNG\r\n\x1a\n")
assert render_headers.get("content-type", "").startswith("image/png")
assert render_headers.get("cache-control") == "no-store"
assert render_headers.get("x-content-type-options") == "nosniff"

batch, _ = json_request("GET", f"/api/collections/certificate_batches/records/{revoked_fixture['batch']}", token=super_token)
admin_token = impersonate(super_token, batch["issuedBy"])
json_request(
    "POST",
    f"/api/app/events/{revoked_fixture['event']}/certificates/{revoked_fixture['id']}/revoke",
    {"reason": "Synthetic public verification revocation"},
    token=admin_token,
)
revoked_fixture["status"] = "revoked"
verify(revoked_fixture, "REVOKED")

json_request(
    "POST",
    f"/api/app/events/{superseded_fixture['event']}/certificates/{superseded_fixture['id']}/supersede",
    {"reason": "Synthetic public verification replacement"},
    token=admin_token,
)
superseded_fixture["status"] = "superseded"
verify(superseded_fixture, "SUPERSEDED")

# Revoked/superseded credentials remain renderable resources; their QR continues
# to resolve to the authoritative public status rather than becoming a 404.
for record in (revoked_fixture, superseded_fixture):
    payload, _ = json_request(
        "GET",
        f"/api/app/certificates/render/{record['verificationToken']}/manifest",
        extra_headers={RENDER_HEADER: RENDER_KEY},
    )
    assert payload["credentialId"] == record["credentialId"]

print(json.dumps({"ok": True, "publicProjectionFields": sorted(PUBLIC_FIELDS), "statusCoverage": ["ACTIVE", "REVOKED", "SUPERSEDED", "INVALID"]}))
