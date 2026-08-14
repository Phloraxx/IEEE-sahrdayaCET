#!/usr/bin/env python3
import concurrent.futures, datetime as dt, hashlib, hmac, json, os, threading, time, urllib.error, urllib.parse, urllib.request

BASE = os.environ.get("PB_BASE_URL", "http://127.0.0.1:8090").rstrip("/")
FAKE = os.environ.get("RAZORPAY_FAKE_URL", "http://127.0.0.1:18080").rstrip("/")
SUPER_EMAIL = os.environ.get("PB_SUPERUSER_EMAIL", "ci-super@example.test")
SUPER_PASS = os.environ.get("PB_SUPERUSER_PASSWORD", "CI-PocketBase-Smoke-2026!")
KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "test_secret_ieee_2026")
WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "test_webhook_ieee_2026")

def req(method, path, body=None, token=None, expected=(200,201,204), headers=None, base=BASE):
    h={"Content-Type":"application/json"}; h.update(headers or {})
    if token: h["Authorization"] = token
    data=None if body is None else json.dumps(body,separators=(",",":")).encode()
    r=urllib.request.Request(base+path,data=data,headers=h,method=method)
    try:
        with urllib.request.urlopen(r,timeout=15) as x: status=x.status; raw=x.read().decode()
    except urllib.error.HTTPError as e: status=e.code; raw=e.read().decode()
    out=json.loads(raw) if raw else None
    if status not in expected: raise AssertionError(f"{method} {path}: {status} {out}")
    return out

def impersonate(super_token,user_id):
    return req("POST",f"/api/collections/users/impersonate/{user_id}",{"duration":3600},super_token)["token"]
super_auth=req("POST","/api/collections/_superusers/auth-with-password",{"identity":SUPER_EMAIL,"password":SUPER_PASS})
super_token=super_auth["token"]
suffix=str(int(time.time()*1000))
password="FixturePass-2026!"

def make_user(label,role="user"):
    return req("POST","/api/collections/users/records",{
        "email":f"rzp-{label}-{suffix}@example.test","verified":True,"name":label.title(),"role":role,
        "password":password,"passwordConfirm":password,
    },super_token)

admin=make_user("admin","admin"); user=make_user("member"); user2=make_user("member2")
admin_token=impersonate(super_token,admin["id"]); user_token=impersonate(super_token,user["id"]); user2_token=impersonate(super_token,user2["id"])
society=req("POST","/api/collections/societies/records",{
    "name":f"Razorpay Direct {suffix}","slug":f"rzp-direct-{suffix}","bio":"direct payment smoke","isHidden":False,"chairs":[]
},super_token)
now=dt.datetime.now(dt.timezone.utc)
start=(now+dt.timedelta(days=2)).isoformat().replace("+00:00","Z")
reg_start=(now-dt.timedelta(hours=1)).isoformat().replace("+00:00","Z")
reg_end=(now+dt.timedelta(days=1)).isoformat().replace("+00:00","Z")

def make_event(label):
    return req("POST","/api/collections/events/records",{
        "title":f"{label} {suffix}","description":"Razorpay direct smoke","venue":"CI Lab","date":start,
        "society":society["id"],"status":"published","registrationMode":"internal","registrationOpen":True,
        "registrationStart":reg_start,"registrationDeadline":reg_end,"price":100,"maxCapacity":10,"isDeleted":False,
    },super_token)
def register(event,user,user_token):
    out=req("POST",f"/api/app/events/{event['id']}/register",{
        "formResponses":{"name":user["name"],"email":user["email"],"phone":"9999999999"}
    },user_token)
    assert out["registrationStatus"]=="pending" and out["paymentStatus"]=="pending" and out["paymentRequired"] is True
    return out

def fake_payment(order_id,status="captured"):
    return req("POST","/__test__/payments",{"order_id":order_id,"status":status,"method":"upi"},base=FAKE)

def checkout_sig(order_id,payment_id):
    return hmac.new(KEY_SECRET.encode(),f"{order_id}|{payment_id}".encode(),hashlib.sha256).hexdigest()

def get_record(collection,record_id,token=super_token):
    return req("GET",f"/api/collections/{collection}/records/{record_id}",token=token)

def filter_records(collection,expr):
    return req("GET",f"/api/collections/{collection}/records?filter="+urllib.parse.quote(expr),token=super_token)

# Normal flow: Order is stable across retries; a failed attempt does not release the seat.
event=make_event("Razorpay Normal")
registration=register(event,user,user_token); reg_id=registration["registrationId"]
session=req("POST",f"/api/app/registrations/{reg_id}/payment",token=user_token)
assert session["provider"]=="razorpay" and session["razorpayOrderId"].startswith("order_") and session["payableAmountPaise"]==10000
session_retry=req("POST",f"/api/app/registrations/{reg_id}/payment",token=user_token)
assert session_retry["razorpayOrderId"]==session["razorpayOrderId"]
failed=fake_payment(session["razorpayOrderId"],"failed")
after_failed=req("GET",f"/api/app/registrations/{reg_id}/payment",token=user_token)
assert after_failed["registrationStatus"]=="pending" and after_failed["paymentStatus"]=="pending"
captured=fake_payment(session["razorpayOrderId"],"captured")
verified=req("POST",f"/api/app/registrations/{reg_id}/payment/razorpay-verify",{
    "razorpay_order_id":session["razorpayOrderId"],"razorpay_payment_id":captured["id"],
    "razorpay_signature":checkout_sig(session["razorpayOrderId"],captured["id"]),
},user_token)
assert verified["registrationStatus"]=="confirmed" and verified["paymentStatus"]=="paid" and verified["ticketId"].startswith("TKT-")
ledger=filter_records("payments",f'registration="{reg_id}"')["items"]
assert len(ledger)==1 and ledger[0]["status"]=="captured" and ledger[0]["collectedPaise"]==10000 and ledger[0]["capturedPaymentId"]==captured["id"]
attempts=filter_records("payment_attempts",f'payment="{ledger[0]["id"]}"')["items"]
assert len(attempts)==2 and {x["status"] for x in attempts}=={"failed","captured"}

# Out-of-order/stale attempts can arrive after capture. They must never downgrade
# the Order aggregate or resurrect the payment flow.
stale_failed=fake_payment(session["razorpayOrderId"],"failed")
after_stale=req("GET",f"/api/app/registrations/{reg_id}/payment",token=user_token)
assert after_stale["registrationStatus"]=="confirmed" and after_stale["paymentStatus"]=="paid"
assert after_stale["ticketId"]==verified["ticketId"]
ledger_after_stale=filter_records("payments",f'registration="{reg_id}"')["items"][-1]
assert ledger_after_stale["status"]=="captured" and ledger_after_stale["capturedPaymentId"]==captured["id"]
stale_attempts=filter_records("payment_attempts",f'payment="{ledger_after_stale["id"]}"')["items"]
assert any(x["providerPaymentId"]==stale_failed["id"] and x["status"]=="failed" for x in stale_attempts)

# Signed webhook is idempotently queued and processed from canonical provider state.
webhook={"entity":"event","event":"payment.captured","contains":["payment"],"payload":{"payment":{"entity":{"id":captured["id"]}}},"created_at":int(time.time())}
raw=json.dumps(webhook,separators=(",",":"))
sig=hmac.new(WEBHOOK_SECRET.encode(),raw.encode(),hashlib.sha256).hexdigest()
headers={"X-Razorpay-Signature":sig,"X-Razorpay-Event-Id":f"evt_{suffix}_capture"}
first=req("POST","/api/webhooks/razorpay",json.loads(raw),headers=headers)
second=req("POST","/api/webhooks/razorpay",json.loads(raw),headers=headers)
assert first.get("queued") is True and second.get("duplicate") is True
req("POST","/api/crons/razorpay-webhook-inbox",token=super_token,expected=(204,))
time.sleep(.2)
inbox=filter_records("payment_webhook_events",f'eventId="evt_{suffix}_capture"')["items"][0]
assert inbox["status"]=="processed" and inbox["attempts"]>=1
# Cancelling an event with a captured Razorpay payment never calls the provider refund API.
# It keeps the captured payment visible and flags it for a manual Razorpay Dashboard refund.
cancel=req("POST",f"/api/admin/events/{event['id']}/cancel",{"reason":"CI manual refund smoke"},admin_token)
assert cancel["manualRefundRequired"]==1 and cancel["refundReview"]==1
refunds=filter_records("payment_refunds",f'payment="{ledger[0]["id"]}"')["items"]
assert len(refunds)==0
cancelled_reg=get_record("registrations",reg_id)
assert cancelled_reg["registrationStatus"]=="cancelled" and cancelled_reg["paymentStatus"]=="paid"
cancelled_ledger=get_record("payments",ledger[0]["id"])
assert cancelled_ledger["status"]=="captured" and cancelled_ledger["manualReview"] is True
assert "Razorpay Dashboard" in cancelled_ledger["reviewReason"]

# Late capture never resurrects a cancelled seat; it requires a manual provider refund.
late_event=make_event("Razorpay Late Capture")
late_reg=register(late_event,user2,user2_token); late_id=late_reg["registrationId"]
late_session=req("POST",f"/api/app/registrations/{late_id}/payment",token=user2_token)
req("POST",f"/api/admin/events/{late_event['id']}/cancel",{"reason":"cancel before capture"},admin_token)
late_payment=fake_payment(late_session["razorpayOrderId"],"captured")
late_verified=req("POST",f"/api/app/registrations/{late_id}/payment/razorpay-verify",{
    "razorpay_order_id":late_session["razorpayOrderId"],"razorpay_payment_id":late_payment["id"],
    "razorpay_signature":checkout_sig(late_session["razorpayOrderId"],late_payment["id"]),
},user2_token)
assert late_verified["registrationStatus"]=="cancelled" and late_verified["paymentStatus"]=="paid" and not late_verified["ticketId"]
late_ledger=filter_records("payments",f'registration="{late_id}"')["items"][0]
late_refunds=filter_records("payment_refunds",f'payment="{late_ledger["id"]}"')["items"]
assert len(late_refunds)==0
assert late_ledger["status"]=="captured" and late_ledger["manualReview"] is True
assert "Razorpay Dashboard" in late_ledger["reviewReason"]
late_final=get_record("registrations",late_id)
assert late_final["registrationStatus"]=="cancelled" and late_final["paymentStatus"]=="paid" and not late_final["ticketId"]

# Hold expiry releases a seat only after a successful provider reconciliation finds no capture.
expiry_event=make_event("Razorpay Hold Expiry")
expiry_reg=register(expiry_event,user2,user2_token); expiry_id=expiry_reg["registrationId"]
expiry_session=req("POST",f"/api/app/registrations/{expiry_id}/payment",token=user2_token)
expiry_ledger=filter_records("payments",f'registration="{expiry_id}"')["items"][0]
past=(now-dt.timedelta(minutes=5)).isoformat().replace("+00:00","Z")
req("PATCH",f"/api/collections/payments/records/{expiry_ledger['id']}",{"holdExpiresAt":past},super_token)
req("POST","/api/crons/razorpay-pending-reconciliation",token=super_token,expected=(204,))
time.sleep(.2)
expired=get_record("registrations",expiry_id)
expired_payment=get_record("payments",expiry_ledger["id"])
assert expired["registrationStatus"]=="cancelled" and expired["paymentStatus"]=="failed"
assert expired_payment["status"]=="cancelled"

# Stress capture vs hold-expiry reconciliation. The provider capture and the
# expiry cron start together; verification then converges any late capture.
race_outcomes={"confirmed":0,"manual_refund":0}
for race_index in range(10):
    race_event=make_event(f"Razorpay Race {race_index}")
    race_reg=register(race_event,user2,user2_token); race_id=race_reg["registrationId"]
    race_session=req("POST",f"/api/app/registrations/{race_id}/payment",token=user2_token)
    race_ledger=filter_records("payments",f'registration="{race_id}"')["items"][-1]
    req("PATCH",f"/api/collections/payments/records/{race_ledger['id']}",{"holdExpiresAt":past},super_token)
    barrier=threading.Barrier(2)
    def create_capture():
        barrier.wait(); return fake_payment(race_session["razorpayOrderId"],"captured")
    def run_expiry():
        barrier.wait(); return req("POST","/api/crons/razorpay-pending-reconciliation",token=super_token,expected=(204,))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        capture_future=pool.submit(create_capture); expiry_future=pool.submit(run_expiry)
        race_payment=capture_future.result(); expiry_future.result()
    req("POST",f"/api/app/registrations/{race_id}/payment/razorpay-verify",{
        "razorpay_order_id":race_session["razorpayOrderId"],"razorpay_payment_id":race_payment["id"],
        "razorpay_signature":checkout_sig(race_session["razorpayOrderId"],race_payment["id"]),
    },user2_token)
    final_reg=get_record("registrations",race_id)
    final_ledger=filter_records("payments",f'registration="{race_id}"')["items"][-1]
    assert final_ledger["capturedPaymentId"]==race_payment["id"] and final_ledger["collectedPaise"]==10000
    if final_reg["registrationStatus"]=="confirmed":
        assert final_reg["paymentStatus"]=="paid" and final_reg["ticketId"].startswith("TKT-")
        race_outcomes["confirmed"]+=1
    else:
        assert final_reg["registrationStatus"]=="cancelled" and final_reg["paymentStatus"]=="paid" and not final_reg["ticketId"]
        race_refunds=filter_records("payment_refunds",f'payment="{final_ledger["id"]}"')["items"]
        assert len(race_refunds)==0
        assert final_ledger["manualReview"] is True and "Razorpay Dashboard" in final_ledger["reviewReason"]
        race_outcomes["manual_refund"]+=1

print("direct Razorpay smoke ok", json.dumps({
    "normal_order":session["razorpayOrderId"],"normal_payment":captured["id"],
    "manual_refund_required":cancel["manualRefundRequired"],
    "late_manual_review":late_ledger["manualReview"],
    "expiry_order":expiry_session["razorpayOrderId"],"race":race_outcomes
}))
