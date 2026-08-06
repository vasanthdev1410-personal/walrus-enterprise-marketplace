variable "postgres_engine_version" {
  description = "Approved PostgreSQL engine line."
  type        = string
  default     = "17"
}

variable "redis_engine_version" {
  description = "Approved Redis engine line."
  type        = string
  default     = "8"
}
