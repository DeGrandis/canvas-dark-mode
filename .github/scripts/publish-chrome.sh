#!/usr/bin/env bash
# Uploads extension.zip to the Chrome Web Store and submits it for review, calling the
# Chrome Web Store API v2 directly: https://developer.chrome.com/docs/webstore/using-api
#
# Needs EXTENSION_ID, PUBLISHER_ID, CLIENT_ID, CLIENT_SECRET and REFRESH_TOKEN.
set -euo pipefail

api=https://chromewebstore.googleapis.com
item="publishers/$PUBLISHER_ID/items/$EXTENSION_ID"

field() {
  python3 -c 'import json, sys; print(json.load(sys.stdin).get(sys.argv[1], ""))' "$1"
}

fail() {
  echo "::error::$1"
  exit 1
}

# This response holds the access token, so it is only printed when the request fails.
response=$(curl -sS --fail-with-body https://oauth2.googleapis.com/token \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET" \
  --data-urlencode "refresh_token=$REFRESH_TOKEN" \
  --data-urlencode grant_type=refresh_token) || fail "Token request failed: $response"
token=$(field access_token <<<"$response")
[ -n "$token" ] || fail "No access token in the response"
# The access token is not a stored secret, so GitHub would not hide it in logs by itself.
echo "::add-mask::$token"
auth="Authorization: Bearer $token"

response=$(curl -sS --fail-with-body -X POST -H "$auth" -T extension.zip \
  "$api/upload/v2/$item:upload") || fail "Upload failed: $response"
echo "$response"
state=$(field uploadState <<<"$response")

# Google's docs name the waiting state both IN_PROGRESS and UPLOAD_IN_PROGRESS.
for _ in $(seq 60); do
  case $state in
    IN_PROGRESS | UPLOAD_IN_PROGRESS) ;;
    *) break ;;
  esac
  sleep 5
  response=$(curl -sS --fail-with-body -H "$auth" "$api/v2/$item:fetchStatus") \
    || fail "Status check failed: $response"
  state=$(field lastAsyncUploadState <<<"$response")
done
[ "$state" = SUCCEEDED ] || fail "Upload ended as ${state:-unknown}"

response=$(curl -sS --fail-with-body -X POST -H "$auth" -H 'Content-Type: application/json' \
  -d '{"publishType": "DEFAULT_PUBLISH"}' "$api/v2/$item:publish") || fail "Publish failed: $response"
echo "$response"
state=$(field state <<<"$response")
case $state in
  PENDING_REVIEW | PUBLISHED | STAGED) echo "Submitted, store state: $state" ;;
  *) fail "Publish ended as ${state:-unknown}" ;;
esac
