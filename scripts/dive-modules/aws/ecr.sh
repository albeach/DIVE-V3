#!/usr/bin/env bash
# =============================================================================
# DIVE V3 — AWS ECR (Elastic Container Registry) Module
# =============================================================================
# Manage Docker images for dev/staging on AWS GovCloud ECR.
#
# Commands:
#   ./dive aws ecr setup     Create ECR repositories
#   ./dive aws ecr push      Build & push all images
#   ./dive aws ecr login     Authenticate Docker with ECR
#   ./dive aws ecr list      List repositories and images
# =============================================================================
# Version: 1.0.0
# Date: 2026-02-18
# =============================================================================

# Prevent multiple sourcing
[ -n "${DIVE_AWS_ECR_LOADED:-}" ] && return 0
export DIVE_AWS_ECR_LOADED=1

# =============================================================================
# LOAD DEPENDENCIES
# =============================================================================

AWS_DIR="$(dirname "${BASH_SOURCE[0]}")"
MODULES_DIR="$(dirname "$AWS_DIR")"

if [ -z "${DIVE_COMMON_LOADED:-}" ]; then
    source "${MODULES_DIR}/common.sh"
    export DIVE_COMMON_LOADED=1
fi

if [ -z "${DIVE_AWS_MODULE_LOADED:-}" ]; then
    source "${AWS_DIR}/module.sh"
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

# ECR repository prefix
ECR_PREFIX="dive-v3"

# Services that need custom Docker images (the rest use public images)
ECR_SERVICES=(frontend backend keycloak kas opal-server opal-client)

# Resolve ECR registry URL
_ecr_registry_url() {
    local account_id
    account_id=$(aws sts get-caller-identity --query 'Account' --output text 2>/dev/null)
    echo "${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
}

# =============================================================================
# ECR FUNCTIONS
# =============================================================================

##
# Authenticate Docker with ECR
##
ecr_login() {
    aws_require_auth || return 1

    local registry
    registry=$(_ecr_registry_url)

    log_info "Logging in to ECR: $registry"
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$registry"

    log_success "Docker authenticated with ECR."
}

##
# Create ECR repositories for all DIVE services
##
ecr_setup() {
    aws_require_auth || return 1

    log_info "Setting up ECR repositories..."

    local registry
    registry=$(_ecr_registry_url)
    local created=0

    for service in "${ECR_SERVICES[@]}"; do
        local repo_name="${ECR_PREFIX}-${service}"

        if aws ecr describe-repositories --repository-names "$repo_name" --region "$AWS_REGION" >/dev/null 2>&1; then
            log_verbose "  Repository exists: $repo_name"
            continue
        fi

        log_info "  Creating repository: $repo_name"
        aws ecr create-repository \
            --repository-name "$repo_name" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=AES256 \
            --region "$AWS_REGION" >/dev/null

        # Set lifecycle policy (keep last 10 images)
        aws ecr put-lifecycle-policy \
            --repository-name "$repo_name" \
            --lifecycle-policy-text '{
                "rules": [{
                    "rulePriority": 1,
                    "description": "Keep last 10 images",
                    "selection": {
                        "tagStatus": "any",
                        "countType": "imageCountMoreThan",
                        "countNumber": 10
                    },
                    "action": { "type": "expire" }
                }]
            }' \
            --region "$AWS_REGION" >/dev/null

        created=$((created + 1))
    done

    log_success "ECR setup complete. $created new repositories created."
    echo ""
    echo "  Registry: $registry"
    echo "  Repositories:"
    for service in "${ECR_SERVICES[@]}"; do
        echo "    ${registry}/${ECR_PREFIX}-${service}"
    done
}

##
# Build and push all DIVE Docker images to ECR
#
# Options:
#   --service NAME     Push only a specific service
#   --tag TAG          Override image tag (default: git SHA)
##
ecr_push() {
    aws_require_auth || return 1

    local target_service=""
    local image_tag
    image_tag=$(git -C "$DIVE_ROOT" rev-parse --short HEAD 2>/dev/null || echo "latest")

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --service) target_service="$2"; shift 2 ;;
            --tag)     image_tag="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    # Login first
    ecr_login || return 1

    local registry
    registry=$(_ecr_registry_url)

    local services=("${ECR_SERVICES[@]}")
    if [ -n "$target_service" ]; then
        services=("$target_service")
    fi

    for service in "${services[@]}"; do
        local repo="${registry}/${ECR_PREFIX}-${service}"
        local dockerfile=""
        local context=""

        case "$service" in
            frontend)
                dockerfile="${DIVE_ROOT}/frontend/Dockerfile.prod"
                context="${DIVE_ROOT}/frontend"
                ;;
            backend)
                dockerfile="${DIVE_ROOT}/backend/Dockerfile.prod"
                context="${DIVE_ROOT}/backend"
                ;;
            keycloak)
                dockerfile="${DIVE_ROOT}/keycloak/Dockerfile"
                context="${DIVE_ROOT}/keycloak"
                ;;
            kas)
                dockerfile="${DIVE_ROOT}/kas/Dockerfile"
                context="${DIVE_ROOT}/kas"
                ;;
            opal-server)
                dockerfile="${DIVE_ROOT}/docker/opal-server/Dockerfile"
                context="${DIVE_ROOT}/docker/opal-server"
                ;;
            opal-client)
                dockerfile="${DIVE_ROOT}/docker/opal-client/Dockerfile"
                context="${DIVE_ROOT}/docker/opal-client"
                ;;
        esac

        if [ ! -f "$dockerfile" ]; then
            log_warn "Dockerfile not found for $service: $dockerfile — skipping"
            continue
        fi

        log_info "Building $service..."
        docker build -t "${repo}:${image_tag}" -t "${repo}:latest" \
            -f "$dockerfile" "$context"

        log_info "Pushing $service..."
        docker push "${repo}:${image_tag}"
        docker push "${repo}:latest"

        log_success "Pushed: ${repo}:${image_tag}"
    done

    log_success "All images pushed to ECR."
}

##
# List ECR repositories and their latest images
##
ecr_list() {
    aws_require_auth || return 1

    echo ""
    echo -e "${BOLD}DIVE V3 ECR Repositories (${AWS_REGION})${NC}"
    echo "================================================"
    echo ""

    for service in "${ECR_SERVICES[@]}"; do
        local repo_name="${ECR_PREFIX}-${service}"

        if ! aws ecr describe-repositories --repository-names "$repo_name" --region "$AWS_REGION" >/dev/null 2>&1; then
            echo "  $repo_name: NOT CREATED"
            continue
        fi

        local image_count
        image_count=$(aws ecr describe-images \
            --repository-name "$repo_name" \
            --query 'length(imageDetails)' \
            --output text \
            --region "$AWS_REGION" 2>/dev/null || echo "0")

        local latest_tag
        latest_tag=$(aws ecr describe-images \
            --repository-name "$repo_name" \
            --query 'sort_by(imageDetails, &imagePushedAt)[-1].imageTags[0]' \
            --output text \
            --region "$AWS_REGION" 2>/dev/null || echo "none")

        echo "  $repo_name: $image_count images (latest: $latest_tag)"
    done
    echo ""
}

# =============================================================================
# MODULE DISPATCH
# =============================================================================

module_ecr() {
    local action="${1:-help}"
    shift || true

    case "$action" in
        setup)  ecr_setup "$@" ;;
        push)   ecr_push "$@" ;;
        login)  ecr_login "$@" ;;
        list)   ecr_list "$@" ;;
        help|*)
            echo "Usage: ./dive aws ecr <command>"
            echo ""
            echo "Commands:"
            echo "  setup     Create ECR repositories for all DIVE services"
            echo "  push      Build & push Docker images to ECR"
            echo "  login     Authenticate Docker with ECR"
            echo "  list      List repositories and images"
            echo ""
            echo "Options:"
            echo "  --service NAME   Target specific service (push only)"
            echo "  --tag TAG        Override image tag (push only)"
            echo ""
            ;;
    esac
}

# =============================================================================
# MODULE EXPORTS
# =============================================================================

export -f ecr_login
export -f ecr_setup
export -f ecr_push
export -f ecr_list
export -f module_ecr

log_verbose "AWS ECR module loaded"
