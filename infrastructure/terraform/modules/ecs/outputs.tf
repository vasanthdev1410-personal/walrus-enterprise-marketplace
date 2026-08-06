output "planned_service" {
  description = "Placeholder ECS Fargate service plan."
  value = {
    name           = var.name
    container_port = var.container_port
    desired_count  = var.desired_count
  }
}
