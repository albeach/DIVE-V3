#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Spoke Pipeline Error Codes
# =============================================================================
# Standardized error codes for the spoke deployment pipeline.
# Used with the orchestration framework's orch_record_error() function.
# =============================================================================
# Version: 1.0.0
# Date: 2026-01-13
# =============================================================================

# Prevent multiple sourcing
if [ -n "$SPOKE_ERROR_CODES_LOADED" ]; then
    return 0
fi
export SPOKE_ERROR_CODES_LOADED=1

# =============================================================================
# PREFLIGHT PHASE ERROR CODES (1001-1099)
# =============================================================================

readonly SPOKE_ERROR_HUB_NOT_FOUND=1001           # Hub infrastructure not detected
readonly SPOKE_ERROR_HUB_UNHEALTHY=1002           # Hub is running but unhealthy
readonly SPOKE_ERROR_NETWORK_SETUP=1003           # Failed to create/join network
readonly SPOKE_ERROR_SECRET_LOAD=1004             # Secret loading failed
readonly SPOKE_ERROR_SECRET_VALIDATION=1005       # Secret validation failed
readonly SPOKE_ERROR_GCP_AUTH=1006                # GCP authentication failed
readonly SPOKE_ERROR_INSTANCE_CONFLICT=1007       # Instance already deploying

# =============================================================================
# INITIALIZATION PHASE ERROR CODES (1101-1199)
# =============================================================================

readonly SPOKE_ERROR_CERT_GENERATION=1101         # Certificate generation failed
readonly SPOKE_ERROR_CERT_COPY=1102               # Certificate copy failed
readonly SPOKE_ERROR_TERRAFORM_INIT=1103          # Terraform init failed
readonly SPOKE_ERROR_TERRAFORM_APPLY=1104         # Terraform apply failed
readonly SPOKE_ERROR_COMPOSE_GENERATE=1105        # Docker compose generation failed
readonly SPOKE_ERROR_DIRECTORY_SETUP=1106         # Directory structure setup failed
readonly SPOKE_ERROR_CONFIG_GENERATE=1107         # Config.json generation failed

# =============================================================================
# DEPLOYMENT PHASE ERROR CODES (1201-1299)
# =============================================================================

readonly SPOKE_ERROR_CONTAINER_START=1201         # Container failed to start
readonly SPOKE_ERROR_CONTAINER_UNHEALTHY=1202     # Container failed health check
readonly SPOKE_ERROR_SERVICE_DEPENDENCY=1203      # Service dependency not ready
readonly SPOKE_ERROR_SERVICE_TIMEOUT=1204         # Service startup timeout
readonly SPOKE_ERROR_VOLUME_CREATE=1205           # Volume creation failed
readonly SPOKE_ERROR_COMPOSE_UP=1206              # Docker compose up failed
readonly SPOKE_ERROR_STALE_CONTAINER=1207         # Stale container cleanup failed

# =============================================================================
# CONFIGURATION PHASE ERROR CODES (1301-1399)
# =============================================================================

readonly SPOKE_ERROR_FEDERATION_SETUP=1301        # Federation IdP setup failed
readonly SPOKE_ERROR_FEDERATION_REGISTER=1302     # Federation registration failed
readonly SPOKE_ERROR_FEDERATION_VERIFY=1303       # Federation verification failed
readonly SPOKE_ERROR_SECRET_SYNC=1304             # Secret synchronization failed
readonly SPOKE_ERROR_KEYCLOAK_CONFIG=1305         # Keycloak configuration failed
readonly SPOKE_ERROR_CLIENT_SECRET=1306           # Client secret mismatch
readonly SPOKE_ERROR_PROTOCOL_MAPPERS=1307        # Protocol mapper setup failed
readonly SPOKE_ERROR_OPAL_TOKEN=1308              # OPAL token provisioning failed

# =============================================================================
# VERIFICATION PHASE ERROR CODES (1401-1499)
# =============================================================================

readonly SPOKE_ERROR_HEALTH_CHECK=1401            # Health check failed
readonly SPOKE_ERROR_CONNECTIVITY=1402            # Connectivity test failed
readonly SPOKE_ERROR_AUTH_FLOW=1403               # Authentication flow test failed
readonly SPOKE_ERROR_FEDERATION_TEST=1404         # Federation test failed
readonly SPOKE_ERROR_API_HEALTH=1405              # API health check failed
readonly SPOKE_ERROR_DATABASE_CHECK=1406          # Database connectivity failed

# =============================================================================
# GENERAL ERROR CODES (1501-1599)
# =============================================================================

readonly SPOKE_ERROR_UNKNOWN=1501                 # Unknown error
readonly SPOKE_ERROR_TIMEOUT=1502                 # General timeout
readonly SPOKE_ERROR_CANCELLED=1503               # Operation cancelled
readonly SPOKE_ERROR_ROLLBACK_FAILED=1504         # Rollback operation failed
readonly SPOKE_ERROR_STATE_INVALID=1505           # Invalid state transition

# =============================================================================
# ERROR CODE LOOKUP
# =============================================================================

##
# Get human-readable description for error code
#
# Arguments:
#   $1 - Error code
#
# Returns:
#   Description string
##
spoke_error_get_description() {
    local error_code="$1"

    case "$error_code" in
        # Preflight errors
        1001) echo "Hub infrastructure not detected" ;;
        1002) echo "Hub is running but unhealthy" ;;
        1003) echo "Failed to create or join Docker network" ;;
        1004) echo "Secret loading failed from GCP and .env" ;;
        1005) echo "Secret validation failed (missing or weak)" ;;
        1006) echo "GCP authentication failed" ;;
        1007) echo "Instance deployment already in progress" ;;

        # Initialization errors
        1101) echo "Certificate generation failed" ;;
        1102) echo "Certificate copy to instance directory failed" ;;
        1103) echo "Terraform initialization failed" ;;
        1104) echo "Terraform apply failed" ;;
        1105) echo "Docker compose file generation failed" ;;
        1106) echo "Instance directory structure setup failed" ;;
        1107) echo "Config.json generation failed" ;;

        # Deployment errors
        1201) echo "Container failed to start" ;;
        1202) echo "Container failed health check" ;;
        1203) echo "Service dependency not ready" ;;
        1204) echo "Service startup timeout exceeded" ;;
        1205) echo "Docker volume creation failed" ;;
        1206) echo "Docker compose up command failed" ;;
        1207) echo "Stale container cleanup failed" ;;

        # Configuration errors
        1301) echo "Federation IdP setup failed" ;;
        1302) echo "Federation registration with Hub failed" ;;
        1303) echo "Federation verification failed" ;;
        1304) echo "Secret synchronization failed" ;;
        1305) echo "Keycloak configuration failed" ;;
        1306) echo "Client secret mismatch between components" ;;
        1307) echo "Protocol mapper setup failed" ;;
        1308) echo "OPAL token provisioning failed" ;;

        # Verification errors
        1401) echo "Health check failed" ;;
        1402) echo "Connectivity test failed" ;;
        1403) echo "Authentication flow test failed" ;;
        1404) echo "Federation test failed" ;;
        1405) echo "API health check failed" ;;
        1406) echo "Database connectivity check failed" ;;

        # General errors
        1501) echo "Unknown error occurred" ;;
        1502) echo "Operation timed out" ;;
        1503) echo "Operation was cancelled" ;;
        1504) echo "Rollback operation failed" ;;
        1505) echo "Invalid state transition" ;;

        *) echo "Unknown error code: $error_code" ;;
    esac
}

##
# Get suggested remediation for error code
#
# Arguments:
#   $1 - Error code
#   $2 - Instance code (optional)
#
# Returns:
#   Remediation suggestion string
##
spoke_error_get_remediation() {
    local error_code="$1"
    local instance_code="${2:-CODE}"

    case "$error_code" in
        # Preflight errors
        1001) echo "Deploy Hub first: ./dive hub deploy" ;;
        1002) echo "Check Hub health: ./dive hub health" ;;
        1003) echo "Recreate network: docker network rm dive-shared && docker network create dive-shared" ;;
        1004) echo "Check GCP credentials: gcloud auth application-default login" ;;
        1005) echo "Regenerate secrets: ./dive secrets create $instance_code" ;;
        1006) echo "Re-authenticate: gcloud auth application-default login" ;;
        1007) echo "Wait or clean: ./dive --instance $(lower "$instance_code") spoke clean" ;;

        # Initialization errors
        1101|1102) echo "Regenerate certs: ./dive --instance $(lower "$instance_code") spoke generate-certs" ;;
        1103|1104) echo "Retry Terraform: ./dive tf spoke apply $instance_code" ;;
        1105) echo "Check template: ls templates/spoke/docker-compose.template.yml" ;;
        1106|1107) echo "Reinitialize: ./dive spoke init $instance_code" ;;

        # Deployment errors
        1201|1202|1206) echo "Check logs: ./dive --instance $(lower "$instance_code") spoke logs" ;;
        1203|1204) echo "Increase timeout or check dependencies" ;;
        1205) echo "Check Docker disk space: docker system df" ;;
        1207) echo "Force clean: ./dive --instance $(lower "$instance_code") spoke clean --force" ;;

        # Configuration errors
        1301|1302|1303) echo "Retry federation: ./dive federation link $instance_code" ;;
        1304|1306) echo "Sync secrets: ./dive --instance $(lower "$instance_code") spoke sync-secrets" ;;
        1305|1307) echo "Reinit Keycloak: ./dive --instance $(lower "$instance_code") spoke init-keycloak" ;;
        1308) echo "Provision OPAL: ./dive --instance $(lower "$instance_code") spoke opal-token" ;;

        # Verification errors
        1401|1402) echo "Check service health: ./dive --instance $(lower "$instance_code") spoke health" ;;
        1403|1404) echo "Verify federation: ./dive federation verify $instance_code" ;;
        1405) echo "Check API: curl -k https://localhost:\${PORT}/health" ;;
        1406) echo "Check database containers are running" ;;

        # General errors
        1501) echo "Check logs for details" ;;
        1502) echo "Increase timeout values in configuration" ;;
        1503) echo "Retry the operation" ;;
        1504) echo "Manual cleanup may be required" ;;
        1505) echo "Clear state: ./dive orch-db rollback $instance_code" ;;

        *) echo "Check logs and retry" ;;
    esac
}
