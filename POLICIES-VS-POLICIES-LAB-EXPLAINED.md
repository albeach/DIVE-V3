# DIVE V3 - Policies vs Policies Lab: Clear Explanation

**Date**: November 1, 2025  
**Purpose**: Clarify the difference between two policy pages  
**Status**: ✅ Both pages working

---

## 🤔 The Confusion

**User Question**: "What is the difference between `/policies` and `/policies/lab`?"

**Why It's Confusing**: Both pages deal with "policies" but serve completely different purposes.

---

## 📊 Quick Comparison

| Feature | `/policies` | `/policies/lab` |
|---------|-------------|-----------------|
| **Purpose** | Browse system policies | Upload & test custom policies |
| **Source** | Filesystem (`policies/*.rego`) | Database (user uploads) |
| **Content** | DIVE's built-in authorization | Your experimental policies |
| **Count** | 7 system policies | 0 (empty for now) |
| **Authentication** | None (public info) | Required (your private policies) |
| **Editable** | No (read-only) | Yes (you upload/delete) |
| **Use Case** | "How does DIVE work?" | "Test my own policy" |

---

## 🏛️ `/policies` - System Policy Browser

### What It Is

**The Rules That Run DIVE**

This page shows the **actual OPA Rego policies** that govern authorization in DIVE. These are the policies that decide whether you can access a document.

### What You See (7 Policies)

1. **Coalition ICAM Authorization Policy** (27 rules)
   - Main authorization logic
   - Clearance, COI, releasability checks
   - Package: `dive.authorization`

2. **Admin Authorization Policy** (8 rules)
   - Super admin role enforcement
   - Package: `dive.admin_authorization`

3. **Federation ABAC Policy** (13 rules)
   - Federation-specific rules
   - Package: `dive.federation`

4. **Object ABAC Policy** (12 rules)
   - Object-based authorization
   - Package: `dive.object`

5. **COI Coherence Policy** (1 rule)
   - COI validation logic
   - Package: `dive.authorization.coi_validation`

6-7. **Test Policies** (for testing)

### Use Cases

- **"Why was I denied access?"** → Check the rules in fuel_inventory_abac_policy
- **"How does COI validation work?"** → Read the coi_coherence_policy source
- **"What clearance checks are enforced?"** → Browse the authorization rules
- **"How does admin access work?"** → View admin_authorization_policy

### Technical Details

- **Location**: `policies/*.rego` files (mounted in Docker)
- **API**: `GET /api/policies` (no auth required - public info)
- **Type**: Server-side rendered page
- **Editable**: No (these are system policies)

---

## 🧪 `/policies/lab` - Interactive Policy Workspace

### What It Is

**Your Personal Policy Sandbox**

This page lets you **upload and test your own custom policies** before deploying them. It's an experimental workspace for policy development.

### Features

**Upload Tab**:
- Upload .rego (OPA) or .xml (XACML) files
- Validate syntax automatically
- Store in your personal collection

**Evaluate Tab**:
- Test policies with custom inputs
- Build subject/resource/context JSON
- See allow/deny decisions in real-time

**Compare Tab** (XACML ↔ Rego):
- Upload both OPA and XACML versions
- Compare decisions side-by-side
- Verify equivalence

### What You See

- **0 policies** (empty until you upload)
- **Your uploaded policies** (only yours, not shared)
- **Test results** from your evaluations

### Use Cases

- **"I wrote a custom Rego policy"** → Upload and validate it
- **"Does my policy work correctly?"** → Test with different inputs
- **"OPA vs XACML comparison"** → Upload both, compare decisions
- **"Before deploying to production"** → Test thoroughly in lab

### Technical Details

- **Location**: MongoDB `policies` collection
- **API**: `GET /api/policies-lab/list` (auth required - your policies)
- **Type**: Client-side interactive page
- **Editable**: Yes (upload, delete your policies)

---

## 🎯 Decision Tree: Which Page Do I Need?

### Ask Yourself:

**"I want to see how DIVE's authorization works"**  
→ **Go to `/policies`**  
→ Browse the 7 system policies  
→ Read the Rego source code  
→ Understand the decision logic

**"I have my own policy I want to test"**  
→ **Go to `/policies/lab`**  
→ Upload your .rego or .xml file  
→ Test it with custom inputs  
→ See if it works as expected

---

## 🔧 Current Status (After Fixes)

### `/policies` Page ✅ **WORKING**

**Browser Test Results**:
- Loads successfully
- Shows 7 system policies
- 61 active rules
- No console errors
- Click any policy to view source

**What Was Fixed**:
- Removed authentication requirement (system policies are public)
- Fixed Docker networking (HTTPS everywhere)
- Backend restart applied changes

---

### `/policies/lab` Page ✅ **WORKING**

**Browser Test Results**:
- Loads successfully
- Shows "No policies yet" (empty state)
- Upload button ready
- All tabs functional
- No console errors

**What Was Fixed**:
- Docker networking (HTTPS backend:4000)
- Authentication working (requires login)
- Frontend restart applied changes

---

## 📊 Current State (Browser Verified)

```
✅ /policies
   - 7 system policies
   - 61 rules total
   - Read-only access
   - No authentication required
   
✅ /policies/lab
   - 0 user policies (empty)
   - Upload ready
   - Interactive workspace
   - Authentication required
```

---

## 🎓 Why This Design?

### Separation of Concerns

**System Policies** (`/policies`):
- Built-in, immutable
- Define how DIVE works
- Public information (transparency)
- Versioned with code

**User Policies** (`/policies/lab`):
- Custom, experimental
- Your own testing
- Private to each user
- Stored in database

### Benefits

- **Clarity**: System vs user policies clearly separated
- **Security**: Can't modify system policies
- **Flexibility**: Can experiment without affecting production
- **Transparency**: Everyone can see how authorization works

---

## ✅ Summary

### The Difference (Simple)

**`/policies`** = "Show me DIVE's rules" (System)  
**`/policies/lab`** = "Let me test my own rules" (Your experiments)

### Both Are Now Working ✅

- `/policies` → 7 system policies, 61 rules
- `/policies/lab` → Ready for your uploads

### No More Confusion ✅

- Clear naming
- Different purposes
- Both documented
- Both tested

---

**Status**: ✅ **Both pages explained and working**  
**Your Feedback**: Helped us simplify to single HTTPS port  
**Result**: Clean, debuggable architecture with clear purpose for each page

