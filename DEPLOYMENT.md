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
   `REQUIRE_REDIS_RATE_LIMIT=true`, `ENABLE_HSTS=true`, and
   `VNPAY_MOCK_ENABLED=false`.
4. Set `ALLOWED_HOSTS` to the API hostname and `ALLOWED_ORIGINS` to the three
   frontend origins.
5. Use the GHN and VNPay production gateways. Production startup rejects
   placeholder domains, development/sandbox gateways, and mock VNPay.

VNPay uses `/api/orders/vnpay-ipn` as the payment source of truth. Register the
exact public `VNPAY_IPN_URL` in the VNPay merchant portal, configure
`VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL`, `VNPAY_API_URL`, and
`VNPAY_RETURN_URL`. Set `VNPAY_API_IP_ADDRESS` to the outbound server IP
registered with VNPay; use the production URLs issued in the merchant contract.
Then verify payment, IPN retry, admin reconciliation, and a full refund in
staging before setting `VNPAY_ENABLED=true`. Never retry a refund whose status
is `unknown`; reconcile it with VNPay support/merchant records first. Frontend
production builds reject localhost and placeholder hostnames.

Google sign-in uses one OAuth 2.0 Web client ID for both the customer frontend
and backend token verification. Set the same value in `GOOGLE_CLIENT_ID` and
`VITE_GOOGLE_CLIENT_ID`. In Google Cloud, add the customer app origin, such as
`https://shop.example.com`, under Authorized JavaScript origins. For local
development also add `http://localhost:5173`; this popup flow does not require
an Authorized redirect URI or a client secret.

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
Set HSTS at the public TLS reverse proxy and do not expose these ports directly
to the internet.

## Verify

```bash
curl https://api.example.com/health/live
curl https://api.example.com/health/ready
docker compose --env-file .env.production -f compose.production.yml ps
docker compose --env-file .env.production -f compose.production.yml logs --tail=100 backend
```

VNPay staging verification must include:

1. A successful payment confirmed by IPN, not only by Return URL.
2. A failed or abandoned payment that leaves the order payable.
3. Repeated IPN calls that do not duplicate state changes.
4. Admin QueryDR reconciliation and a full refund.
5. Cancellation only after the refund status becomes `succeeded`.

Production startup fails deliberately when it detects SQLite, localhost
origins/hosts, unsafe external gateways, missing Redis/proxy enforcement,
missing HSTS, or incomplete JWT settings. API documentation endpoints are
disabled in production.
