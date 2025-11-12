# Debug Runner Registration 404 Error

## Run These Commands on Home Server

### 1. Check if runner already exists with same name

```bash
# Check if runner directory already configured
cd ~/actions-runner 2>/dev/null && cat .runner 2>/dev/null || echo "No existing runner config found"
```

If you see existing config, you need to remove it first:
```bash
cd ~/actions-runner
./config.sh remove
# Then re-run installation
```

---

### 2. Try Manual Configuration (Bypass Script)

Instead of using the script, try manual configuration:

```bash
cd ~/actions-runner

# Remove any existing config
./config.sh remove --token YOUR_TOKEN || echo "No existing config"

# Configure with fresh token
./config.sh \
  --url https://github.com/albeach/DIVE-V3 \
  --token YOUR_FRESH_TOKEN \
  --name dive-v3-dev-server \
  --labels dive-v3-dev-server,home-server,deployment \
  --unattended \
  --replace
```

---

### 3. Check Repository Access

The token page should show your repository as:
- **Owner:** albeach
- **Repository:** DIVE-V3

Verify the URL is exactly: `https://github.com/albeach/DIVE-V3`

---

### 4. Get Token from Correct Page

**IMPORTANT:** Make sure you're on:
https://github.com/albeach/DIVE-V3/settings/actions/runners/new

NOT:
- Organization runners page
- Different repository
- Personal account runners

---

## Alternative: Use GitHub UI Token Commands

On the GitHub runners page, you'll see pre-filled commands. Use those EXACT commands:

```bash
cd ~/actions-runner

# GitHub shows something like:
# ./config.sh --url https://github.com/albeach/DIVE-V3 --token ABCDE...

# Copy and run that EXACT command (don't modify it)
```

---

## Last Resort: Clean Install

If nothing works, do a complete clean install:

```bash
# Remove existing runner directory
cd ~
rm -rf actions-runner

# Re-download and extract
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Use EXACT command from GitHub UI
# Go to: https://github.com/albeach/DIVE-V3/settings/actions/runners/new
# Copy the ./config.sh command shown and run it
```

---

Tell me what you find!

