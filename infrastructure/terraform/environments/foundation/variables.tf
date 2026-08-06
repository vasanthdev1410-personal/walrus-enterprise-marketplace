variable "environment_name" {
  description = "Approved environment-qualified name."
  type        = string
}

variable "vpc_cidr" {
  description = "Approved VPC CIDR supplied by the networking owner."
  type        = string
}

variable "api_desired_count" {
  description = "Approved initial ECS API task count."
  type        = number
}
