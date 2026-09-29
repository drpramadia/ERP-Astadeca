#!/usr/bin/env bash
# Hits every route on the running dev server and records the HTTP status.
# Unauthenticated requests should be redirected (3xx) to /login; a 4xx/5xx here
# or a Next.js error payload means the page is broken.
BASE="http://localhost:3000"
ROUTES=$(cd "$(dirname "$0")/.." && find src/app -name 'page.tsx' \
  | sed 's|src/app||; s|/page.tsx||' \
  | sed 's|/\[id\]|/00000000-0000-0000-0000-000000000000|g; s|/\[resource\]|/products|; s|/\[view\]|/invoices|' \
  | sed 's|^$|/|' | sort)

pass=0; fail=0
printf "%-52s %-6s %s\n" "ROUTE" "CODE" "RESULT"
printf "%-52s %-6s %s\n" "----------------------------------------------------" "------" "------"
while IFS= read -r r; do
  [ -z "$r" ] && continue
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$BASE$r")
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "308" ]; then
    res="ok"; pass=$((pass+1))
  else
    res="BROKEN"; fail=$((fail+1))
  fi
  printf "%-52s %-6s %s\n" "$r" "$code" "$res"
done <<< "$ROUTES"

echo
echo "passed=$pass broken=$fail"
