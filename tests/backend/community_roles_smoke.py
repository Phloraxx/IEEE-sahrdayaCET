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
branch_finance_me = req("GET", "/api/workspace/me", token=tokens["branch-treasurer"])
assert "finance.view" in branch_finance_me["capabilities"]
assert "registrations.view" not in branch_finance_me["capabilities"]
event_finance_me = req("GET", "/api/workspace/me", token=tokens["event-finance"])
assert "finance.view" in event_finance_me["capabilities"]
assert "registrations.view" not in event_finance_me["capabilities"]

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
req("PATCH", f"/api/collections/execom/records/{execom_title['id']}", {
    "roleCode": "society_secretary", "term": "CI term"
}, super_token)
# The backlink is written by the transactional after-update synchronizer, so
# validate the durable record rather than the pre-hook PATCH response payload.
time.sleep(0.1)
execom_linked = req("GET", f"/api/collections/execom/records/{execom_title['id']}", token=super_token)
assert execom_linked.get("assignment")
linked_assignment = req("GET", f"/api/collections/organization_assignments/records/{execom_linked['assignment']}", token=super_token)
assert linked_assignment["source"] == "execom" and linked_assignment["sourceExecom"] == execom_title["id"]
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
    "userId": new_checkin["id"], "roleCode": "checkin_staff", "scopeType": "event", "eventId": event["id"]
}, tokens["event-lead"])
assert created["assignment"]["roleCode"] == "event_checkin"
assert created["assignment"]["accessRole"] == "checkin_staff"
req("POST", "/api/workspace/assignments", {
    "userId": new_finance["id"], "roleCode": "finance", "scopeType": "event", "eventId": event["id"]
}, tokens["event-lead"], expected=(403,))
req("POST", "/api/workspace/assignments", {
    "userId": users["plain"]["id"], "roleCode": "branch_chair", "scopeType": "branch"
}, tokens["branch-secretary"], expected=(403,))

# A higher-scope society manager can appoint Event Lead / Event Finance.
new_lead = create_user(super_token, "delegated-lead", suffix)
req("POST", "/api/workspace/assignments", {
    "userId": new_lead["id"], "roleCode": "event_lead", "scopeType": "event", "eventId": event["id"]
}, tokens["society-chair"])

# Event lifecycle: the event organizer publishes directly; finance has no
# publication approval step. The old columns are not part of the projection.
published = req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "publish"}, tokens["event-lead"])["event"]
assert published["status"] == "published"
assert "approvalStatus" not in published and "financeApprovalStatus" not in published
# Coupon changes remain transactional and do not create a second review state.
coupon_sync = req("PUT", f"/api/app/events/{event['id']}/coupons", {"coupons": [{
    "code": "ROLE10", "discountPercent": 10, "maxUses": 5, "isActive": True
}]}, tokens["event-lead"])
assert coupon_sync["success"] is True and "financeApprovalStatus" not in coupon_sync
post_coupon = req("GET", f"/api/collections/events/records/{event['id']}", token=tokens["event-lead"])
assert post_coupon["status"] == "published"
req("PUT", f"/api/app/events/{event['id']}/coupons", {"coupons": [{
    "code": "ROLE20", "discountPercent": 20, "maxUses": 5, "isActive": True
}]}, tokens["event-lead"])

# Published setup can be corrected by the scoped organizer without a second
# approval workflow. Status transitions themselves remain command-owned.
changed_published = req("PATCH", f"/api/collections/events/records/{event['id']}", {"venue": "Changed Hall"}, tokens["event-lead"])
assert changed_published["status"] == "published" and changed_published["venue"] == "Changed Hall"
req("PATCH", f"/api/collections/events/records/{event['id']}", {"status": "draft"}, tokens["event-lead"], expected=(400, 403))
req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "unpublish"}, tokens["branch-secretary"], expected=(400,))
returned = req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "unpublish", "note": "Venue needs review"}, tokens["branch-secretary"])["event"]
assert returned["status"] == "draft" and returned["registrationOpen"] is False
changed = req("PATCH", f"/api/collections/events/records/{event['id']}", {"venue": "Changed Hall"}, tokens["event-lead"])
assert changed["status"] == "draft"

# Return the event to the published branch directly.
req("POST", f"/api/workspace/events/{event['id']}/workflow", {"action": "publish"}, tokens["event-lead"])

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
    "formResponses": {
        "name": "Checkin Attendee",
        "phone": "+919876543210",
        "college": "Sahrdaya College of Engineering and Technology",
        "branch": "CSE",
        "semester": "S7",
        "isIeeeMember": True,
        "ieeeMembershipId": "12345678",
        "eventOnlyAnswer": "do-not-reuse",
    },
}, super_token)

# Scanner staff cannot browse the attendee register but can perform the minimal check-in command.
req("GET", f"/api/collections/registrations/records/{registration['id']}", token=tokens["checkin-staff"], expected=(403, 404))
checked = req("POST", "/api/workspace/check-in", {"ticketId": registration["ticketId"]}, tokens["checkin-staff"])
assert checked["success"] is True and checked["registration"]["checkedIn"] is True
assert set(checked["registration"].keys()) <= {"id", "eventTitle", "ticketId", "checkedIn", "checkedInAt"}
assert "userName" not in checked["registration"] and "userEmail" not in checked["registration"]
req("GET", f"/api/admin/events/{event['id']}/operations", token=tokens["checkin-staff"], expected=(403,))
req("GET", "/api/collections/payments/records", token=tokens["event-finance"], expected=(403,))
req("GET", "/api/collections/payment_attempts/records", token=tokens["event-finance"], expected=(403,))


# Registration desk can browse/cancel, but not perform finance actions.
registration_ops = req("GET", f"/api/admin/events/{event['id']}/operations", token=tokens["registration-desk"])
assert registration_ops["summary"]["active"] >= 1
assert "recent" in registration_ops and registration_ops["recent"]
registration_row = registration_ops["recent"][0]
assert {"id", "userName", "userEmail", "registrationStatus", "ticketId", "checkedIn"}.issubset(registration_row)
for forbidden_key in (
    "paymentStatus", "amount", "collectedAmount", "refundedAmount", "paymentMethod",
    "couponCode", "discountAmount", "provider", "providerStatus", "manualReview",
    "reviewReason", "manualConfirmation", "internalNotes",
):
    assert forbidden_key not in registration_row, forbidden_key
assert "attention" not in registration_ops
assert "cancellationRequests" not in registration_ops
assert "financeDisclaimer" not in registration_ops
assert "coupons" not in registration_ops
assert "audit" not in registration_ops
for forbidden_event_key in ("formTemplate", "approvalStatus", "financeApprovalStatus", "financeApprovalNote"):
    assert forbidden_event_key not in registration_ops["event"], forbidden_event_key

finance_ops = req("GET", f"/api/admin/events/{event['id']}/operations", token=tokens["event-finance"])
assert finance_ops["summary"]["paidAmount"] == 0
assert "financeDisclaimer" in finance_ops and "attention" in finance_ops and "cancellationRequests" in finance_ops
assert "audit" not in finance_ops
finance_row = finance_ops["recent"][0]
assert {"paymentStatus", "amount", "provider", "manualConfirmation"}.issubset(finance_row)
assert "approvalStatus" not in finance_ops["event"] and "financeApprovalStatus" not in finance_ops["event"] and "paymentProvider" not in finance_ops["event"]

edit_ops = req("GET", f"/api/admin/events/{event['id']}/operations", token=tokens["event-lead"])
assert "coupons" in edit_ops and "formTemplate" in edit_ops["event"]
assert "audit" in edit_ops
assert "financeDisclaimer" not in edit_ops and "attention" not in edit_ops

req(
    "GET",
    f"/api/collections/registrations/records?filter={q('event = '+repr(event['id']))}",
    token=tokens["registration-desk"],
    expected=(403,),
)
req("GET", f"/api/collections/registrations/records/{registration['id']}", token=tokens["registration-desk"], expected=(403, 404))
projected_regs = req("GET", f"/api/admin/registrations?event={event['id']}&page=1&perPage=40", token=tokens["registration-desk"])
assert projected_regs["total"] >= 1 and projected_regs["registrations"]
projected_row = projected_regs["registrations"][0]
for forbidden_key in (
    "paymentStatus", "paymentData", "amount", "collectedAmount", "refundedAmount",
    "paymentMethod", "couponCode", "discountSource", "discountAmount", "provider",
    "providerStatus", "manualReview", "reviewReason", "manualConfirmation",
    "internalNotes", "createdBy", "paymentTicketId",
):
    assert forbidden_key not in projected_row, forbidden_key
req("POST", f"/api/admin/registrations/{registration['id']}/command", {"action": "confirm-payment"}, tokens["registration-desk"], expected=(403,))

# Branch finance can use projected Payment Desk reads and scoped detail, but not the generic attendee register or mail outbox.
branch_payment_rows = req("GET", "/api/admin/payments?page=1&perPage=40", token=tokens["branch-treasurer"])
assert set(branch_payment_rows) == {"payments", "total", "page", "perPage", "hasMore"}
branch_finance_detail = req("GET", f"/api/admin/registrations/{registration['id']}", token=tokens["branch-treasurer"])["registration"]
assert branch_finance_detail["id"] == registration["id"] and "paymentStatus" in branch_finance_detail
req("GET", f"/api/admin/registrations?event={event['id']}&page=1&perPage=40", token=tokens["branch-treasurer"], expected=(403,))
super_outbox = req("GET", "/api/collections/notification_outbox/records", token=super_token)
assert super_outbox["totalItems"] >= 1 and super_outbox["items"]
protected_outbox_id = super_outbox["items"][0]["id"]
branch_finance_outbox = req("GET", "/api/collections/notification_outbox/records", token=tokens["branch-treasurer"])
assert branch_finance_outbox["totalItems"] == 0 and branch_finance_outbox["items"] == []
req("GET", f"/api/collections/notification_outbox/records/{protected_outbox_id}", token=tokens["branch-treasurer"], expected=(403, 404))

event_finance_detail = req("GET", f"/api/admin/registrations/{registration['id']}", token=tokens["event-finance"])["registration"]
assert event_finance_detail["id"] == registration["id"] and "paymentStatus" in event_finance_detail
req("GET", f"/api/admin/registrations?event={event['id']}&page=1&perPage=40", token=tokens["event-finance"], expected=(403,))
event_finance_outbox = req("GET", "/api/collections/notification_outbox/records", token=tokens["event-finance"])
assert event_finance_outbox["totalItems"] == 0 and event_finance_outbox["items"] == []
req("GET", f"/api/collections/notification_outbox/records/{protected_outbox_id}", token=tokens["event-finance"], expected=(403, 404))
req("GET", "/api/admin/payments/summary", token=tokens["event-finance"], expected=(403,))
req("GET", "/api/admin/payments?page=1&perPage=40", token=tokens["event-finance"], expected=(403,))
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

# Registration memory reuses only common attendee details from the latest registration.
registration_memory = req("GET", "/api/app/registration-memory", token=tokens["plain"])
assert registration_memory["found"] is True
assert registration_memory["profile"] == {
    "name": "Checkin Attendee",
    "phone": "+919876543210",
    "college": "Sahrdaya College of Engineering and Technology",
    "branch": "CSE",
    "semester": "S7",
    "isIeeeMember": True,
    "ieeeMembershipId": "12345678",
}

fixture_file = os.environ.get("E2E_WORKSPACE_FIXTURE", "").strip()
if fixture_file:
    fixture_payload = {
        "PERSONAS": {
            "branch": {"token": tokens["branch-secretary"], "record": users["branch-secretary"]},
            "checkin": {"token": tokens["checkin-staff"], "record": users["checkin-staff"]},
            "registration": {"token": tokens["registration-desk"], "record": users["registration-desk"]},
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
