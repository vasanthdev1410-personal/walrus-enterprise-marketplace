# WALRUS Enterprise Marketplace Platform

Production-oriented engineering foundation for the WALRUS multi-vendor marketplace.
Module 00 contains platform scaffolding only; it intentionally contains no business modules.

## Prerequisites

- Node.js 26.6.0
- pnpm 10.34.5
- Docker Engine with Docker Compose
- Flutter stable with Dart stable
- Terraform stable (for validation only; no live resources are created)

## Local startup

1. Copy `.env.example` to `.env.local` and replace local placeholder passwords.
2. Run `pnpm install`.
3. Run `docker compose --profile local up -d`.
4. Run `pnpm dev`.
5. Run Flutter separately from `apps/mobile` with `flutter run`.

The web foundation is available at `http://localhost:3000`, the API at
`http://localhost:4000/api/v1`, Grafana at `http://localhost:3001`, and Prometheus at
`http://localhost:9090`.

For the production-parity local profile, run:

```text
docker compose --profile full up --build
```

See [docs/development/local-development.md](docs/development/local-development.md) for details.
