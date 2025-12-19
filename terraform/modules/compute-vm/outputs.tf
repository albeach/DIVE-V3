# =============================================================================
# DIVE V3 - Compute VM Module Outputs
# =============================================================================

output "instance_name" {
  description = "Name of the created VM instance"
  value       = google_compute_instance.vm.name
}

output "instance_id" {
  description = "Instance ID"
  value       = google_compute_instance.vm.instance_id
}

output "self_link" {
  description = "Self link of the VM instance"
  value       = google_compute_instance.vm.self_link
}

output "external_ip" {
  description = "External IP address of the VM"
  value       = google_compute_instance.vm.network_interface[0].access_config[0].nat_ip
}

output "internal_ip" {
  description = "Internal IP address of the VM"
  value       = google_compute_instance.vm.network_interface[0].network_ip
}

output "zone" {
  description = "Zone where the VM is deployed"
  value       = google_compute_instance.vm.zone
}

output "machine_type" {
  description = "Machine type of the VM"
  value       = google_compute_instance.vm.machine_type
}

output "ssh_command" {
  description = "Command to SSH into the VM"
  value       = "gcloud compute ssh ${google_compute_instance.vm.name} --zone=${google_compute_instance.vm.zone} --project=${var.project_id} --tunnel-through-iap"
}

output "gcloud_ssh" {
  description = "gcloud SSH command without IAP tunnel"
  value       = "gcloud compute ssh ${google_compute_instance.vm.name} --zone=${google_compute_instance.vm.zone} --project=${var.project_id}"
}

output "endpoints" {
  description = "DIVE V3 service endpoints"
  value = {
    frontend_usa = "https://${google_compute_instance.vm.network_interface[0].access_config[0].nat_ip}:3000"
    backend_usa  = "https://${google_compute_instance.vm.network_interface[0].access_config[0].nat_ip}:4000"
    keycloak_usa = "https://${google_compute_instance.vm.network_interface[0].access_config[0].nat_ip}:8443"
  }
}

output "health_check_id" {
  description = "Health check resource ID (if created)"
  value       = var.create_health_check ? google_compute_health_check.vm_health[0].id : null
}

