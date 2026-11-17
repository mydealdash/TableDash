#!/usr/bin/env bash
# One-time (safe to re-run) creation of everything TableDash needs on AWS:
#   - Lightsail PostgreSQL database (private: only your Lightsail services can reach it)
#   - Lightsail container services: API, restaurant back office, admin console
#   - S3 + CloudFront for the two mobile web apps (diner, restaurant app)
#   - A login-signing secret stored in AWS Systems Manager Parameter Store
# Run it from the "AWS setup" GitHub workflow, or in AWS CloudShell: AWS_REGION=us-east-1 ./infra/aws/setup.sh
set -euo pipefail
cd "$(dirname "$0")"
source ./common.sh

say "Account $ACCOUNT, region $REGION"

# ---- 1. Secret used to sign logins --------------------------------------------------------------
if aws ssm get-parameter --name "/$APP/jwt-secret" >/dev/null 2>&1; then
  say "Login secret already exists"
else
  aws ssm put-parameter --name "/$APP/jwt-secret" --type SecureString --value "$(openssl rand -hex 48)" >/dev/null
  say "Created login secret"
fi

# ---- 2. Database ----------------------------------------------------------------------------------
if aws lightsail get-relational-database --relational-database-name "$DB" >/dev/null 2>&1; then
  say "Database $DB already exists"
else
  BLUEPRINT=${DB_BLUEPRINT:-$(aws lightsail get-relational-database-blueprints \
    --query "blueprints[?engine=='postgres' && isEngineDefault] | [0].blueprintId" --output text)}
  BUNDLE=${DB_BUNDLE:-$(aws lightsail get-relational-database-bundles \
    --query "sort_by(bundles[?isActive && !contains(bundleId, '_ha_')], &price) | [0].bundleId" --output text)}
  say "Creating database $DB ($BLUEPRINT, $BUNDLE). This takes 10-20 minutes."
  aws lightsail create-relational-database \
    --relational-database-name "$DB" \
    --relational-database-blueprint-id "$BLUEPRINT" \
    --relational-database-bundle-id "$BUNDLE" \
    --master-database-name "$APP" \
    --master-username tdadmin \
    --no-publicly-accessible \
    --tags key=app,value="$APP" >/dev/null
fi

# ---- 3. Container services ------------------------------------------------------------------------
create_service() { # name power
  if aws lightsail get-container-services --service-name "$1" >/dev/null 2>&1; then
    say "Container service $1 already exists"
  else
    say "Creating container service $1 ($2)"
    aws lightsail create-container-service --service-name "$1" --power "$2" --scale 1 --tags key=app,value="$APP" >/dev/null
  fi
}
create_service "$SVC_API" "${API_POWER:-micro}"
create_service "$SVC_OFFICE" "${OFFICE_POWER:-nano}"
create_service "$SVC_ADMIN" "${ADMIN_POWER:-nano}"

# ---- 4. Mobile web apps: private S3 bucket + CloudFront ------------------------------------------
create_site() { # site
  local site=$1 bucket oac dist_id
  bucket=$(bucket_for "$site")
  if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    say "Bucket $bucket already exists"
  else
    say "Creating bucket $bucket"
    if [ "$REGION" = "us-east-1" ]; then aws s3api create-bucket --bucket "$bucket" >/dev/null
    else aws s3api create-bucket --bucket "$bucket" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null; fi
    aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  fi

  oac=$(aws cloudfront list-origin-access-controls \
    --query "OriginAccessControlList.Items[?Name=='$APP-$site'].Id | [0]" --output text)
  if [ -z "$oac" ] || [ "$oac" = "None" ]; then
    oac=$(aws cloudfront create-origin-access-control --origin-access-control-config \
      "Name=$APP-$site,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
      --query OriginAccessControl.Id --output text)
  fi

  dist_id=$(distribution_id "$site")
  if [ -z "$dist_id" ] || [ "$dist_id" = "None" ]; then
    say "Creating CloudFront site for $site"
    jq -n --arg ref "$APP-$site-$(date +%s)" --arg comment "$APP-$site" \
          --arg domain "$bucket.s3.$REGION.amazonaws.com" --arg oac "$oac" '{
      CallerReference: $ref, Comment: $comment, Enabled: true, DefaultRootObject: "index.html",
      PriceClass: "PriceClass_100", HttpVersion: "http2and3",
      Origins: { Quantity: 1, Items: [ { Id: "s3", DomainName: $domain,
        S3OriginConfig: { OriginAccessIdentity: "" }, OriginAccessControlId: $oac } ] },
      DefaultCacheBehavior: { TargetOriginId: "s3", ViewerProtocolPolicy: "redirect-to-https", Compress: true,
        CachePolicyId: "658327ea-f89d-4fab-a63d-7e88639e58f6",
        AllowedMethods: { Quantity: 2, Items: ["GET","HEAD"], CachedMethods: { Quantity: 2, Items: ["GET","HEAD"] } } },
      CustomErrorResponses: { Quantity: 2, Items: [
        { ErrorCode: 403, ResponsePagePath: "/index.html", ResponseCode: "200", ErrorCachingMinTTL: 0 },
        { ErrorCode: 404, ResponsePagePath: "/index.html", ResponseCode: "200", ErrorCachingMinTTL: 0 } ] }
    }' > "/tmp/dist-$site.json"
    dist_id=$(aws cloudfront create-distribution --distribution-config "file:///tmp/dist-$site.json" \
      --query Distribution.Id --output text)
  else
    say "CloudFront site for $site already exists"
  fi

  # Only this CloudFront site may read the bucket.
  jq -n --arg b "$bucket" --arg arn "arn:aws:cloudfront::$ACCOUNT:distribution/$dist_id" '{
    Version: "2012-10-17",
    Statement: [ { Sid: "CloudFrontRead", Effect: "Allow", Principal: { Service: "cloudfront.amazonaws.com" },
      Action: "s3:GetObject", Resource: ("arn:aws:s3:::" + $b + "/*"),
      Condition: { StringEquals: { "AWS:SourceArn": $arn } } } ] }' > "/tmp/policy-$site.json"
  aws s3api put-bucket-policy --bucket "$bucket" --policy "file:///tmp/policy-$site.json"
}
create_site diner
create_site restaurant-app

# ---- 5. Wait for the database --------------------------------------------------------------------
say "Waiting for the database to be ready"
for _ in $(seq 1 90); do
  state=$(aws lightsail get-relational-database --relational-database-name "$DB" --query relationalDatabase.state --output text)
  [ "$state" = "available" ] && break
  sleep 20
done
[ "$state" = "available" ] || fail "Database is still '$state' after 30 minutes. Re-run this setup later; it picks up where it left off."

print_addresses "AWS setup finished"
