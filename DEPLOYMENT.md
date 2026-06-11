# Production deployment

This repository ships a Docker Compose stack for the API, Redis, and the three
frontend SPAs. PostgreSQL remains an external managed service.

## Prerequisites

- Docker Engine with Docker Compose
- A PostgreSQL database reachable from the host
- Four public HTTPS hostnames for API, customer, admin, and affiliate apps
- A TLS reverse proxy in front of the localhost-bound Compose ports

## Configure

1. Copy `.env.production.example` to `.env.production`.
2. Replace every `example.com`, database credential, and blank secret.
3. Keep `APP_ENV=production`, `AUTO_CREATE_SCHEMA=false`,
   `REQUIRE_REDIS_RATE_LIMIT=true`, and `ENABLE_HSTS=true`.
4. Set `ALLOWED_HOSTS` to the API hostname and `ALLOWED_ORIGINS` to the three
   frontend origins.

The existing VNPay implementation is intentionally unchanged. The backend still
requires its existing `VNPAY_HASH_SECRET` configuration before it can start.

## Build and migrate

```bash
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml run --rm backend alembic upgrade head
docker compose --env-file .env.production -f compose.production.yml up -d
```

Do not run `AUTO_CREATE_SCHEMA=true` in production. Review and back up the
database before applying migrations.

## Reverse proxy

Route public HTTPS hostnames to these localhost ports:

| Service | Local target |
| --- | --- |
| API | `http://127.0.0.1:8000` |
| Customer app | `http://127.0.0.1:8080` |
| Admin app | `http://127.0.0.1:8081` |
| Affiliate app | `http://127.0.0.1:8082` |

Forward the original `Host`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers.
Do not expose these ports directly to the internet.

## Verify

```bash
curl https://api.example.com/health/live
curl https://api.example.com/health/ready
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 backend
```

Production startup fails deliberately when it detects SQLite, localhost
origins/hosts, missing Redis enforcement, missing HSTS, or a missing JWT
audience. API documentation endpoints are disabled in production.
