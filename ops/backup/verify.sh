#!/bin/sh
# Restore drill: fetch the newest dump from the bucket, validate the archive, restore it into a scratch database on the
# same Postgres server, count rows, then drop the scratch database. Non-zero exit = the backup is not restorable.
# Run weekly as a Railway cron service (same image as backup, Start Command `sh /app/verify.sh`), or locally with the
# bucket credentials. Env: same as backup.sh; SCRATCH_DB (default wikibrain_restore_check); MIN_NOTES (default 1).
set -eu
BUCKET_NAME="${BUCKET_NAME:-${AWS_S3_BUCKET_NAME:-}}"
: "${DATABASE_URL:?}" "${BUCKET_NAME:?}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}" "${AWS_ENDPOINT_URL:?}"
export AWS_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-auto}}"
PREFIX="${PREFIX:-pg}"; SCRATCH_DB="${SCRATCH_DB:-wikibrain_restore_check}"; MIN_NOTES="${MIN_NOTES:-1}"

LATEST="$(aws s3 ls "s3://${BUCKET_NAME}/${PREFIX}/" --endpoint-url "$AWS_ENDPOINT_URL" | awk '{print $4}' | grep '^wikibrain-.*\.dump$' | sort | tail -n 1)"
[ -n "$LATEST" ] || { echo "[verify] no dumps found under s3://${BUCKET_NAME}/${PREFIX}/"; exit 2; }
AGE_H=$(( ( $(date -u +%s) - $(date -u -d "$(echo "$LATEST" | sed -E 's/wikibrain-([0-9]{8})T([0-9]{2})([0-9]{2})([0-9]{2})Z\.dump/\1 \2:\3:\4/')" +%s) ) / 3600 ))
echo "[verify] newest dump ${LATEST} (${AGE_H} h old)"
[ "$AGE_H" -le 36 ] || { echo "[verify] newest dump is older than 36 h: the daily backup is not running"; exit 3; }

aws s3 cp "s3://${BUCKET_NAME}/${PREFIX}/${LATEST}" /tmp/latest.dump --endpoint-url "$AWS_ENDPOINT_URL" --only-show-errors
SIZE="$(wc -c < /tmp/latest.dump)"; echo "[verify] ${SIZE} bytes"
[ "$SIZE" -gt 10240 ] || { echo "[verify] dump suspiciously small"; exit 4; }
pg_restore --list /tmp/latest.dump > /tmp/toc.txt
grep -q 'TABLE DATA public notes' /tmp/toc.txt || { echo "[verify] archive has no notes table data"; exit 5; }

# Scratch database on the same server (DATABASE_URL points at the app database; swap the db name).
ADMIN_URL="$(echo "$DATABASE_URL" | sed -E 's#/[^/?]+(\?.*)?$#/postgres\1#')"
SCRATCH_URL="$(echo "$DATABASE_URL" | sed -E "s#/[^/?]+(\?.*)?\$#/${SCRATCH_DB}\1#")"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};" -c "CREATE DATABASE ${SCRATCH_DB};"
trap 'psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};" || true' EXIT
echo "[verify] restoring into ${SCRATCH_DB}"
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$SCRATCH_URL" /tmp/latest.dump
NOTES="$(psql "$SCRATCH_URL" -tA -c 'SELECT count(*) FROM notes')"
WS="$(psql "$SCRATCH_URL" -tA -c 'SELECT count(*) FROM workspaces')"
USERS="$(psql "$SCRATCH_URL" -tA -c 'SELECT count(*) FROM "user"')"
echo "[verify] restored: users=${USERS} workspaces=${WS} notes=${NOTES}"
[ "$NOTES" -ge "$MIN_NOTES" ] || { echo "[verify] fewer notes than MIN_NOTES=${MIN_NOTES}"; exit 6; }
rm -f /tmp/latest.dump /tmp/toc.txt
echo "[verify] OK ${LATEST}"
