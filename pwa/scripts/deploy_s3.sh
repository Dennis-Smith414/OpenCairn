#!/usr/bin/env bash
# Deploy pwa/ to the live S3 bucket (pwademo.opencairn.xyz, served via Cloudflare).
#
# Run this AFTER `node scripts/sign_release.mjs` (that bumps sw.js's VERSION and
# re-signs release.json — skipping it means the update mechanism never notices
# anything changed, since browsers detect updates by diffing sw.js's own bytes).
#
# Usage:
#   node scripts/sign_release.mjs      # from pwa/scripts/
#   ./scripts/deploy_s3.sh             # from pwa/
set -euo pipefail

BUCKET="pwademo.opencairn.xyz"
REGION="us-west-2"
export PATH="$HOME/bin:$PATH"

cd "$(dirname "$0")/.."   # always run from pwa/, regardless of caller's cwd

echo ">> Syncing pwa/ -> s3://$BUCKET/ (excluding scripts/ and package.json)"
aws s3 sync . "s3://${BUCKET}/" --delete --region "$REGION" \
  --exclude "scripts/*" \
  --exclude "package.json"

echo ">> Fixing content-types/cache-control S3 guesses wrong or that must never cache"
aws s3 cp ./index.html "s3://${BUCKET}/index.html" --region "$REGION" \
  --content-type "text/html; charset=utf-8" --cache-control "no-cache" --metadata-directive REPLACE
aws s3 cp ./sw.js "s3://${BUCKET}/sw.js" --region "$REGION" \
  --content-type "application/javascript; charset=utf-8" --cache-control "no-cache" --metadata-directive REPLACE
aws s3 cp ./release.json "s3://${BUCKET}/release.json" --region "$REGION" \
  --content-type "application/json" --cache-control "no-cache" --metadata-directive REPLACE
aws s3 cp ./release-pubkey.json "s3://${BUCKET}/release-pubkey.json" --region "$REGION" \
  --content-type "application/json" --cache-control "no-cache" --metadata-directive REPLACE
aws s3 cp ./manifest.webmanifest "s3://${BUCKET}/manifest.webmanifest" --region "$REGION" \
  --content-type "application/manifest+json" --metadata-directive REPLACE
aws s3 cp "./vendor/fonts/Open Sans Regular/0-255.pbf" "s3://${BUCKET}/vendor/fonts/Open Sans Regular/0-255.pbf" --region "$REGION" \
  --content-type "application/x-protobuf" --metadata-directive REPLACE
aws s3 cp "./vendor/fonts/Open Sans Regular/256-511.pbf" "s3://${BUCKET}/vendor/fonts/Open Sans Regular/256-511.pbf" --region "$REGION" \
  --content-type "application/x-protobuf" --metadata-directive REPLACE

echo ">> Safety check: confirm scripts/ never made it up"
if aws s3 ls "s3://${BUCKET}/scripts/" --region "$REGION" >/dev/null 2>&1; then
  echo "!! scripts/ exists in the bucket — this should never happen. Investigate before trusting this deploy." >&2
  exit 1
fi

echo ">> Done. https://${BUCKET}/"
