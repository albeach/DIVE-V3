# CI/CD Image Building Configuration

## Overview

DIVE V3 uses GitHub Actions to automatically build and publish Docker images to GitHub Container Registry (GHCR). Images are built on every push to main and are available for deployment.

## Architecture

### Image Registry
- **Registry**: GitHub Container Registry (ghcr.io)
- **Namespace**: `ghcr.io/<your-org>/dive-v3-<service>:latest`
- **Authentication**: GitHub Personal Access Token (PAT) or GITHUB_TOKEN

### Built Images
1. **Backend** (`dive-v3-backend:latest`)
   - Express.js API with PEP
   - Built from: `backend/Dockerfile.dev`

2. **Frontend** (`dive-v3-frontend:latest`)
   - Next.js application
   - Built from: `frontend/Dockerfile.dev`

3. **Keycloak** (`dive-v3-keycloak:latest`)
   - Custom Keycloak with themes
   - Built from: `keycloak/Dockerfile`

4. **KAS** (`dive-v3-kas:latest`)
   - Key Access Service
   - Built from: `kas/Dockerfile`

5. **OPAL Server** (`dive-v3-opal-server:latest`)
   - Policy distribution server
   - Built from: `docker/opal-server.Dockerfile`

## Workflow

### Automatic Builds

Images are automatically built when:
- Code is pushed to `main` branch
- Pull requests are created (build only, not pushed)
- Files in service directories are modified

### Manual Builds

Trigger manual build via GitHub Actions UI:
```bash
# Or via gh CLI
gh workflow run docker-build.yml -f force_build=true
```

### Build Optimization

- **Multi-platform**: Builds for amd64 and arm64
- **Layer caching**: Uses GitHub Actions cache
- **Smart building**: Only rebuilds changed services
- **Parallel builds**: All services build concurrently

## Using Pre-Built Images

### Update docker-compose to use GHCR

Edit `docker-compose.hub.yml`:

```yaml
services:
  backend:
    image: ghcr.io/<your-org>/dive-v3-backend:latest
    # Remove 'build:' section when using pre-built images
    
  frontend:
    image: ghcr.io/<your-org>/dive-v3-frontend:latest
    # Remove 'build:' section
```

### Authenticate with GHCR

On deployment server (EC2):

```bash
# Using Personal Access Token (recommended)
echo $GITHUB_PAT | docker login ghcr.io -u <username> --password-stdin

# Or using GITHUB_TOKEN in CI/CD
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_ACTOR --password-stdin
```

### Pull and Deploy

```bash
# Pull latest images
docker-compose -f docker-compose.hub.yml pull

# Start services
docker-compose -f docker-compose.hub.yml up -d
```

## Configuration

### GitHub Secrets Required

**For building:**
- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

**For deployment (EC2):**
- Store GitHub PAT in AWS Secrets Manager or EC2 parameter store
- Grant PAT permissions: `read:packages`

### Docker Buildx Setup

The workflow uses Docker Buildx with:
- Latest BuildKit version
- Multi-platform support (amd64, arm64)
- GitHub Actions cache backend

## Local Development

### Build images locally

```bash
# Build all images
docker-compose -f docker-compose.hub.yml build

# Build specific service
docker-compose -f docker-compose.hub.yml build backend

# Force rebuild without cache
docker-compose -f docker-compose.hub.yml build --no-cache backend
```

### Test with local images

```bash
# Use local builds
docker-compose -f docker-compose.hub.yml up -d

# Or mix local and remote
# Edit docker-compose.hub.yml to specify which services use 'build:' vs 'image:'
```

## Deployment Strategies

### Strategy 1: Pull Pre-Built Images (Recommended)

**Pros:**
- Fast deployment (no build time)
- Consistent images across environments
- No build dependencies on deployment server

**Cons:**
- Requires GHCR authentication
- Slight delay between commit and image availability

```bash
# On EC2
docker login ghcr.io -u <username> --password-stdin < ~/.github-pat
docker-compose -f docker-compose.hub.yml --env-file .env.hub pull
docker-compose -f docker-compose.hub.yml --env-file .env.hub up -d
```

### Strategy 2: Build on Deployment Server

**Pros:**
- No registry required
- Immediate availability

**Cons:**
- Slow deployment (build time)
- Requires Docker Buildx 0.17.0+
- Resource intensive

```bash
# On EC2 (requires Buildx update)
docker-compose -f docker-compose.hub.yml --env-file .env.hub build
docker-compose -f docker-compose.hub.yml --env-file .env.hub up -d
```

### Strategy 3: Hybrid Approach

Use pre-built images for stable services, build locally for development:

```yaml
services:
  backend:
    image: ghcr.io/<org>/dive-v3-backend:latest  # Pre-built
  
  frontend:
    build:  # Build locally for rapid iteration
      context: ./frontend
      dockerfile: Dockerfile.dev
```

## Monitoring

### Check build status

```bash
# Via gh CLI
gh run list --workflow=docker-build.yml --limit 5

# Check specific run
gh run view <run-id>

# View logs
gh run view <run-id> --log
```

### Verify images

```bash
# List images in GHCR
gh api /user/packages/container/dive-v3-backend/versions

# Pull and inspect
docker pull ghcr.io/<org>/dive-v3-backend:latest
docker inspect ghcr.io/<org>/dive-v3-backend:latest
```

## Troubleshooting

### Build fails on GitHub Actions

**Check:**
1. Dockerfile syntax errors
2. Missing dependencies in package.json
3. Build context includes required files
4. GitHub Actions runner has sufficient resources

**Solution:**
```bash
# Test build locally first
docker buildx build --platform linux/amd64,linux/arm64 -f backend/Dockerfile.dev backend/
```

### Cannot pull images on EC2

**Check:**
1. Authenticated with GHCR: `docker login ghcr.io`
2. PAT has `read:packages` permission
3. Images are public or PAT belongs to organization member

**Solution:**
```bash
# Verify authentication
docker logout ghcr.io
echo $GITHUB_PAT | docker login ghcr.io -u <username> --password-stdin

# Test pull
docker pull ghcr.io/<org>/dive-v3-backend:latest
```

### Images are too large

**Optimize Dockerfiles:**
- Use multi-stage builds
- Minimize layers
- Use .dockerignore
- Remove dev dependencies in production images

**Check image sizes:**
```bash
docker images | grep dive-v3
```

## Best Practices

1. **Tag Strategy**
   - Use `latest` for main branch
   - Use SHA tags for specific commits
   - Use semantic versioning for releases

2. **Security**
   - Scan images for vulnerabilities
   - Use minimal base images
   - Don't include secrets in images
   - Keep base images updated

3. **Performance**
   - Enable layer caching
   - Build only changed services
   - Use multi-stage builds
   - Optimize layer ordering

4. **Maintenance**
   - Regularly update base images
   - Clean up old image versions
   - Monitor image sizes
   - Review Dockerfile best practices

## Migration from Local Builds

### Step 1: Enable GitHub Actions

1. Commit `.github/workflows/docker-build.yml`
2. Push to main branch
3. Wait for images to build (check Actions tab)

### Step 2: Verify Images Available

```bash
# Check if images exist
gh api /users/<your-org>/packages

# Or via browser
https://github.com/<your-org>?tab=packages
```

### Step 3: Update EC2 Deployment

```bash
# SSH to EC2
ssh -i ~/.ssh/ABeach-SSH-Key.pem ec2-user@18.254.34.87

# Authenticate with GHCR
echo $GITHUB_PAT | docker login ghcr.io -u <username> --password-stdin

# Pull images
cd /home/ec2-user/DIVE-V3
docker-compose -f docker-compose.hub.yml pull

# Deploy
docker-compose -f docker-compose.hub.yml --env-file .env.hub up -d
```

### Step 4: Update docker-compose.hub.yml (Optional)

Replace `build:` sections with `image:` references:

```yaml
# Before
backend:
  build:
    context: ./backend
    dockerfile: Dockerfile.dev

# After
backend:
  image: ghcr.io/<org>/dive-v3-backend:latest
```

## Cost Considerations

- **Storage**: GitHub provides 500MB free for public packages, 50GB for GitHub Teams
- **Bandwidth**: Unlimited for public packages
- **Build Minutes**: 2,000 free minutes/month (Linux runners)

For DIVE V3 (5 images, ~2GB total):
- **Storage**: Well within free tier
- **Build Time**: ~10-15 minutes per full build
- **Monthly Cost**: $0 (within free tier)

## Support

For issues with CI/CD pipeline:
1. Check GitHub Actions logs
2. Review Dockerfile syntax
3. Test builds locally first
4. Check registry authentication
5. Consult [GitHub Packages documentation](https://docs.github.com/en/packages)
