# Security baseline

- Production traffic uses TLS 1.2 or later; TLS 1.3 is preferred.
- PostgreSQL, Redis, metrics, and detailed readiness remain private in production.
- Containers run without root privileges where application images are controlled.
- Application logs are structured JSON on stdout and redact credentials and tokens.
- Production secrets reside in AWS Secrets Manager and are obtained through workload identity.
- CI performs dependency, secret, static, filesystem, and container scanning.
- Local ports bind to loopback and local credentials must never be reused outside development.
- Security headers follow current OWASP guidance and must be tested before production.

Authentication, authorization, privileged actions, and business audit events remain out of Module 00.
