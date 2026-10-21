#!/usr/bin/env bash
# Two-browser smoke test of leagues, invite links, accounts and draft rules against a running server.
# Usage: scripts/smoke.sh [base-url]    (default http://localhost:3000)
# The server must run with development sign-in: `AUTH_DEV_LOGIN=1 npm run dev`. Each "browser" is a curl cookie jar and
# signs up its own account through Better Auth's email/password endpoint. Exits non-zero when any check fails.
set -u
BASE=${1:-http://localhost:3000}
JARS=$(mktemp -d)
trap 'rm -rf "$JARS"' EXIT
FAILED=0
RUN=$(date +%s)-$$
CODE=""
BODY=""

# call JAR METHOD PATH [JSON]: sends the request with this site's Origin; sets CODE and BODY.
call() {
  local args=(-s -o "$JARS/body" -w "%{http_code}" -b "$JARS/$1" -c "$JARS/$1" -X "$2" -H "Origin: $BASE")
  if [ -n "${4:-}" ]; then args+=(-H "content-type: application/json" -d "$4"); fi
  CODE=$(curl "${args[@]}" "$BASE$3")
  BODY=$(cat "$JARS/body")
}

# check LABEL STATUS [TEXT]: passes when CODE is STATUS and BODY contains TEXT.
check() {
  if [ "$CODE" = "$2" ] && { [ -z "${3:-}" ] || grep -qF -- "$3" <<<"$BODY"; }; then
    echo "PASS $1"
  else
    echo "FAIL $1 (got $CODE: $(head -c 160 <<<"$BODY"))"
    FAILED=1
  fi
}

# signup JAR NAME: signs this "browser" up (and in) as a new development account.
signup() {
  call "$1" POST /api/auth/sign-up/email "{\"name\":\"$2\",\"email\":\"smoke-$RUN-$1@example.com\",\"password\":\"smoke-password-1\"}"
  if [ "$CODE" = "404" ] || [ "$CODE" = "503" ]; then
    echo "Development sign-in is off. Start the server with AUTH_DEV_LOGIN=1 (npm run dev) and run this again." >&2
    exit 2
  fi
  check "$2 signs up" 200 '"token"'
}

links() { grep -o '/i/[A-Za-z0-9_-]\{22\}\.[A-Za-z0-9_-]\{22\}' <<<"$BODY" | awk '!seen[$0]++'; }
confirm() { call "$1" POST "/api/leagues/$LEAGUE/draft" "{\"type\":\"confirm\",\"teamId\":\"$2\",\"side\":\"$3\",\"pickNumber\":$4}"; }

signup ana Ana
signup ben Ben
signup cal Cal
signup dan Dan

call nobody POST /api/leagues '{"leagueName":"Signed Out","displayName":"Nobody"}'
check "signed-out league creation is refused" 401 '"sign_in_required"'

call ana POST /api/leagues '{"leagueName":"Smoke Test","displayName":"Ana"}'
check "create a league" 201 '"leagueId"'
LEAGUE=$(sed -E 's/.*"leagueId":"([a-z0-9]+)".*/\1/' <<<"$BODY")

call ana GET "/l/$LEAGUE/draft"
INVITE=$(links | sed -n 1p)
[ -n "$INVITE" ] && [ "$(links | wc -l)" -eq 1 ] && echo "PASS commissioner sees the league invite and no personal link" ||
  { echo "FAIL commissioner links wrong (expected only the league invite)"; FAILED=1; }

call nobody GET "/l/$LEAGUE/draft"
check "a spectator can open the draft room" 200 "Waiting for the commissioner to start the draft."
[ -z "$(links)" ] && echo "PASS spectators see no links" || { echo "FAIL spectator sees links"; FAILED=1; }

call ben GET "$INVITE"
check "invite page renders" 200 "Join the league"
call nobody GET "$INVITE"
check "signed out, the invite asks to sign in" 200 "Sign in with Google to continue"
call nobody POST /api/links/claim "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m2\",\"displayName\":\"Ben\"}"
check "a signed-out claim is refused" 401 '"sign_in_required"'

CODE=$(curl -s -o "$JARS/body" -w "%{http_code}" -H "content-type: application/json" "$BASE/api/links/claim" \
  -d "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m2\",\"displayName\":\"Ben\"}")
BODY=$(cat "$JARS/body")
check "claim without Origin is refused" 403 '"forbidden"'

call ben POST /api/links/claim "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m2\",\"displayName\":\"Ben\"}"
check "Ben claims seat 2" 200 '"managerId":"m2"'
call ben POST /api/links/claim "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m3\",\"displayName\":\"Ben\"}"
check "a second seat for the same account is refused" 409 '"already_joined"'

call ana POST "/api/leagues/$LEAGUE/records/refresh"
check "commissioner refreshes records" 200 '"records"'
call ben POST "/api/leagues/$LEAGUE/records/refresh"
check "another seat can't refresh records" 403
call ana POST "/api/leagues/demo/records/refresh"
check "demo records are read-only" 403
call ana GET "/api/cron/refresh-records"
check "cron needs its secret" "$([ -n "${CRON_SECRET:-}" ] && echo 401 || echo 503)"

call ana PUT "/api/leagues/$LEAGUE/lines" '{"overrides":{"BOS":44.5}}'
check "commissioner overrides a line" 200 '"BOS":44.5'
call ben PUT "/api/leagues/$LEAGUE/lines" '{"overrides":{"BOS":40.5}}'
check "only the commissioner overrides lines" 403 '"forbidden"'

call ben PUT "/api/leagues/$LEAGUE/order" '{"order":["m2","m1","m3","m4"]}'
check "only the commissioner sets the draft order" 403 '"forbidden"'
call ana PUT "/api/leagues/$LEAGUE/order" '{"order":["m1","m1","m3","m4"]}'
check "a draft order must name every manager once" 409 '"invalid_order"'
call ana PUT "/api/leagues/$LEAGUE/order" '{"order":"m1"}'
check "a malformed draft order is refused" 400 '"invalid_request"'
call ana PUT "/api/leagues/$LEAGUE/order" '{"order":["m2","m1","m3","m4"]}'
check "commissioner reorders the draft" 200 '"seatOrder":["m2","m1","m3","m4"]'
call ana PUT "/api/leagues/$LEAGUE/order" '{"order":["m1","m2","m3","m4"]}'
check "commissioner puts the order back" 200 '"seatOrder":["m1","m2","m3","m4"]'

call ben POST "/api/leagues/$LEAGUE/draft" '{"type":"start"}'
check "only the commissioner starts" 403 '"forbidden"'
call ana POST "/api/leagues/$LEAGUE/draft" '{"type":"start"}'
check "commissioner starts; lines freeze" 200 '"season":"'

call ana PUT "/api/leagues/$LEAGUE/order" '{"order":["m2","m1","m3","m4"]}'
check "draft order is locked once the draft starts" 409 '"order_locked"'

confirm ana MIN OVER 1
check "pick 1" 200
confirm ana MIN OVER 1
check "double submit is stale" 409 '"stale_pick"'
confirm ben MIN UNDER 2
check "pick 2 (other side, other manager)" 200
confirm ana OKC OVER 3
check "commissioner picks for open seat 3" 200
confirm ana BOS OVER 4
check "commissioner picks for open seat 4" 200
confirm ana BOS UNDER 5
check "seat 4 can't hold both sides of BOS" 409 '"team_already_held"'

call ben GET "/api/leagues/$LEAGUE/draft"
check "Ben is seated" 200 '"viewerId":"m2"'
call ana POST "/api/leagues/$LEAGUE/seats/m2/reset" '{}'
check "commissioner resets seat 2" 200 '"ok":true'
call ben GET "/api/leagues/$LEAGUE/draft"
check "Ben no longer holds the seat" 200 '"viewerId":null'

call ana GET "/l/$LEAGUE/settings"
REJOIN=$(links | grep -vF -e "$INVITE" | head -1)
call cal POST /api/links/claim "{\"token\":\"${REJOIN#/i/}\",\"displayName\":\"Benny\"}"
check "the rejoin link re-claims seat 2" 200 '"managerId":"m2"'
call dan POST /api/links/claim "{\"token\":\"${REJOIN#/i/}\",\"displayName\":\"Dan\"}"
check "the rejoin link works once" 404 '"invalid_link"'
call cal GET "/api/leagues/$LEAGUE/draft"
check "Cal's account holds seat 2" 200 '"viewerId":"m2"'

call ana POST "/api/leagues/$LEAGUE/invite" '{}'
check "commissioner rotates the invite" 200 '"ok":true'
call dan GET "$INVITE"
check "the old invite stops working" 200 "This link no longer works"
call dan GET "/i/AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA"
check "a forged link gets the same message" 200 "This link no longer works"
grep -qiE '^referrer-policy: no-referrer[[:space:]]*$' <(curl -s -D - -o /dev/null "$BASE$INVITE") &&
  echo "PASS link pages send no Referer" || { echo "FAIL Referrer-Policy header missing"; FAILED=1; }

call ana GET /
check "home lists the league" 200 "Smoke Test"
call ana POST /api/leagues/demo/draft '{"type":"pause"}'
check "demo league is read-only" 403 '"demo_league"'
CODE=$(curl -s -o "$JARS/body" -w "%{http_code}" -b "courtline_seats=$LEAGUE:m1" "$BASE/api/leagues/$LEAGUE/draft")
BODY=$(cat "$JARS/body")
check "the old editable seat cookie grants nothing" 200 '"viewerId":null'

# 30/30 Challenge: one entry per account. Save checks run only while the challenge is open (a locked or
# schedule-less environment answers the first full save 409/503 and the rest is skipped).
TEAMS=(ATL BKN BOS CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS)
# picks N [DUPLICATE]: a JSON array of N picks (Over/Under alternating); DUPLICATE repeats the first team as the last.
picks() {
  local out="" i
  for ((i = 0; i < $1; i++)); do
    local team=${TEAMS[$i]} side=OVER
    [ $((i % 2)) -eq 1 ] && side=UNDER
    [ -n "${2:-}" ] && [ "$i" -eq $(($1 - 1)) ] && team=${TEAMS[0]}
    out+="${out:+,}{\"teamId\":\"$team\",\"side\":\"$side\"}"
  done
  echo "[$out]"
}

signup chloe Chloe
signup dev Dev
call nobody PUT /api/challenge/entry "{\"displayName\":\"Smoke Nobody\",\"picks\":$(picks 30)}"
check "a signed-out challenge save is refused" 401 '"sign_in_required"'

call chloe PUT /api/challenge/entry "{\"displayName\":\"Smoke Chloe\",\"picks\":$(picks 30)}"
if [ "$CODE" = "409" ] && grep -qF '"challenge_locked"' <<<"$BODY"; then
  echo "SKIP challenge saves (locked)"
elif [ "$CODE" = "503" ] && grep -qF '"deadline_unavailable"' <<<"$BODY"; then
  echo "SKIP challenge saves (no deadline yet)"
else
  check "a full challenge entry saves" 200 '"entry"'
  CHLOE_ID=$(sed -E 's/.*"entry":\{"id":"([A-Za-z0-9_-]+)".*/\1/' <<<"$BODY")
  call chloe PUT /api/challenge/entry "{\"displayName\":\"Smoke Chloe\",\"picks\":$(picks 29)}"
  check "an incomplete entry is refused" 400 '"incomplete_entry"'
  call chloe PUT /api/challenge/entry "{\"displayName\":\"Smoke Chloe\",\"picks\":$(picks 30 dup)}"
  check "a duplicate team is refused" 400 '"invalid_picks"'
  call dev PUT /api/challenge/entry "{\"displayName\":\"Smoke Dev\",\"picks\":$(picks 30)}"
  check "another account saves its own entry" 200 '"entry"'
  DEV_ID=$(sed -E 's/.*"entry":\{"id":"([A-Za-z0-9_-]+)".*/\1/' <<<"$BODY")
  [ -n "$CHLOE_ID" ] && [ -n "$DEV_ID" ] && [ "$CHLOE_ID" != "$DEV_ID" ] &&
    echo "PASS each account has its own entry" || { echo "FAIL entries share an id ($CHLOE_ID, $DEV_ID)"; FAILED=1; }
  call chloe GET /challenge/leaderboard
  check "the leaderboard lists both entrants" 200 "Smoke Chloe"
  grep -qF "Smoke Dev" <<<"$BODY" || { echo "FAIL leaderboard misses Smoke Dev"; FAILED=1; }
fi
call chloe PUT /api/challenge/entry '{"displayName":"x","picks":[]}'
check "an empty challenge save is refused" 400 '"incomplete_entry"'

exit $FAILED
