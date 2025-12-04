# DIVE V3 Infrastructure - GKE Cluster

This Terraform module provisions the Kubernetes cluster and supporting infrastructure for DIVE V3.

## Prerequisites

1. **GCP Project**: `dive25` (or update `project_id` variable)
2. **GCS Bucket**: For Terraform state storage
   ```bash
   gsutil mb -p dive25 gs://dive-v3-terraform-state
   gsutil versioning set on gs://dive-v3-terraform-state
   ```
3. **APIs Enabled**:
   ```bash
   gcloud services enable \
     container.googleapis.com \
     compute.googleapis.com \
     secretmanager.googleapis.com \
     storage-api.googleapis.com
   ```

## Usage

### Initialize Terraform

```bash
cd terraform/infrastructure
terraform init
```

### Plan Changes

```bash
terraform plan
```

### Apply Infrastructure

```bash
terraform apply
```

This will create:
- VPC Network & Subnet
- Cloud Router & NAT Gateway
- Firewall Rules
- GKE Autopilot Cluster
- Service Accounts & IAM Bindings

### Configure kubectl

After cluster creation:

```bash
gcloud container clusters get-credentials dive-v3-cluster \
  --region us-east4 \
  --project dive25
```

Or use the output command:

```bash
terraform output -raw kubectl_command | bash
```

### Verify Cluster

```bash
kubectl get nodes
kubectl get namespaces
```

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `project_id` | GCP Project ID | `dive25` |
| `region` | GCP Region | `us-east4` |
| `cluster_name` | GKE Cluster Name | `dive-v3-cluster` |
| `network_name` | VPC Network Name | `dive-v3-network` |
| `subnet_cidr` | Subnet CIDR | `10.0.0.0/16` |
| `enable_private_cluster` | Enable private cluster | `true` |
| `enable_workload_identity` | Enable Workload Identity | `true` |

## Outputs

- `cluster_name`: GKE Cluster Name
- `cluster_endpoint`: Cluster API endpoint (sensitive)
- `cluster_ca_certificate`: Cluster CA certificate (sensitive)
- `network_name`: VPC Network Name
- `subnet_name`: Subnet Name
- `service_account_email`: GKE Nodes Service Account Email
- `kubectl_command`: Command to configure kubectl

## Cost Estimate

GKE Autopilot pricing:
- Base cluster: ~$73/month
- vCPU-hours: $0.10/vCPU-hour
- Memory: $0.01125/GB-hour

Estimated monthly cost: **~$90-120/month** (depending on workload)

## Next Steps

After cluster creation:
1. Install ArgoCD (Phase 2)
2. Deploy DIVE V3 services (Phase 1 - K8s Manifests)
3. Setup monitoring (Phase 3)


