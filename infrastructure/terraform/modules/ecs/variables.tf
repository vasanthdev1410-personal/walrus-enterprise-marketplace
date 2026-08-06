variable "name" {
  description = "Environment-qualified ECS service name."
  type        = string
}

variable "container_port" {
  description = "Application container port."
  type        = number
}

variable "desired_count" {
  description = "Approved desired task count."
  type        = number

  validation {
    condition     = var.desired_count > 0
    error_message = "desired_count must be positive."
  }
}
