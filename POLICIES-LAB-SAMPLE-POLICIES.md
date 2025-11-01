# Policy Lab - Sample Policies Documentation

**Date**: November 1, 2025  
**Purpose**: Learning examples for Policy Lab feature  
**Status**: ✅ 5 sample policies seeded

---

## 📚 Sample Policies Overview

The Policy Lab now includes **5 pre-loaded example policies** that all users can view and test. These demonstrate common access control patterns in both Rego and XACML formats.

---

## 🔍 Sample Policy #1: Simple Clearance Check

**File**: `simple_clearance_check.rego`  
**Type**: Rego (OPA)  
**Package**: `dive.examples.simple_clearance`

**Purpose**: Basic clearance-based access control

**Logic**:
- Compares user clearance level vs resource classification
- Uses numeric levels: UNCLASSIFIED(0), CONFIDENTIAL(1), SECRET(2), TOP_SECRET(3)
- Allows access if user clearance >= resource classification

**Example**:
```
User: CONFIDENTIAL
Resource: UNCLASSIFIED
Result: ALLOW (1 >= 0)

User: CONFIDENTIAL  
Resource: SECRET
Result: DENY (1 < 2)
```

---

## 🌍 Sample Policy #2: Country Releasability Policy

**File**: `country_releasability.rego`  
**Type**: Rego (OPA)  
**Package**: `dive.examples.country_check`

**Purpose**: Verify user country is in resource releasability list

**Logic**:
- Checks if `input.subject.countryOfAffiliation` is in `input.resource.releasabilityTo`
- Returns detailed reason for allow/deny

**Example**:
```
User: CAN (Canada)
Resource releasabilityTo: [USA, CAN, GBR]
Result: ALLOW (CAN in list)

User: FRA (France)
Resource releasabilityTo: [USA, CAN]
Result: DENY (FRA not in list)
```

---

## ⏰ Sample Policy #3: Time-Based Embargo Policy

**File**: `time_embargo.rego`  
**Type**: Rego (OPA)  
**Package**: `dive.examples.time_embargo`

**Purpose**: Enforce time-based document release embargoes

**Logic**:
- Parses `input.resource.embargoUntil` (RFC3339 timestamp)
- Compares with `input.context.currentTime`
- Allows access if current time > embargo time
- Also allows if no embargo is set

**Example**:
```
Resource embargoUntil: 2025-01-01T00:00:00Z
Current time: 2025-11-01T00:00:00Z
Result: ALLOW (embargo passed)

Resource embargoUntil: 2026-01-01T00:00:00Z
Current time: 2025-11-01T00:00:00Z
Result: DENY (still under embargo)
```

---

## 🤝 Sample Policy #4: COI Membership Check

**File**: `coi_membership.rego`  
**Type**: Rego (OPA)  
**Package**: `dive.examples.coi_check`

**Purpose**: Validate user has required Community of Interest memberships

**Logic**:
- Requires user to have ALL resource COI tags (AND logic)
- Uses set intersection to check membership
- Allows if resource has no COI requirements
- Allows if COI list is empty

**Example**:
```
User COI: [FVEY, NATO-COSMIC]
Resource COI: [FVEY]
Result: ALLOW (user has required FVEY)

User COI: [CAN-US]
Resource COI: [FVEY]
Result: DENY (user doesn't have FVEY)

Resource COI: []
Result: ALLOW (no COI restrictions)
```

---

## 📋 Sample Policy #5: XACML Clearance Policy

**File**: `xacml_clearance.xml`  
**Type**: XACML 3.0  
**Policy ID**: `clearance-policy`

**Purpose**: Demonstrate XACML syntax for clearance checks

**Logic**:
- Target: Action = "read"
- Rule: Permit if clearanceLevel (integer) >= classificationLevel
- Uses XACML 3.0 integer comparison functions

**Example**:
```xml
Subject clearanceLevel: 2 (SECRET)
Resource classificationLevel: 1 (CONFIDENTIAL)
Result: Permit (2 >= 1)
```

---

## 🎯 How To Use These Examples

### 1. View Example Policies

1. Navigate to: `https://localhost:3000/policies/lab`
2. See 5 sample policies listed
3. Click "View" on any policy
4. Read the Rego/XACML source code
5. Understand the authorization logic

### 2. Test Example Policies

1. Go to "Evaluate" tab
2. Select one of the example policies
3. Build a test input:
   ```json
   {
     "subject": {
       "clearance": "CONFIDENTIAL",
       "countryOfAffiliation": "USA"
     },
     "resource": {
       "classification": "SECRET",
       "releasabilityTo": ["USA", "GBR"]
     }
   }
   ```
4. Click "Evaluate"
5. See the allow/deny decision

### 3. Learn From Examples

- **Simple Clearance**: Learn basic Rego syntax
- **Country Check**: See string membership testing
- **Time Embargo**: Understand date/time handling
- **COI Check**: Learn set operations in Rego
- **XACML**: Compare XACML vs Rego approaches

### 4. Upload Your Own

1. Write your custom policy (use examples as templates)
2. Click "Upload Policy"
3. Select your .rego or .xml file
4. Test it in the Evaluate tab
5. Compare with examples

---

## 🛠️ Technical Details

### Storage

**Location**: MongoDB `policy_uploads` collection  
**Owner ID**: `system-examples` (shared with all users)  
**Validated**: Yes (pre-validated during seeding)

### API Behavior

```typescript
// GET /api/policies-lab/list returns:
{
  "policies": [
    ...userPolicies,      // User's own uploads (first)
    ...examplePolicies    // System examples (after)
  ],
  "count": 5,
  "userPolicyCount": 0,   // None uploaded yet
  "examplePolicyCount": 5  // 5 examples
}
```

### Deletion

- Users **can** delete example policies (they'll be recreated on reseed)
- User policies and examples are clearly distinguished
- `isExample: true` flag marks system examples

---

## 🔄 Reseeding Examples

If examples are deleted or corrupted, reseed them:

```bash
# From host
cd backend && npx tsx src/scripts/seed-policies-lab.ts

# From Docker
docker exec dive-v3-backend npx tsx src/scripts/seed-policies-lab.ts
```

**Output**:
```
🌱 Seeding Policies Lab with sample policies...
✅ Inserted 5 sample policies
📊 Sample Policies Created:
   1. Simple Clearance Check (REGO)
   2. Country Releasability Policy (REGO)
   3. Time-Based Embargo Policy (REGO)
   4. COI Membership Check (REGO)
   5. XACML Clearance Policy (XACML)
```

---

## 📊 Sample Policy Statistics

| Policy | Type | Package | Rules | Purpose |
|--------|------|---------|-------|---------|
| Simple Clearance | REGO | dive.examples.simple_clearance | 3 | Basic clearance check |
| Country Releasability | REGO | dive.examples.country_check | 2 | Country membership |
| Time Embargo | REGO | dive.examples.time_embargo | 3 | Embargo enforcement |
| COI Membership | REGO | dive.examples.coi_check | 3 | COI validation |
| XACML Clearance | XACML | policy:* | 1 | XACML example |

**Total**: 5 policies, 12 rules (Rego), 1 XACML policy

---

## ✅ User Benefits

### Learning
- **See working examples** immediately
- **Understand Rego syntax** from real policies
- **Compare OPA vs XACML** side-by-side
- **Learn best practices** from validated examples

### Testing
- **Pre-loaded test cases** to experiment with
- **Interactive evaluation** without setup
- **Immediate feedback** on how policies work
- **No empty state** - ready to explore

### Development
- **Use as templates** for your own policies
- **Copy and modify** example logic
- **Test before deploying** to production
- **Validate syntax** with working examples

---

## 🎯 Next Steps For Users

1. **Explore**: Browse the 5 example policies
2. **Test**: Go to Evaluate tab, test with custom inputs
3. **Learn**: Read the Rego source code
4. **Upload**: Create your own policy based on examples
5. **Compare**: Test OPA vs XACML equivalence

---

**Status**: ✅ **5 sample policies loaded and verified**  
**User Experience**: No more empty state - ready to learn!  
**Purpose**: Educational examples demonstrating common access control patterns

