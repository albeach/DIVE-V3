#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — AWS Module
# =============================================================================
# EC2 instance management for dev/staging environments.
#
# Commands:
#   ./dive aws launch   --role hub|spoke [--env dev|staging]
#   ./dive aws terminate <instance-id>
#   ./dive aws status
#   ./dive aws ssh       [--role hub|spoke]
#   ./dive aws list
#   ./dive aws bootstrap <instance-id>
#   ./dive aws ecr setup
#   ./dive aws ecr push  [service...]
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-18
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_AWS_MODULE_LOADED:-}" ] && return 0
export DIVE_AWS_MODULE_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

AWS_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$AWS_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# Tag prefix for all DIVE-managed EC2 instances
AWS_TAG_PREFIX="dive-v3"
AWS_TAG_PROJECT="DIVE-V3"

# AMI lookup: Ubuntu 24.04 LTS (Noble)
# Canonical GovCloud owner: 513442679011
AWS_AMI_NAME_FILTER="${DIVE_AWS_AMI_FILTER:-ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*}"
AWS_AMI_OWNER="${DIVE_AWS_AMI_OWNER:-513442679011}"

# Security group names
AWS_SG_HUB_NAME="dive-${ENVIRONMENT}-hub-sg"
AWS_SG_SPOKE_NAME="dive-${ENVIRONMENT}-spoke-sg"

# Bootstrap script path
BOOTSTRAP_SCRIPT="${DIVE_ROOT}/scripts/aws/bootstrap-ec2.sh"

# =============================================================================
# HELPERS
# =============================================================================

##
# Ensure AWS CLI is available and authenticated
##
aws_require_auth() {
    if ! command -v aws >/dev/null 2>&1; then
        log_error "AWS CLI not found. Install with: brew install awscli"
        return 1
    fi
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS not authenticated. Run: aws configure"
        return 1
    fi
}

##
# Resolve the latest AMI ID for the configured OS
##
aws_resolve_ami() {
    aws ec2 describe-images \
        --owners "$AWS_AMI_OWNER" \
        --filters "Name=name,Values=${AWS_AMI_NAME_FILTER}" \
                  "Name=state,Values=available" \
                  "Name=architecture,Values=x86_64" \
        --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
        --output text \
        --region "$AWS_REGION"
}

##
# Get the default VPC ID
##
aws_default_vpc() {
    # Prefer existing dive-v3-vpc if available
    local dive_vpc
    dive_vpc=$(aws ec2 describe-vpcs \
        --filters "Name=tag:Name,Values=dive-v3-vpc" \
        --query 'Vpcs[0].VpcId' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null)
    if [ -n "$dive_vpc" ] && [ "$dive_vpc" != "None" ]; then
        echo "$dive_vpc"
        return 0
    fi
    # Fall back to default VPC
    aws ec2 describe-vpcs \
        --filters "Name=isDefault,Values=true" \
        --query 'Vpcs[0].VpcId' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null
}

##
# Get or create a security group for DIVE services
#
# Arguments:
#   $1 - Role: hub or spoke
##
aws_ensure_security_group() {
    local role="$1"
    local sg_name="dive-${ENVIRONMENT}-${role}-sg"
    local vpc_id
    vpc_id=$(aws_default_vpc)

    # Check for existing dive-v3-app-sg (shared SG for all roles)
    local existing_sg
    existing_sg=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=dive-v3-app-sg" "Name=vpc-id,Values=${vpc_id}" \
        --query 'SecurityGroups[0].GroupId' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null)
    if [ -n "$existing_sg" ] && [ "$existing_sg" != "None" ]; then
        log_info "Using existing security group: dive-v3-app-sg ($existing_sg)" >&2
        echo "$existing_sg"
        return 0
    fi

    # Check if role-specific SG already exists
    local sg_id
    sg_id=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=${sg_name}" "Name=vpc-id,Values=${vpc_id}" \
        --query 'SecurityGroups[0].GroupId' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null)

    if [ -n "$sg_id" ] && [ "$sg_id" != "None" ]; then
        echo "$sg_id"
        return 0
    fi

    log_info "Creating security group: $sg_name" >&2
    sg_id=$(aws ec2 create-security-group \
        --group-name "$sg_name" \
        --description "DIVE V3 ${ENVIRONMENT} ${role} services" \
        --vpc-id "$vpc_id" \
        --query 'GroupId' \
        --output text \
        --region "$AWS_REGION")

    # Tag it
    aws ec2 create-tags \
        --resources "$sg_id" \
        --tags "Key=Project,Value=${AWS_TAG_PROJECT}" \
               "Key=Environment,Value=${ENVIRONMENT}" \
               "Key=Role,Value=${role}" \
        --region "$AWS_REGION"

    # SSH
    aws ec2 authorize-security-group-ingress \
        --group-id "$sg_id" \
        --protocol tcp --port 22 --cidr 0.0.0.0/0 \
        --region "$AWS_REGION" >/dev/null

    # Common DIVE ports
    local ports
    if [ "$role" = "hub" ]; then
        ports=(3000 4000 8080 8443 9000 7002 8181 8200 8085)
    else
        # Spoke gets standard ports (one spoke per EC2)
        ports=(3000 4000 8080 8443 8181 8085 7000)
    fi

    for port in "${ports[@]}"; do
        aws ec2 authorize-security-group-ingress \
            --group-id "$sg_id" \
            --protocol tcp --port "$port" --cidr 0.0.0.0/0 \
            --region "$AWS_REGION" >/dev/null 2>&1 || true
    done

    # Allow all traffic within the SG (inter-service)
    aws ec2 authorize-security-group-ingress \
        --group-id "$sg_id" \
        --protocol -1 --source-group "$sg_id" \
        --region "$AWS_REGION" >/dev/null 2>&1 || true

    log_success "Security group created: $sg_id ($sg_name)" >&2
    echo "$sg_id"
}

##
# Find DIVE EC2 instances by tags
#
# Arguments:
#   $1 - Role filter (optional): hub, spoke, or empty for all
##
aws_find_instances() {
    local role_filter="${1:-}"
    local filters=(
        "Name=tag:Project,Values=${AWS_TAG_PROJECT}"
        "Name=tag:Environment,Values=${ENVIRONMENT}"
        "Name=instance-state-name,Values=running,stopped,pending"
    )
    [ -n "$role_filter" ] && filters+=("Name=tag:Role,Values=${role_filter}")

    aws ec2 describe-instances \
        --filters "${filters[@]}" \
        --query 'Reservations[].Instances[].{
            ID:InstanceId,
            State:State.Name,
            Type:InstanceType,
            IP:PublicIpAddress,
            PrivateIP:PrivateIpAddress,
            Role:Tags[?Key==`Role`]|[0].Value,
            Name:Tags[?Key==`Name`]|[0].Value,
            Spoke:Tags[?Key==`SpokeCode`]|[0].Value,
            Launch:LaunchTime
        }' \
        --output table \
        --region "$AWS_REGION"
}

##
# Get public IP of a DIVE instance by role
#
# Arguments:
#   $1 - Role: hub or spoke
#   $2 - Spoke code (optional, for spoke role)
##
aws_get_instance_ip() {
    local role="$1"
    local spoke_code="${2:-}"
    local filters=(
        "Name=tag:Project,Values=${AWS_TAG_PROJECT}"
        "Name=tag:Environment,Values=${ENVIRONMENT}"
        "Name=tag:Role,Values=${role}"
        "Name=instance-state-name,Values=running"
    )
    [ -n "$spoke_code" ] && filters+=("Name=tag:SpokeCode,Values=$(echo "$spoke_code" | tr '[:lower:]' '[:upper:]')")

    aws ec2 describe-instances \
        --filters "${filters[@]}" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text \
        --region "$AWS_REGION"
}

##
# Get instance ID of a DIVE instance by role
##
aws_get_instance_id() {
    local role="$1"
    local spoke_code="${2:-}"
    local filters=(
        "Name=tag:Project,Values=${AWS_TAG_PROJECT}"
        "Name=tag:Environment,Values=${ENVIRONMENT}"
        "Name=tag:Role,Values=${role}"
        "Name=instance-state-name,Values=running"
    )
    [ -n "$spoke_code" ] && filters+=("Name=tag:SpokeCode,Values=$(echo "$spoke_code" | tr '[:lower:]' '[:upper:]')")

    aws ec2 describe-instances \
        --filters "${filters[@]}" \
        --query 'Reservations[0].Instances[0].InstanceId' \
        --output text \
        --region "$AWS_REGION"
}

# =============================================================================
# CORE COMMANDS
# =============================================================================

##
# Launch a new EC2 instance for DIVE
#
# Options:
#   --role hub|spoke     (required)
#   --spoke-code CODE    (required for spoke role)
#   --instance-type TYPE (optional, overrides env default)
#   --no-bootstrap       Skip running bootstrap script
##
aws_launch() {
    aws_require_auth || return 1

    local role=""
    local spoke_code=""
    local instance_type="${DIVE_AWS_INSTANCE_TYPE}"
    local skip_bootstrap=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --role)        role="$2"; shift 2 ;;
            --spoke-code)  spoke_code="$2"; shift 2 ;;
            --instance-type) instance_type="$2"; shift 2 ;;
            --no-bootstrap) skip_bootstrap=true; shift ;;
            *) log_error "Unknown option: $1"; return 1 ;;
        esac
    done

    if [ -z "$role" ]; then
        log_error "Usage: ./dive aws launch --role hub|spoke [--spoke-code GBR]"
        return 1
    fi

    if [ "$role" = "spoke" ] && [ -z "$spoke_code" ]; then
        log_error "Spoke launches require --spoke-code. Example: --spoke-code GBR"
        return 1
    fi

    # Instance naming
    local instance_name="dive-${ENVIRONMENT}-${role}"
    [ -n "$spoke_code" ] && instance_name="${instance_name}-$(echo "$spoke_code" | tr '[:upper:]' '[:lower:]')"

    # Check for existing instance
    local existing_id
    existing_id=$(aws_get_instance_id "$role" "$spoke_code" 2>/dev/null)
    if [ -n "$existing_id" ] && [ "$existing_id" != "None" ]; then
        log_warn "Instance already exists: $existing_id ($instance_name)"
        log_info "Use './dive aws terminate $existing_id' to remove it first."
        return 1
    fi

    log_info "Launching EC2 instance: $instance_name ($instance_type)"

    # Resolve AMI
    log_info "Resolving latest AMI..."
    local ami_id
    ami_id=$(aws_resolve_ami)
    if [ -z "$ami_id" ] || [ "$ami_id" = "None" ]; then
        log_error "Could not resolve AMI for filter: $AWS_AMI_NAME_FILTER"
        return 1
    fi
    log_info "AMI: $ami_id"

    # Ensure security group
    local sg_id
    sg_id=$(aws_ensure_security_group "$role")

    # Build tag specifications using jq for proper JSON formatting
    local tag_specs
    local base_tags
    base_tags=$(jq -nc \
        --arg name "$instance_name" \
        --arg project "$AWS_TAG_PROJECT" \
        --arg env "$ENVIRONMENT" \
        --arg role "$role" \
        '[{"Key":"Name","Value":$name},{"Key":"Project","Value":$project},{"Key":"Environment","Value":$env},{"Key":"Role","Value":$role},{"Key":"ManagedBy","Value":"dive-cli"}]')
    if [ -n "${spoke_code:-}" ]; then
        base_tags=$(echo "$base_tags" | jq -c --arg spoke "${spoke_code}" '. + [{"Key":"SpokeCode","Value":($spoke | ascii_upcase)}]')
    fi
    tag_specs=$(echo "$base_tags" | jq -c '[{"ResourceType":"instance","Tags":.}]')

    # Resolve a public subnet in the same VPC as the security group
    local vpc_id
    vpc_id=$(aws_default_vpc)
    local subnet_id
    subnet_id=$(aws ec2 describe-subnets \
        --filters "Name=vpc-id,Values=${vpc_id}" "Name=tag:Name,Values=*public*" \
        --query 'Subnets[0].SubnetId' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null)
    if [ -z "$subnet_id" ] || [ "$subnet_id" = "None" ]; then
        # Fall back to any subnet in the VPC
        subnet_id=$(aws ec2 describe-subnets \
            --filters "Name=vpc-id,Values=${vpc_id}" \
            --query 'Subnets[0].SubnetId' \
            --output text \
            --region "$AWS_REGION" 2>/dev/null)
    fi
    log_info "Subnet: $subnet_id (VPC: $vpc_id)"

    # User data: lightweight shim that clones repo and runs bootstrap
    # (full script exceeds EC2 16KB user-data limit)
    local user_data_flag=()
    if [ "$skip_bootstrap" = "false" ]; then
        local shim_file
        shim_file=$(mktemp /tmp/dive-userdata-XXXXXXXX)
        cat > "$shim_file" <<'SHIM'
#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
exec > /var/log/cloud-init-output.log 2>&1
echo "[BOOTSTRAP] Installing git..."
apt-get update -qq && apt-get install -y -qq git
echo "[BOOTSTRAP] Cloning DIVE V3..."
git clone --branch main https://github.com/albeach/DIVE-V3.git /opt/dive-v3
echo "[BOOTSTRAP] Running bootstrap..."
chmod +x /opt/dive-v3/scripts/aws/bootstrap-ec2.sh
DEBIAN_FRONTEND=noninteractive DIVE_DIR=/opt/dive-v3 /opt/dive-v3/scripts/aws/bootstrap-ec2.sh
SHIM
        user_data_flag=(--user-data "file://${shim_file}")
    fi

    # Debug: show the exact values being used
    log_verbose "tag_specs=$tag_specs"
    log_verbose "bdm=[{\"DeviceName\":\"/dev/xvda\",\"Ebs\":{\"VolumeSize\":${DIVE_AWS_VOLUME_SIZE},\"VolumeType\":\"gp3\",\"Encrypted\":true}}]"
    log_verbose "user_data_flag=${user_data_flag[*]:-none}"

    # Launch (no IAM profile — uses Vault for secrets, builds from source)
    local instance_id
    instance_id=$(aws ec2 run-instances \
        --image-id "$ami_id" \
        --instance-type "$instance_type" \
        --key-name "$DIVE_AWS_KEY_PAIR" \
        --security-group-ids "$sg_id" \
        --subnet-id "$subnet_id" \
        --associate-public-ip-address \
        --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":'"${DIVE_AWS_VOLUME_SIZE}"',"VolumeType":"gp3","Encrypted":true}}]' \
        --tag-specifications "$tag_specs" \
        --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
        "${user_data_flag[@]}" \
        --query 'Instances[0].InstanceId' \
        --output text \
        --region "$AWS_REGION")

    log_success "Instance launched: $instance_id"

    # Wait for running state
    log_info "Waiting for instance to reach 'running' state..."
    aws ec2 wait instance-running \
        --instance-ids "$instance_id" \
        --region "$AWS_REGION"

    # Get public IP
    local public_ip
    public_ip=$(aws ec2 describe-instances \
        --instance-ids "$instance_id" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text \
        --region "$AWS_REGION")

    log_success "Instance running!"
    echo ""
    echo "  Instance ID:  $instance_id"
    echo "  Public IP:    $public_ip"
    echo "  Instance Type: $instance_type"
    echo "  Environment:  $ENVIRONMENT"
    echo "  Role:         $role"
    [ -n "$spoke_code" ] && echo "  Spoke Code:   $spoke_code"
    echo ""

    if [ "$skip_bootstrap" = "false" ]; then
        echo "  Bootstrap is running via user-data. Monitor with:"
        echo "    ssh -i ${DIVE_AWS_SSH_KEY} ubuntu@${public_ip} 'tail -f /var/log/cloud-init-output.log'"
    else
        echo "  Bootstrap skipped. Run manually:"
        echo "    ./dive aws bootstrap $instance_id"
    fi
    echo ""
    echo "  SSH access:"
    echo "    ssh -i ${DIVE_AWS_SSH_KEY} ubuntu@${public_ip}"
}

##
# Terminate an EC2 instance
#
# Arguments:
#   $1 - Instance ID
##
aws_terminate() {
    aws_require_auth || return 1

    local instance_id="${1:-}"
    if [ -z "$instance_id" ]; then
        log_error "Usage: ./dive aws terminate <instance-id>"
        return 1
    fi

    # Verify it's a DIVE instance
    local project_tag
    project_tag=$(aws ec2 describe-instances \
        --instance-ids "$instance_id" \
        --query 'Reservations[0].Instances[0].Tags[?Key==`Project`]|[0].Value' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null)

    if [ "$project_tag" != "$AWS_TAG_PROJECT" ]; then
        log_error "Instance $instance_id is not a DIVE-managed instance. Refusing to terminate."
        return 1
    fi

    local name_tag
    name_tag=$(aws ec2 describe-instances \
        --instance-ids "$instance_id" \
        --query 'Reservations[0].Instances[0].Tags[?Key==`Name`]|[0].Value' \
        --output text \
        --region "$AWS_REGION" 2>/dev/null)

    log_warn "Terminating instance: $instance_id ($name_tag)"
    aws ec2 terminate-instances \
        --instance-ids "$instance_id" \
        --region "$AWS_REGION" >/dev/null

    log_success "Instance $instance_id termination initiated."
}

##
# Show status of all DIVE EC2 instances
##
aws_status() {
    aws_require_auth || return 1

    echo ""
    echo -e "${BOLD}DIVE V3 AWS Instances (${ENVIRONMENT})${NC}"
    echo "================================================"
    echo ""
    aws_find_instances ""
}

##
# List all DIVE instances (compact)
##
aws_list() {
    aws_require_auth || return 1
    aws_find_instances ""
}

##
# SSH into a DIVE EC2 instance
#
# Options:
#   --role hub|spoke     (default: hub)
#   --spoke-code CODE    (for spoke role)
##
aws_ssh() {
    aws_require_auth || return 1

    local role="hub"
    local spoke_code=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --role)       role="$2"; shift 2 ;;
            --spoke-code) spoke_code="$2"; shift 2 ;;
            *) break ;;
        esac
    done

    local ip
    ip=$(aws_get_instance_ip "$role" "$spoke_code")

    if [ -z "$ip" ] || [ "$ip" = "None" ]; then
        log_error "No running ${ENVIRONMENT} ${role}${spoke_code:+ ($spoke_code)} instance found."
        return 1
    fi

    log_info "Connecting to ${role}${spoke_code:+ ($spoke_code)} at $ip..."
    ssh -i "$DIVE_AWS_SSH_KEY" \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        ubuntu@"$ip" "$@"
}

##
# Run bootstrap on an existing instance
#
# Arguments:
#   $1 - Instance ID
##
aws_bootstrap() {
    aws_require_auth || return 1

    local instance_id="${1:-}"
    if [ -z "$instance_id" ]; then
        log_error "Usage: ./dive aws bootstrap <instance-id>"
        return 1
    fi

    local ip
    ip=$(aws ec2 describe-instances \
        --instance-ids "$instance_id" \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text \
        --region "$AWS_REGION")

    if [ -z "$ip" ] || [ "$ip" = "None" ]; then
        log_error "Instance $instance_id has no public IP."
        return 1
    fi

    log_info "Uploading bootstrap script to $ip..."
    scp -i "$DIVE_AWS_SSH_KEY" \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        "$BOOTSTRAP_SCRIPT" "ubuntu@${ip}:/tmp/bootstrap-ec2.sh"

    log_info "Running bootstrap..."
    ssh -i "$DIVE_AWS_SSH_KEY" \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        "ubuntu@${ip}" "sudo bash /tmp/bootstrap-ec2.sh"

    log_success "Bootstrap complete on $instance_id ($ip)"
}

##
# Set up IAM instance profile for EC2 Secrets Manager access
##
aws_setup_iam() {
    aws_require_auth || return 1

    local role_name="dive-ec2-role"
    local profile_name="dive-ec2-profile"
    local policy_name="dive-ec2-secrets-policy"

    # Check if role exists
    if aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
        log_info "IAM role '$role_name' already exists."
    else
        log_info "Creating IAM role: $role_name"

        # Trust policy for EC2
        local trust_policy
        trust_policy=$(cat <<'POLICY'
{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "ec2.amazonaws.com"},
        "Action": "sts:AssumeRole"
    }]
}
POLICY
)
        aws iam create-role \
            --role-name "$role_name" \
            --assume-role-policy-document "$trust_policy" \
            --region "$AWS_REGION" >/dev/null

        # Secrets Manager + ECR + CloudWatch policy
        local permissions_policy
        permissions_policy=$(cat <<'POLICY'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
                "secretsmanager:ListSecrets"
            ],
            "Resource": "arn:aws-us-gov:secretsmanager:*:*:secret:dive-v3-*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken",
                "ecr:BatchGetImage",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchCheckLayerAvailability"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws-us-gov:logs:*:*:log-group:/dive-v3/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws-us-gov:s3:::dive-v3-*",
                "arn:aws-us-gov:s3:::dive-v3-*/*"
            ]
        }
    ]
}
POLICY
)
        aws iam put-role-policy \
            --role-name "$role_name" \
            --policy-name "$policy_name" \
            --policy-document "$permissions_policy" \
            --region "$AWS_REGION" >/dev/null

        log_success "IAM role created with Secrets Manager + ECR + CloudWatch + S3 permissions."
    fi

    # Create instance profile
    if aws iam get-instance-profile --instance-profile-name "$profile_name" >/dev/null 2>&1; then
        log_info "Instance profile '$profile_name' already exists."
    else
        aws iam create-instance-profile --instance-profile-name "$profile_name" >/dev/null
        aws iam add-role-to-instance-profile \
            --instance-profile-name "$profile_name" \
            --role-name "$role_name" >/dev/null

        log_success "Instance profile created: $profile_name"
        log_info "Wait ~10s for IAM propagation before launching instances."
    fi
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_aws() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        launch)      aws_launch "$@" ;;
        terminate)   aws_terminate "$@" ;;
        status)      aws_status "$@" ;;
        list)        aws_list "$@" ;;
        ssh)         aws_ssh "$@" ;;
        bootstrap)   aws_bootstrap "$@" ;;
        setup-iam)   aws_setup_iam "$@" ;;
        ecr)
            # Load ECR sub-module
            if [ -f "${AWS_DIR}/ecr.sh" ]; then
                source "${AWS_DIR}/ecr.sh"
                module_ecr "$@"
            else
                log_error "ECR module not yet available."
                return 1
            fi
            ;;
        help|*)
            echo -e "${BOLD}DIVE V3 AWS Management${NC}"
            echo ""
            echo "Usage: ./dive [--env dev|staging] aws <command> [options]"
            echo ""
            echo "Infrastructure:"
            echo "  launch       Launch a new EC2 instance"
            echo "    --role hub|spoke       Instance role (required)"
            echo "    --spoke-code CODE      Spoke country code (required for spoke)"
            echo "    --instance-type TYPE   Override instance type"
            echo "    --no-bootstrap         Skip auto-bootstrap"
            echo "  terminate <id>           Terminate an EC2 instance"
            echo "  bootstrap <id>           Run bootstrap on existing instance"
            echo "  setup-iam                Create IAM role + instance profile"
            echo ""
            echo "Operations:"
            echo "  status       Show all DIVE EC2 instances"
            echo "  list         List instances (compact)"
            echo "  ssh          SSH into a DIVE instance"
            echo "    --role hub|spoke       Target role (default: hub)"
            echo "    --spoke-code CODE      Target spoke"
            echo ""
            echo "Container Registry:"
            echo "  ecr setup    Create ECR repositories"
            echo "  ecr push     Build & push images to ECR"
            echo "  ecr login    Authenticate Docker with ECR"
            echo ""
            echo "Examples:"
            echo "  ./dive --env dev aws launch --role hub"
            echo "  ./dive --env dev aws launch --role spoke --spoke-code GBR"
            echo "  ./dive --env dev aws ssh --role hub"
            echo "  ./dive --env dev aws status"
            echo "  ./dive --env staging aws terminate i-0abc123def456"
            echo ""
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f aws_require_auth
export -f aws_resolve_ami
export -f aws_default_vpc
export -f aws_ensure_security_group
export -f aws_find_instances
export -f aws_get_instance_ip
export -f aws_get_instance_id
export -f aws_launch
export -f aws_terminate
export -f aws_status
export -f aws_list
export -f aws_ssh
export -f aws_bootstrap
export -f aws_setup_iam
export -f module_aws

log_verbose "AWS module loaded (region: $AWS_REGION, env: $ENVIRONMENT)"
