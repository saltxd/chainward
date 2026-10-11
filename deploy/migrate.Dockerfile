# chainward-migrate: the migration runner + the SQL of THIS commit, run by the chart's pre-upgrade hook.
# Same client the old deploy.sh Job used (timescaledb image = psql + pg_isready + bash), pinned to the server's version.
FROM timescale/timescaledb:2.25.1-pg16
COPY deploy/run-migrations.sh /scripts/run-migrations.sh
COPY deploy/base-schema/ /base-schema/
COPY packages/db/src/migrations/ /migrations/
ENTRYPOINT []
CMD ["bash", "/scripts/run-migrations.sh"]
