# Self-Hosted GitHub Actions Runner Setup

**Purpose:** Install and configure GitHub Actions runner on home server for automated deployment  
**Target Server:** dev-app.dive25.com (home server)  
**Date:** November 12, 2025

---

## Prerequisites

### Server Requirements
- **OS:** Linux (Ubuntu 20.04+ recommended)
- **RAM:** 4GB minimum, 8GB recommended
- **Disk:** 50GB free space minimum
- **Network:** Stable internet connection
- **Access:** SSH access with sudo privileges
- **Docker:** Docker + Docker Compose installed

### GitHub Requirements
- **Repository:** albeach/DIVE-V3 (admin access)
- **Token:** GitHub Personal Access Token (PAT) with `repo` and `admin:org` scopes

---

## Installation Steps

### Step 1: Connect to Home Server

```bash
# SSH into home server
ssh user@dev-app.dive25.com

# Verify Docker is running
docker --version
docker-compose --version

# Check available disk space (need >50GB)
df -h /
```

---

### Step 2: Create Runner Directory

```bash
# Create dedicated directory for GitHub Actions runner
mkdir -p ~/actions-runner
cd ~/actions-runner

# Verify current directory
pwd  # Should output: /home/<user>/actions-runner
```

---

### Step 3: Download GitHub Actions Runner

**IMPORTANT:** Get the latest download URL from:
https://github.com/albeach/DIVE-V3/settings/actions/runners/new

```bash
# Download the runner package (Linux x64)
# Replace with latest version from GitHub
curl -o actions-runner-linux-x64-2.311.0.tar.gz \
  -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Verify download
ls -lh actions-runner-linux-x64-*.tar.gz

# Extract the runner
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Verify extraction
ls -la
```

---

### Step 4: Configure the Runner

**Get Registration Token:**
1. Go to: https://github.com/albeach/DIVE-V3/settings/actions/runners/new
2. Copy the registration token (starts with `A...`)

**Configure Runner:**
```bash
# Run configuration (interactive)
./config.sh \
  --url https://github.com/albeach/DIVE-V3 \
  --token <YOUR_REGISTRATION_TOKEN>

# When prompted:
# - Runner name: dive-v3-dev-server
# - Runner group: Default
# - Labels (additional): dive-v3-dev-server,home-server,deployment
# - Work folder: _work (default)
```

**Expected Output:**
```
√ Connected to GitHub

Current runner version: '2.311.0'
Runner name: 'dive-v3-dev-server'
Runner group name: 'Default'
Machine name: 'your-server-hostname'
√ Runner successfully added
√ Runner connection is good

# Runner settings saved.
```

---

### Step 5: Install Runner as System Service

```bash
# Install the service (requires sudo)
sudo ./svc.sh install

# Start the service
sudo ./svc.sh start

# Check service status
sudo ./svc.sh status

# Expected output:
# ● actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service - GitHub Actions Runner (albeach-DIVE-V3.dive-v3-dev-server)
#      Loaded: loaded (/etc/systemd/system/actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service; enabled; vendor preset: enabled)
#      Active: active (running) since ...
```

**Enable Auto-Start on Boot:**
```bash
# Verify service is enabled
sudo systemctl is-enabled actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service

# If not enabled:
sudo systemctl enable actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service
```

---

### Step 6: Verify Runner Registration

**Check GitHub:**
1. Go to: https://github.com/albeach/DIVE-V3/settings/actions/runners
2. Verify runner appears as "Idle" (green circle)
3. Check labels: `self-hosted`, `Linux`, `X64`, `dive-v3-dev-server`, `home-server`, `deployment`

**Check Logs:**
```bash
# View service logs
sudo journalctl -u actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service -f

# Expected output:
# Nov 12 14:30:00 hostname Runner: Listening for Jobs
```

---

## Runner Configuration File

The runner configuration is stored in `~/actions-runner/.runner` (hidden file):

```bash
# View runner configuration
cat ~/actions-runner/.runner

# Expected content (example):
{
  "agentId": 123456,
  "agentName": "dive-v3-dev-server",
  "poolId": 1,
  "poolName": "Default",
  "serverUrl": "https://github.com",
  "gitHubUrl": "https://github.com/albeach/DIVE-V3",
  "workFolder": "_work"
}
```

---

## Runner Labels

The runner is registered with the following labels (used in workflow triggers):

- `self-hosted` (automatic)
- `Linux` (automatic)
- `X64` (automatic)
- `dive-v3-dev-server` (custom - primary identifier)
- `home-server` (custom - location identifier)
- `deployment` (custom - purpose identifier)

**Usage in Workflow:**
```yaml
jobs:
  deploy:
    runs-on: self-hosted
    # OR more specific:
    runs-on: [self-hosted, dive-v3-dev-server]
```

---

## Security Configuration

### 1. Limit Repository Access

**Edit `.env` file (if needed):**
```bash
cd ~/actions-runner
nano .env
```

Add repository restrictions (optional):
```bash
GITHUB_REPOSITORY=albeach/DIVE-V3
```

---

### 2. Configure Docker Permissions

**Add runner user to docker group:**
```bash
# Check current user
whoami

# Add user to docker group
sudo usermod -aG docker $USER

# Verify group membership
groups $USER

# Restart runner service to apply changes
sudo ./svc.sh stop
sudo ./svc.sh start
```

**Test Docker access:**
```bash
# Should work without sudo
docker ps
docker-compose --version
```

---

### 3. Setup GitHub Secrets

**Add the following secrets to repository:**

1. **ENV_BACKEND** - Backend .env file content
2. **ENV_FRONTEND** - Frontend .env.local file content  
3. **ENV_KAS** - KAS .env file content

**To add secrets:**
1. Go to: https://github.com/albeach/DIVE-V3/settings/secrets/actions
2. Click "New repository secret"
3. Name: `ENV_BACKEND`
4. Value: (paste entire .env file content)
5. Click "Add secret"
6. Repeat for ENV_FRONTEND and ENV_KAS

---

## File System Preparation

### 1. Create Deployment Directories

```bash
# Navigate to DIVE-V3 project directory
cd /home/mike/Desktop/DIVE-V3/DIVE-V3

# Verify project structure
ls -la

# Create backup directory for rollback
mkdir -p /home/mike/Desktop/DIVE-V3/DIVE-V3/backups/deployments

# Create deployment logs directory
mkdir -p /home/mike/Desktop/DIVE-V3/DIVE-V3/logs/deployments
```

---

### 2. Verify Docker Compose Files

```bash
# Check docker-compose.yml exists
test -f docker-compose.yml && echo "✅ docker-compose.yml found" || echo "❌ docker-compose.yml missing"

# Verify all services defined
docker-compose config --services

# Expected output:
# postgres
# mongodb
# redis
# keycloak
# opa
# authzforce
# backend
# frontend
# kas
```

---

## Testing the Runner

### Test 1: Manual Workflow Trigger

Create a test workflow: `.github/workflows/test-runner.yml`

```yaml
name: Test Self-Hosted Runner

on:
  workflow_dispatch:

jobs:
  test-runner:
    name: Test Runner Connectivity
    runs-on: [self-hosted, dive-v3-dev-server]
    
    steps:
      - name: Check Runner OS
        run: |
          echo "Runner OS: $(uname -s)"
          echo "Hostname: $(hostname)"
          echo "User: $(whoami)"
          echo "Docker version: $(docker --version)"
          
      - name: Checkout Code
        uses: actions/checkout@v4
        
      - name: List Files
        run: ls -la
        
      - name: Check Docker
        run: docker ps
        
      - name: Check Docker Compose
        run: docker-compose --version
        
      - name: Verify Project Directory
        run: |
          pwd
          test -f docker-compose.yml && echo "✅ docker-compose.yml found"
          test -f package.json && echo "✅ package.json found"
```

**Run Test:**
1. Commit and push test workflow
2. Go to: https://github.com/albeach/DIVE-V3/actions/workflows/test-runner.yml
3. Click "Run workflow"
4. Select branch: `main`
5. Click "Run workflow"
6. Verify job completes successfully

---

### Test 2: Docker Operations

```yaml
name: Test Docker Operations

on:
  workflow_dispatch:

jobs:
  test-docker:
    name: Test Docker on Runner
    runs-on: [self-hosted, dive-v3-dev-server]
    
    steps:
      - name: Pull Test Image
        run: docker pull hello-world
        
      - name: Run Test Container
        run: docker run --rm hello-world
        
      - name: List Docker Images
        run: docker images
        
      - name: List Running Containers
        run: docker ps
```

**Run Test:**
1. Trigger via GitHub Actions
2. Verify Docker commands execute without `sudo`
3. Check logs for "Hello from Docker!"

---

## Monitoring & Maintenance

### View Runner Logs

```bash
# Real-time logs
sudo journalctl -u actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service -f

# Last 100 lines
sudo journalctl -u actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service -n 100

# Logs from today
sudo journalctl -u actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service --since today
```

---

### Check Runner Status

```bash
# Service status
sudo ./svc.sh status

# Check if runner is listening
ps aux | grep Runner.Listener

# Check runner work directory
ls -la ~/actions-runner/_work
```

---

### Restart Runner

```bash
cd ~/actions-runner

# Stop runner
sudo ./svc.sh stop

# Start runner
sudo ./svc.sh start

# Or restart
sudo systemctl restart actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service
```

---

### Update Runner

```bash
cd ~/actions-runner

# Stop runner
sudo ./svc.sh stop

# Download latest version
curl -o actions-runner-linux-x64-2.312.0.tar.gz \
  -L https://github.com/actions/runner/releases/download/v2.312.0/actions-runner-linux-x64-2.312.0.tar.gz

# Backup current installation
cp -r ~/actions-runner ~/actions-runner.backup

# Extract new version (overwrites files)
tar xzf ./actions-runner-linux-x64-2.312.0.tar.gz

# Start runner
sudo ./svc.sh start

# Verify version
cat ~/actions-runner/.runner | grep version
```

---

## Troubleshooting

### Issue 1: Runner Not Connecting

**Symptoms:**
- Runner shows "Offline" in GitHub
- Service running but not listening for jobs

**Solution:**
```bash
# Check logs for errors
sudo journalctl -u actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service -n 50

# Check network connectivity
curl -I https://github.com

# Restart runner
sudo ./svc.sh stop
sudo ./svc.sh start
```

---

### Issue 2: Docker Permission Denied

**Symptoms:**
- Workflow fails with "permission denied while trying to connect to Docker daemon"

**Solution:**
```bash
# Add runner user to docker group
sudo usermod -aG docker $USER

# Restart runner
sudo ./svc.sh stop
sudo ./svc.sh start

# Verify docker access
docker ps
```

---

### Issue 3: Disk Space Full

**Symptoms:**
- Workflows fail with "No space left on device"

**Solution:**
```bash
# Check disk usage
df -h

# Clean up Docker
docker system prune -a --volumes -f

# Clean up old workflow runs
cd ~/actions-runner/_work
rm -rf */  # Careful: removes all workflow work directories

# Restart runner
sudo ./svc.sh restart
```

---

### Issue 4: Runner Service Won't Start

**Symptoms:**
- `sudo ./svc.sh start` fails
- systemd service inactive/failed

**Solution:**
```bash
# Check systemd logs
sudo journalctl -u actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service

# Check runner configuration
cat ~/actions-runner/.runner

# Reconfigure runner
cd ~/actions-runner
./config.sh remove  # Remove old config
./config.sh --url https://github.com/albeach/DIVE-V3 --token <NEW_TOKEN>
sudo ./svc.sh install
sudo ./svc.sh start
```

---

### Issue 5: Workflow Hangs During Deployment

**Symptoms:**
- Deployment workflow runs for >30 minutes
- No progress in logs

**Solution:**
```bash
# Check running workflows
cd ~/actions-runner/_work
ls -la

# Check Docker containers
docker ps
docker-compose ps

# Kill hanging workflow (if needed)
sudo systemctl restart actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service
```

---

## Security Best Practices

### 1. Regular Updates
- Update runner every 2-3 months
- Monitor GitHub for security advisories
- Keep server OS up to date

### 2. Access Control
- Restrict SSH access to necessary users
- Use SSH keys (not passwords)
- Configure firewall rules

### 3. Secrets Management
- Never log secrets in workflows
- Use GitHub Secrets for sensitive data
- Rotate secrets every 90 days

### 4. Monitoring
- Monitor runner logs daily
- Set up alerts for failed deployments
- Track deployment history

### 5. Backup & Recovery
- Backup runner configuration weekly
- Document recovery procedures
- Test rollback mechanism monthly

---

## Uninstall Runner (If Needed)

**To completely remove the runner:**

```bash
cd ~/actions-runner

# Stop and uninstall service
sudo ./svc.sh stop
sudo ./svc.sh uninstall

# Remove runner from GitHub
./config.sh remove --token <TOKEN>

# Delete runner directory
cd ~
rm -rf ~/actions-runner
```

**Remove from GitHub:**
1. Go to: https://github.com/albeach/DIVE-V3/settings/actions/runners
2. Find runner "dive-v3-dev-server"
3. Click "..." → "Remove runner"
4. Confirm removal

---

## Next Steps

**Phase 3 Complete** ✅ - Self-hosted runner installed and configured

**Phase 4 Next:** Deployment Automation Scripts
1. Create `scripts/deploy-dev.sh`
2. Create `scripts/rollback.sh`
3. Enhance `scripts/health-check.sh`
4. Create `deploy-dev-server.yml` workflow

**Validation Checklist:**
- ✅ Runner appears "Idle" in GitHub
- ✅ Runner service is running
- ✅ Docker commands work without sudo
- ✅ Test workflow executes successfully
- ✅ GitHub Secrets configured (ENV_BACKEND, ENV_FRONTEND, ENV_KAS)
- ✅ File system prepared
- ✅ Monitoring setup complete

---

**End of Self-Hosted Runner Setup**

*Generated: November 12, 2025*  
*Phase: 3 of 7*  
*Next: Phase 4 - Deployment Automation Scripts*

