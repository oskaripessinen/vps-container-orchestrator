output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.orchestrator.id
}

output "public_ip" {
  description = "Elastic IP for the server"
  value       = aws_eip.orchestrator.public_ip
}

output "security_group_id" {
  description = "Security group ID"
  value       = aws_security_group.orchestrator.id
}

output "ssh_command" {
  description = "Ready-to-use SSH command"
  value       = "ssh ${var.deploy_user}@${aws_eip.orchestrator.public_ip}"
}
