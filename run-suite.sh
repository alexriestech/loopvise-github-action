#!/usr/bin/env bash
set -euo pipefail

BODY=$(jq -n \
  --arg suiteId "$SUITE_ID" \
  --arg spaceId "$SPACE_ID" \
  --arg environmentId "$ENVIRONMENT_ID" \
  --arg browser "$BROWSER" \
  --arg triggeredByUserId "$TRIGGERED_BY_USER_ID" \
  '{
    suiteId: $suiteId,
    spaceId: $spaceId
  }
  | if $environmentId != "" then . + {environmentId: $environmentId} else . end
  | if $browser != "" then . + {browser: $browser} else . end
  | if $triggeredByUserId != "" then . + {triggeredByUserId: $triggeredByUserId} else . end')

START_JSON=$(curl -fsS -X POST "$API_BASE/suites/run" \
  -H "Content-Type: application/json" \
  -d "$BODY")

SUITE_RUN_ID=$(echo "$START_JSON" | jq -r '.suiteRunId')
echo "suite_run_id=$SUITE_RUN_ID" >> "$GITHUB_OUTPUT"
echo "Started suite run: $SUITE_RUN_ID"

DEADLINE=$(($(date +%s) + TIMEOUT_MINUTES * 60))

while true; do
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "Timed out after ${TIMEOUT_MINUTES} minutes"
    exit 1
  fi

  STATUS_BODY=$(jq -n --arg suiteRunId "$SUITE_RUN_ID" '{suiteRunId: $suiteRunId}')
  STATUS_JSON=$(curl -fsS -X POST "$API_BASE/suites/run/status" \
    -H "Content-Type: application/json" \
    -d "$STATUS_BODY")

  RUN_COUNT=$(echo "$STATUS_JSON" | jq '(.runs // []) | length')
  RUNNING_COUNT=$(echo "$STATUS_JSON" | jq '[(.runs // [])[] | select(.status == "pending" or .status == "queued" or .status == "running")] | length')

  if [ "$RUN_COUNT" -eq 0 ] || [ "$RUNNING_COUNT" -gt 0 ]; then
    sleep "$POLL_INTERVAL_SECONDS"
    continue
  fi

  echo "$STATUS_JSON" | jq -r '(.runs // [])[] | "Run \(.id): status=\(.status) page=\(.runs_page_url)"'

  FAILED_STATUS_COUNT=$(echo "$STATUS_JSON" | jq '[(.runs // [])[] | select(.status == "failed" or .status == "error" or .status == "cancelled")] | length')
  FAILED_CHECK_COUNT=$(echo "$STATUS_JSON" | jq '[(.runs // [])[] | .check_results[]? | select(.succeeded == false)] | length')

  if [ "$FAILED_STATUS_COUNT" -gt 0 ] || [ "$FAILED_CHECK_COUNT" -gt 0 ]; then
    echo "$STATUS_JSON" | jq .
    exit 1
  fi

  echo "Suite run completed successfully"
  exit 0
done
