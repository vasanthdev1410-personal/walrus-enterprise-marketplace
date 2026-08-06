variable "name" {
  description = "Environment-qualified network name."
  type        = string
}

variable "vpc_cidr" {
  description = "Approved VPC CIDR."
  type        = string
}
