# Critical Issues with Clearance Normalization Implementation

## Reported Problems (marco.rossi from Italy):
1. **auth_time**: N/A
2. **acr (AAL)**: N/A  
3. **amr**: N/A
4. **clearance**: UNCLASSIFIED (should be SEGRETO)
5. **No MFA prompt**

## Root Cause Analysis:

### Issue #1: Terraform Keycloak Provider Bug
- **Problem**: User attributes set in Terraform but NULL in Keycloak
- **Evidence**: `terraform state show` shows attributes, but API returns null
- **Impact**: All new users (ITA, NLD, POL, GBR, DEU, CAN, IND) have no clearance attributes
- **Status**: BLOCKER - prevents testing clearance normalization

### Issue #2: Custom Login vs Broker Flow
- **Problem**: Custom login authenticates directly to source realm (dive-v3-ita)
- **Should**: Authenticate through broker realm for attribute propagation
- **Impact**: Even if attributes exist, they won't be normalized through broker

### Issue #3: Session-Based ACR/AMR Not Working  
- **Problem**: ACR/AMR session mappers only work in broker realm flow
- **Custom login**: Authenticates directly, skipping broker
- **Impact**: No acr/amr in tokens, no AAL enforcement

## Immediate Fix Required:

**Option A: Fix Terraform (RECOMMENDED)**
1. Downgrade Terraform Keycloak provider to stable version
2. OR manually set attributes via Keycloak Admin Console
3. OR use Keycloak CLI to batch-create users

**Option B: Disable Custom Login (FASTEST)**
1. Use standard Keycloak OAuth broker flow
2. All IdPs go through broker realm properly
3. Clearance normalization works as designed
4. ACR/AMR from session works

**Option C: Fix Custom Login to Use Broker**
1. Custom login should POST to broker realm
2. Then broker authenticates to source realm
3. Requires major backend refactor

## Recommendation:
Use **Option B** (standard OAuth flow) for testing clearance normalization.
Custom login can be fixed later as enhancement.
