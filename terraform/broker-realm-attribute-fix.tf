# ============================================
# WORKAROUND: Force User Attributes via null_resource
# ============================================
# Issue: Keycloak Terraform Provider 5.5.0 has a bug where user attributes
# appear in Terraform state but don't persist to Keycloak
# 
# Root Cause: Provider doesn't correctly handle attribute updates
# 
# Solution: Use null_resource with triggers to force attributes via REST API
# This runs on EVERY terraform apply when attributes change
# 
# See: KEYCLOAK-UPDATE-ASSESSMENT.md for full analysis
# ============================================

resource "null_resource" "force_broker_super_admin_attributes" {
  count = var.create_test_users ? 1 : 0
  
  # Trigger whenever user attributes change in Terraform config
  # This ensures the provisioner runs on EVERY apply, not just first creation
  triggers = {
    user_id              = keycloak_user.broker_super_admin[0].id
    uniqueID             = "admin@dive-v3.pilot"
    clearance            = "TOP_SECRET"
    countryOfAffiliation = "USA"
    acpCOI               = "NATO-COSMIC,FVEY,CAN-US"
    dutyOrg              = "DIVE_ADMIN"
    orgUnit              = "SYSTEM_ADMINISTRATION"
    # Force re-run: Change this value to force attribute sync
    # Useful for debugging: set to timestamp or random value
    force_sync           = "2025-10-26-v1"
  }
  
  # Force attributes via Keycloak Admin REST API
  provisioner "local-exec" {
    command = <<-EOT
      ${path.module}/../scripts/terraform-sync-attributes.sh \
        '${keycloak_user.broker_super_admin[0].id}' \
        'dive-v3-broker' \
        '{
          "attributes": {
            "uniqueID": ["admin@dive-v3.pilot"],
            "clearance": ["TOP_SECRET"],
            "countryOfAffiliation": ["USA"],
            "acpCOI": ["NATO-COSMIC", "FVEY", "CAN-US"],
            "dutyOrg": ["DIVE_ADMIN"],
            "orgUnit": ["SYSTEM_ADMINISTRATION"]
          }
        }'
    EOT
  }
  
  depends_on = [
    keycloak_user.broker_super_admin,
    keycloak_user_roles.broker_super_admin_roles
  ]
}


