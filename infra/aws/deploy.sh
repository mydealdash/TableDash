#!/usr/bin/env bash
# Builds and deploys every part of TableDash to the AWS resources made by setup.sh.
# Run from the "Deploy to AWS" GitHub workflow (runs on every push once AWS is set up).
# Needs: aws CLI, lightsailctl, docker, node 22, jq.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$(dirname "$0")"
source ./common.sh
ONLY=${ONLY:-all}   # all | api | web | mobile

API_URL=$(service_url "$SVC_API")
OFFICE_URL=$(service_url "$SVC_OFFICE")
[ -n "$API_URL" ] && [ "$API_URL" != "None" ] || fail "AWS isn't set up yet. Run the 'AWS setup' workflow first."
say "API address: $API_URL"

# Upload a local image to a container service; prints the name to deploy it by.
push_image() { # service label local-image
  local out
  out=$(aws lightsail push-container-image --service-name "$1" --label "$2" --image "$3")
  echo "$out" >&2
  echo "$out" | grep -o '":[^"]*"' | tail -1 | tr -d '"'
}

# Start a new deployment of one container on a service.
deploy_service() { # service image port health-path env-json
  local containers endpoint
  containers=$(jq -n --arg img "$2" --arg port "$3" --argjson env "$5" \
    '{app: {image: $img, ports: {($port): "HTTP"}, environment: $env}}')
  endpoint=$(jq -n --arg port "$3" --arg path "$4" '{containerName: "app", containerPort: ($port|tonumber),
    healthCheck: {path: $path, intervalSeconds: 30, timeoutSeconds: 10, healthyThreshold: 2, unhealthyThreshold: 8, successCodes: "200-399"}}')
  aws lightsail create-container-service-deployment --service-name "$1" \
    --containers "$containers" --public-endpoint "$endpoint" >/dev/null
  say "Deployment started on $1"
}

# Wait until the newest deployment on a service is live (or report why it failed).
wait_service() { # service
  local state
  for _ in $(seq 1 60); do
    sleep 20
    state=$(aws lightsail get-container-service-deployments --service-name "$1" \
      --query 'sort_by(deployments, &version)[-1].state' --output text)
    case "$state" in
      ACTIVE) say "$1 is live"; return 0 ;;
      FAILED)
        echo "---- last log lines from $1 ----"
        aws lightsail get-container-log --service-name "$1" --container-name app \
          --query 'logEvents[-60:].message' --output text | tr '\t' '\n' || true
        fail "$1 did not start. The log above shows why." ;;
    esac
  done
  fail "$1 is still deploying after 20 minutes."
}

WAIT=()
if [ "$ONLY" = all ] || [ "$ONLY" = api ]; then
  say "Building the API"
  docker build -f "$ROOT/apps/api/Dockerfile" -t "$APP-api:latest" "$ROOT"
  DB_HOST=$(aws lightsail get-relational-database --relational-database-name "$DB" --query relationalDatabase.masterEndpoint.address --output text)
  DB_PORT=$(aws lightsail get-relational-database --relational-database-name "$DB" --query relationalDatabase.masterEndpoint.port --output text)
  DB_USER=$(aws lightsail get-relational-database --relational-database-name "$DB" --query relationalDatabase.masterUsername --output text)
  DB_NAME=$(aws lightsail get-relational-database --relational-database-name "$DB" --query relationalDatabase.masterDatabaseName --output text)
  DB_PASS=$(aws lightsail get-relational-database-master-user-password --relational-database-name "$DB" --password-version CURRENT --query masterUserPassword --output text)
  echo "::add-mask::$DB_PASS"
  DB_PASS_ENC=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1], safe=""))' "$DB_PASS")
  JWT=$(aws ssm get-parameter --name "/$APP/jwt-secret" --with-decryption --query Parameter.Value --output text)
  echo "::add-mask::$JWT"

  ENV=$(jq -n \
    --arg db "postgresql://$DB_USER:$DB_PASS_ENC@$DB_HOST:$DB_PORT/$DB_NAME" \
    --arg jwt "$JWT" \
    --arg google "${GOOGLE_MAPS_API_KEY:-}" \
    --arg otp "${SHOW_DEV_OTP:-true}" \
    --arg cors "${CORS_ORIGINS:-*}" \
    '{DATABASE_URL: $db, DATABASE_SSL: "require", JWT_SECRET: $jwt, CORS_ORIGINS: $cors,
      SHOW_DEV_OTP: $otp, PLATFORM_FEE_BPS: "200", NOTIFY_PRIORITY_WINDOW_SECONDS: "120",
      PARTNER_KEYS: "demo-partner:demo-partner-key", PORT: "4000"}
     + (if $google == "" then {} else {GOOGLE_MAPS_API_KEY: $google} end)')
  IMG=$(push_image "$SVC_API" api "$APP-api:latest")
  deploy_service "$SVC_API" "$IMG" 4000 /health "$ENV"
  WAIT+=("$SVC_API")
fi

if [ "$ONLY" = all ] || [ "$ONLY" = web ]; then
  say "Building the restaurant back office and admin console"
  docker build -f "$ROOT/apps/restaurant/Dockerfile" --build-arg NEXT_PUBLIC_API_URL="$API_URL" -t "$APP-office:latest" "$ROOT"
  docker build -f "$ROOT/apps/admin/Dockerfile" --build-arg NEXT_PUBLIC_API_URL="$API_URL" \
    --build-arg NEXT_PUBLIC_RESTAURANT_APP_URL="$OFFICE_URL" -t "$APP-admin:latest" "$ROOT"
  IMG=$(push_image "$SVC_OFFICE" web "$APP-office:latest")
  deploy_service "$SVC_OFFICE" "$IMG" 3001 /login '{}'
  WAIT+=("$SVC_OFFICE")
  IMG=$(push_image "$SVC_ADMIN" web "$APP-admin:latest")
  deploy_service "$SVC_ADMIN" "$IMG" 3002 / '{}'
  WAIT+=("$SVC_ADMIN")
fi

if [ "$ONLY" = all ] || [ "$ONLY" = mobile ]; then
  for site in diner restaurant-app; do
    say "Building the $site web app"
    (cd "$ROOT/apps/$site" && npm ci --no-audit --no-fund && rm -rf dist && \
      EXPO_PUBLIC_API_URL="$API_URL" npx expo export --platform web --output-dir dist)
    bucket=$(bucket_for "$site")
    # Hashed files never change, so browsers may keep them; everything else is always re-checked.
    aws s3 sync "$ROOT/apps/$site/dist" "s3://$bucket" --delete --only-show-errors \
      --exclude "*" --include "_expo/*" --include "assets/*" --cache-control "public,max-age=31536000,immutable"
    aws s3 sync "$ROOT/apps/$site/dist" "s3://$bucket" --delete --only-show-errors \
      --exclude "_expo/*" --exclude "assets/*" --cache-control "no-cache"
    aws cloudfront create-invalidation --distribution-id "$(distribution_id "$site")" --paths "/*" >/dev/null
    say "$site uploaded"
  done
fi

for svc in "${WAIT[@]}"; do wait_service "$svc"; done
print_addresses "Deployed to AWS"
