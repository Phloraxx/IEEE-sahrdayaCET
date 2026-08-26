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
topup_cron = next((cron for cron in crons if cron.get("id") == "fifa-daily-topup"), None)
assert topup_cron and topup_cron.get("expression") == "30 3 * * *"
suffix = str(int(time.time() * 1000))
fixture_password = "FixturePass-2026!"


def create_user(label, role="user", balance=0):
    return request("POST", "/api/collections/users/records", {
        "email": f"{label}-{suffix}@example.test",
        "verified": True,
        "name": label.title(),
        "role": role,
        "balance": balance,
        "password": fixture_password,
        "passwordConfirm": fixture_password,
    }, super_token)


admin = create_user("admin", "admin")
chair = create_user("chair", "chair")
user = create_user("member", "user", 1000)
second_user = create_user("member-two", "user", 1000)
admin_token = impersonate(super_token, admin["id"])
if github_env := os.environ.get("GITHUB_ENV"):
    with open(github_env, "a", encoding="utf-8") as env_file:
        env_file.write(f"E2E_ADMIN_TOKEN={admin_token}\n")
chair_token = impersonate(super_token, chair["id"])
user_token = impersonate(super_token, user["id"])
second_token = impersonate(super_token, second_user["id"])

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

# The daily FIFA top-up cron is executable, transactional, and idempotent per IST day.
settings_page = request("GET", "/api/collections/fifa_settings/records?page=1&perPage=1", token=super_token)
if not settings_page["items"]:
    cron_settings = request("POST", "/api/collections/fifa_settings/records", {
        "event_name": "WC Predict '26", "starting_balance": 1000, "max_bet_percent": 25,
        "daily_topup_threshold": 100, "daily_topup_target": 200, "pool_house_cut_percent": 0,
        "raffle_tickets_base": 50, "raffle_tickets_decay": 2, "raffle_active_participant_min_bets": 5,
        "prize": "", "registration_open": True,
    }, super_token)
else:
    cron_settings = settings_page["items"][0]
request("PATCH", f"/api/collections/fifa_settings/records/{cron_settings['id']}", {
    "daily_topup_threshold": 100,
    "daily_topup_target": 200,
}, super_token)
# User creation intentionally applies the starting grant, so explicitly lower one
# fixture after creation to exercise the daily top-up path.
request("PATCH", f"/api/collections/users/records/{admin['id']}", {"balance": 0}, super_token)
request("POST", "/api/crons/fifa-daily-topup", token=super_token, expected=(204,))
admin_after_topup = None
for _ in range(30):
    admin_after_topup = request("GET", f"/api/collections/users/records/{admin['id']}", token=super_token)
    if admin_after_topup["balance"] == 200:
        break
    time.sleep(0.1)
assert admin_after_topup and admin_after_topup["balance"] == 200
topup_ledger = request(
    "GET",
    f"/api/collections/fifa_transactions/records?filter=" + urllib.parse.quote(f'user="{admin["id"]}" && type="daily_topup"'),
    token=super_token,
)
assert topup_ledger["totalItems"] == 1 and topup_ledger["items"][0]["amount"] == 200
request("POST", "/api/crons/fifa-daily-topup", token=super_token, expected=(204,))
time.sleep(0.5)
topup_ledger_again = request(
    "GET",
    f"/api/collections/fifa_transactions/records?filter=" + urllib.parse.quote(f'user="{admin["id"]}" && type="daily_topup"'),
    token=super_token,
)
assert topup_ledger_again["totalItems"] == 1

society = request("POST", "/api/collections/societies/records", {
    "name": f"CI Society {suffix}", "slug": f"ci-society-{suffix}", "bio": "CI smoke",
    "isHidden": False, "chairs": [chair["id"]],
}, super_token)
other_society = request("POST", "/api/collections/societies/records", {
    "name": f"Other Society {suffix}", "slug": f"other-society-{suffix}", "bio": "CI smoke",
    "isHidden": False, "chairs": [],
}, super_token)

chair_second_society = request("POST", "/api/collections/societies/records", {
    "name": f"Chair Second Society {suffix}", "slug": f"chair-second-{suffix}", "bio": "CI smoke",
    "isHidden": False, "chairs": [chair["id"]],
}, super_token)

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
    "date": start, "endDate": end, "venue": "CI Lab", "price": 0,
    "society": society["id"], "status": "published", "maxCapacity": 1,
    "registeredCount": 0, "checkedInCount": 0, "registrationOpen": True,
    "checkInEnabled": True, "isDeleted": False,
    "formTemplate": [
        {"id": "name", "name": "name", "label": "Name", "required": True},
        {"id": "email", "name": "email", "label": "Email", "required": True},
    ],
}, super_token)
assert event["slug"].startswith("ci-smoke-event-")
if github_env := os.environ.get("GITHUB_ENV"):
    with open(github_env, "a", encoding="utf-8") as env_file:
        env_file.write(f"E2E_EVENT_ID={event['id']}\n")

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
save10_record = request("GET", f"/api/collections/registrations/records/{save10_registration['registrationId']}", token=admin_token)
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

# Registration command reserves exactly one seat. Replaying the same user's
# command is idempotent and returns the original record instead of consuming a
# second seat; another user is still rejected by capacity.
registration = request("POST", f"/api/app/events/{event['id']}/register", {
    "formResponses": {"name": "Member", "email": user["email"], "phone": "123"},
}, user_token)
assert registration["registrationStatus"] == "confirmed" and registration["ticketId"]
replayed_registration = request("POST", f"/api/app/events/{event['id']}/register", {
    "formResponses": {"name": "Member", "email": user["email"]},
}, user_token, (200,))
assert replayed_registration.get("reused") is True
assert replayed_registration["registrationId"] == registration["registrationId"]
assert replayed_registration["ticketId"] == registration["ticketId"]

# Confirmed free registrations enqueue exactly one ticket email job. With SMTP
# intentionally absent in clean-room CI, the worker must fail durably into the
# outbox instead of dropping the message, and an admin resend must requeue it.
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
assert notification_job["kind"] == "ticket" and notification_job["status"] == "pending"
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
    if notification_job["status"] == "failed":
        break
    time.sleep(0.1)
assert notification_job["status"] == "failed"
assert notification_job["attempts"] == 1
assert "SMTP delivery is not configured" in notification_job["lastError"]
resend = request(
    "POST",
    f"/api/admin/registrations/{registration['registrationId']}/notifications/ticket/resend",
    token=admin_token,
    expected=(202,),
)
assert resend["success"] is True and resend["status"] == "pending"
notification_job = request(
    "GET",
    f"/api/collections/notification_outbox/records/{notification_job['id']}",
    token=super_token,
)
assert notification_job["status"] == "pending"

request("POST", f"/api/app/events/{event['id']}/register", {
    "formResponses": {"name": "Member Two", "email": second_user["email"]},
}, second_token, (400,))
updated_event = request("GET", f"/api/collections/events/records/{event['id']}")
assert updated_event["registeredCount"] == 1

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
    token=admin_token,
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
assert "queuedRefundCount" in finance and "failedRefundCount" in finance and "attentionCount" in finance
request("PATCH", f"/api/collections/events/records/{ops_event['id']}", {
    "status": "cancelled",
}, admin_token, expected=(400,))
ops_cancel = request("POST", f"/api/admin/events/{ops_event['id']}/cancel", {
    "reason": "CI validates event cancellation cascade",
}, admin_token)
assert ops_cancel["releasedPending"] >= 1
ops_cancelled_event = request("GET", f"/api/collections/events/records/{ops_event['id']}", token=admin_token)
assert ops_cancelled_event["status"] == "cancelled"
ops_pending_after_cancel = request("GET", f"/api/collections/registrations/records/{ops_pending['id']}", token=admin_token)
assert ops_pending_after_cancel["registrationStatus"] == "cancelled"
assert ops_pending_after_cancel["paymentStatus"] == "failed"

# Anonymous ticket lookup never exposes a stable account/registration identifier.
ticket_path = "/api/tickets/lookup?ticketId=" + urllib.parse.quote(registration["ticketId"])
anonymous_ticket = request("GET", ticket_path)
assert anonymous_ticket["found"] is True
assert "user" not in anonymous_ticket and "registrationId" not in anonymous_ticket
owner_ticket = request("GET", ticket_path, token=user_token)
assert owner_ticket["registrationId"] == registration["registrationId"]

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

# Retired social-feed data is preserved but no longer exposed.
request("GET", "/api/collections/fifa_feed_events/records", expected=(403,))
request("GET", "/api/fifa/feed", expected=(404,))

# Role changes use the dedicated admin command.
role_change = request("POST", f"/api/app/admin/users/{second_user['id']}/role", {"role": "content"}, admin_token)
assert role_change["user"]["role"] == "content"

# FIFA bet placement is one atomic balance/ledger/bet/pool transaction.
kickoff = (now + dt.timedelta(hours=5)).isoformat().replace("+00:00", "Z")
match = request("POST", "/api/collections/fifa_matches/records", {
    "team_home": "Alpha", "team_away": "Beta", "stage": "group",
    "kickoff_at": kickoff, "betting_locks_at": kickoff, "status": "upcoming", "settled": False,
}, super_token)
market = request("POST", "/api/collections/fifa_bet_markets/records", {
    "match": match["id"], "market_type": "match_winner", "mode": "pool",
    "options": ["home", "away"], "is_open": True, "void": False,
    "pool_total": 0, "pool_by_option": {},
}, super_token)
bet = request("POST", "/api/fifa/bets", {
    "match": match["id"], "market": market["id"], "selection": "home", "stake": 100,
}, user_token)
assert bet["balance"] == 900
request("POST", "/api/fifa/bets", {
    "match": match["id"], "market": market["id"], "selection": "away", "stake": 300,
}, user_token, (400,))

# Raw admin REST cannot rewrite economy/result history after bets exist.
request("PATCH", f"/api/collections/fifa_bet_markets/records/{market['id']}", {"pool_total": 9999}, admin_token, (400,))
request("PATCH", f"/api/collections/fifa_bet_markets/records/{market['id']}", {"options": ["home", "away", "draw"]}, admin_token, (400,))
request("DELETE", f"/api/collections/fifa_bet_markets/records/{market['id']}", token=admin_token, expected=(400,))
request("PATCH", f"/api/collections/fifa_matches/records/{match['id']}", {"settled": True}, admin_token, (400,))
request("PATCH", f"/api/collections/fifa_matches/records/{match['id']}", {"result_winner": "away"}, admin_token, (400,))
request("DELETE", f"/api/collections/fifa_matches/records/{match['id']}", token=admin_token, expected=(400,))

settlement = request("POST", "/api/fifa/settle", {
    "matchId": match["id"], "result_winner": "home",
    "result_home_goals": 2, "result_away_goals": 1,
    "result_scorers": [], "result_yellow_cards": 0, "result_red_cards": 0,
}, admin_token)
assert settlement["success"] is True
settled_bet = request("GET", f"/api/collections/fifa_bets/records/{bet['bet']['id']}", token=user_token)
assert settled_bet["status"] == "won" and settled_bet["payout"] == 100
settled_user = request("GET", f"/api/collections/users/records/{user['id']}", token=user_token)
assert settled_user["balance"] == 1000
again = request("POST", "/api/fifa/settle", {
    "matchId": match["id"], "result_winner": "home", "result_home_goals": 2, "result_away_goals": 1,
}, admin_token)
assert again.get("message") == "Already settled"

# Financial voids reject direct mutation and refund once through the command.
match2 = request("POST", "/api/collections/fifa_matches/records", {
    "team_home": "Gamma", "team_away": "Delta", "stage": "group",
    "kickoff_at": kickoff, "betting_locks_at": kickoff, "status": "upcoming", "settled": False,
}, super_token)
market2 = request("POST", "/api/collections/fifa_bet_markets/records", {
    "match": match2["id"], "market_type": "match_winner", "mode": "pool",
    "options": ["home", "away"], "is_open": True, "void": False,
    "pool_total": 0, "pool_by_option": {},
}, super_token)
bet2 = request("POST", "/api/fifa/bets", {
    "match": match2["id"], "market": market2["id"], "selection": "away", "stake": 100,
}, user_token)
request("PATCH", f"/api/collections/fifa_bet_markets/records/{market2['id']}", {"void": True}, admin_token, (400,))
voided = request("POST", f"/api/fifa/markets/{market2['id']}/void", {}, admin_token)
assert voided["refundedCount"] == 1
assert request("GET", f"/api/collections/users/records/{user['id']}", token=user_token)["balance"] == 1000
assert request("GET", f"/api/collections/fifa_bets/records/{bet2['bet']['id']}", token=user_token)["status"] == "void"
assert request("POST", f"/api/fifa/markets/{market2['id']}/void", {}, admin_token).get("alreadyVoid") is True

# Raffle response contains the same auditable snapshot persisted in settings.
settings = request("GET", "/api/collections/fifa_settings/records?page=1&perPage=1", token=admin_token)["items"][0]
request("PATCH", f"/api/collections/fifa_settings/records/{settings['id']}", {
    "raffle_seed": "forged-audit-value",
}, admin_token, (400,))
request("PATCH", f"/api/collections/fifa_settings/records/{settings['id']}", {
    "raffle_active_participant_min_bets": 0,
}, admin_token)
leaderboard_zero_min = request("GET", "/api/fifa/leaderboard")
assert leaderboard_zero_min["settings"]["min_bets"] == 0
normal_settings = request("PATCH", f"/api/collections/fifa_settings/records/{settings['id']}", {
    "prize": "CI prize",
    "registration_open": False,
    "raffle_active_participant_min_bets": 1,
}, admin_token)
assert normal_settings["prize"] == "CI prize"
raffle = request("POST", "/api/fifa/raffle", {}, admin_token)
assert raffle["success"] is True
assert raffle["entries_snapshot"]["total_tickets"] == raffle["totalTickets"]
assert raffle["winner"]["bets_count"] >= 1
assert any(entry["user_id"] == raffle["winner"]["user_id"] for entry in raffle["entries_snapshot"]["entries"])
settings_after = request("GET", f"/api/collections/fifa_settings/records/{settings['id']}", token=super_token)
assert settings_after["raffle_seed"] == raffle["seed"]
assert settings_after["raffle_entries_snapshot"]["winning_pick"] == raffle["entries_snapshot"]["winning_pick"]
second_raffle = request("POST", "/api/fifa/raffle", {}, admin_token, (400,))
assert "already drawn" in second_raffle.get("error", "").lower()

print(json.dumps({"ok": True, "eventSlug": event["slug"], "registrationId": registration["registrationId"], "raffleWinner": raffle["winner"]["user_id"]}))
