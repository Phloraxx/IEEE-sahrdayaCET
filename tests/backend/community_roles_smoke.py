#!/usr/bin/env python3
"""Clean-room authorization matrix for Community Roles V2."""
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("PB_BASE_URL", "http://127.0.0.1:8099").rstrip("/")
SUPER_EMAIL = os.environ.get("PB_SUPERUSER_EMAIL", "ci-super@example.test")
SUPER_PASS = os.environ.get("PB_SUPERUSER_PASSWORD", "CI-PocketBase-Smoke-2026!")
FIXTURE_PASSWORD = "FixturePass-2026!"


def req(method, path, body=None, token=None, expected=(200, 201, 204)):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            status = response.status
            raw = response.read().decode()
    except urllib.error.HTTPError as error:
        status = error.code
        raw = error.read().decode()
    payload = json.loads(raw) if raw else None
    if status not in expected:
        raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {payload}")
    return payload


def create_user(super_token, label, suffix):
    password = FIXTURE_PASSWORD
    return req("POST", "/api/collections/users/records", {
        "email": f"roles-{label}-{suffix}@example.test",
        "verified": True,
        "name": label.replace("-", " ").title(),
        "role": "user",
        "password": password,
        "passwordConfirm": password,
    }, super_token)


def impersonate(super_token, user_id):
    return req("POST", f"/api/collections/users/impersonate/{user_id}", {"duration": 3600}, super_token)["token"]


def assignment(super_token, user_id, role_code, scope_type, society_id="", event_id="", starts_at="", ends_at="", active=True):
    return req("POST", "/api/collections/organization_assignments/records", {
        "user": user_id,
        "roleCode": role_code,
        "title": role_code.replace("_", " ").title(),
        "scopeType": scope_type,
        "society": society_id,
        "event": event_id,
        "startsAt": starts_at,
        "endsAt": ends_at,
        "active": active,
        "source": "manual",
    }, super_token)


def q(value):
    return urllib.parse.quote(value, safe="")


req("GET", "/api/health")
super_auth = req("POST", "/api/collections/_superusers/auth-with-password", {
    "identity": SUPER_EMAIL,
    "password": SUPER_PASS,
})
super_token = super_auth["token"]
suffix = str(int(time.time() * 1000))

users = {name: create_user(super_token, name, suffix) for name in [
    "plain", "branch-secretary", "branch-treasurer", "society-chair", "society-faculty",
    "event-lead", "registration-desk", "checkin-staff", "event-finance", "event-content",
    "expired", "future", "execom-title",
]}
tokens = {name: impersonate(super_token, user["id"]) for name, user in users.items()}

society = req("POST", "/api/collections/societies/records", {
    "name": f"Roles Society {suffix}",
    "slug": f"roles-society-{suffix}",
    "bio": "Authorization matrix",
    "isHidden": False,
}, super_token)
other_society = req("POST", "/api/collections/societies/records", {
    "name": f"Other Roles Society {suffix}",
    "slug": f"other-roles-society-{suffix}",
    "bio": "Out of scope",
    "isHidden": False,
}, super_token)

now = dt.datetime.now(dt.timezone.utc)
start = (now + dt.timedelta(hours=2)).isoformat().replace("+00:00", "Z")
end = (now + dt.timedelta(hours=5)).isoformat().replace("+00:00", "Z")
event = req("POST", "/api/collections/events/records", {
    "title": f"Community Roles Paid Event {suffix}",
    "description": "<p>Role matrix</p>",
    "date": start,
    "endDate": end,
    "venue": "Roles Lab",
    "price": 100,
    "baseFeePaise": 10000,
    "society": society["id"],
    "status": "draft",
    "maxCapacity": 50,
    "registrationMode": "internal",
    "registrationOpen": False,
    "checkInEnabled": True,
    "formTemplate": [],
    "isDeleted": False,
}, super_token)
other_event = req("POST", "/api/collections/events/records", {
    "title": f"Other Scope Event {suffix}",
    "date": start,
    "endDate": end,
    "venue": "Elsewhere",
    "price": 0,
    "society": other_society["id"],
    "status": "draft",
    "registrationMode": "internal",
    "registrationOpen": False,
    "checkInEnabled": True,
    "formTemplate": [],
    "isDeleted": False,
}, super_token)

assignment(super_token, users["branch-secretary"]["id"], "branch_secretary", "branch")
assignment(super_token, users["branch-treasurer"]["id"], "branch_treasurer", "branch")
assignment(super_token, users["society-chair"]["id"], "society_chair", "society", society["id"])
assignment(super_token, users["society-faculty"]["id"], "society_faculty", "society", society["id"])
assignment(super_token, users["event-lead"]["id"], "event_lead", "event", "", event["id"])
assignment(super_token, users["registration-desk"]["id"], "event_registration", "event", "", event["id"])
assignment(super_token, users["checkin-staff"]["id"], "event_checkin", "event", "", event["id"])
assignment(super_token, users["event-finance"]["id"], "event_finance", "event", "", event["id"])
assignment(super_token, users["event-content"]["id"], "event_content", "event", "", event["id"])

# Plain account has no workspace; each assignment exposes only its role capabilities.
plain_me = req("GET", "/api/workspace/me", token=tokens["plain"])
assert plain_me["hasWorkspace"] is False and plain_me["capabilities"] == []
checkin_me = req("GET", "/api/workspace/me", token=tokens["checkin-staff"])
assert "checkin.manage" in checkin_me["capabilities"]
assert "registrations.view" not in checkin_me["capabilities"]
assert "finance.view" not in checkin_me["capabilities"]

# Event-scoped staff can see their event but not an unrelated draft event.
req("GET", f"/api/collections/events/records/{event['id']}", token=tokens["checkin-staff"])
req("GET", f"/api/collections/events/records/{other_event['id']}", token=tokens["checkin-staff"], expected=(403, 404))

# Assignment validity windows are enforced server-side, not only hidden in the UI.
past_start = (now - dt.timedelta(days=10)).isoformat().replace("+00:00", "Z")
past_end = (now - dt.timedelta(days=1)).isoformat().replace("+00:00", "Z")
future_start = (now + dt.timedelta(days=1)).isoformat().replace("+00:00", "Z")
future_end = (now + dt.timedelta(days=10)).isoformat().replace("+00:00", "Z")
assignment(super_token, users["expired"]["id"], "event_checkin", "event", "", event["id"], past_start, past_end)
assignment(super_token, users["future"]["id"], "event_checkin", "event", "", event["id"], future_start, future_end)
assert req("GET", "/api/workspace/me", token=tokens["expired"])["capabilities"] == []
assert req("GET", "/api/workspace/me", token=tokens["future"])["capabilities"] == []

# An Execom title is directory metadata only. Explicit normalized roleCode linkage is required.
execom_title = req("POST", "/api/collections/execom/records", {
    "name": "Title Only Chair", "position": "Chair", "order": 999,
    "section": "Role Matrix", "sectionId": f"roles-{suffix}",
    "email": users["execom-title"]["email"], "user": users["execom-title"]["id"],
    "society": society["id"],
}, super_token)
assert req("GET", "/api/workspace/me", token=tokens["execom-title"])["capabilities"] == []
execom_linked = req("PATCH", f"/api/collections/execom/records/{execom_title['id']}", {
    "roleCode": "society_secretary", "term": "CI term"
}, super_token)
assert execom_linked.get("assignment")
linked_me = req("GET", "/api/workspace/me", token=tokens["execom-title"])
assert "events.edit" in linked_me["capabilities"] and "finance.approve" not in linked_me["capabilities"]
req("PATCH", f"/api/collections/execom/records/{execom_title['id']}", {"roleCode": ""}, super_token)
assert req("GET", "/api/workspace/me", token=tokens["execom-title"])["capabilities"] == []

# Society chair can maintain content but cannot rewrite society identity or another society.
updated_society = req("PATCH", f"/api/collections/societies/records/{society['id']}", {"bio": "Updated by scoped chair"}, tokens["society-chair"])
assert updated_society["bio"] == "Updated by scoped chair"
req("PATCH", f"/api/collections/societies/records/{society['id']}", {"name": "Escalated Name"}, tokens["society-chair"], expected=(400, 403))
req("PATCH", f"/api/collections/societies/records/{other_society['id']}", {"bio": "Nope"}, tokens["society-chair"], expected=(403, 404))

# Grant hierarchy: event lead can build working staff, but cannot mint finance or leadership.
new_checkin = create_user(super_token, "delegated-checkin", suffix)
new_finance = create_user(super_token, "delegated-finance", suffix)
created = req("POST", "/api/workspace/assignments", {
    "userId": new_checkin["id"], "roleCode": "event_checkin", "scopeType": "event", "eventId": event["id"]
}, tokens["event-lead"])
assert created["assignment"]["roleCode"] == "event_checkin"
req("POST", "/api/workspace/assignments", {
    "userId": new_finance["id"], "roleCode": "event_finance", "scopeType": "event", "eventId": event["id"]
}, tokens["event-lead"], expected=(403,))
req("POST", "/api/workspace/assignments", {
    "userId": users["plain"]["id"], "roleCode": "branch_chair", "scopeType": "branch"
}, tokens["branch-secretary"], expected=(403,))

# A higher-scope society manager can appoint Event Lead / Event Finance.
new_lead = create_user(super_token, "delegated-lead", suffix)
req("POST", "/api/workspace/assignments", {
    "userId": new_lead["id"], "roleCode": "event_lead", "scopeType": "event", "eventId": event["id"]
}, tokens["society-chair"])

# Event lifecycle: operational author submits, faculty approves, finance approves, branch publishes.
submitted = req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "submit", "note": "Ready"}, tokens["event-lead"])["event"]
assert submitted["approvalStatus"] == "submitted"
req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "publish"}, tokens["event-lead"], expected=(403,))
approved = req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "approve", "note": "Society review complete"}, tokens["society-faculty"])["event"]
assert approved["approvalStatus"] == "approved"
req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "publish"}, tokens["branch-secretary"], expected=(409,))
finance = req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "finance_approve", "note": "Fee verified"}, tokens["event-finance"])["event"]
assert finance["financeApprovalStatus"] == "approved"
published = req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "publish"}, tokens["branch-secretary"])["event"]
assert published["status"] == "published"

# Sensitive edits cannot silently mutate a published approved event.
req("PATCH", f"/api/collections/events/records/{event['id']}", {"venue": "Changed Hall"}, tokens["event-lead"], expected=(400, 403))
req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "unpublish"}, tokens["branch-secretary"], expected=(400,))
returned = req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "unpublish", "note": "Venue needs review"}, tokens["branch-secretary"])["event"]
assert returned["status"] == "draft" and returned["registrationOpen"] is False
changed = req("PATCH", f"/api/collections/events/records/{event['id']}", {"venue": "Changed Hall"}, tokens["event-lead"])
assert changed["approvalStatus"] == "draft"
assert changed["financeApprovalStatus"] == "pending"

# Return event through review so check-in fixture lives under a published event again.
req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "submit"}, tokens["event-lead"])
req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "approve"}, tokens["society-faculty"])
req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "finance_approve"}, tokens["event-finance"])
req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "publish"}, tokens["branch-secretary"])

registration = req("POST", "/api/collections/registrations/records", {
    "user": users["plain"]["id"],
    "event": event["id"],
    "userName": "Checkin Attendee",
    "userEmail": users["plain"]["email"],
    "registrationStatus": "confirmed",
    "paymentStatus": "not_required",
    "checkedIn": False,
    "ticketId": f"TKT-ROLE-{suffix[-8:]}",
    "amount": 0,
    "registrationDate": now.isoformat().replace("+00:00", "Z"),
    "formResponses": {},
}, super_token)

# Scanner staff cannot browse the attendee register but can perform the minimal check-in command.
req("GET", f"/api/collections/registrations/records/{registration['id']}", token=tokens["checkin-staff"], expected=(403, 404))
checked = req("POST", "/api/workspace/check-in", {"ticketId": registration["ticketId"]}, tokens["checkin-staff"])
assert checked["success"] is True and checked["registration"]["checkedIn"] is True
assert set(checked["registration"].keys()) <= {"id", "userName", "userEmail", "eventTitle", "ticketId", "checkedIn", "checkedInAt"}

# Registration desk can browse/cancel, but not perform finance actions.
reg_list = req("GET", f"/api/collections/registrations/records?filter={q('event = '+repr(event['id']))}", token=tokens["registration-desk"])
assert reg_list["totalItems"] >= 1
req("POST", f"/api/admin/registrations/{registration['id']}/command", {"action": "confirm-payment"}, tokens["registration-desk"], expected=(403,))

# Event finance has event-scoped finance but cannot open branch-wide Payment Desk.
req("GET", "/api/admin/payments/summary", token=tokens["event-finance"], expected=(403,))
branch_finance = req("GET", "/api/admin/payments/summary", token=tokens["branch-treasurer"])
assert "summary" in branch_finance

# Scoped content: event content can create for its event, not another event.
blog = req("POST", "/api/collections/blogs/records", {
    "title": f"Scoped event story {suffix}", "slug": f"scoped-event-story-{suffix}",
    "content": "<p>Scoped</p>", "published": False, "relation": users["event-content"]["id"],
    "event": event["id"], "society": society["id"],
}, tokens["event-content"])
assert blog["event"] == event["id"]
req("POST", "/api/collections/blogs/records", {
    "title": f"Wrong scope story {suffix}", "slug": f"wrong-scope-story-{suffix}",
    "content": "<p>No</p>", "published": False, "relation": users["event-content"]["id"],
    "event": other_event["id"], "society": other_society["id"],
}, tokens["event-content"], expected=(400, 403))

# Community profile is self-editable, but verification fields are ignored/protected.
profile = req("POST", "/api/workspace/profile", {
    "accountType": "student", "srNumber": "223929", "department": "CSE", "semester": "S7",
    "graduationYear": "2027", "ieeeMember": True, "ieeeMemberId": "12345678",
    "institutionalVerified": True, "verifiedBy": users["plain"]["id"],
}, tokens["plain"])
assert profile["success"] is True
profile_read = req("GET", "/api/workspace/profile", token=tokens["plain"])["profile"]
assert profile_read["srNumber"] == "223929" and profile_read["institutionalVerified"] is False

fixture_file = os.environ.get("E2E_WORKSPACE_FIXTURE", "").strip()
if fixture_file:
    fixture_payload = {
        "PERSONAS": {
            "branch": {"token": tokens["branch-secretary"], "record": users["branch-secretary"]},
            "checkin": {"token": tokens["checkin-staff"], "record": users["checkin-staff"]},
            "chair": {"token": tokens["society-chair"], "record": users["society-chair"]},
            "finance": {"token": tokens["event-finance"], "record": users["event-finance"]},
            "content": {"token": tokens["event-content"], "record": users["event-content"]},
        },
        "EVENT_ID": event["id"],
        "SOCIETY_ID": society["id"],
    }
    with open(fixture_file, "w", encoding="utf-8") as handle:
        json.dump(fixture_payload, handle)

print("community roles v2 smoke: OK")
