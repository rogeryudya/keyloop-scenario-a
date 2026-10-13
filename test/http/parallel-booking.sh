#!/usr/bin/env bash
# Scenario 10 (FR-5, BR-10): fire N identical bookings at once for the same Hanoi slot (one bay).
# Expected: exactly one 201; the rest 409 (NO_SERVICE_BAY_AVAILABLE, or APPOINTMENT_CONFLICT on a lost race).
# Usage: test/http/parallel-booking.sh [count=10] [local start time=11:00]
# Works in bash on Linux, macOS and Git Bash on Windows. Needs curl and a running API (README › Try it).
set -euo pipefail

count="${1:-10}"
time="${2:-11:00}"
base_url="${BASE_URL:-http://localhost:3000}"
# "Tomorrow" in the dealerships' time zone (UTC+7): the UTC date of now + 31 h. GNU date, then BSD date.
day="$(date -u -d '+31 hours' +%F 2>/dev/null || date -u -v+31H +%F)"

body=$(cat <<JSON
{"customerId":"50000000-0000-4000-8000-000000000006","vehicleId":"60000000-0000-4000-8000-000000000008",
 "dealershipId":"10000000-0000-4000-8000-000000000003","serviceTypeId":"40000000-0000-4000-8000-000000000001",
 "start":"${day}T${time}:00+07:00"}
JSON
)

echo "Booking Hanoi ${day} ${time} (+07:00) ${count}x in parallel at ${base_url}…"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for i in $(seq "$count"); do
  curl -s -o "$tmp/$i.json" -w '%{http_code}' -H 'content-type: application/json' \
    -d "$body" "$base_url/v1/appointments" > "$tmp/$i.status" &
done
wait

for i in $(seq "$count"); do
  status="$(cat "$tmp/$i.status")"
  code="$(grep -o '"code":"[A-Z_]*"' "$tmp/$i.json" | cut -d'"' -f4 || true)"
  echo "$status ${code}"
done | sort | uniq -c
