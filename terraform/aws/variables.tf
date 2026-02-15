variable "region" {
  description = "AWS region"
  type        = string
  default     = "eu-north-1"
}

variable "instance_name" {
  description = "Name tag for EC2"
  type        = string
  default     = "vps-container-orchestrator"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "ami_id" {
  description = "Optional AMI override. Leave empty for latest Ubuntu 24.04 LTS"
  type        = string
  default     = ""
}

variable "key_name" {
  description = "Existing AWS key pair name for SSH"
  type        = string
}

variable "vpc_id" {
  description = "VPC where instance is created"
  type        = string
}

variable "subnet_id" {
  description = "Public subnet ID for the instance"
  type        = string
}

variable "admin_cidrs" {
  description = "CIDR list allowed for SSH (22) and NPM admin UI (81)"
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition     = length(var.admin_cidrs) > 0
    error_message = "At least one CIDR must be provided for admin access."
  }
}

variable "deploy_user" {
  description = "Linux user used for /home/<user>/deploy-hub"
  type        = string
  default     = "ubuntu"
}

variable "root_volume_size" {
  description = "Root volume size in GB"
  type        = number
  default     = 20
}

variable "tags" {
  description = "Extra AWS tags"
  type        = map(string)
  default     = {}
}
