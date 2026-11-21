# chainward-migrate: the migration runner + the SQL of THIS commit, run by the chart's pre-upgrade hook.
# Same client the old deploy.sh Job used (timescaledb image = psql + pg_isready + bash), pinned to the server's version.
FROM timescale/timescaledb:2.32.1-pg16@sha256:5d7a2f9d9d593315368338aa6054fda37d7707b4a12a912e30dcb7523385e2b4
COPY deploy/run-migrations.sh /scripts/run-migrations.sh
COPY deploy/base-schema/ /base-schema/
COPY packages/db/src/migrations/ /migrations/
ENTRYPOINT []
CMD ["bash", "/scripts/run-migrations.sh"]
