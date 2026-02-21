#!/bin/bash
# ACP-240 KAS Phase 4.3 - Cloud Run Deployment Script
#
# Deploys KAS to Google Cloud Run with cost-optimized configuration
# Target: <$20/month for <1,000 req/day pilot

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-dive25}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-kas-usa}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo -e "${BLUE}==================================${NC}"
echo -e "${BLUE}KAS Cloud Run Deployment${NC}"
echo -e "${BLUE}Phase 4.3 - Cost-Optimized${NC}"
echo -e "${BLUE}==================================${NC}"
echo ""

# Verify prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI not found. Please install Google Cloud SDK.${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker not found. Please install Docker.${NC}"
    exit 1
fi

# Check gcloud authentication
if ! gcloud auth print-access-token &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with gcloud. Run: gcloud auth login${NC}"
    exit 1
fi

# Set project
echo -e "${GREEN}✓ Setting GCP project: ${PROJECT_ID}${NC}"
gcloud config set project "${PROJECT_ID}"

# Verify we're in the right directory
if [ ! -f "Dockerfile.cloudrun" ]; then
    echo -e "${RED}Error: Dockerfile.cloudrun not found. Run this script from the kas/ directory.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites verified${NC}"
echo ""

# Step 1: Build and deploy using Cloud Build
echo -e "${YELLOW}Step 1: Building and deploying via Cloud Build...${NC}"
echo "This will:"
echo "  - Build Docker image"
echo "  - Push to Google Container Registry"
echo "  - Deploy to Cloud Run (${SERVICE_NAME})"
echo ""

cd ..
gcloud builds submit \
    --config kas/cloudbuild.yaml \
    --project="${PROJECT_ID}" \
    --substitutions="_REGION=${REGION},_SERVICE_NAME=${SERVICE_NAME}"

echo -e "${GREEN}✓ Cloud Build completed${NC}"
echo ""

# Step 2: Configure secrets
echo -e "${YELLOW}Step 2: Configuring secrets from Secret Manager...${NC}"

# Check if secret exists
if gcloud secrets describe dive-v3-kas-credentials --project="${PROJECT_ID}" &> /dev/null; then
    echo "Mounting secret: dive-v3-kas-credentials"
    gcloud run services update "${SERVICE_NAME}" \
        --region="${REGION}" \
        --project="${PROJECT_ID}" \
        --set-secrets=GOOGLE_APPLICATION_CREDENTIALS=dive-v3-kas-credentials:latest
    echo -e "${GREEN}✓ Secrets configured${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Secret 'dive-v3-kas-credentials' not found${NC}"
    echo "Create it with: gcloud secrets create dive-v3-kas-credentials --data-file=path/to/credentials.json"
fi
echo ""

# Step 3: Set cost-optimized configuration
echo -e "${YELLOW}Step 3: Applying cost-optimized configuration...${NC}"

gcloud run services update "${SERVICE_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --min-instances=0 \
    --max-instances=3 \
    --cpu=1 \
    --memory=512Mi \
    --timeout=60s \
    --concurrency=10 \
    --no-cpu-throttling

echo -e "${GREEN}✓ Cost-optimized configuration applied${NC}"
echo ""

# Step 4: Set environment variables
echo -e "${YELLOW}Step 4: Setting environment variables...${NC}"

gcloud run services update "${SERVICE_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --set-env-vars="NODE_ENV=production,\
USE_GCP_KMS=true,\
GCP_PROJECT_ID=${PROJECT_ID},\
GCP_KMS_LOCATION=${REGION},\
GCP_KMS_KEY_RING=kas-usa,\
GCP_KMS_KEY_NAME=kas-usa-private-key,\
CACHE_BACKEND=memory,\
RATE_LIMIT_BACKEND=memory,\
ENABLE_CACHE=true,\
ENABLE_RATE_LIMITING=true,\
LOG_LEVEL=info"

echo -e "${GREEN}✓ Environment variables set${NC}"
echo ""

# Step 5: Get service URL
echo -e "${YELLOW}Step 5: Getting service URL...${NC}"

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
    --region="${REGION}" \
    --project="${PROJECT_ID}" \
    --format="value(status.url)")

echo -e "${GREEN}✓ Service deployed at: ${SERVICE_URL}${NC}"
echo ""

# Step 6: Test health endpoint
echo -e "${YELLOW}Step 6: Testing health endpoint...${NC}"

HEALTH_URL="${SERVICE_URL}/health"
echo "Checking: ${HEALTH_URL}"

if curl -f -s "${HEALTH_URL}" > /dev/null; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo "Check logs: gcloud run services logs read ${SERVICE_NAME} --region=${REGION}"
fi
echo ""

# Step 7: Display deployment summary
echo -e "${BLUE}==================================${NC}"
echo -e "${BLUE}Deployment Summary${NC}"
echo -e "${BLUE}==================================${NC}"
echo -e "Service Name:    ${SERVICE_NAME}"
echo -e "Region:          ${REGION}"
echo -e "Project:         ${PROJECT_ID}"
echo -e "Service URL:     ${SERVICE_URL}"
echo -e "Image:           gcr.io/${PROJECT_ID}/kas:${IMAGE_TAG}"
echo ""
echo -e "${GREEN}Cost-Optimized Configuration:${NC}"
echo -e "  - Min Instances: 0 (scale to zero)"
echo -e "  - Max Instances: 3"
echo -e "  - CPU: 1 vCPU"
echo -e "  - Memory: 512 MB"
echo -e "  - Cache: In-memory (no Redis)"
echo -e "  - Rate Limiting: In-memory"
echo ""
echo -e "${GREEN}Expected Monthly Cost:${NC}"
echo -e "  - At 1,000 req/day: ~\$5-10/month"
echo -e "  - At 10,000 req/day: ~\$0.93/month"
echo -e "  - Baseline (idle): \$0/month (scales to zero)"
echo ""

# Step 8: Set up budget alerts
echo -e "${YELLOW}Step 8: Setting up budget alerts...${NC}"
echo "Would you like to set up a \$20/month budget alert? (y/n)"
read -r SETUP_BUDGET

if [ "${SETUP_BUDGET}" = "y" ]; then
    # Get billing account
    BILLING_ACCOUNT=$(gcloud billing projects describe "${PROJECT_ID}" --format="value(billingAccountName)" | cut -d'/' -f2)

    if [ -z "${BILLING_ACCOUNT}" ]; then
        echo -e "${RED}Error: No billing account found for project ${PROJECT_ID}${NC}"
    else
        echo "Creating budget alert for billing account: ${BILLING_ACCOUNT}"
        gcloud billing budgets create \
            --billing-account="${BILLING_ACCOUNT}" \
            --display-name="KAS Monthly Budget - ${SERVICE_NAME}" \
            --budget-amount=20 \
            --threshold-rule=percent=50 \
            --threshold-rule=percent=90 \
            --threshold-rule=percent=100

        echo -e "${GREEN}✓ Budget alert created${NC}"
        echo "You'll receive notifications at 50%, 90%, and 100% of \$20/month"
    fi
else
    echo "Skipping budget setup"
fi
echo ""

# Step 9: Next steps
echo -e "${BLUE}==================================${NC}"
echo -e "${BLUE}Next Steps${NC}"
echo -e "${BLUE}==================================${NC}"
echo ""
echo "1. Monitor costs:"
echo "   gcloud billing projects describe ${PROJECT_ID}"
echo ""
echo "2. View logs:"
echo "   gcloud run services logs read ${SERVICE_NAME} --region=${REGION} --limit=100"
echo ""
echo "3. View metrics:"
echo "   https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}/metrics"
echo ""
echo "4. Test endpoints:"
echo "   curl ${SERVICE_URL}/health"
echo "   curl ${SERVICE_URL}/.well-known/jwks.json"
echo ""
echo "5. Update service:"
echo "   ./deploy-cloudrun.sh"
echo ""
echo -e "${GREEN}Deployment complete! 🚀${NC}"
echo ""
