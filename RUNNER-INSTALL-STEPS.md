# Self-Hosted Runner Installation Steps

**Status:** In Progress  
**Estimated Time:** 30-45 minutes

---

## Step 1: Get Registration Token from GitHub

1. **Open in browser:** https://github.com/albeach/DIVE-V3/settings/actions/runners/new

2. **Select options:**
   - Operating System: **Linux**
   - Architecture: **x64**

3. **Copy the registration token**
   - Look for a command like: `./config.sh --url https://github.com/albeach/DIVE-V3 --token ABCDEFG...`
   - Copy ONLY the token part (starts with `A` and is about 50 characters long)
   - Example: `ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG`

4. **Keep the token ready** - You'll use it in Step 3

---

## Step 2: SSH to Home Server

```bash
# Connect to home server
ssh user@dev-app.dive25.com

# You should see a prompt like:
# user@hostname:~$
```

---

## Step 3: Pull Latest Code and Run Installation

```bash
# Navigate to project
cd /home/mike/Desktop/DIVE-V3/DIVE-V3

# Pull latest changes (includes runner installation script)
git pull

# Make script executable (if needed)
chmod +x scripts/install-github-runner.sh

# Run installation with your registration token
bash scripts/install-github-runner.sh YOUR_REGISTRATION_TOKEN

# Replace YOUR_REGISTRATION_TOKEN with the token from Step 1
```

---

## Expected Installation Output

You should see:

```
🚀 Starting GitHub Actions Runner Installation
Runner Version: 2.311.0
Runner Name: dive-v3-dev-server

✅ Prerequisites check passed
  ✓ Linux OS detected
  ✓ Docker found: Docker version X.X.X
  ✓ Docker Compose found: docker-compose version X.X.X
  ✓ Disk space: XXG free

✅ Runner downloaded and extracted
  ✓ Downloaded: XXM

✅ Runner configured
  √ Connected to GitHub
  Runner name: 'dive-v3-dev-server'
  Runner group name: 'Default'

✅ Docker permissions configured
  ✓ User added to docker group

✅ Service installed and started
  ● actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service - GitHub Actions Runner
     Active: active (running)

✅ Installation verified
  ✓ Service is running
  ✓ Runner is listening for jobs

📊 Installation Summary
=======================
Runner Configuration:
  Name: dive-v3-dev-server
  Labels: self-hosted, Linux, X64, dive-v3-dev-server, home-server, deployment
  Directory: /home/user/actions-runner
  Repository: https://github.com/albeach/DIVE-V3

✅ GitHub Actions Runner Installation Complete!

🌐 Verify runner at:
https://github.com/albeach/DIVE-V3/settings/actions/runners
```

---

## Step 4: Verify Installation

1. **Check GitHub UI:**
   - Go to: https://github.com/albeach/DIVE-V3/settings/actions/runners
   - You should see: **dive-v3-dev-server** with status **Idle** (green circle)
   - Labels should show: `self-hosted`, `Linux`, `X64`, `dive-v3-dev-server`, `home-server`, `deployment`

2. **Check service status (on server):**
   ```bash
   sudo systemctl status actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service
   
   # Should show: Active: active (running)
   ```

3. **Check runner logs (optional):**
   ```bash
   sudo journalctl -u actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service -f
   
   # Should show: Listening for Jobs
   # Press Ctrl+C to exit
   ```

---

## Troubleshooting

### Issue: Registration token expired

**Symptoms:**
```
Failed to register runner
Registration token may have expired
```

**Solution:**
- Registration tokens expire after 1 hour
- Get a new token from: https://github.com/albeach/DIVE-V3/settings/actions/runners/new
- Re-run the installation script with the new token

---

### Issue: Docker permission denied

**Symptoms:**
```
permission denied while trying to connect to Docker daemon
```

**Solution:**
```bash
# Add user to docker group (already done by script)
sudo usermod -aG docker $USER

# Log out and log back in for group changes to take effect
exit
ssh user@dev-app.dive25.com

# Verify docker access
docker ps
```

---

### Issue: Service failed to start

**Symptoms:**
```
Failed to start service
Service is not running
```

**Solution:**
```bash
# Check service logs
sudo journalctl -u actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service -n 50

# Try restarting
cd ~/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh start

# Check status
sudo ./svc.sh status
```

---

## After Installation

Once installation is complete and verified:

1. ✅ Runner shows as "Idle" in GitHub
2. ✅ Service is running on home server
3. ✅ You can exit SSH (runner will continue in background)

**Next:** Test deployment workflow (Step 3)

---

## Quick Reference

**GitHub Runner Page:**
https://github.com/albeach/DIVE-V3/settings/actions/runners

**Installation Command:**
```bash
bash scripts/install-github-runner.sh YOUR_REGISTRATION_TOKEN
```

**Service Status:**
```bash
sudo systemctl status actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service
```

**Runner Logs:**
```bash
sudo journalctl -u actions.runner.albeach-DIVE-V3.dive-v3-dev-server.service -f
```

---

**Delete this file after runner is installed:**
```bash
rm /home/mike/Desktop/DIVE-V3/DIVE-V3/RUNNER-INSTALL-STEPS.md
```

