# shellcheck shell=bash disable=SC2034
# Shared names and helpers for the AWS scripts.
APP=${APP:-tabledash}
REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}
export AWS_REGION=$REGION AWS_DEFAULT_REGION=$REGION AWS_PAGER=""
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

DB="$APP-db"
SVC_API="$APP-api"
SVC_OFFICE="$APP-office"
SVC_ADMIN="$APP-admin"

say()  { echo "==> $*"; }
fail() { echo "::error::$*"; echo "ERROR: $*" >&2; exit 1; }

bucket_for()      { echo "$APP-$1-$ACCOUNT-$REGION"; }
distribution_id() { aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='$APP-$1'].Id | [0]" --output text; }
distribution_url(){ local d; d=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='$APP-$1'].DomainName | [0]" --output text); echo "https://$d"; }
service_url()     { aws lightsail get-container-services --service-name "$1" --query 'containerServices[0].url' --output text | sed 's#/$##'; }

print_addresses() { # title
  local out
  out=$(cat <<EOF
### $1

| What | Address |
|---|---|
| Diner app | $(distribution_url diner) |
| Restaurant app (iPad / phone) | $(distribution_url restaurant-app) |
| Restaurant back office (web) | $(service_url "$SVC_OFFICE") |
| Admin console | $(service_url "$SVC_ADMIN") |
| API | $(service_url "$SVC_API") |

Region: $REGION
EOF
)
  echo "$out"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$out" >> "$GITHUB_STEP_SUMMARY"; fi
}
