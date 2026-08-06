# Local development

## Host-development profile

Copy `.env.example` to `.env.local`, replace placeholder local passwords, and add
`GRAFANA_ADMIN_PASSWORD`. Then run:

```text
pnpm install
docker compose --env-file .env.local --profile local up -d
pnpm dev
```

The infrastructure profile binds all published ports to loopback. Nginx is available at
`http://localhost:8080`; direct host development ports remain available for debugging.

## Full-container profile

```text
docker compose --env-file .env.local --profile full up --build
```

Use this profile for integration testing and production-parity container validation. Flutter is never
containerized and runs from `apps/mobile` with `flutter run`.

## Shutdown

```text
docker compose --env-file .env.local --profile local down
docker compose --env-file .env.local --profile full down
```

Do not add `--volumes` unless persistent local data is intentionally being discarded.
