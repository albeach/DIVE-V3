#!/bin/bash
#################################################################
# DIVE V3 - GitHub Actions Self-Hosted Runner Installation
# Purpose: Automated installation of GitHub Actions runner
# Usage: bash scripts/install-github-runner.sh <registration-token>
# Author: Claude Sonnet 4.5
# Date: November 12, 2025
#################################################################

set -e  # Exit on any error
set -u  # Exit on undefined variable

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
RUNNER_VERSION="2.311.0"  # Update to latest version from GitHub
RUNNER_DIR="$HOME/actions-runner"
RUNNER_NAME="dive-v3-dev-server"
RUNNER_LABELS="dive-v3-dev-server,home-server,deployment"
REPO_URL="https://github.com/albeach/DIVE-V3"

#################################################################
# LOGGING
#################################################################

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARN:${NC} $*"
}

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $*"
}

#################################################################
# PREREQUISITES CHECK
#################################################################

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if running on Linux
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        log_error "This script only supports Linux"
        exit 1
    fi
    log_info "✓ Linux OS detected"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    log_info "✓ Docker found: $(docker --version)"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    log_info "✓ Docker Compose found: $(docker-compose --version)"
    
    # Check disk space (need at least 20GB free)
    DISK_FREE=$(df -BG "$HOME" | tail -1 | awk '{print $4}' | sed 's/G//')
    if [ "$DISK_FREE" -lt 20 ]; then
        log_warn "Low disk space: ${DISK_FREE}GB free (recommend 20GB minimum)"
    else
        log_info "✓ Disk space: ${DISK_FREE}GB free"
    fi
    
    log "✅ Prerequisites check passed"
}

#################################################################
# DOWNLOAD RUNNER
#################################################################

download_runner() {
    log "Downloading GitHub Actions Runner v${RUNNER_VERSION}..."
    
    # Create runner directory
    mkdir -p "$RUNNER_DIR"
    cd "$RUNNER_DIR"
    
    # Download runner
    RUNNER_FILE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
    DOWNLOAD_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_FILE}"
    
    if [ -f "$RUNNER_FILE" ]; then
        log_info "Runner package already downloaded"
    else
        log_info "Downloading from: $DOWNLOAD_URL"
        curl -o "$RUNNER_FILE" -L "$DOWNLOAD_URL" || {
            log_error "Failed to download runner"
            exit 1
        }
    fi
    
    # Verify download
    if [ ! -f "$RUNNER_FILE" ]; then
        log_error "Runner download failed"
        exit 1
    fi
    
    log_info "✓ Downloaded: $(ls -lh $RUNNER_FILE | awk '{print $5}')"
    
    # Extract runner
    log "Extracting runner..."
    tar xzf "$RUNNER_FILE" || {
        log_error "Failed to extract runner"
        exit 1
    }
    
    log "✅ Runner downloaded and extracted"
}

#################################################################
# CONFIGURE RUNNER
#################################################################

configure_runner() {
    log "Configuring GitHub Actions Runner..."
    
    cd "$RUNNER_DIR"
    
    # Check if registration token provided
    if [ -z "${REGISTRATION_TOKEN:-}" ]; then
        log_error "Registration token not provided"
        log_error ""
        log_error "Usage: $0 <registration-token>"
        log_error ""
        log_error "Get token from:"
        log_error "https://github.com/albeach/DIVE-V3/settings/actions/runners/new"
        exit 1
    fi
    
    # Run configuration
    log_info "Running configuration with:"
    log_info "  URL: $REPO_URL"
    log_info "  Name: $RUNNER_NAME"
    log_info "  Labels: $RUNNER_LABELS"
    
    ./config.sh \
        --url "$REPO_URL" \
        --token "$REGISTRATION_TOKEN" \
        --name "$RUNNER_NAME" \
        --labels "$RUNNER_LABELS" \
        --work _work \
        --unattended \
        --replace || {
        log_error "Runner configuration failed"
        exit 1
    }
    
    log "✅ Runner configured"
}

#################################################################
# DOCKER PERMISSIONS
#################################################################

setup_docker_permissions() {
    log "Setting up Docker permissions..."
    
    # Add current user to docker group
    if groups | grep -q docker; then
        log_info "✓ User already in docker group"
    else
        log_info "Adding user to docker group..."
        sudo usermod -aG docker "$USER" || {
            log_warn "Failed to add user to docker group (may require manual setup)"
        }
        log_info "✓ User added to docker group"
        log_warn "⚠️  You may need to log out and back in for group changes to take effect"
    fi
    
    # Test Docker access
    if docker ps &> /dev/null; then
        log_info "✓ Docker access verified"
    else
        log_warn "⚠️  Docker access test failed (may work after re-login)"
    fi
    
    log "✅ Docker permissions configured"
}

#################################################################
# INSTALL AS SERVICE
#################################################################

install_service() {
    log "Installing runner as systemd service..."
    
    cd "$RUNNER_DIR"
    
    # Install service
    sudo ./svc.sh install || {
        log_error "Failed to install service"
        exit 1
    }
    
    # Start service
    sudo ./svc.sh start || {
        log_error "Failed to start service"
        exit 1
    }
    
    # Check status
    sleep 2
    sudo ./svc.sh status || {
        log_warn "Service status check failed (may still be starting)"
    }
    
    log "✅ Service installed and started"
}

#################################################################
# VERIFY INSTALLATION
#################################################################

verify_installation() {
    log "Verifying installation..."
    
    # Check if service is running
    if sudo systemctl is-active --quiet "actions.runner.albeach-DIVE-V3.${RUNNER_NAME}.service"; then
        log_info "✓ Service is running"
    else
        log_error "Service is not running"
        sudo journalctl -u "actions.runner.albeach-DIVE-V3.${RUNNER_NAME}.service" -n 20
        exit 1
    fi
    
    # Check if runner is listening
    sleep 3
    if ps aux | grep -q "Runner.Listener"; then
        log_info "✓ Runner is listening for jobs"
    else
        log_warn "⚠️  Runner listener not found (may take a few seconds to start)"
    fi
    
    log "✅ Installation verified"
}

#################################################################
# INSTALLATION SUMMARY
#################################################################

installation_summary() {
    log "📊 Installation Summary"
    log "======================="
    log ""
    log "Runner Configuration:"
    log "  Name: $RUNNER_NAME"
    log "  Labels: $RUNNER_LABELS"
    log "  Directory: $RUNNER_DIR"
    log "  Repository: $REPO_URL"
    log ""
    log "Service Status:"
    sudo systemctl status "actions.runner.albeach-DIVE-V3.${RUNNER_NAME}.service" --no-pager || true
    log ""
    log "✅ GitHub Actions Runner Installation Complete!"
    log ""
    log "🌐 Verify runner at:"
    log "https://github.com/albeach/DIVE-V3/settings/actions/runners"
    log ""
    log "📝 Next Steps:"
    log "1. Verify runner shows as 'Idle' in GitHub"
    log "2. Test deployment: Go to Actions → deploy-dev-server → Run workflow"
    log "3. Monitor logs: sudo journalctl -u actions.runner.* -f"
    log ""
    log "⚠️  Important:"
    log "- If you added user to docker group, log out and back in"
    log "- Runner will auto-start on system reboot"
    log "- View logs: sudo journalctl -u actions.runner.albeach-DIVE-V3.${RUNNER_NAME}.service"
    log ""
}

#################################################################
# MAIN
#################################################################

main() {
    # Get registration token from argument
    REGISTRATION_TOKEN="${1:-}"
    
    log "🚀 Starting GitHub Actions Runner Installation"
    log "Runner Version: $RUNNER_VERSION"
    log "Runner Name: $RUNNER_NAME"
    log ""
    
    # Execute installation steps
    check_prerequisites
    download_runner
    configure_runner
    setup_docker_permissions
    install_service
    verify_installation
    installation_summary
    
    log "🎉 Installation complete!"
    exit 0
}

#################################################################
# EXECUTE
#################################################################

# Check if help requested
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "GitHub Actions Self-Hosted Runner Installation"
    echo ""
    echo "Usage: $0 <registration-token>"
    echo ""
    echo "Get registration token from:"
    echo "https://github.com/albeach/DIVE-V3/settings/actions/runners/new"
    echo ""
    echo "Example:"
    echo "  $0 A1B2C3D4E5F6G7H8I9J0..."
    echo ""
    exit 0
fi

# Run main installation
main "$@"

