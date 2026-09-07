#!/bin/sh
# Dump the whole database (custom format, compressed) to an S3-compatible bucket and prune old dumps.
# Required env: DATABASE_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL (S3 endpoint),
#   bucket name as BUCKET_NAME or AWS_S3_BUCKET_NAME (Railway's "Add to Service" uses the latter).
# Optional: AWS_REGION / AWS_DEFAULT_REGION (default auto), KEEP_DAYS (default 30), PREFIX (default pg).
set -eu
BUCKET_NAME="${BUCKET_NAME:-${AWS_S3_BUCKET_NAME:-}}"
: "${DATABASE_URL:?}" "${BUCKET_NAME:?BUCKET_NAME or AWS_S3_BUCKET_NAME}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}" "${AWS_ENDPOINT_URL:?}"
export AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-auto}}"
KEEP_DAYS="${KEEP_DAYS:-30}"
PREFIX="${PREFIX:-pg}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="wikibrain-${STAMP}.dump"

echo "[backup] pg_dump → /tmp/${FILE}"
pg_dump "$DATABASE_URL" --format=custom --compress=6 --no-owner --no-privileges --file "/tmp/${FILE}"
SIZE="$(wc -c < "/tmp/${FILE}")"
echo "[backup] ${SIZE} bytes; uploading to s3://${BUCKET_NAME}/${PREFIX}/${FILE}"
aws s3 cp "/tmp/${FILE}" "s3://${BUCKET_NAME}/${PREFIX}/${FILE}" --endpoint-url "$AWS_ENDPOINT_URL" --only-show-errors
rm -f "/tmp/${FILE}"

# Prune: file names sort lexicographically by timestamp, so compare against the cutoff name.
CUTOFF="wikibrain-$(date -u -d "@$(( $(date -u +%s) - KEEP_DAYS * 86400 ))" +%Y%m%dT%H%M%SZ).dump"
aws s3 ls "s3://${BUCKET_NAME}/${PREFIX}/" --endpoint-url "$AWS_ENDPOINT_URL" | awk '{print $4}' | while read -r name; do
  [ -n "$name" ] || continue
  if [ "$name" \< "$CUTOFF" ]; then
    echo "[backup] pruning ${name}"
    aws s3 rm "s3://${BUCKET_NAME}/${PREFIX}/${name}" --endpoint-url "$AWS_ENDPOINT_URL" --only-show-errors
  fi
done
echo "[backup] done ${FILE}"
psql "$DATABASE_URL" -q -c "INSERT INTO ops_status (key, value, at) VALUES ('backup', '{\"file\": \"${FILE}\", \"bytes\": ${SIZE}}', now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, at = now()" || echo "[backup] could not record status (ops_status table missing?)"

# Weekly restore drill (Mondays, or VERIFY=1): re-download the newest dump and restore it into a scratch database.
# A failure makes this cron run fail, which shows up red in Railway's cron history.
if [ "$(date -u +%u)" = "1" ] || [ "${VERIFY:-0}" = "1" ]; then
  echo "[backup] running restore drill"
  sh "$(dirname "$0")/verify.sh"
fi
