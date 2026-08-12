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
WEBHOOK_SECRET = os.environ.get("PAYMENT_WEBHOOK_SECRET", "CI-Payment-Webhook-2026!")


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
cron_settings = request("GET", "/api/collections/fifa_settings/records?page=1&perPage=1", token=super_token)["items"][0]
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
sync = request("PUT", f"/api/app/events/{event['id']}/coupons", {
    "coupons": [{"code": "save10", "discountPercent": 10, "maxUses": 2, "isActive": True}],
}, admin_token)
assert sync["created"] == 1
coupon_filter = urllib.parse.quote(f"event='{event['id']}'")
coupons = request("GET", f"/api/collections/coupons/records?filter={coupon_filter}", token=admin_token)
assert coupons["totalItems"] == 1 and coupons["items"][0]["code"] == "SAVE10"
coupon = coupons["items"][0]
request("PUT", f"/api/app/events/{event['id']}/coupons", {"coupons": [{
    "id": coupon["id"], "code": "SAVE10", "discountPercent": 15,
    "maxUses": 3, "isActive": True,
}]}, admin_token)
request("PUT", f"/api/app/events/{event['id']}/coupons", {"coupons": []}, admin_token)

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
request("POST", f"/api/app/events/{event['id']}/register", {
    "formResponses": {"name": "Member Two", "email": second_user["email"]},
}, second_token, (400,))
updated_event = request("GET", f"/api/collections/events/records/{event['id']}")
assert updated_event["registeredCount"] == 1

# Legacy payment callback compatibility is tested with records explicitly marked
# as legacy. Native PayGate registrations are not allowed through this route.
payment_user = create_user("payer", "user")
payment_user_token = impersonate(super_token, payment_user["id"])
paid_event = request("POST", "/api/collections/events/records", {
    "title": f"CI Paid Event {suffix}", "description": "payment lifecycle",
    "date": start, "endDate": end, "venue": "CI Lab", "price": 100,
    "society": society["id"], "status": "published", "maxCapacity": 1,
    "registeredCount": 0, "checkedInCount": 0, "registrationOpen": True,
    "checkInEnabled": True, "isDeleted": False,
    "formTemplate": [
        {"id": "name", "name": "name", "label": "Name", "required": True},
        {"id": "email", "name": "email", "label": "Email", "required": True},
    ],
}, super_token)
first_paid = request("POST", f"/api/app/events/{paid_event['id']}/register", {
    "formResponses": {"name": "Payer", "email": payment_user["email"]},
}, payment_user_token)
assert first_paid["paymentRequired"] is True
assert first_paid["registrationStatus"] == "pending"
request("PATCH", f"/api/collections/registrations/records/{first_paid['registrationId']}", {
    "paymentData": {"provider": "legacy"},
}, super_token)
assert request("GET", f"/api/collections/events/records/{paid_event['id']}")["registeredCount"] == 1

webhook_headers = {"x-webhook-secret": WEBHOOK_SECRET}
request("POST", "/api/webhooks/payment-confirm", {
    "ticketId": first_paid["ticketId"], "status": "failed",
    "transactionId": f"failed-{suffix}", "amount": 100,
}, extra_headers=webhook_headers)
failed_reg = request("GET", f"/api/collections/registrations/records/{first_paid['registrationId']}", token=payment_user_token)
assert failed_reg["paymentStatus"] == "failed" and failed_reg["registrationStatus"] == "cancelled"
assert request("GET", f"/api/collections/events/records/{paid_event['id']}")["registeredCount"] == 0

retry_paid = request("POST", f"/api/app/events/{paid_event['id']}/register", {
    "formResponses": {"name": "Payer", "email": payment_user["email"]},
}, payment_user_token)
assert retry_paid["registrationId"] != first_paid["registrationId"]
request("PATCH", f"/api/collections/registrations/records/{retry_paid['registrationId']}", {
    "paymentData": {"provider": "legacy"},
}, super_token)
assert request("GET", f"/api/collections/events/records/{paid_event['id']}")["registeredCount"] == 1

late = request("POST", "/api/webhooks/payment-confirm", {
    "ticketId": first_paid["ticketId"], "status": "success",
    "transactionId": f"late-{suffix}", "amount": 100,
}, extra_headers=webhook_headers)
assert late.get("ignored") is True
failed_reg = request("GET", f"/api/collections/registrations/records/{first_paid['registrationId']}", token=payment_user_token)
assert failed_reg["registrationStatus"] == "cancelled" and failed_reg["paymentStatus"] == "failed"

request("POST", "/api/webhooks/payment-confirm", {
    "ticketId": retry_paid["ticketId"], "status": "success",
    "transactionId": f"wrong-amount-{suffix}", "amount": 99,
}, expected=(400,), extra_headers=webhook_headers)
retry_reg = request("GET", f"/api/collections/registrations/records/{retry_paid['registrationId']}", token=payment_user_token)
assert retry_reg["registrationStatus"] == "pending" and retry_reg["paymentStatus"] == "pending"

paid = request("POST", "/api/webhooks/payment-confirm", {
    "ticketId": retry_paid["ticketId"], "status": "success",
    "transactionId": f"paid-{suffix}", "amount": 100,
}, extra_headers=webhook_headers)
assert paid["success"] is True
retry_reg = request("GET", f"/api/collections/registrations/records/{retry_paid['registrationId']}", token=payment_user_token)
assert retry_reg["registrationStatus"] == "confirmed" and retry_reg["paymentStatus"] == "paid" and retry_reg["ticketId"]
assert request("GET", f"/api/collections/events/records/{paid_event['id']}")["registeredCount"] == 1
replayed = request("POST", "/api/webhooks/payment-confirm", {
    "ticketId": retry_paid["ticketId"], "status": "success",
    "transactionId": f"paid-{suffix}", "amount": 100,
}, extra_headers=webhook_headers)
assert replayed.get("message") == "Already processed"

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
