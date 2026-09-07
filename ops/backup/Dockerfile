# Nightly Postgres backup for the hosted version (Railway cron service; see DEPLOY.md "備份").
# pg_dump must be >= the server major version (Railway Postgres is 18.x), so start from the postgres image.
FROM postgres:18-alpine
RUN apk add --no-cache aws-cli
COPY backup.sh /backup.sh
RUN chmod +x /backup.sh
ENTRYPOINT ["/backup.sh"]
