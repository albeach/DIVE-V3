# AuthzForce CE PDP Configuration

This directory contains configuration for the AuthzForce CE (Community Edition) Policy Decision Point used in the Policies Lab feature.

## Directory Structure

```
authzforce/
├── conf/           # Configuration files
│   └── domain.xml  # DIVE Lab domain configuration
└── data/           # Runtime data (policies, decisions)
```

## Domain Configuration

- **Domain ID**: `dive-lab`
- **Root Policy**: `urn:dive:lab:root-policy`
- **Combining Algorithm**: `deny-unless-permit`

## Usage

The AuthzForce PDP is automatically started via docker-compose and listens on port 8282.

### Health Check
```bash
curl http://localhost:8282/authzforce-ce/
```

### Submit Policy Evaluation Request
```bash
curl -X POST http://localhost:8282/authzforce-ce/domains/dive-lab/pdp \
  -H "Content-Type: application/xml" \
  -d @request.xml
```

## Integration

The backend service communicates with AuthzForce via the `AUTHZFORCE_URL` environment variable:
```
AUTHZFORCE_URL=http://authzforce:8080/authzforce-ce
```

## Security

- AuthzForce runs in an isolated Docker network
- No outbound network access
- Read-only access to uploaded policies
- Resource limits: 256MB-512MB memory

