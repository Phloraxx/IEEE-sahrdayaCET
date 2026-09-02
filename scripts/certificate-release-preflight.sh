#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://ieeesahrdaya.com}"
TARGET_ENV="${TARGET_ENV:-production}"
ENV_FILE="${ENV_FILE:-}"
EXPECTED_SHA="${EXPECTED_SHA:-}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CHECK_RUNTIME="${CHECK_RUNTIME:-1}"
REQUIRE_MAIL_LIVE="${REQUIRE_MAIL_LIVE:-0}"
HTTP_TIMEOUT="${HTTP_TIMEOUT:-15}"
failures=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }
check_eq() { [[ "$2" == "$3" ]] && pass "$1" || fail "$1"; }
check_nonempty() { [[ -n "$2" ]] && pass "$1" || fail "$1"; }

if [[ -n "$ENV_FILE" && ! -f "$ENV_FILE" ]]; then
  fail "ENV_FILE exists"
fi

check_nonempty "EXPECTED_SHA is provided" "$EXPECTED_SHA"
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]] && pass "EXPECTED_SHA is a full Git SHA" || fail "EXPECTED_SHA must be a 40-character lowercase Git SHA"
checkout_sha=""
if checkout_sha="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null)"; then
  check_eq "release checkout HEAD matches EXPECTED_SHA" "$checkout_sha" "$EXPECTED_SHA"
  [[ -z "$(git -C "$REPO_DIR" status --porcelain --untracked-files=all 2>/dev/null)" ]] && pass "release checkout is clean" || fail "release checkout has local changes"
else
  fail "release checkout is readable"
fi
case "$CHECK_RUNTIME" in
  0|1) pass "CHECK_RUNTIME mode is valid" ;;
  *) fail "CHECK_RUNTIME must be 0 or 1" ;;
esac
case "$REQUIRE_MAIL_LIVE" in
  0|1) pass "REQUIRE_MAIL_LIVE mode is valid" ;;
  *) fail "REQUIRE_MAIL_LIVE must be 0 or 1" ;;
esac

value() {
  local key="$1" current=""
  current="${!key-}"
  if [[ -n "$current" ]]; then printf '%s' "$current"; return; fi
  if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
    current="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$ENV_FILE" | tail -1 | sed -E 's/^[[:space:]]*(export[[:space:]]+)?[^=]+=//' || true)"
    current="${current%$'\r'}"
    if [[ ${#current} -ge 2 && "$current" == \"*\" ]]; then current="${current:1:${#current}-2}"; fi
    if [[ ${#current} -ge 2 && "$current" == \'*\' ]]; then current="${current:1:${#current}-2}"; fi
  fi
  printf '%s' "$current"
}

sender_address() {
  local raw="$1" address="$1"
  if [[ "$raw" =~ \<([^\<\>]+)\>[[:space:]]*$ ]]; then address="${BASH_REMATCH[1]}"; fi
  printf '%s' "$address"
}

http_code() {
  local code=""
  if ! code="$(curl --max-time "$HTTP_TIMEOUT" -sS -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)"; then
    printf '000'
    return 0
  fi
  printf '%s' "$code"
}

deploy_env="$(value DEPLOY_ENV)"
site_url="$(value SITE_URL)"
render_key="$(value CERTIFICATE_RENDER_CAPABILITY_KEY)"
provider="$(value CERTIFICATE_MAIL_PROVIDER)"
mail_mode="$(value MAIL_DELIVERY_MODE)"
smtp_host="$(value SMTP_HOST)"
smtp_port="$(value SMTP_PORT)"
smtp_from="$(value SMTP_FROM)"
smtp_sender="$(sender_address "$smtp_from")"
smtp_user="$(value SMTP_USERNAME)"
smtp_pass="$(value SMTP_PASSWORD)"

check_eq "DEPLOY_ENV is ${TARGET_ENV}" "$deploy_env" "$TARGET_ENV"
check_eq "SITE_URL matches target" "${site_url%/}" "${BASE_URL%/}"
[[ ${#render_key} -ge 32 ]] && pass "renderer capability key is present" || fail "renderer capability key is missing/too short"

if [[ "$REQUIRE_MAIL_LIVE" == "1" ]]; then
  check_eq "mail-live gate targets production" "$TARGET_ENV" "production"
  check_eq "certificate mail provider is explicitly smtp" "$provider" "smtp"
  check_eq "production mail mode is live" "$mail_mode" "live"
  check_nonempty "SMTP host is configured" "$smtp_host"
  [[ "$smtp_port" =~ ^[0-9]+$ && "$smtp_port" -gt 0 && "$smtp_port" -le 65535 ]] && pass "SMTP port is valid" || fail "SMTP port is missing/invalid"
  [[ "$smtp_sender" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] && pass "SMTP sender is valid" || fail "SMTP_FROM is missing/invalid"
  if [[ -n "$smtp_user" || -n "$smtp_pass" ]]; then
    [[ -n "$smtp_user" && -n "$smtp_pass" ]] && pass "SMTP authentication pair is complete" || fail "SMTP username/password must be configured together"
  else
    pass "SMTP uses an unauthenticated/trusted relay configuration"
  fi
else
  if [[ "$TARGET_ENV" == "production" ]]; then
    check_eq "production mail mode is explicitly disabled" "$mail_mode" "disabled"
  else
    case "$mail_mode" in
      disabled|allowlist|redirect) pass "non-production mail mode is explicitly safe" ;;
      *) fail "non-production mail mode must be disabled, allowlist, or redirect" ;;
    esac
  fi
  pass "mail transport readiness is deferred while live delivery is disabled"
fi

if [[ "$CHECK_RUNTIME" == "1" ]]; then
  check_eq "site root returns 200" "$(http_code "${BASE_URL%/}/")" "200"
  check_eq "health endpoint returns 200" "$(http_code "${BASE_URL%/}/healthz")" "200"
  check_eq "verification page returns 200" "$(http_code "${BASE_URL%/}/verify")" "200"
  check_eq "PocketBase admin is not public" "$(http_code "${BASE_URL%/}/_/")" "404"

  verify_html=""
  verify_text=""
  if verify_html="$(curl --max-time "$HTTP_TIMEOUT" -fsS "${BASE_URL%/}/verify" 2>/dev/null)"; then
    verify_text="$(printf '%s' "$verify_html" | sed -E 's/<[^>]+>/ /g' | tr '\n' ' ')"
  fi
  if grep -Eqi 'Verify[[:space:]]+a[[:space:]]+certificate' <<<"$verify_text"; then
    pass "verification UI rendered"
  else
    fail "verification UI marker missing"
  fi
else
  pass "runtime HTTP checks deferred until post-deploy"
fi

if (( failures > 0 )); then
  printf '\nCertificate release preflight failed: %d check(s).\n' "$failures" >&2
  exit 1
fi
printf '\nCertificate release preflight passed for %s.\n' "$BASE_URL"
