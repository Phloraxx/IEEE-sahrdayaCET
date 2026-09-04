#!/usr/bin/env python3
"""Clean-room integration test for the authoritative PocketBase backend."""
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("PB_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
SUPER_EMAIL = os.environ.get("PB_SUPERUSER_EMAIL", "ci-super@example.test")
SUPER_PASS = os.environ.get("PB_SUPERUSER_PASSWORD", "CI-PocketBase-Smoke-2026!")


def request(method, path, body=None, token=None, expected=(200, 201, 204), extra_headers=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    if extra_headers:
        headers.update(extra_headers)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
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


def impersonate(super_token, user_id):
    return request(
        "POST", f"/api/collections/users/impersonate/{user_id}", {"duration": 3600}, super_token
    )["token"]


health = request("GET", "/api/health")
assert health["code"] == 200
super_auth = request("POST", "/api/collections/_superusers/auth-with-password", {
    "identity": SUPER_EMAIL,
    "password": SUPER_PASS,
})
super_token = super_auth["token"]
crons = request("GET", "/api/crons", token=super_token)
backup_cron = next((cron for cron in crons if cron.get("id") == "__pbAutoBackup__"), None)
assert backup_cron and backup_cron.get("expression") == "30 21 * * *"
assert not any(str(cron.get("id", "")).startswith("fifa") for cron in crons)

# The retired WC Predict feature is removed from the runtime and schema.
for retired_collection in (
    "fifa_matches", "fifa_bet_markets", "fifa_bets",
    "fifa_transactions", "fifa_settings", "fifa_feed_events",
):
    request("GET", f"/api/collections/{retired_collection}", token=super_token, expected=(404,))
users_schema = request("GET", "/api/collections/users", token=super_token)
assert "balance" not in {field.get("name") for field in users_schema.get("fields", [])}
assert "balance" not in str(users_schema.get("updateRule") or "")
for retired_route in ("/api/fifa/leaderboard", "/api/fifa/stats", "/api/fifa/live-scores"):
    request("GET", retired_route, expected=(404,))
settings = request("GET", "/api/settings", token=super_token)
assert settings["backups"]["cron"] == "30 21 * * *"
assert settings["backups"]["cronMaxKeep"] == 14

# Event audience/pricing groundwork is additive. Existing events remain
# unrestricted until later command/UI phases start writing these fields.
event_schema = request("GET", "/api/collections/events", token=super_token)
event_fields = {field["name"]: field for field in event_schema["fields"]}
assert event_fields["eligibleSemesters"]["type"] == "json"
assert event_fields["eligibleProgrammes"]["type"] == "json"
assert event_fields["ieeeMemberDiscountPercent"]["type"] == "number"
assert event_fields["requirements"]["type"] == "json"
assert event_fields["attendeeNote"]["type"] == "text"

registration_schema = request("GET", "/api/collections/registrations", token=super_token)
registration_fields = {field["name"]: field for field in registration_schema["fields"]}
assert registration_fields["programmeCode"]["type"] == "text"
assert set(registration_fields["semester"]["values"]) == {f"S{i}" for i in range(1, 9)}
assert registration_fields["ieeeMember"]["type"] == "bool"
assert registration_fields["ieeeMemberId"]["type"] == "text"
assert set(registration_fields["discountSource"]["values"]) == {"none", "ieee_member", "coupon"}

private_schema = request("GET", "/api/collections/event_private_details", token=super_token)
private_fields = {field["name"]: field for field in private_schema["fields"]}
assert private_fields["whatsappGroupUrl"]["type"] == "text"

waitlist_schema = request("GET", "/api/collections/event_waitlist", token=super_token)
waitlist_fields = {field["name"]: field for field in waitlist_schema["fields"]}
assert waitlist_fields["programmeCode"]["type"] == "text"
assert set(waitlist_fields["semester"]["values"]) == {f"S{i}" for i in range(1, 9)}

# Long-lived production predates the additive baseline migration. Keep the
# query/uniqueness indexes required by current code normalized on both fresh
# and upgraded databases.
required_indexes = {
    "societies": ("idx_societies_slug", "idx_societies_hidden"),
    "blogs": ("idx_blogs_published_at",),
    "execom": ("idx_execom_order", "idx_execom_society", "idx_execom_assignment_unique"),
    "organization_assignments": ("idx_org_assignments_source_execom_unique",),
    "registrations": ("idx_registrations_event_payment", "idx_registrations_event_ticket"),
}
for collection_name, expected_indexes in required_indexes.items():
    schema = request("GET", f"/api/collections/{collection_name}", token=super_token)
    indexes = [str(index) for index in schema.get("indexes", [])]
    for expected_index in expected_indexes:
        assert any(expected_index in index for index in indexes), (collection_name, expected_index, indexes)
suffix = str(int(time.time() * 1000))
fixture_password = "FixturePass-2026!"


def create_user(label, role="user"):
    return request("POST", "/api/collections/users/records", {
        "email": f"{label}-{suffix}@example.test",
        "verified": True,
        "name": label.title(),
        "role": role,
        "password": fixture_password,
        "passwordConfirm": fixture_password,
    }, super_token)


admin = create_user("admin", "admin")
chair = create_user("chair", "chair")
user = create_user("member", "user")
second_user = create_user("member-two", "user")
admin_token = impersonate(super_token, admin["id"])
if github_env := os.environ.get("GITHUB_ENV"):
    with open(github_env, "a", encoding="utf-8") as env_file:
        env_file.write(f"E2E_ADMIN_TOKEN={admin_token}\n")
chair_token = impersonate(super_token, chair["id"])
user_token = impersonate(super_token, user["id"])
second_token = impersonate(super_token, second_user["id"])

# Payment summary remains valid on an empty ledger/refund table.
empty_finance = request("GET", "/api/admin/payments/summary", token=admin_token)["summary"]
assert all(value == 0 for value in empty_finance.values()), empty_finance

# Attendee history is private and requires an authenticated user.
request("GET", "/api/app/my-events", expected=(401,))

# Certificate core collections are authoritative server-only state. Direct
# browser CRUD stays closed even for legacy application admins; future
# certificate operations must use explicitly authorized command routes.
for collection_name in ("certificate_templates", "certificate_batches", "certificates"):
    schema = request("GET", f"/api/collections/{collection_name}", token=super_token)
    for rule_name in ("listRule", "viewRule", "createRule", "updateRule", "deleteRule"):
        assert schema.get(rule_name) is None, (collection_name, rule_name, schema.get(rule_name))
    request("GET", f"/api/collections/{collection_name}/records", token=user_token, expected=(403,))
    request("GET", f"/api/collections/{collection_name}/records", token=admin_token, expected=(403,))
    request("POST", f"/api/collections/{collection_name}/records", {}, token=admin_token, expected=(403,))

# Attendance V2 is also command-owned server state. Session definitions and
# attendance history are not directly browsable or writable by application users.
for collection_name in ("event_sessions", "attendance_records"):
    schema = request("GET", f"/api/collections/{collection_name}", token=super_token)
    for rule_name in ("listRule", "viewRule", "createRule", "updateRule", "deleteRule"):
        assert schema.get(rule_name) is None, (collection_name, rule_name, schema.get(rule_name))
    request("GET", f"/api/collections/{collection_name}/records", token=user_token, expected=(403,))
    request("GET", f"/api/collections/{collection_name}/records", token=admin_token, expected=(403,))
    request("POST", f"/api/collections/{collection_name}/records", {}, token=admin_token, expected=(403,))

# Attendee cancellation requests and waitlist identities are command-owned.
for collection_name in ("registration_cancellation_requests", "event_waitlist"):
    schema = request("GET", f"/api/collections/{collection_name}", token=super_token)
    for rule_name in ("listRule", "viewRule", "createRule", "updateRule", "deleteRule"):
        assert schema.get(rule_name) is None, (collection_name, rule_name, schema.get(rule_name))
    request("GET", f"/api/collections/{collection_name}/records", token=user_token, expected=(403,))
    request("GET", f"/api/collections/{collection_name}/records", token=admin_token, expected=(403,))
    request("POST", f"/api/collections/{collection_name}/records", {}, token=admin_token, expected=(403,))

template_schema = request("GET", "/api/collections/certificate_templates", token=super_token)
template_fields = {field["name"]: field for field in template_schema["fields"]}
for protected_name in ("sourceBackground", "sourceSignatures", "renderBase"):
    assert template_fields[protected_name].get("protected") is True

outbox_schema = request("GET", "/api/collections/notification_outbox", token=super_token)
outbox_fields = {field["name"]: field for field in outbox_schema["fields"]}
assert set(outbox_fields["kind"]["values"]) == {"ticket", "receipt", "certificate"}
assert outbox_fields["certificate"]["type"] == "relation"

# Blog admin listing relies on explicit PocketBase auto-date fields; this catches
# schema drift that would otherwise surface as a generic 400 in the admin UI.
blog_admin_list = request(
    "GET",
    "/api/collections/blogs/records?sort=-updated,-published_at,-id&expand=relation,society,event",
    token=admin_token,
)
assert isinstance(blog_admin_list.get("items"), list)

# Coupon edit screens sort by creation time; keep those timestamps explicit too.
coupon_admin_list = request(
    "GET",
    "/api/collections/coupons/records?sort=created",
    token=admin_token,
)
assert isinstance(coupon_admin_list.get("items"), list)

society = request("POST", "/api/collections/societies/records", {
    "name": f"CI Society {suffix}", "slug": f"ci-society-{suffix}", "bio": "CI smoke",
    "isHidden": False, "chairs": [chair["id"]],
}, super_token)
request("POST", "/api/collections/societies/records", {
    "name": f"Duplicate Society {suffix}", "slug": f"ci-society-{suffix}", "bio": "duplicate",
    "isHidden": False, "chairs": [],
}, super_token, expected=(400,))
other_society = request("POST", "/api/collections/societies/records", {
    "name": f"Other Society {suffix}", "slug": f"other-society-{suffix}", "bio": "CI smoke",
    "isHidden": False, "chairs": [],
}, super_token)

chair_second_society = request("POST", "/api/collections/societies/records", {
    "name": f"Chair Second Society {suffix}", "slug": f"chair-second-{suffix}", "bio": "CI smoke",
    "isHidden": False, "chairs": [chair["id"]],
}, super_token)

# Execom roles are an authorization source. Each directory record owns one
# active assignment, stale source/backlink drift must fail closed immediately,
# role changes preserve history, and deleting one duplicate-role source must
# not revoke another source record's independent assignment.
execom_member = request("POST", "/api/collections/execom/records", {
    "name": f"CI Execom {suffix}", "position": "Society Chair",
    "society": society["id"], "user": second_user["id"],
    "roleCode": "society_chair", "term": "ci",
}, super_token)
time.sleep(0.1)
execom_member = request("GET", f"/api/collections/execom/records/{execom_member['id']}", token=super_token)
first_assignment_id = execom_member.get("assignment")
assert first_assignment_id
first_assignment = request("GET", f"/api/collections/organization_assignments/records/{first_assignment_id}", token=super_token)
assert first_assignment["active"] is True and first_assignment["source"] == "execom"
assert first_assignment["sourceExecom"] == execom_member["id"]
assert first_assignment["roleCode"] == "society_chair" and first_assignment["user"] == second_user["id"]
assert "events.create" in request("GET", "/api/workspace/me", token=second_token)["capabilities"]

# Deliberately break the source relation. Authorization must reject the active
# row before reconciliation, then the next source update repairs it atomically.
request("PATCH", f"/api/collections/organization_assignments/records/{first_assignment_id}", {
    "sourceExecom": "",
}, super_token)
assert request("GET", "/api/workspace/me", token=second_token)["capabilities"] == []
request("PATCH", f"/api/collections/execom/records/{execom_member['id']}", {
    "term": "ci-repaired",
}, super_token)
time.sleep(0.1)
first_assignment = request("GET", f"/api/collections/organization_assignments/records/{first_assignment_id}", token=super_token)
assert first_assignment["sourceExecom"] == execom_member["id"] and first_assignment["term"] == "ci-repaired"
assert "events.create" in request("GET", "/api/workspace/me", token=second_token)["capabilities"]

execom_duplicate = request("POST", "/api/collections/execom/records", {
    "name": f"CI Execom Duplicate {suffix}", "position": "Society Chair",
    "society": society["id"], "user": second_user["id"],
    "roleCode": "society_chair", "term": "ci-duplicate",
}, super_token)
time.sleep(0.1)
execom_duplicate = request("GET", f"/api/collections/execom/records/{execom_duplicate['id']}", token=super_token)
duplicate_assignment_id = execom_duplicate.get("assignment")
assert duplicate_assignment_id and duplicate_assignment_id != first_assignment_id
duplicate_assignment = request("GET", f"/api/collections/organization_assignments/records/{duplicate_assignment_id}", token=super_token)
assert duplicate_assignment["active"] is True and duplicate_assignment["sourceExecom"] == execom_duplicate["id"]
request("PATCH", f"/api/collections/execom/records/{execom_duplicate['id']}", {
    "assignment": first_assignment_id,
}, super_token, expected=(400,))

request("PATCH", f"/api/collections/execom/records/{execom_member['id']}", {
    "position": "Society Secretary", "roleCode": "society_secretary",
}, super_token)
time.sleep(0.1)
execom_member = request("GET", f"/api/collections/execom/records/{execom_member['id']}", token=super_token)
second_assignment_id = execom_member.get("assignment")
assert second_assignment_id and second_assignment_id not in (first_assignment_id, duplicate_assignment_id)
first_assignment = request("GET", f"/api/collections/organization_assignments/records/{first_assignment_id}", token=super_token)
second_assignment = request("GET", f"/api/collections/organization_assignments/records/{second_assignment_id}", token=super_token)
assert first_assignment["active"] is False
assert second_assignment["active"] is True and second_assignment["roleCode"] == "society_secretary"
assert second_assignment["sourceExecom"] == execom_member["id"]

request("DELETE", f"/api/collections/execom/records/{execom_member['id']}", token=super_token, expected=(204,))
time.sleep(0.1)
second_assignment = request("GET", f"/api/collections/organization_assignments/records/{second_assignment_id}", token=super_token)
duplicate_assignment = request("GET", f"/api/collections/organization_assignments/records/{duplicate_assignment_id}", token=super_token)
assert second_assignment["active"] is False
assert duplicate_assignment["active"] is True
assert "events.create" in request("GET", "/api/workspace/me", token=second_token)["capabilities"]
request("DELETE", f"/api/collections/execom/records/{execom_duplicate['id']}", token=super_token, expected=(204,))
time.sleep(0.1)
duplicate_assignment = request("GET", f"/api/collections/organization_assignments/records/{duplicate_assignment_id}", token=super_token)
assert duplicate_assignment["active"] is False
assert request("GET", "/api/workspace/me", token=second_token)["capabilities"] == []

# Chairs can edit their society content but cannot delegate chair access or store unsafe links.
request("PATCH", f"/api/collections/societies/records/{society['id']}", {
    "chairs": [chair["id"], second_user["id"]],
}, chair_token, (400, 403, 404))
request("PATCH", f"/api/collections/societies/records/{society['id']}", {
    "defaultWhatsappLink": "javascript:alert(1)",
}, chair_token, (400,))
society = request("PATCH", f"/api/collections/societies/records/{society['id']}", {
    "defaultWhatsappLink": "https://wa.me/1234567890",
}, chair_token)
assert society["defaultWhatsappLink"] == "https://wa.me/1234567890"
now = dt.datetime.now(dt.timezone.utc)
start = (now + dt.timedelta(days=1)).isoformat().replace("+00:00", "Z")
end = (now + dt.timedelta(days=1, hours=2)).isoformat().replace("+00:00", "Z")
event = request("POST", "/api/collections/events/records", {
    "title": f"CI Smoke Event {suffix}", "description": "<p>Clean-room integration event</p>",
    "date": start, "endDate": end, "venue": "CI Lab", "timezone": "Asia/Kolkata",
    "attendanceMode": "hybrid", "locationAddress": "CI Lab, Sahrdaya College", "price": 0,
    "society": society["id"], "status": "published", "maxCapacity": 1,
    "registeredCount": 0, "checkedInCount": 0, "registrationOpen": True,
    "checkInEnabled": True, "isDeleted": False,
    "requirements": ["  Bring laptop charger  ", "", "College ID card required"],
    "attendeeNote": "  Report 15 minutes before the session.  ",
    "externalLink": "https://example.test/event-guide",
    "contactEmail": "events@example.test", "contactPhone": "+91 98765 43210",
    "formTemplate": [
        {"id": "name", "name": "name", "label": "Name", "required": True},
        {"id": "email", "name": "email", "label": "Email", "required": True},
    ],
}, super_token)
assert event["slug"].startswith("ci-smoke-event-")
assert event["timezone"] == "Asia/Kolkata" and event["attendanceMode"] == "hybrid"
assert event["requirements"] == ["Bring laptop charger", "College ID card required"]
assert event["attendeeNote"] == "Report 15 minutes before the session."
assert not event.get("whatsappLink")
request("PATCH", f"/api/collections/events/records/{event['id']}", {
    "whatsappLink": "https://chat.whatsapp.com/must-stay-private",
}, super_token, (400,))

guidance_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Public Guidance {suffix}", "description": "<p>Public attendee guidance fixture</p>",
    "date": start, "endDate": end, "venue": "CI Guidance Lab", "timezone": "Asia/Kolkata",
    "attendanceMode": "onsite", "price": 200, "baseFeePaise": 20000,
    "society": society["id"], "status": "published", "registrationOpen": False,
    "collectIeeeMember": True, "ieeeMemberDiscountPercent": 20,
    "eligibleSemesters": ["S7"], "eligibleProgrammes": ["CSE"],
    "requirements": ["Bring a charged laptop", "Install VS Code beforehand"],
    "attendeeNote": "Report to the lab 15 minutes early.",
    "externalLink": "https://example.test/guidance", "isDeleted": False,
}, super_token)
assert guidance_event["requirements"] == ["Bring a charged laptop", "Install VS Code beforehand"]

# Private join data is server-only state: raw collection CRUD stays closed even
# for application admins, organizer access goes through events.edit, and users
# need a confirmed registration before retrieval.
private_schema = request("GET", "/api/collections/event_private_details", token=super_token)
for rule_name in ("listRule", "viewRule", "createRule", "updateRule", "deleteRule"):
    assert private_schema.get(rule_name) is None
request("GET", "/api/collections/event_private_details/records", token=user_token, expected=(403,))
request("GET", "/api/collections/event_private_details/records", token=admin_token, expected=(403,))
private_access = request("PUT", f"/api/app/events/{event['id']}/private-details", {
    "whatsappGroupUrl": "https://chat.whatsapp.com/ci-private-group",
    "virtualJoinUrl": "https://meet.example.test/ci-private-room",
    "joinInstructions": "Use the attendee name shown on your ticket.",
}, admin_token)
assert private_access["whatsappGroupUrl"] == "https://chat.whatsapp.com/ci-private-group"
assert private_access["virtualJoinUrl"].startswith("https://meet.example.test/")
request("GET", f"/api/app/events/{event['id']}/join-details", token=user_token, expected=(403,))
private_audit_filter = urllib.parse.quote(
    f'event="{event["id"]}" && action="event.private-access.updated"'
)
private_audit = request("GET", f"/api/collections/admin_audit_log/records?filter={private_audit_filter}", token=super_token)
assert private_audit["totalItems"] == 1
audit_blob = json.dumps(private_audit["items"][0])
assert "meet.example.test" not in audit_blob and "chat.whatsapp.com" not in audit_blob and "attendee name" not in audit_blob

# A published event cannot be completed before its effective scheduled end.
request(
    "POST",
    f"/api/workspace/events/{event['id']}/workflow",
    {"action": "complete"},
    admin_token,
    (409,),
)
if github_env := os.environ.get("GITHUB_ENV"):
    with open(github_env, "a", encoding="utf-8") as env_file:
        env_file.write(f"E2E_EVENT_ID={event['id']}\n")
        env_file.write(f"E2E_EVENT_GUIDANCE_SLUG={guidance_event['slug']}\n")

# Requirements are normalized at the PocketBase write boundary. Published
# checklists require review, while a public attendee note can be corrected
# without rewriting registrations or tickets.
request("POST", "/api/collections/events/records", {
    "title": f"Too Many Requirements {suffix}", "description": "requirements limit",
    "date": start, "society": society["id"], "status": "draft",
    "requirements": [f"Item {i}" for i in range(13)],
}, super_token, (400,))
request("POST", "/api/collections/events/records", {
    "title": f"Long Requirement {suffix}", "description": "requirements length",
    "date": start, "society": society["id"], "status": "draft",
    "requirements": ["x" * 201],
}, super_token, (400,))
request("POST", "/api/collections/events/records", {
    "title": f"Non Text Requirement {suffix}", "description": "requirements type",
    "date": start, "society": society["id"], "status": "draft",
    "requirements": [{"unsafe": True}],
}, super_token, (400,))
request("PATCH", f"/api/collections/events/records/{event['id']}", {
    "requirements": ["Changed after publish"],
}, admin_token, (403,))
event = request("PATCH", f"/api/collections/events/records/{event['id']}", {
    "attendeeNote": "  Report at the registration desk 15 minutes early.  ",
}, admin_token)
assert event["status"] == "published"
assert event["attendeeNote"] == "Report at the registration desk 15 minutes early."

# Chair scoping is enforced by PocketBase, not by UI filtering.
chair_event = request("POST", "/api/collections/events/records", {
    "title": f"Chair Event {suffix}", "description": "chair scope",
    "date": start, "society": society["id"], "status": "draft",
    "registrationOpen": False, "isDeleted": False,
}, chair_token)
assert chair_event["society"] == society["id"]
request("POST", "/api/collections/events/records", {
    "title": f"Unsafe Link {suffix}", "description": "must fail",
    "date": start, "society": society["id"], "status": "draft",
    "registrationOpen": False, "isDeleted": False,
    "externalLink": "javascript:alert(1)",
}, chair_token, (400,))
request("PATCH", f"/api/collections/events/records/{chair_event['id']}", {
    "externalLink": "javascript:alert(1)",
}, chair_token, (400,))
chair_event = request("PATCH", f"/api/collections/events/records/{chair_event['id']}", {
    "externalLink": "https://example.test/register",
}, chair_token)
assert chair_event["externalLink"] == "https://example.test/register"
request("PATCH", f"/api/collections/events/records/{chair_event['id']}", {
    "society": chair_second_society["id"],
}, chair_token, (400, 403))
# Archive is command-only and must not be smuggled through ordinary record updates.
request("PATCH", f"/api/collections/events/records/{chair_event['id']}", {
    "isDeleted": True,
}, chair_token, (400,))
archived = request("POST", f"/api/admin/events/{chair_event['id']}/archive", token=chair_token)
assert archived["archived"] is True and archived["alreadyArchived"] is False
archived_event = request("GET", f"/api/collections/events/records/{chair_event['id']}", token=super_token)
assert archived_event["isDeleted"] is True
assert archived_event["status"] == "draft"
request("POST", f"/api/admin/events/{chair_event['id']}/archive", token=chair_token)

request("POST", "/api/collections/events/records", {
    "title": f"Out of Scope {suffix}", "description": "must fail",
    "date": start, "society": other_society["id"], "status": "draft",
    "registrationOpen": False, "isDeleted": False,
}, chair_token, (400, 403))
other_event = request("POST", "/api/collections/events/records", {
    "title": f"Other Society Event {suffix}", "description": "scope test",
    "date": start, "society": other_society["id"], "status": "draft",
    "registrationOpen": False, "isDeleted": False,
}, super_token)
request("PATCH", f"/api/collections/events/records/{other_event['id']}", {
    "society": society["id"],
}, chair_token, (400, 403, 404))
chair_list = request("GET", "/api/collections/events/records?filter=status%3D%27draft%27", token=chair_token)
assert all(row["society"] == society["id"] for row in chair_list["items"])

# Event URLs are immutable after creation.
request("PATCH", f"/api/collections/events/records/{event['id']}", {"slug": "changed"}, super_token, (403,))

# Coupon writes are command-only; direct REST cannot bypass event/society scope.
request("POST", "/api/collections/coupons/records", {
    "event": event["id"], "society": society["id"], "code": "BYPASS",
    "discountPercent": 50, "isActive": True,
}, admin_token, (403,))
request("POST", "/api/collections/coupons/records", {
    "event": event["id"], "society": society["id"], "code": "CHAIRBYPASS",
    "discountPercent": 50, "isActive": True,
}, chair_token, (403,))

# Coupon set reconciliation is atomic and normalizes codes.
coupon_event = request("POST", "/api/collections/events/records", {
    "title": f"Coupon Draft {suffix}", "description": "coupon command",
    "date": start, "endDate": end, "venue": "CI Lab", "price": 100,
    "baseFeePaise": 10000, "society": society["id"], "status": "draft",
    "registrationMode": "internal", "registrationOpen": False, "isDeleted": False,
}, super_token)
sync = request("PUT", f"/api/app/events/{coupon_event['id']}/coupons", {
    "coupons": [{"code": "save10", "discountPercent": 10, "maxUses": 2, "isActive": True}],
}, admin_token)
assert sync["created"] == 1
coupon_filter = urllib.parse.quote(f"event='{coupon_event['id']}'")
coupons = request("GET", f"/api/collections/coupons/records?filter={coupon_filter}", token=admin_token)
assert coupons["totalItems"] == 1 and coupons["items"][0]["code"] == "SAVE10"
coupon = coupons["items"][0]
request("PUT", f"/api/app/events/{coupon_event['id']}/coupons", {"coupons": [{
    "id": coupon["id"], "code": "SAVE10", "discountPercent": 15,
    "maxUses": 3, "isActive": True,
}]}, admin_token)
# A stale/browser-only ID must reconcile by code instead of creating a duplicate
# and deleting the real PocketBase record on the next save.
request("PUT", f"/api/app/events/{coupon_event['id']}/coupons", {"coupons": [{
    "id": "browser-only-stale-id", "code": "save10", "discountPercent": 20,
    "maxUses": 4, "isActive": True,
}]}, admin_token)
coupons_after_stale_id = request("GET", f"/api/collections/coupons/records?filter={coupon_filter}", token=admin_token)
assert coupons_after_stale_id["totalItems"] == 1
assert coupons_after_stale_id["items"][0]["id"] == coupon["id"]
assert coupons_after_stale_id["items"][0]["code"] == "SAVE10"
assert coupons_after_stale_id["items"][0]["discountPercent"] == 20
request("PUT", f"/api/app/events/{coupon_event['id']}/coupons", {"coupons": []}, admin_token)

# Coupon redemption is previewable and then revalidated transactionally at
# registration. Cover normalization, discounts, 100%-off, expiry, deactivation,
# max-use exhaustion, and used-coupon deletion protection.
coupon_redemption_event = request("POST", "/api/collections/events/records", {
    "title": f"Coupon Redemption {suffix}", "description": "coupon redemption",
    "date": start, "endDate": end, "venue": "CI Coupon Lab", "price": 200,
    "baseFeePaise": 20000, "society": society["id"], "status": "draft",
    "registrationMode": "internal", "registrationOpen": True,
    "registeredCount": 0, "checkedInCount": 0, "isDeleted": False,
}, super_token)
expired = (now - dt.timedelta(minutes=5)).isoformat().replace("+00:00", "Z")
request("PUT", f"/api/app/events/{coupon_redemption_event['id']}/coupons", {"coupons": [
    {"code": "SAVE10", "discountPercent": 10, "maxUses": 0, "isActive": True},
    {"code": "UI20", "discountPercent": 20, "maxUses": 0, "isActive": True},
    {"code": "FREE100", "discountPercent": 100, "maxUses": 0, "isActive": True},
    {"code": "MAX1", "discountPercent": 25, "maxUses": 1, "isActive": True},
    {"code": "EXPIRED", "discountPercent": 50, "maxUses": 0, "expiresAt": expired, "isActive": True},
    {"code": "OFF", "discountPercent": 50, "maxUses": 0, "isActive": False},
]}, admin_token)
request("POST", f"/api/workspace/events/{coupon_redemption_event['id']}/workflow", {"action": "submit", "note": "Coupon smoke"}, admin_token)
request("POST", f"/api/workspace/events/{coupon_redemption_event['id']}/workflow", {"action": "approve", "note": "Coupon smoke org approval"}, admin_token)
request("POST", f"/api/workspace/events/{coupon_redemption_event['id']}/workflow", {"action": "finance_approve", "note": "Coupon smoke finance approval"}, admin_token)
request("POST", f"/api/workspace/events/{coupon_redemption_event['id']}/workflow", {"action": "publish"}, admin_token)
# Leave one unused attendee fixture for the real browser redemption test.
coupon_browser_user = create_user("coupon-browser", "user")
coupon_browser_token = impersonate(super_token, coupon_browser_user["id"])
coupon_fixture_path = os.environ.get("E2E_COUPON_FIXTURE_OUTPUT", "/tmp/coupon-redemption-e2e.json")
with open(coupon_fixture_path, "w", encoding="utf-8") as fixture_file:
    json.dump({
        "token": coupon_browser_token,
        "record": coupon_browser_user,
        "eventId": coupon_redemption_event["id"],
        "paidCode": "UI20",
        "paidAmount": 160,
        "freeCode": "FREE100",
    }, fixture_file)
preview = request("POST", f"/api/app/events/{coupon_redemption_event['id']}/coupon-preview", {
    "couponCode": "save10",
}, user_token)
assert preview["code"] == "SAVE10" and preview["discountPercent"] == 10
assert preview["baseAmount"] == 200 and preview["discountAmount"] == 20 and preview["amount"] == 180
request("POST", f"/api/app/events/{coupon_redemption_event['id']}/coupon-preview", {"couponCode": "expired"}, user_token, (400,))
request("POST", f"/api/app/events/{coupon_redemption_event['id']}/coupon-preview", {"couponCode": "off"}, user_token, (400,))
request("POST", f"/api/app/events/{coupon_redemption_event['id']}/coupon-preview", {"couponCode": "does-not-exist"}, user_token, (400,))

save10_registration = request("POST", f"/api/app/events/{coupon_redemption_event['id']}/register", {
    "formResponses": {"name": "Member", "email": user["email"], "phone": "9999999999", "college": "CI College"},
    "couponCode": "save10",
}, user_token)
assert save10_registration["paymentRequired"] is True and save10_registration["amount"] == 180
save10_record = request("GET", f"/api/collections/registrations/records/{save10_registration['registrationId']}", token=super_token)
assert save10_record["couponCode"] == "SAVE10" and save10_record["discountAmount"] == 20

free100_preview = request("POST", f"/api/app/events/{coupon_redemption_event['id']}/coupon-preview", {
    "couponCode": "free100",
}, second_token)
assert free100_preview["amount"] == 0 and free100_preview["discountAmount"] == 200
free100_registration = request("POST", f"/api/app/events/{coupon_redemption_event['id']}/register", {
    "formResponses": {"name": "Member Two", "email": second_user["email"], "phone": "8888888888", "college": "CI College"},
    "couponCode": "free100",
}, second_token)
assert free100_registration["paymentRequired"] is False
assert free100_registration["registrationStatus"] == "confirmed" and free100_registration["amount"] == 0
assert free100_registration["ticketId"]

max_user = create_user("coupon-max", "user")
max_user_token = impersonate(super_token, max_user["id"])
max_overflow_user = create_user("coupon-max-overflow", "user")
max_overflow_token = impersonate(super_token, max_overflow_user["id"])
max_preview = request("POST", f"/api/app/events/{coupon_redemption_event['id']}/coupon-preview", {"couponCode": "max1"}, max_user_token)
assert max_preview["amount"] == 150
max_registration = request("POST", f"/api/app/events/{coupon_redemption_event['id']}/register", {
    "formResponses": {"name": "Coupon Max", "email": max_user["email"], "phone": "7777777777", "college": "CI College"},
    "couponCode": "max1",
}, max_user_token)
assert max_registration["amount"] == 150
request("POST", f"/api/app/events/{coupon_redemption_event['id']}/coupon-preview", {"couponCode": "max1"}, max_overflow_token, (409,))
request("POST", f"/api/app/events/{coupon_redemption_event['id']}/register", {
    "formResponses": {"name": "Coupon Overflow", "email": max_overflow_user["email"], "phone": "6666666666", "college": "CI College"},
    "couponCode": "max1",
}, max_overflow_token, (400,))

redemption_filter = urllib.parse.quote(f"event='{coupon_redemption_event['id']}'")
redemption_coupons = request("GET", f"/api/collections/coupons/records?filter={redemption_filter}&sort=code", token=admin_token)
# Removing a used coupon is rejected; organizers must deactivate it instead.
remaining_without_save10 = [{
    "id": row["id"], "code": row["code"], "discountPercent": row["discountPercent"],
    "maxUses": row["maxUses"], "expiresAt": row.get("expiresAt", ""), "isActive": row["isActive"],
} for row in redemption_coupons["items"] if row["code"] != "SAVE10"]
request("PUT", f"/api/app/events/{coupon_redemption_event['id']}/coupons", {"coupons": remaining_without_save10}, admin_token, (400,))

# IEEE-member pricing preview and registration share one server calculation.
pricing_event = request("POST", "/api/collections/events/records", {
    "title": f"CI IEEE Pricing {suffix}", "description": "member pricing guard",
    "date": start, "endDate": end, "venue": "CI Pricing Lab", "price": 200,
    "baseFeePaise": 20000, "society": society["id"], "status": "draft",
    "registrationMode": "internal", "registrationOpen": True, "maxCapacity": 20,
    "collectIeeeMember": True, "ieeeMemberDiscountPercent": 20, "isDeleted": False,
}, super_token)
request("PUT", f"/api/app/events/{pricing_event['id']}/coupons", {"coupons": [
    {"code": "WIN30", "discountPercent": 30, "maxUses": 2, "isActive": True},
    {"code": "TIE20", "discountPercent": 20, "maxUses": 1, "isActive": True},
]}, admin_token)
request("POST", f"/api/workspace/events/{pricing_event['id']}/workflow", {"action": "submit", "note": "Pricing smoke"}, admin_token)
request("POST", f"/api/workspace/events/{pricing_event['id']}/workflow", {"action": "approve", "note": "Pricing org"}, admin_token)
request("POST", f"/api/workspace/events/{pricing_event['id']}/workflow", {"action": "finance_approve", "note": "Pricing finance"}, admin_token)
request("POST", f"/api/workspace/events/{pricing_event['id']}/workflow", {"action": "publish"}, admin_token)

member_preview = request("POST", f"/api/app/events/{pricing_event['id']}/pricing-preview", {
    "isIeeeMember": True, "ieeeMembershipId": "IEEE-10001",
}, user_token)
assert member_preview["discountSource"] == "ieee_member" and member_preview["amount"] == 160
request("POST", f"/api/app/events/{pricing_event['id']}/pricing-preview", {
    "isIeeeMember": True,
}, max_overflow_token, (400,))
member_registration = request("POST", f"/api/app/events/{pricing_event['id']}/register", {
    "formResponses": {"name": "Pricing Member", "email": user["email"], "phone": "9000000101", "college": "CI College", "isIeeeMember": True, "ieeeMembershipId": "IEEE-10001"},
}, user_token)
assert member_registration["amount"] == member_preview["amount"]
member_record = request("GET", f"/api/collections/registrations/records/{member_registration['registrationId']}", token=super_token)
assert member_record["discountSource"] == "ieee_member" and member_record["couponCode"] == "" and member_record["finalFeePaise"] == 16000

coupon_win_preview = request("POST", f"/api/app/events/{pricing_event['id']}/pricing-preview", {
    "isIeeeMember": True, "ieeeMembershipId": "IEEE-10002", "couponCode": "win30",
}, second_token)
assert coupon_win_preview["discountSource"] == "coupon" and coupon_win_preview["amount"] == 140
tie_preview = request("POST", f"/api/app/events/{pricing_event['id']}/pricing-preview", {
    "isIeeeMember": True, "ieeeMembershipId": "IEEE-10003", "couponCode": "tie20",
}, max_user_token)
assert tie_preview["discountSource"] == "ieee_member" and tie_preview["amount"] == 160
assert tie_preview["requestedCouponCode"] == "TIE20" and tie_preview["appliedCouponCode"] == ""

coupon_win_registration = request("POST", f"/api/app/events/{pricing_event['id']}/register", {
    "formResponses": {"name": "Pricing Coupon", "email": second_user["email"], "phone": "9000000102", "college": "CI College", "isIeeeMember": True, "ieeeMembershipId": "IEEE-10002"},
    "couponCode": "WIN30",
}, second_token)
assert coupon_win_registration["amount"] == coupon_win_preview["amount"]
coupon_win_record = request("GET", f"/api/collections/registrations/records/{coupon_win_registration['registrationId']}", token=super_token)
assert coupon_win_record["discountSource"] == "coupon" and coupon_win_record["couponCode"] == "WIN30" and coupon_win_record["finalFeePaise"] == 14000

tie_registration = request("POST", f"/api/app/events/{pricing_event['id']}/register", {
    "formResponses": {"name": "Pricing Tie", "email": max_user["email"], "phone": "9000000103", "college": "CI College", "isIeeeMember": True, "ieeeMembershipId": "IEEE-10003"},
    "couponCode": "TIE20",
}, max_user_token)
assert tie_registration["amount"] == tie_preview["amount"]
tie_record = request("GET", f"/api/collections/registrations/records/{tie_registration['registrationId']}", token=super_token)
assert tie_record["discountSource"] == "ieee_member" and tie_record["couponCode"] == ""
pricing_filter = urllib.parse.quote(f"event='{pricing_event['id']}'")
pricing_coupons = request("GET", f"/api/collections/coupons/records?filter={pricing_filter}", token=super_token)["items"]
pricing_by_code = {row["code"]: row for row in pricing_coupons}
assert pricing_by_code["WIN30"]["usedCount"] == 1 and pricing_by_code["TIE20"]["usedCount"] == 0
pricing_fixture_path = os.environ.get("E2E_PRICING_FIXTURE_OUTPUT", "/tmp/member-pricing-e2e.json")
with open(pricing_fixture_path, "w", encoding="utf-8") as fixture_file:
    json.dump({
        "token": max_overflow_token, "record": max_overflow_user,
        "eventId": pricing_event["id"], "memberDiscountPercent": 20,
        "memberAmount": 160, "memberId": "IEEE-BROWSER",
        "tieCode": "TIE20", "betterCouponCode": "WIN30", "couponAmount": 140,
    }, fixture_file)

request("POST", f"/api/app/events/{pricing_event['id']}/register", {
    "formResponses": {"name": "Missing ID", "email": max_overflow_user["email"], "phone": "9000000104", "college": "CI College", "isIeeeMember": True},
}, max_overflow_token, (400,))
request("PATCH", f"/api/collections/events/records/{pricing_event['id']}", {"ieeeMemberDiscountPercent": 25}, admin_token, (403,))

manual_pricing = request("POST", f"/api/admin/events/{pricing_event['id']}/registrations/manual", {
    "name": "Manual Member", "email": f"manual-member-{suffix}@example.test", "paymentMode": "pending",
    "formResponses": {"isIeeeMember": True, "ieeeMembershipId": "IEEE-MANUAL"},
}, admin_token)["registration"]
assert manual_pricing["amount"] == 160
manual_pricing_record = request("GET", f"/api/collections/registrations/records/{manual_pricing['id']}", token=super_token)
assert manual_pricing_record["discountSource"] == "ieee_member"
assert manual_pricing_record["couponCode"] == "" and manual_pricing_record["finalFeePaise"] == 16000

pricing_free_event = request("POST", "/api/collections/events/records", {
    "title": f"CI IEEE Free Price {suffix}", "description": "100 percent member pricing",
    "date": start, "endDate": end, "venue": "CI Pricing Lab", "price": 75,
    "baseFeePaise": 7500, "society": society["id"], "status": "draft",
    "registrationMode": "internal", "registrationOpen": True, "maxCapacity": 5,
    "collectIeeeMember": True, "ieeeMemberDiscountPercent": 100, "isDeleted": False,
}, super_token)
request("POST", f"/api/workspace/events/{pricing_free_event['id']}/workflow", {"action": "submit", "note": "Free member price"}, admin_token)
request("POST", f"/api/workspace/events/{pricing_free_event['id']}/workflow", {"action": "approve", "note": "Free member price org"}, admin_token)
request("POST", f"/api/workspace/events/{pricing_free_event['id']}/workflow", {"action": "finance_approve", "note": "Free member price finance"}, admin_token)
request("POST", f"/api/workspace/events/{pricing_free_event['id']}/workflow", {"action": "publish"}, admin_token)
pricing_free_registration = request("POST", f"/api/app/events/{pricing_free_event['id']}/register", {
    "formResponses": {"name": "Pricing Free", "email": coupon_browser_user["email"], "phone": "9000000105", "college": "CI College", "isIeeeMember": True, "ieeeMembershipId": "IEEE-FREE"},
}, coupon_browser_token)
assert pricing_free_registration["paymentRequired"] is False and pricing_free_registration["amount"] == 0
assert pricing_free_registration["registrationStatus"] == "confirmed" and pricing_free_registration["ticketId"]

request("POST", "/api/collections/events/records", {
    "title": f"CI Bad PayGate Member {suffix}", "description": "invalid member paise price",
    "date": start, "endDate": end, "venue": "CI Pricing Lab", "price": 125,
    "baseFeePaise": 12500, "society": society["id"], "status": "draft",
    "registrationMode": "internal", "registrationOpen": True, "collectIeeeMember": True,
    "ieeeMemberDiscountPercent": 10, "isDeleted": False,
}, super_token, (400,))
paygate_coupon_event = request("POST", "/api/collections/events/records", {
    "title": f"CI PayGate Coupon Config {suffix}", "description": "invalid coupon paise price",
    "date": start, "endDate": end, "venue": "CI Pricing Lab", "price": 125,
    "baseFeePaise": 12500, "society": society["id"], "status": "draft",
    "registrationMode": "internal", "registrationOpen": True, "isDeleted": False,
}, super_token)
request("PUT", f"/api/app/events/{paygate_coupon_event['id']}/coupons", {"coupons": [{
    "code": "BAD10", "discountPercent": 10, "maxUses": 0, "isActive": True,
}]}, admin_token, (400,))


# Audience eligibility is command-owned. Rejection happens before capacity,
# coupon or payment state is consumed; accepted records store canonical academics.
audience_bad_user = create_user("audience-bad", "user")
audience_good_user = create_user("audience-good", "user")
audience_bad_token = impersonate(super_token, audience_bad_user["id"])
audience_good_token = impersonate(super_token, audience_good_user["id"])
audience_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Restricted Audience {suffix}", "description": "academic audience guard",
    "date": start, "endDate": end, "venue": "CI Audience Lab", "price": 100,
    "baseFeePaise": 10000, "society": society["id"], "status": "draft",
    "registrationMode": "internal", "registrationOpen": True, "maxCapacity": 3,
    "registeredCount": 0, "checkedInCount": 0, "isDeleted": False,
    "eligibleSemesters": ["S6"], "eligibleProgrammes": ["EEE"],
}, super_token)
request("PUT", f"/api/app/events/{audience_event['id']}/coupons", {"coupons": [
    {"code": "AUD10", "discountPercent": 10, "maxUses": 5, "isActive": True},
]}, admin_token)
request("POST", f"/api/workspace/events/{audience_event['id']}/workflow", {"action": "submit", "note": "Audience smoke"}, admin_token)
request("POST", f"/api/workspace/events/{audience_event['id']}/workflow", {"action": "approve", "note": "Audience approval"}, admin_token)
request("POST", f"/api/workspace/events/{audience_event['id']}/workflow", {"action": "finance_approve", "note": "Audience finance"}, admin_token)
request("POST", f"/api/workspace/events/{audience_event['id']}/workflow", {"action": "publish"}, admin_token)
audience_fixture_path = os.environ.get("E2E_AUDIENCE_FIXTURE_OUTPUT", "/tmp/event-audience-e2e.json")
with open(audience_fixture_path, "w", encoding="utf-8") as fixture_file:
    json.dump({
        "token": audience_bad_token,
        "record": audience_bad_user,
        "eventId": audience_event["id"],
        "eventTitle": audience_event["title"],
        "programmeCode": "EEE",
        "semester": "S6",
    }, fixture_file)

request("POST", f"/api/app/events/{audience_event['id']}/register", {
    "formResponses": {"name": "Wrong Programme", "email": audience_bad_user["email"], "phone": "9000000001", "college": "CI College", "programmeCode": "CSE", "branch": "Computer Science and Engineering", "semester": "S6"},
    "couponCode": "AUD10",
}, audience_bad_token, (400,))
request("POST", f"/api/app/events/{audience_event['id']}/register", {
    "formResponses": {"name": "Missing Semester", "email": audience_bad_user["email"], "phone": "9000000001", "college": "CI College", "programmeCode": "EEE", "branch": "Electrical and Electronics Engineering"},
    "couponCode": "AUD10",
}, audience_bad_token, (400,))
audience_bad_filter = urllib.parse.quote(f'event="{audience_event["id"]}" && user="{audience_bad_user["id"]}"')
assert request("GET", f"/api/collections/registrations/records?filter={audience_bad_filter}", token=super_token)["totalItems"] == 0
audience_coupon_filter = urllib.parse.quote(f'event="{audience_event["id"]}" && code="AUD10"')
audience_coupon = request("GET", f"/api/collections/coupons/records?filter={audience_coupon_filter}", token=super_token)["items"][0]
assert audience_coupon["usedCount"] == 0
audience_payment_filter = urllib.parse.quote(f'event="{audience_event["id"]}"')
assert request("GET", f"/api/collections/payments/records?filter={audience_payment_filter}", token=super_token)["totalItems"] == 0
audience_after_reject = request("GET", f"/api/collections/events/records/{audience_event['id']}", token=super_token)
assert audience_after_reject["registeredCount"] == 0

audience_registration = request("POST", f"/api/app/events/{audience_event['id']}/register", {
    "formResponses": {"name": "Eligible EEE", "email": audience_good_user["email"], "phone": "9000000002", "college": "CI College", "programmeCode": "EEE", "branch": "Electrical and Electronics Engineering", "semester": "semester 6"},
    "couponCode": "AUD10",
}, audience_good_token)
assert audience_registration["paymentRequired"] is True and audience_registration["amount"] == 90
audience_record = request("GET", f"/api/collections/registrations/records/{audience_registration['registrationId']}", token=super_token)
assert audience_record["programmeCode"] == "EEE" and audience_record["semester"] == "S6"
assert audience_record["discountSource"] == "coupon" and audience_record["couponCode"] == "AUD10"
request("POST", f"/api/admin/events/{audience_event['id']}/registrations/manual", {
    "name": "Manual Wrong", "email": f"manual-wrong-{suffix}@example.test",
    "paymentMode": "waived", "note": "CI ineligible manual guard",
    "formResponses": {"programmeCode": "CSE", "branch": "Computer Science and Engineering", "semester": "S6"},
}, admin_token, (400,))
audience_manual = request("POST", f"/api/admin/events/{audience_event['id']}/registrations/manual", {
    "name": "Manual Eligible", "email": f"manual-good-{suffix}@example.test",
    "paymentMode": "waived", "note": "CI eligible manual registration",
    "formResponses": {"programmeCode": "EEE", "branch": "Electrical and Electronics Engineering", "semester": "S6"},
}, admin_token)["registration"]
audience_manual_record = request("GET", f"/api/collections/registrations/records/{audience_manual['id']}", token=super_token)
assert audience_manual_record["programmeCode"] == "EEE" and audience_manual_record["semester"] == "S6"

# Restricted waitlists snapshot academic values too. Audience changes require
# unpublishing first, and that lifecycle transition retires active reservations.
audience_owner = create_user("audience-owner", "user")
audience_waiter = create_user("audience-waiter", "user")
audience_owner_token = impersonate(super_token, audience_owner["id"])
audience_waiter_token = impersonate(super_token, audience_waiter["id"])
audience_wait_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Restricted Waitlist {suffix}", "description": "academic waitlist guard",
    "date": start, "endDate": end, "venue": "CI Audience Lab", "price": 0,
    "society": society["id"], "status": "draft", "registrationMode": "internal",
    "registrationOpen": True, "maxCapacity": 1, "registeredCount": 0,
    "waitlistEnabled": True, "waitlistOfferMinutes": 15,
    "allowSelfCancellation": True, "selfCancellationUntil": start,
    "eligibleSemesters": ["S6"], "eligibleProgrammes": ["EEE"],
    "checkInEnabled": True, "isDeleted": False,
}, super_token)
request("POST", f"/api/workspace/events/{audience_wait_event['id']}/workflow", {"action": "submit", "note": "Restricted waitlist"}, admin_token)
request("POST", f"/api/workspace/events/{audience_wait_event['id']}/workflow", {"action": "approve", "note": "Restricted waitlist approval"}, admin_token)
request("POST", f"/api/workspace/events/{audience_wait_event['id']}/workflow", {"action": "publish"}, admin_token)
audience_owner_reg = request("POST", f"/api/app/events/{audience_wait_event['id']}/register", {
    "formResponses": {"name": "Audience Owner", "email": audience_owner["email"], "programmeCode": "EEE", "branch": "Electrical and Electronics Engineering", "semester": "S6"},
}, audience_owner_token)
request("POST", f"/api/app/events/{audience_wait_event['id']}/waitlist/join", {
    "programmeCode": "CSE", "branch": "Computer Science and Engineering", "semester": "S6",
}, audience_bad_token, (400,))
bad_wait_filter = urllib.parse.quote(f'event="{audience_wait_event["id"]}" && user="{audience_bad_user["id"]}"')
assert request("GET", f"/api/collections/event_waitlist/records?filter={bad_wait_filter}", token=super_token)["totalItems"] == 0
wait_join = request("POST", f"/api/app/events/{audience_wait_event['id']}/waitlist/join", {
    "programmeCode": "EEE", "branch": "Electrical and Electronics Engineering", "semester": "S6",
}, audience_waiter_token)
assert wait_join["joined"] is True
wait_filter = urllib.parse.quote(f'event="{audience_wait_event["id"]}" && user="{audience_waiter["id"]}"')
wait_row = request("GET", f"/api/collections/event_waitlist/records?filter={wait_filter}", token=super_token)["items"][0]
assert wait_row["programmeCode"] == "EEE" and wait_row["semester"] == "S6"
request("POST", f"/api/app/registrations/{audience_owner_reg['registrationId']}/cancel", {"reason": "CI waitlist seat release"}, audience_owner_token)
wait_offer = request("GET", f"/api/app/events/{audience_wait_event['id']}/waitlist", token=audience_waiter_token)
assert wait_offer["state"]["status"] == "offered"
wait_event_record = request("GET", f"/api/collections/events/records/{audience_wait_event['id']}", token=super_token)
assert wait_event_record["waitlistReservedCount"] == 1
request("POST", f"/api/workspace/events/{audience_wait_event['id']}/workflow", {"action": "unpublish", "note": "Change audience safely"}, admin_token)
request("PATCH", f"/api/collections/events/records/{audience_wait_event['id']}", {"eligibleProgrammes": ["CSE"]}, admin_token)
request("POST", f"/api/app/events/{audience_wait_event['id']}/waitlist/join", {
    "programmeCode": "CSE", "branch": "Computer Science and Engineering", "semester": "S6",
}, audience_bad_token, (409,))
retired_wait = request("GET", f"/api/collections/event_waitlist/records/{wait_row['id']}", token=super_token)
assert retired_wait["status"] == "cancelled" and retired_wait["activeKey"] == ""
wait_event_after_unpublish = request("GET", f"/api/collections/events/records/{audience_wait_event['id']}", token=super_token)
assert wait_event_after_unpublish["waitlistReservedCount"] == 0

# Registration command reserves exactly one seat. Replaying the same user's
# command is idempotent and returns the original record instead of consuming a
# second seat; another user is still rejected by capacity.
registration = request("POST", f"/api/app/events/{event['id']}/register", {
    "formResponses": {"name": "Member", "email": user["email"], "phone": "123"},
}, user_token)
assert registration["registrationStatus"] == "confirmed" and registration["ticketId"]
join_details = request("GET", f"/api/app/events/{event['id']}/join-details", token=user_token)
assert join_details["whatsappGroupUrl"] == "https://chat.whatsapp.com/ci-private-group"
assert join_details["virtualJoinUrl"] == "https://meet.example.test/ci-private-room"
assert join_details["contactEmail"] == "events@example.test"
assert join_details["contactPhone"] == "+91 98765 43210"
assert "attendee name" in join_details["joinInstructions"]
replayed_registration = request("POST", f"/api/app/events/{event['id']}/register", {
    "formResponses": {"name": "Member", "email": user["email"]},
}, user_token, (200,))
assert replayed_registration.get("reused") is True
assert replayed_registration["registrationId"] == registration["registrationId"]
assert replayed_registration["ticketId"] == registration["ticketId"]
if github_env := os.environ.get("GITHUB_ENV"):
    with open(github_env, "a", encoding="utf-8") as env_file:
        env_file.write(f"E2E_MY_EVENTS_TOKEN={user_token}\n")
        env_file.write(f"E2E_MY_EVENTS_EVENT_TITLE={event['title']}\n")
        env_file.write(f"E2E_MY_EVENTS_EVENT_SLUG={event['slug']}\n")
        env_file.write(f"E2E_MY_EVENTS_TICKET_ID={registration['ticketId']}\n")

# Attendance V2 is opt-in by event sessions. A dedicated fixture proves the new
# append-only session path while the existing main/ops events remain sessionless
# and continue exercising legacy single check-in compatibility later in this file.
attendance_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Attendance V2 {suffix}", "description": "multi-session attendance",
    "date": start, "endDate": end, "venue": "CI Attendance Lab", "price": 0,
    "society": society["id"], "status": "published", "maxCapacity": 5,
    "registeredCount": 0, "checkedInCount": 0, "registrationOpen": True,
    "checkInEnabled": True, "isDeleted": False,
    "formTemplate": [
        {"id": "name", "name": "name", "label": "Name", "required": True},
        {"id": "email", "name": "email", "label": "Email", "required": True},
    ],
}, super_token)
attendance_other_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Attendance Other {suffix}", "description": "wrong-session fixture",
    "date": start, "endDate": end, "venue": "CI Other Lab", "price": 0,
    "society": society["id"], "status": "published", "maxCapacity": 5,
    "registeredCount": 0, "checkedInCount": 0, "registrationOpen": True,
    "checkInEnabled": True, "isDeleted": False,
}, super_token)
attendance_session = request("POST", f"/api/app/events/{attendance_event['id']}/attendance/sessions", {
    "title": "Day 1 · Core Session", "startsAt": start, "endsAt": end,
    "venue": "CI Attendance Lab", "attendanceEnabled": True, "checkInEnabled": True,
    "requiredForCertificate": True, "attendanceWeight": 1,
}, admin_token)["session"]
other_attendance_session = request("POST", f"/api/app/events/{attendance_other_event['id']}/attendance/sessions", {
    "title": "Other Event Session", "startsAt": start, "endsAt": end,
    "attendanceEnabled": True, "checkInEnabled": True,
}, admin_token)["session"]
assert attendance_session["presentCount"] == 0
attendance_sessions = request("GET", f"/api/app/events/{attendance_event['id']}/attendance/sessions", token=admin_token)
assert attendance_sessions["mode"] == "sessions" and len(attendance_sessions["sessions"]) == 1

attendance_registration = request("POST", f"/api/app/events/{attendance_event['id']}/register", {
    "formResponses": {"name": "Attendance Member", "email": user["email"]},
}, user_token)
assert attendance_registration["registrationStatus"] == "confirmed"
attendance_registration_id = attendance_registration["registrationId"]
attendance_ticket = attendance_registration["ticketId"]

checkin_staff = create_user("attendance-checkin", "user")
checkin_staff_token = impersonate(super_token, checkin_staff["id"])
request("POST", "/api/collections/organization_assignments/records", {
    "user": checkin_staff["id"], "roleCode": "event_checkin", "title": "Attendance desk",
    "scopeType": "event", "event": attendance_event["id"], "active": True,
    "source": "manual", "createdBy": admin["id"],
}, super_token)
request("GET", f"/api/collections/registrations/records/{attendance_registration_id}", token=checkin_staff_token, expected=(403, 404))
attendance_context = request("GET", "/api/workspace/attendance/context", token=checkin_staff_token)
assert [row["id"] for row in attendance_context["events"]] == [attendance_event["id"]]
assert attendance_context["events"][0]["mode"] == "sessions"
assert "userName" not in json.dumps(attendance_context)

# Once sessions exist, old event-level check-in commands refuse to mutate the
# legacy boolean. Operators must select an explicit session.
request("POST", "/api/workspace/check-in", {"ticketId": attendance_ticket}, checkin_staff_token, (409,))
request("POST", f"/api/admin/registrations/{attendance_registration_id}/command", {"action": "check-in"}, admin_token, (409,))

# V2 requires a client-generated request identifier so retries are safe rather
# than accidentally becoming duplicate attendance records.
request("POST", "/api/workspace/attendance/check-in", {
    "ticketId": attendance_ticket, "eventId": attendance_event["id"],
    "sessionId": attendance_session["id"],
}, checkin_staff_token, (400,))

request("POST", "/api/workspace/attendance/check-in", {
    "ticketId": attendance_ticket, "eventId": attendance_event["id"],
    "sessionId": other_attendance_session["id"], "idempotencyKey": f"wrong-session-{suffix}",
}, checkin_staff_token, (409,))
request("POST", "/api/workspace/attendance/check-in", {
    "ticketId": registration["ticketId"], "eventId": attendance_event["id"],
    "sessionId": attendance_session["id"], "idempotencyKey": f"wrong-event-{suffix}",
}, checkin_staff_token, (409,))

scan_key = f"attendance-scan-{suffix}"
attendance_scan = request("POST", "/api/workspace/attendance/check-in", {
    "ticketId": attendance_ticket, "eventId": attendance_event["id"],
    "sessionId": attendance_session["id"], "idempotencyKey": scan_key,
    "deviceId": "ci-scanner",
}, checkin_staff_token)
assert attendance_scan["success"] is True and attendance_scan["replayed"] is False
assert attendance_scan["registration"]["userName"] == "Attendance Member"
assert attendance_scan["registration"]["sessionId"] == attendance_session["id"]
assert attendance_scan["presentCount"] == 1
attendance_replay = request("POST", "/api/workspace/attendance/check-in", {
    "ticketId": attendance_ticket, "eventId": attendance_event["id"],
    "sessionId": attendance_session["id"], "idempotencyKey": scan_key,
}, checkin_staff_token)
assert attendance_replay["replayed"] is True
request("POST", "/api/workspace/attendance/check-in", {
    "ticketId": attendance_ticket, "eventId": attendance_event["id"],
    "sessionId": attendance_session["id"], "idempotencyKey": f"duplicate-{suffix}",
}, checkin_staff_token, (409,))

attendance_reg_record = request("GET", f"/api/collections/registrations/records/{attendance_registration_id}", token=super_token)
assert attendance_reg_record["checkedIn"] is True and attendance_reg_record["checkedInAt"]
attendance_event_record = request("GET", f"/api/collections/events/records/{attendance_event['id']}", token=super_token)
assert attendance_event_record["checkedInCount"] == 1

request("POST", "/api/workspace/attendance/correct", {
    "registrationId": attendance_registration_id, "sessionId": attendance_session["id"],
    "action": "manual_remove", "note": "CI correction removes accidental scan",
}, checkin_staff_token)
attendance_reg_after_remove = request("GET", f"/api/collections/registrations/records/{attendance_registration_id}", token=super_token)
assert attendance_reg_after_remove["checkedIn"] is True and attendance_reg_after_remove["checkedInAt"]
attendance_state = request("GET", f"/api/workspace/attendance/sessions/{attendance_session['id']}/state", token=checkin_staff_token)
assert attendance_state["session"]["presentCount"] == 0
assert attendance_state["recent"][0]["type"] == "manual_remove"
assert attendance_state["recent"][0]["present"] is False
assert attendance_state["recent"][0]["isLatestForRegistration"] is True
request("POST", "/api/workspace/attendance/correct", {
    "registrationId": attendance_registration_id, "sessionId": attendance_session["id"],
    "action": "manual_add", "note": "CI correction restores verified attendance",
}, checkin_staff_token)
attendance_state = request("GET", f"/api/workspace/attendance/sessions/{attendance_session['id']}/state", token=checkin_staff_token)
assert attendance_state["session"]["presentCount"] == 1
assert attendance_state["recent"][0]["type"] == "manual_add"
assert attendance_state["recent"][0]["present"] is True
assert attendance_state["recent"][0]["isLatestForRegistration"] is True
request("POST", "/api/workspace/attendance/correct", {
    "registrationId": attendance_registration_id, "sessionId": attendance_session["id"],
    "action": "manual_remove", "note": "",
}, checkin_staff_token, (400,))
request("DELETE", f"/api/app/event-sessions/{attendance_session['id']}", token=admin_token, expected=(409,))

attendance_rows = request("GET", "/api/collections/attendance_records/records?filter=" + urllib.parse.quote(f'session="{attendance_session["id"]}"'), token=super_token)
assert attendance_rows["totalItems"] == 3
request("PATCH", f"/api/collections/attendance_records/records/{attendance_rows['items'][0]['id']}", {"note": "tampered"}, super_token, (400,))
attendance_audit = request("GET", "/api/collections/admin_audit_log/records?filter=" + urllib.parse.quote(f'event="{attendance_event["id"]}" && action~"attendance."'), token=super_token)
assert any(row["action"] == "attendance.present" for row in attendance_audit["items"])
assert any(row["action"] == "attendance.manual_remove" for row in attendance_audit["items"])
assert any(row["action"] == "attendance.manual_add" for row in attendance_audit["items"])

# Session scanning is an event-day operation; once the event is no longer
# published the command fails closed even though the session history remains.
request("POST", f"/api/workspace/events/{attendance_event['id']}/workflow", {
    "action": "unpublish", "note": "CI validates attendance active-event guard",
}, admin_token)
request("POST", "/api/workspace/attendance/check-in", {
    "ticketId": attendance_ticket, "eventId": attendance_event["id"],
    "sessionId": attendance_session["id"], "idempotencyKey": f"inactive-{suffix}",
}, checkin_staff_token, (409,))

# My Events is a user-owned projection across registration, access and attendance.
my_events = request("GET", "/api/app/my-events", token=user_token)
main_item = next(row for row in my_events["items"] if row["event"]["id"] == event["id"])
assert main_item["registration"]["ticketId"] == registration["ticketId"]
assert main_item["privateAccess"]["virtualJoinUrl"] == "https://meet.example.test/ci-private-room"
attendance_item = next(row for row in my_events["items"] if row["event"]["id"] == attendance_event["id"])
assert attendance_item["attendance"]["mode"] == "sessions"
assert attendance_item["attendance"]["attendedSessions"] == 1
assert attendance_item["attendance"]["totalSessions"] == 1
assert attendance_item["privateAccess"] is None
my_events_blob = json.dumps(my_events)
assert user["email"] not in my_events_blob and "userPhone" not in my_events_blob
empty_history = request("GET", "/api/app/my-events", token=checkin_staff_token)
assert empty_history["summary"]["total"] == 0 and empty_history["items"] == []

# Leave one dedicated sessionless event untouched for the browser lifecycle.
# Playwright receives only non-secret fixture identifiers through GITHUB_ENV;
# it never needs PocketBase superuser credentials or raw collection writes.
browser_attendance_event = request("POST", "/api/collections/events/records", {
    "title": f"E2E Attendance V2 {suffix}", "description": "browser attendance fixture",
    "date": start, "endDate": end, "venue": "E2E Attendance Lab", "price": 0,
    "society": society["id"], "status": "published", "maxCapacity": 5,
    "registeredCount": 0, "checkedInCount": 0, "registrationOpen": True,
    "checkInEnabled": True, "isDeleted": False,
    "formTemplate": [
        {"id": "name", "name": "name", "label": "Name", "required": True},
        {"id": "email", "name": "email", "label": "Email", "required": True},
    ],
}, super_token)
browser_attendee_name = "E2E Attendance Member"
browser_attendance_registration = request("POST", f"/api/app/events/{browser_attendance_event['id']}/register", {
    "formResponses": {"name": browser_attendee_name, "email": second_user["email"]},
}, second_token)
assert browser_attendance_registration["registrationStatus"] == "confirmed"
assert browser_attendance_registration["ticketId"]
if github_env := os.environ.get("GITHUB_ENV"):
    with open(github_env, "a", encoding="utf-8") as env_file:
        env_file.write(f"E2E_ATTENDANCE_EVENT_ID={browser_attendance_event['id']}\n")
        env_file.write(f"E2E_ATTENDANCE_TICKET_ID={browser_attendance_registration['ticketId']}\n")
        env_file.write(f"E2E_ATTENDANCE_ATTENDEE_NAME={browser_attendee_name}\n")

# Confirmed free registrations enqueue exactly one ticket email job. The periodic
# worker may claim that job before this test observes it, so do not assert a
# transient `pending` state. Instead prove the durable contract: one outbox row,
# one successful first delivery, then exactly one successful admin resend.
notification_filter = urllib.parse.quote(
    f'registration="{registration["registrationId"]}"'
)
notification_list = request(
    "GET",
    f"/api/collections/notification_outbox/records?filter={notification_filter}",
    token=super_token,
)
assert notification_list["totalItems"] == 1
notification_job = notification_list["items"][0]
assert notification_job["kind"] == "ticket"
assert notification_job["status"] in {"pending", "sending", "sent"}
request(
    "POST",
    "/api/crons/registration-notification-outbox",
    token=super_token,
    expected=(204,),
)
for _ in range(30):
    notification_job = request(
        "GET",
        f"/api/collections/notification_outbox/records/{notification_job['id']}",
        token=super_token,
    )
    if notification_job["status"] == "sent":
        break
    time.sleep(0.1)
assert notification_job["status"] == "sent"
assert notification_job["attempts"] == 1
assert not notification_job["lastError"]

resend = request(
    "POST",
    f"/api/admin/registrations/{registration['registrationId']}/notifications/ticket/resend",
    token=admin_token,
    expected=(202,),
)
assert resend["success"] is True
request(
    "POST",
    "/api/crons/registration-notification-outbox",
    token=super_token,
    expected=(204,),
)
for _ in range(30):
    notification_job = request(
        "GET",
        f"/api/collections/notification_outbox/records/{notification_job['id']}",
        token=super_token,
    )
    if notification_job["status"] == "sent" and notification_job["attempts"] == 2:
        break
    time.sleep(0.1)
assert notification_job["status"] == "sent"
assert notification_job["attempts"] == 2
assert not notification_job["lastError"]
notification_list = request(
    "GET",
    f"/api/collections/notification_outbox/records?filter={notification_filter}",
    token=super_token,
)
assert notification_list["totalItems"] == 1

request("POST", f"/api/app/events/{event['id']}/register", {
    "formResponses": {"name": "Member Two", "email": second_user["email"]},
}, second_token, (400,))
updated_event = request("GET", f"/api/collections/events/records/{event['id']}")
assert updated_event["registeredCount"] == 1


# Phase 4 attendee lifecycle: offered waitlist seats reserve real capacity.
wait_owner = create_user("wait-owner", "user")
wait_one = create_user("wait-one", "user")
wait_two = create_user("wait-two", "user")
wait_three = create_user("wait-three", "user")
wait_owner_token = impersonate(super_token, wait_owner["id"])
wait_one_token = impersonate(super_token, wait_one["id"])
wait_two_token = impersonate(super_token, wait_two["id"])
wait_three_token = impersonate(super_token, wait_three["id"])
wait_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Capacity Waitlist {suffix}", "description": "reserved waitlist capacity",
    "date": start, "endDate": end, "venue": "CI Waitlist Lab", "price": 0,
    "society": society["id"], "status": "published", "registrationMode": "internal",
    "registrationOpen": True, "maxCapacity": 1, "registeredCount": 0,
    "waitlistEnabled": True, "waitlistOfferMinutes": 15,
    "allowSelfCancellation": True, "selfCancellationUntil": start,
    "checkInEnabled": True, "isDeleted": False,
}, super_token)
wait_owner_registration = request("POST", f"/api/app/events/{wait_event['id']}/register", {
    "formResponses": {"name": "Wait Owner", "email": wait_owner["email"]},
}, wait_owner_token)
assert wait_owner_registration["registrationStatus"] == "confirmed"
wait_one_join = request("POST", f"/api/app/events/{wait_event['id']}/waitlist/join", token=wait_one_token)
assert wait_one_join["joined"] is True and wait_one_join["state"]["status"] == "waiting"
assert wait_one_join["state"]["position"] == 1
wait_two_join = request("POST", f"/api/app/events/{wait_event['id']}/waitlist/join", token=wait_two_token)
assert wait_two_join["state"]["status"] == "waiting" and wait_two_join["state"]["position"] == 2
wait_cancel = request(
    "POST", f"/api/app/registrations/{wait_owner_registration['registrationId']}/cancel",
    {"reason": "CI release for waitlist"}, wait_owner_token,
)
assert wait_cancel["action"] == "cancelled"
wait_one_state = request("GET", f"/api/app/events/{wait_event['id']}/waitlist", token=wait_one_token)
assert wait_one_state["state"]["status"] == "offered"
assert wait_one_state["full"] is True and wait_one_state["occupied"] == 1
wait_event_after_offer = request("GET", f"/api/collections/events/records/{wait_event['id']}", token=super_token)
assert wait_event_after_offer["registeredCount"] == 0
assert wait_event_after_offer["waitlistReservedCount"] == 1
request("POST", f"/api/app/events/{wait_event['id']}/register", {
    "formResponses": {"name": "Wait Three", "email": wait_three["email"]},
}, wait_three_token, (400,))
wait_one_registration = request("POST", f"/api/app/events/{wait_event['id']}/register", {
    "formResponses": {"name": "Wait One", "email": wait_one["email"]},
}, wait_one_token)
assert wait_one_registration["registrationStatus"] == "confirmed"
wait_one_filter = urllib.parse.quote(f'event="{wait_event["id"]}" && user="{wait_one["id"]}"')
wait_one_row = request("GET", f"/api/collections/event_waitlist/records?filter={wait_one_filter}", token=super_token)["items"][0]
assert wait_one_row["status"] == "accepted"
wait_event_after_claim = request("GET", f"/api/collections/events/records/{wait_event['id']}", token=super_token)
assert wait_event_after_claim["registeredCount"] == 1
assert wait_event_after_claim["waitlistReservedCount"] == 0
wait_two_state = request("GET", f"/api/app/events/{wait_event['id']}/waitlist", token=wait_two_token)
assert wait_two_state["state"]["status"] == "waiting"
request(
    "POST", f"/api/app/registrations/{wait_one_registration['registrationId']}/cancel",
    {"reason": "CI release second seat"}, wait_one_token,
)
wait_two_offer = request("GET", f"/api/app/events/{wait_event['id']}/waitlist", token=wait_two_token)
assert wait_two_offer["state"]["status"] == "offered"
left_offer = request("POST", f"/api/app/events/{wait_event['id']}/waitlist/leave", token=wait_two_token)
assert left_offer["left"] is True
wait_event_after_leave = request("GET", f"/api/collections/events/records/{wait_event['id']}", token=super_token)
assert wait_event_after_leave["registeredCount"] == 0
assert wait_event_after_leave["waitlistReservedCount"] == 0

# Expired offers advance FIFO through the reconciliation cron.
expiry_owner = create_user("expiry-owner", "user")
expiry_one = create_user("expiry-one", "user")
expiry_two = create_user("expiry-two", "user")
expiry_owner_token = impersonate(super_token, expiry_owner["id"])
expiry_one_token = impersonate(super_token, expiry_one["id"])
expiry_two_token = impersonate(super_token, expiry_two["id"])
expiry_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Waitlist Expiry {suffix}", "description": "waitlist expiry",
    "date": start, "endDate": end, "venue": "CI Waitlist Lab", "price": 0,
    "society": society["id"], "status": "published", "registrationMode": "internal",
    "registrationOpen": True, "maxCapacity": 1, "registeredCount": 0,
    "waitlistEnabled": True, "waitlistOfferMinutes": 15,
    "allowSelfCancellation": True, "selfCancellationUntil": start,
    "checkInEnabled": True, "isDeleted": False,
}, super_token)
expiry_owner_reg = request("POST", f"/api/app/events/{expiry_event['id']}/register", {
    "formResponses": {"name": "Expiry Owner", "email": expiry_owner["email"]},
}, expiry_owner_token)
request("POST", f"/api/app/events/{expiry_event['id']}/waitlist/join", token=expiry_one_token)
request("POST", f"/api/app/events/{expiry_event['id']}/waitlist/join", token=expiry_two_token)
request("POST", f"/api/app/registrations/{expiry_owner_reg['registrationId']}/cancel", {
    "reason": "CI trigger expiry offer",
}, expiry_owner_token)
expiry_one_filter = urllib.parse.quote(f'event="{expiry_event["id"]}" && user="{expiry_one["id"]}"')
expiry_one_row = request("GET", f"/api/collections/event_waitlist/records?filter={expiry_one_filter}", token=super_token)["items"][0]
assert expiry_one_row["status"] == "offered"
expired_at = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)).isoformat().replace("+00:00", "Z")
patched_expiry = request("PATCH", f"/api/collections/event_waitlist/records/{expiry_one_row['id']}", {
    "offerExpiresAt": expired_at,
}, super_token)
assert patched_expiry["offerExpiresAt"], patched_expiry
request("POST", "/api/crons/attendee-lifecycle-reconcile", token=super_token, expected=(204,))
expiry_two_filter = urllib.parse.quote(f'event="{expiry_event["id"]}" && user="{expiry_two["id"]}"')
expiry_two_row = None
for _ in range(30):
    expiry_one_row = request("GET", f"/api/collections/event_waitlist/records/{expiry_one_row['id']}", token=super_token)
    expiry_two_row = request("GET", f"/api/collections/event_waitlist/records?filter={expiry_two_filter}", token=super_token)["items"][0]
    if expiry_one_row["status"] == "expired" and expiry_two_row["status"] == "offered":
        break
    time.sleep(0.1)
assert expiry_one_row["status"] == "expired", expiry_one_row
assert expiry_two_row and expiry_two_row["status"] == "offered", expiry_two_row
expiry_event_record = request("GET", f"/api/collections/events/records/{expiry_event['id']}", token=super_token)
assert expiry_event_record["waitlistReservedCount"] == 1

# Paid self-cancellation creates attendee intent only. Finance decision and the
# existing refund command remain separate from money movement/provider truth.
refund_user = create_user("refund-attendee", "user")
refund_user_token = impersonate(super_token, refund_user["id"])
refund_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Refund Request {suffix}", "description": "attendee refund request",
    "date": start, "endDate": end, "venue": "CI Finance Lab", "price": 125,
    "society": society["id"], "status": "published", "registrationMode": "internal",
    "registrationOpen": True, "maxCapacity": 5, "registeredCount": 0,
    "allowSelfCancellation": True, "selfCancellationUntil": start,
    "refundRequestUntil": start, "refundPolicy": "CI refunds require finance review.",
    "checkInEnabled": True, "isDeleted": False,
}, super_token)
refund_registration = request("POST", f"/api/admin/events/{refund_event['id']}/registrations/manual", {
    "name": "Refund Attendee", "email": refund_user["email"], "userId": refund_user["id"],
    "paymentMode": "paid", "paymentMethod": "upi", "paymentReference": "CI-REFUND-PAID",
    "note": "CI captured manual payment for refund request",
}, admin_token)["registration"]
assert refund_registration["registrationStatus"] == "confirmed"
assert refund_registration["paymentStatus"] == "paid"
refund_request = request(
    "POST", f"/api/app/registrations/{refund_registration['id']}/cancel",
    {"reason": "CI attendee requests refund"}, refund_user_token, expected=(202,),
)
assert refund_request["action"] == "refund_requested"
assert refund_request["request"]["status"] == "open"
refund_request_id = refund_request["request"]["id"]
refund_record = request("GET", f"/api/collections/registrations/records/{refund_registration['id']}", token=super_token)
assert refund_record["registrationStatus"] == "confirmed"
assert refund_record["paymentStatus"] == "paid"
refund_my_events = request("GET", "/api/app/my-events", token=refund_user_token)
refund_item = next(item for item in refund_my_events["items"] if item["event"]["id"] == refund_event["id"])
assert refund_item["cancellation"]["request"]["status"] == "open"
assert refund_item["cancellation"]["mode"] == "refund_request"
refund_ops = request("GET", f"/api/admin/events/{refund_event['id']}/operations", token=admin_token)
assert any(row["request"]["id"] == refund_request_id and row["request"]["status"] == "open" for row in refund_ops["cancellationRequests"])
request(
    "POST", f"/api/admin/cancellation-requests/{refund_request_id}/decision",
    {"action": "accept", "note": "CI finance accepts refund request"}, refund_user_token, expected=(403,),
)
refund_decision = request(
    "POST", f"/api/admin/cancellation-requests/{refund_request_id}/decision",
    {"action": "accept", "note": "CI finance accepts refund request"}, admin_token,
)
assert refund_decision["request"]["status"] == "accepted"
refund_record = request("GET", f"/api/collections/registrations/records/{refund_registration['id']}", token=super_token)
assert refund_record["registrationStatus"] == "confirmed" and refund_record["paymentStatus"] == "paid"
refund_done = request(
    "POST", f"/api/admin/registrations/{refund_registration['id']}/command",
    {"action": "mark-refunded", "reference": "CI-REFUND-1", "note": "CI refund completed externally"},
    admin_token,
)["registration"]
assert refund_done["registrationStatus"] == "cancelled"
assert refund_done["paymentStatus"] == "refunded"
refund_request_record = request("GET", f"/api/collections/registration_cancellation_requests/records/{refund_request_id}", token=super_token)
assert refund_request_record["status"] == "resolved" and refund_request_record["resolvedAt"]
assert refund_request_record["activeKey"] == ""

# Dedicated untouched Browser E2E fixture: attendee owns a live reserved offer.
browser_wait_owner = create_user("browser-wait-owner", "user")
browser_wait_user = create_user("browser-wait-attendee", "user")
browser_wait_owner_token = impersonate(super_token, browser_wait_owner["id"])
browser_wait_token = impersonate(super_token, browser_wait_user["id"])
browser_wait_event = request("POST", "/api/collections/events/records", {
    "title": f"E2E Reserved Waitlist Seat {suffix}", "description": "browser waitlist fixture",
    "date": start, "endDate": end, "venue": "E2E Waitlist Lab", "price": 0,
    "society": society["id"], "status": "published", "registrationMode": "internal",
    "registrationOpen": True, "maxCapacity": 1, "registeredCount": 0,
    "waitlistEnabled": True, "waitlistOfferMinutes": 360,
    "allowSelfCancellation": True, "selfCancellationUntil": start,
    "checkInEnabled": True, "isDeleted": False,
}, super_token)
browser_wait_owner_reg = request("POST", f"/api/app/events/{browser_wait_event['id']}/register", {
    "formResponses": {"name": "Browser Wait Owner", "email": browser_wait_owner["email"]},
}, browser_wait_owner_token)
request("POST", f"/api/app/events/{browser_wait_event['id']}/waitlist/join", token=browser_wait_token)
request("POST", f"/api/app/registrations/{browser_wait_owner_reg['registrationId']}/cancel", {
    "reason": "E2E release reserved seat",
}, browser_wait_owner_token)
browser_wait_state = request("GET", f"/api/app/events/{browser_wait_event['id']}/waitlist", token=browser_wait_token)
assert browser_wait_state["state"]["status"] == "offered"

# Dedicated untouched Browser E2E fixture: paid attendee can submit a request.
browser_refund_user = create_user("browser-refund-attendee", "user")
browser_refund_token = impersonate(super_token, browser_refund_user["id"])
browser_refund_event = request("POST", "/api/collections/events/records", {
    "title": f"E2E Paid Cancellation Request {suffix}", "description": "browser refund fixture",
    "date": start, "endDate": end, "venue": "E2E Finance Lab", "price": 95,
    "society": society["id"], "status": "published", "registrationMode": "internal",
    "registrationOpen": True, "maxCapacity": 5, "registeredCount": 0,
    "allowSelfCancellation": True, "selfCancellationUntil": start,
    "refundRequestUntil": start, "refundPolicy": "Requests are reviewed before any refund is recorded.",
    "checkInEnabled": True, "isDeleted": False,
}, super_token)
browser_refund_registration = request("POST", f"/api/admin/events/{browser_refund_event['id']}/registrations/manual", {
    "name": "Browser Refund Attendee", "email": browser_refund_user["email"], "userId": browser_refund_user["id"],
    "paymentMode": "paid", "paymentMethod": "upi", "paymentReference": "E2E-PAID",
    "note": "E2E paid attendee fixture",
}, admin_token)["registration"]
assert browser_refund_registration["paymentStatus"] == "paid"
if github_env := os.environ.get("GITHUB_ENV"):
    with open(github_env, "a", encoding="utf-8") as env_file:
        env_file.write(f"E2E_WAITLIST_TOKEN={browser_wait_token}\n")
        env_file.write(f"E2E_WAITLIST_EVENT_ID={browser_wait_event['id']}\n")
        env_file.write(f"E2E_WAITLIST_EVENT_TITLE={browser_wait_event['title']}\n")
        env_file.write(f"E2E_REFUND_TOKEN={browser_refund_token}\n")
        env_file.write(f"E2E_REFUND_EVENT_TITLE={browser_refund_event['title']}\n")
        env_file.write(f"E2E_REFUND_REGISTRATION_ID={browser_refund_registration['id']}\n")

# A pending paid registration can be confirmed manually only through the
# dedicated admin command. The transition is atomic, auditable, idempotent, and
# queues both the ticket and receipt emails. Direct financial PATCHes stay
# blocked even for application admins.
manual_payment_user = create_user("manual-payer", "user")
manual_payment_token = impersonate(super_token, manual_payment_user["id"])
manual_paid_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Manual Payment Event {suffix}", "description": "manual payment confirmation",
    "date": start, "endDate": end, "venue": "CI Lab", "price": 75,
    "society": society["id"], "status": "published",
    "registeredCount": 0, "checkedInCount": 0, "registrationOpen": True,
    "checkInEnabled": True, "isDeleted": False,
    "formTemplate": [
        {"id": "name", "name": "name", "label": "Name", "required": True},
        {"id": "email", "name": "email", "label": "Email", "required": True},
    ],
}, super_token)
manual_registration = request("POST", f"/api/admin/events/{manual_paid_event['id']}/registrations/manual", {
    "name": "Manual Payer",
    "email": manual_payment_user["email"],
    "userId": manual_payment_user["id"],
    "paymentMode": "pending",
    "note": "CI fixture awaiting manual payment confirmation",
}, admin_token)["registration"]
manual_registration_id = manual_registration["id"]
assert manual_registration["registrationStatus"] == "pending"
assert manual_registration["paymentStatus"] == "pending"
request(
    "PATCH",
    f"/api/collections/registrations/records/{manual_registration_id}",
    {"paymentStatus": "paid"},
    admin_token,
    (400,),
)
request("POST", f"/api/admin/registrations/{manual_registration_id}/command", {"action": "confirm-payment"}, manual_payment_token, (403,))
request("POST", f"/api/admin/registrations/{manual_registration_id}/command", {"action": "confirm-payment"}, chair_token, (403,))
manual_confirmed = request(
    "POST", f"/api/admin/registrations/{manual_registration_id}/command",
    {"action": "confirm-payment", "reference": "CI-OFFLINE-1", "method": "upi", "note": "CI manual confirmation"}, admin_token
)["registration"]
assert manual_confirmed["registrationStatus"] == "confirmed"
assert manual_confirmed["paymentStatus"] == "paid"
assert manual_confirmed["ticketId"].startswith("TKT-")
manual_record = request(
    "GET",
    f"/api/collections/registrations/records/{manual_registration_id}",
    token=super_token,
)
manual_audit = manual_record["paymentData"]["manualConfirmation"]
assert manual_record["registrationStatus"] == "confirmed"
assert manual_record["paymentStatus"] == "paid"
assert manual_audit["confirmedBy"] == admin["id"]
assert manual_audit["source"] == "admin"
manual_notification_filter = urllib.parse.quote(f'registration="{manual_registration_id}"')
manual_notifications = request(
    "GET",
    f"/api/collections/notification_outbox/records?filter={manual_notification_filter}",
    token=super_token,
)
assert manual_notifications["totalItems"] == 2
assert {row["kind"] for row in manual_notifications["items"]} == {"ticket", "receipt"}
manual_replay = request("POST", f"/api/admin/registrations/{manual_registration_id}/command", {"action": "confirm-payment"}, admin_token)["registration"]
assert manual_replay["ticketId"] == manual_confirmed["ticketId"]
manual_payment_rows = request(
    "GET", "/api/collections/payments/records?filter=" + urllib.parse.quote(f'registration="{manual_registration_id}"'), token=super_token
)
assert manual_payment_rows["totalItems"] == 1
assert manual_payment_rows["items"][0]["provider"] == "manual"
assert manual_payment_rows["items"][0]["status"] == "captured"

# Event operations are explicit admin commands: walk-ins, finance corrections,
# restores, check-in reversals and refunds are auditable and recoverable.
ops_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Event Operations {suffix}", "description": "admin event operations",
    "date": start, "endDate": end, "venue": "CI Ops Lab", "price": 120,
    "society": society["id"], "status": "published",
    "maxCapacity": 3, "registeredCount": 0, "checkedInCount": 0,
    "registrationOpen": True, "checkInEnabled": True, "isDeleted": False,
}, admin_token)
ops_manual = request("POST", f"/api/admin/events/{ops_event['id']}/registrations/manual", {
    "name": "Walk In Student", "email": f"walkin-{suffix}@example.test",
    "phone": "9999999999", "paymentMode": "paid",
    "paymentReference": f"UTR-{suffix}", "note": "Receipt verified at registration desk",
}, admin_token)["registration"]
assert ops_manual["registrationSource"] == "admin"
assert ops_manual["registrationStatus"] == "confirmed"
assert ops_manual["paymentStatus"] == "paid" and ops_manual["amount"] == 120
assert ops_manual["user"] == "" and ops_manual["ticketId"].startswith("TKT-")
ops_summary = request("GET", f"/api/admin/events/{ops_event['id']}/operations", token=admin_token)
assert ops_summary["summary"]["manualPaidAmount"] == 120
assert ops_summary["summary"]["adminCreatedCount"] == 1
assert any(row["action"] == "registration.manual-create" for row in ops_summary["audit"])
ops_admin_row = next(row for row in ops_summary["recent"] if row["id"] == ops_manual["id"])
assert {"paymentStatus", "amount", "collectedAmount", "refundedAmount", "paymentMethod",
        "provider", "providerStatus", "manualReview", "manualConfirmation"}.issubset(ops_admin_row)
assert {"formTemplate", "financeApprovalStatus"}.issubset(ops_summary["event"])
assert "paymentProvider" not in ops_summary["event"]
assert all(key in ops_summary for key in (
    "attention", "coupons", "cancellationRequests", "waitlist", "audit", "attendance", "financeDisclaimer"
))
audit_filter = urllib.parse.quote(
    f'action="registration.manual-create" && entityId="{ops_manual["id"]}"'
)
audit_rows = request(
    "GET", f"/api/collections/admin_audit_log/records?filter={audit_filter}", token=super_token
)
assert audit_rows["totalItems"] == 1
assert audit_rows["items"][0]["entityType"] == "registration"
assert audit_rows["items"][0]["outcome"] == "success"

ops_cancelled = request("POST", f"/api/admin/registrations/{ops_manual['id']}/command", {
    "action": "cancel",
}, admin_token)["registration"]
assert ops_cancelled["registrationStatus"] == "cancelled" and ops_cancelled["paymentStatus"] == "paid"
ops_summary = request("GET", f"/api/admin/events/{ops_event['id']}/operations", token=admin_token)
assert ops_summary["summary"]["cancelledPaidCount"] == 1
assert any(row["id"] == ops_manual["id"] for row in ops_summary["attention"])

ops_restored = request("POST", f"/api/admin/registrations/{ops_manual['id']}/command", {
    "action": "restore", "note": "Payment is valid; restore seat",
}, admin_token)["registration"]
assert ops_restored["registrationStatus"] == "confirmed"
ops_checked = request("POST", f"/api/admin/registrations/{ops_manual['id']}/command", {
    "action": "check-in",
}, admin_token)["registration"]
assert ops_checked["checkedIn"] is True
ops_unchecked = request("POST", f"/api/admin/registrations/{ops_manual['id']}/command", {
    "action": "undo-check-in",
}, admin_token)["registration"]
assert ops_unchecked["checkedIn"] is False
ops_refunded = request("POST", f"/api/admin/registrations/{ops_manual['id']}/command", {
    "action": "mark-refunded", "note": "Refund sent after cancellation",
    "reference": f"REF-{suffix}",
}, admin_token)["registration"]
assert ops_refunded["registrationStatus"] == "cancelled"
assert ops_refunded["paymentStatus"] == "refunded"

ops_pending = request("POST", f"/api/admin/events/{ops_event['id']}/registrations/manual", {
    "name": "Pending Walk In", "email": f"pending-walkin-{suffix}@example.test",
    "paymentMode": "pending", "note": "Awaiting desk verification",
}, admin_token)["registration"]
assert ops_pending["registrationStatus"] == "pending" and ops_pending["paymentStatus"] == "pending"
ops_confirmed = request("POST", f"/api/admin/registrations/{ops_pending['id']}/command", {
    "action": "confirm-payment", "reference": f"UTR2-{suffix}",
    "note": "Receipt checked at help desk",
}, admin_token)["registration"]
assert ops_confirmed["registrationStatus"] == "confirmed" and ops_confirmed["manualConfirmation"]
ops_reopened = request("POST", f"/api/admin/registrations/{ops_pending['id']}/command", {
    "action": "reopen-manual-payment", "note": "Receipt belonged to another attendee",
}, admin_token)["registration"]
assert ops_reopened["registrationStatus"] == "pending"
assert ops_reopened["paymentStatus"] == "pending" and ops_reopened["ticketId"] == ""
ops_recompute = request("POST", f"/api/admin/events/{ops_event['id']}/recompute", {}, admin_token)
assert ops_recompute["success"] is True
ops_payment_desk = request("GET", "/api/admin/payments/summary", token=admin_token)
finance = ops_payment_desk["summary"]
assert finance["paymentCount"] >= 1
assert finance["grossCollectedAmount"] >= finance["refundedAmount"] >= 0
assert abs(finance["netCollectedAmount"] - (finance["grossCollectedAmount"] - finance["refundedAmount"])) < 0.001
assert finance["manualCount"] >= 1
assert "attentionCount" in finance and "queuedRefundCount" not in finance and "failedRefundCount" not in finance
payment_rows = request("GET", "/api/collections/payments/records?perPage=500", token=super_token)["items"]
assert finance["paymentCount"] == len(payment_rows)
for provider, count_key, amount_key in (
    ("paygate", "paygateCount", "paygateCollectedAmount"),
    ("manual", "manualCount", "manualCollectedAmount"),
):
    provider_rows = [row for row in payment_rows if (row.get("provider") or "unknown") == provider]
    assert finance[count_key] == len(provider_rows)
    expected_amount = sum(max(0, int(row.get("collectedPaise") or 0)) for row in provider_rows) / 100
    assert abs(finance[amount_key] - expected_amount) < 0.001
historical_rows = [row for row in payment_rows if (row.get("provider") or "unknown") not in {"paygate", "manual"}]
assert finance["historicalCount"] == len(historical_rows)
assert abs(finance["historicalCollectedAmount"] - sum(max(0, int(row.get("collectedPaise") or 0)) for row in historical_rows) / 100) < 0.001
assert finance["attentionCount"] == sum(bool(row.get("manualReview")) or row.get("status") == "partially_refunded" for row in payment_rows)

request("GET", "/api/admin/data-health", token=user_token, expected=(403,))
data_health = request("GET", "/api/admin/data-health", token=admin_token)
assert isinstance(data_health["issues"], list) and data_health["checkedAt"]
assert data_health["counts"]["events"] >= 1
assert data_health["counts"]["registrations"] >= 1
assert data_health["counts"]["payments"] >= 1
allowed_health_issue_keys = {"id", "severity", "category", "title", "detail", "href"}
assert all(set(issue).issubset(allowed_health_issue_keys) for issue in data_health["issues"])
assert all(issue["severity"] in {"critical", "warning"} for issue in data_health["issues"])

request("PATCH", f"/api/collections/events/records/{ops_event['id']}", {
    "status": "cancelled",
}, admin_token, expected=(400,))
ops_cancel = request("POST", f"/api/admin/events/{ops_event['id']}/cancel", {
    "reason": "CI validates event cancellation cascade",
}, admin_token)
assert ops_cancel["releasedPending"] >= 1
ops_cancelled_event = request("GET", f"/api/collections/events/records/{ops_event['id']}", token=admin_token)
assert ops_cancelled_event["status"] == "cancelled"
ops_pending_after_cancel = request("GET", f"/api/collections/registrations/records/{ops_pending['id']}", token=super_token)
assert ops_pending_after_cancel["registrationStatus"] == "cancelled"
assert ops_pending_after_cancel["paymentStatus"] == "failed"

# Anonymous ticket lookup never exposes a stable account/registration identifier.
ticket_path = "/api/tickets/lookup?ticketId=" + urllib.parse.quote(registration["ticketId"])
anonymous_ticket = request("GET", ticket_path)
assert anonymous_ticket["found"] is True
assert "user" not in anonymous_ticket and "registrationId" not in anonymous_ticket
assert anonymous_ticket["event"]["requirements"] == ["Bring laptop charger", "College ID card required"]
assert anonymous_ticket["event"]["attendeeNote"] == "Report at the registration desk 15 minutes early."
assert anonymous_ticket["event"]["externalLink"] == "https://example.test/event-guide"
assert "contactEmail" not in anonymous_ticket["event"] and "contactPhone" not in anonymous_ticket["event"]
assert anonymous_ticket["isOwner"] is False
assert "meet.example.test" not in json.dumps(anonymous_ticket)
assert "chat.whatsapp.com/ci-private-group" not in json.dumps(anonymous_ticket)
assert "joinInstructions" not in json.dumps(anonymous_ticket) and "whatsapp" not in json.dumps(anonymous_ticket).lower()
owner_ticket = request("GET", ticket_path, token=user_token)
assert owner_ticket["registrationId"] == registration["registrationId"]
assert owner_ticket["isOwner"] is True
assert owner_ticket["registration"]["id"] == registration["registrationId"]
assert set(owner_ticket["registration"].keys()) == {
    "id", "userName", "userEmail", "userPhone", "registrationStatus",
    "paymentStatus", "registrationDate", "amount",
}
request("GET", f"/api/collections/registrations/records/{registration['registrationId']}", token=user_token, expected=(403, 404))
assert "chat.whatsapp.com/ci-private-group" not in json.dumps(owner_ticket)

# Chairs may perform the intended operational state changes, but cannot edit attendee/audit fields.
request("PATCH", f"/api/collections/registrations/records/{registration['registrationId']}", {
    "userEmail": "forged@example.test",
}, chair_token, (400,))
request("PATCH", f"/api/collections/registrations/records/{registration['registrationId']}", {
    "registrationStatus": "pending",
}, chair_token, (400,))
request("DELETE", f"/api/collections/registrations/records/{registration['registrationId']}", token=admin_token, expected=(403,))

checked = request("PATCH", f"/api/collections/registrations/records/{registration['registrationId']}", {
    "checkedIn": True,
}, chair_token)
assert checked["checkedIn"] is True and checked["checkedInAt"]
updated_event = request("GET", f"/api/collections/events/records/{event['id']}")
assert updated_event["checkedInCount"] == 1

# Public execom records hide private contact fields at the PocketBase boundary.
execom = request("POST", "/api/collections/execom/records", {
    "name": "Portfolio Smoke Member", "position": "Tester", "order": 999,
    "section": "Portfolio Test", "sectionId": "portfolio-test",
    "portfolio": "https://example.com/execom-portfolio",
    "email": f"private-{suffix}@example.test", "phone": "9999999999",
}, super_token)
public_execom = request("GET", f"/api/collections/execom/records/{execom['id']}")
assert public_execom["portfolio"] == "https://example.com/execom-portfolio"
assert not public_execom.get("email") and not public_execom.get("phone")
private_execom = request("GET", f"/api/collections/execom/records/{execom['id']}", token=super_token)
assert private_execom["email"] == execom["email"] and private_execom["phone"] == "9999999999"

# Role changes use the dedicated admin command.
role_change = request("POST", f"/api/app/admin/users/{second_user['id']}/role", {"role": "content"}, admin_token)
assert role_change["user"]["role"] == "content"

print(json.dumps({"ok": True, "eventSlug": event["slug"], "registrationId": registration["registrationId"]}))
