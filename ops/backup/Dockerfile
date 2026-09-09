# Nightly Postgres backup: run this image on a scheduler (cron service, Kubernetes CronJob, systemd timer).
# pg_dump must be >= the server's major version, so start from the postgres image.
FROM postgres:18-alpine
RUN apk add --no-cache aws-cli
COPY backup.sh /backup.sh
COPY verify.sh /verify.sh
RUN chmod +x /backup.sh
ENTRYPOINT ["/backup.sh"]
