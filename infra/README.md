# Infrastructure

## Local API + PostgreSQL

Create an untracked `.env` with a random password and secret, then expose it to Compose:

```bash
export POSTGRES_PASSWORD='local-only-random-password'
export SESSION_SECRET='local-only-random-secret-at-least-32-bytes'
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
curl http://127.0.0.1:3000/health/ready
```

The API container runs migrations on startup. Seed only local/staging data after the container is healthy:

```bash
docker compose -f infra/docker-compose.yml exec api node apps/api/dist/seed.js local
```

The seed prints generated synthetic-only credentials once. Production seed is hard-rejected.

## Backup and restore rehearsal

Use two different non-production database URLs. The script refuses the same source and target and refuses `NODE_ENV=production`.

```bash
SOURCE_DATABASE_URL=postgresql://.../cfls_test \
TARGET_DATABASE_URL=postgresql://.../cfls_restore \
infra/scripts/backup-restore.sh
```

## Current limits

- Rate limits are in-process. A multi-instance deployment must replace them with a shared Redis-backed limiter.
- This candidate does not claim production readiness, security approval, privacy compliance or a tested RPO/RTO.
- TLS, secrets, monitoring destinations and backup retention remain deployment-specific and require school approval.
