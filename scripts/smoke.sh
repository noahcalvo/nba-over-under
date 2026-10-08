#!/usr/bin/env bash
# Two-browser smoke test of leagues, invite links, sessions and draft rules against a running server.
# Usage: scripts/smoke.sh [base-url]    (default http://localhost:3000, e.g. from `npm run dev`)
# Each "browser" is a curl cookie jar. Exits non-zero when any check fails.
set -u
BASE=${1:-http://localhost:3000}
JARS=$(mktemp -d)
trap 'rm -rf "$JARS"' EXIT
FAILED=0
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

links() { grep -o '/i/[A-Za-z0-9_-]\{22\}\.[A-Za-z0-9_-]\{22\}' <<<"$BODY" | awk '!seen[$0]++'; }
confirm() { call "$1" POST "/api/leagues/$LEAGUE/draft" "{\"type\":\"confirm\",\"teamId\":\"$2\",\"side\":\"$3\",\"pickNumber\":$4}"; }

call ana POST /api/leagues '{"leagueName":"Smoke Test","displayName":"Ana"}'
check "create a league" 201 '"leagueId"'
LEAGUE=$(sed -E 's/.*"leagueId":"([a-z0-9]+)".*/\1/' <<<"$BODY")

call ana GET "/l/$LEAGUE/draft"
INVITE=$(links | sed -n 1p)
ANA_LINK=$(links | sed -n 2p)
[ -n "$INVITE" ] && [ -n "$ANA_LINK" ] && echo "PASS commissioner sees the invite and their sign-in link" ||
  { echo "FAIL commissioner links missing"; FAILED=1; }

call nobody GET "/l/$LEAGUE/draft"
[ -z "$(links)" ] && echo "PASS spectators see no links" || { echo "FAIL spectator sees links"; FAILED=1; }

call ben GET "$INVITE"
check "invite page renders" 200 "Join the league"

CODE=$(curl -s -o "$JARS/body" -w "%{http_code}" -H "content-type: application/json" "$BASE/api/links/claim" \
  -d "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m2\",\"displayName\":\"Ben\"}")
BODY=$(cat "$JARS/body")
check "claim without Origin is refused" 403 '"forbidden"'

call ben POST /api/links/claim "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m2\",\"displayName\":\"Ben\"}"
check "Ben claims seat 2" 200 '"managerId":"m2"'
call ben POST /api/links/claim "{\"token\":\"${INVITE#/i/}\",\"managerId\":\"m3\",\"displayName\":\"Ben\"}"
check "a second seat for the same browser is refused" 409 '"already_joined"'

call ben POST "/api/leagues/$LEAGUE/draft" '{"type":"start"}'
check "only the commissioner starts" 403 '"forbidden"'
call ana POST "/api/leagues/$LEAGUE/draft" '{"type":"start"}'
check "commissioner starts; lines freeze" 200 '"source":"static"'

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
check "Ben is signed out everywhere" 200 '"viewerId":null'

call ana GET "/l/$LEAGUE/settings"
REJOIN=$(links | grep -vF -e "$INVITE" -e "$ANA_LINK" | head -1)
call cal POST /api/links/claim "{\"token\":\"${REJOIN#/i/}\",\"displayName\":\"Benny\"}"
check "the rejoin link re-claims seat 2" 200 '"managerId":"m2"'
call dan POST /api/links/claim "{\"token\":\"${REJOIN#/i/}\",\"displayName\":\"Dan\"}"
check "the rejoin link works once" 404 '"invalid_link"'

call ana POST "/api/leagues/$LEAGUE/invite" '{}'
check "commissioner rotates the invite" 200 '"ok":true'
call eve GET "$INVITE"
check "the old invite stops working" 200 "This link no longer works"
call eve GET "/i/AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA"
check "a forged link gets the same message" 200 "This link no longer works"
grep -qi "referrer-policy: no-referrer" <(curl -s -D - -o /dev/null "$BASE$INVITE") &&
  echo "PASS link pages send no Referer" || { echo "FAIL Referrer-Policy header missing"; FAILED=1; }

call ana GET /
check "home lists the league" 200 "Smoke Test"
call ana POST /api/leagues/demo/draft '{"type":"pause"}'
check "demo league is read-only" 403 '"demo_league"'
CODE=$(curl -s -o "$JARS/body" -w "%{http_code}" -b "courtline_seats=$LEAGUE:m1" "$BASE/api/leagues/$LEAGUE/draft")
BODY=$(cat "$JARS/body")
check "the old editable seat cookie grants nothing" 200 '"viewerId":null'

exit $FAILED
