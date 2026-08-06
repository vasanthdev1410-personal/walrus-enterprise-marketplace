# Docker architecture

The `local` profile runs PostgreSQL, Redis, Nginx, Prometheus, and Grafana while web and API run
on the host. The `full` profile additionally builds and runs web and API containers. Flutter always
runs on the host. All published development ports bind to loopback.

TLS terminates at the future AWS load balancer in production. Local HTTP must never be treated as
a production configuration.
