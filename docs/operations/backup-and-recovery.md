# Backup and recovery foundation

No live resources are provisioned by Module 00. The approved production design must use PostgreSQL
continuous recovery/PITR capable of meeting RPO ≤ 15 minutes; daily snapshots alone are insufficient.
Restore exercises must validate the RTO ≤ 4 hours. Redis durability must be decided by each future use:
cache data is disposable, while durable queue/session use requires an approved recovery design.
