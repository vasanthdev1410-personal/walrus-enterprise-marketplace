# Observability

The API exposes `/health`, `/health/live`, `/health/ready`, and `/metrics`. Prometheus and Grafana run
locally through Docker Compose. In production these endpoints must be restricted to internal health and
monitoring networks. Sentry and CloudWatch values are optional integration points in Module 00.

Logs are JSON on stdout. The container runtime owns collection and retention. Correlation IDs accept
only 1–128 ASCII letters, digits, periods, underscores, or hyphens; invalid values are replaced.
