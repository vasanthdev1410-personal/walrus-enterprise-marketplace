module "network_plan" {
  source   = "../../modules/network"
  name     = var.environment_name
  vpc_cidr = var.vpc_cidr
}

module "api_plan" {
  source         = "../../modules/ecs"
  name           = "${var.environment_name}-api"
  container_port = 4000
  desired_count  = var.api_desired_count
}

module "data_plan" { source = "../../modules/data" }
module "observability_plan" { source = "../../modules/observability" }

output "foundation_plan" {
  description = "Non-deploying foundation interface validation output."
  value = {
    network       = module.network_plan.planned_name
    api           = module.api_plan.planned_service
    data          = module.data_plan.planned_engines
    log_retention = module.observability_plan.planned_log_retention_days
  }
}
