output "planned_engines" {
  description = "Placeholder managed data service versions."
  value = {
    postgres = var.postgres_engine_version
    redis    = var.redis_engine_version
  }
}
