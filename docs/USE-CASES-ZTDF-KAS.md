# ZTDF & KAS Use Cases - Week 3.4.3

**Project**: DIVE V3 - Coalition ICAM Pilot  
**Phase**: Week 3.4.3 UI/UX Enhancement  
**Purpose**: Demonstrate user understanding of ZTDF structure and KAS mediation  
**Date**: October 2025

---

## Overview

This document presents 4 comprehensive use cases that demonstrate how coalition partners interact with and understand:
- Zero Trust Data Format (ZTDF) structure
- Key Access Service (KAS) mediation
- Security labels (STANAG 4774)
- Cryptographic integrity validation (STANAG 4778)

Each use case includes:
- Actor and goals
- Step-by-step walkthrough
- Expected results
- Success metrics

---

## Use Case 1: Understanding ZTDF Structure

### Title
**"Viewing Zero Trust Data Format Details for a NATO Document"**

### Actor
**Jean Dupont** - French Military Analyst  
**Attributes**:
- Clearance: SECRET
- Country: FRA (France)
- COI: NATO-COSMIC
- Organization: French Ministry of Defence

### Goal
Understand how a NATO-COSMIC classified document is protected using ZTDF and verify that they meet all access requirements.

### Scenario
Jean has been granted access to a NATO-COSMIC operations plan. Before reviewing the content, he wants to understand the security structure and verify the document's integrity.

### Steps

#### 1. Initial Access
Jean logs in through the French SAML IdP and navigates to the resource list. He sees:
- **Resource**: "NATO Mediterranean Operations Plan Q4"
- **Classification**: SECRET
- **Display Marking**: `SECRET//NATO-COSMIC//REL USA, GBR, FRA, DEU, ITA`
- **Status**: 🔐 ZTDF Protected

#### 2. View Resource Details
Jean clicks on the document and sees the "Access Granted" banner (green) confirming authorization. He notices a new **"Zero Trust Data Format (ZTDF)"** summary card showing:

```
Zero Trust Data Format (ZTDF)
Data-centric security with embedded policy

┌──────────────────────────────────────────────────────┐
│ ZTDF Version: 1.0    Encryption: AES-256-GCM         │
│ Key Access Objects: 1   Content Type: text/plain     │
└──────────────────────────────────────────────────────┘

ℹ️ This resource is protected using ZTDF (ACP-240 compliant). 
Security policy is embedded and travels with the data. 
Cryptographic integrity ensures tamper detection (STANAG 4778).
```

**Observation**: Jean understands the document uses modern zero-trust encryption.

#### 3. Click "View ZTDF Details"
Jean clicks the **"View ZTDF Details"** button, which opens `/resources/doc-nato-001/ztdf`. He sees a comprehensive interface with 4 tabs.

#### 4. Review Manifest Tab
In the **Manifest** tab, Jean sees:

```
Object Metadata
─────────────────────────────────────────
Object ID:      doc-nato-001
Object Type:    document
ZTDF Version:   1.0
Content Type:   text/plain
Payload Size:   2.4 MB
Owner:          SHAPE HQ
Organization:   NATO Allied Command Operations
Created:        October 10, 2025, 14:30:00
Last Modified:  October 12, 2025, 09:15:00
```

**Understanding**: Jean now knows the document origin, size, and when it was created/modified.

#### 5. Review Policy Tab
Jean switches to the **Policy** tab and sees:

**A. Policy Integrity**
```
Policy Hash (SHA-384):  ✓ Valid
abc123def456...xyz789  [Copy]
```

**B. Security Label (STANAG 4774)**
```
╔════════════════════════════════════════════════════╗
║  SECRET//NATO-COSMIC//REL USA, GBR, FRA, DEU, ITA ║
╚════════════════════════════════════════════════════╝

Classification: SECRET 🟠
⚠️ Unauthorized disclosure could cause serious damage 
to national security

Releasable To (Countries):
✅ USA  ✅ GBR  ✅ FRA  ✅ DEU  ✅ ITA
❌ CAN  ❌ AUS  ❌ NZL

Communities of Interest:
🔵 NATO-COSMIC  NATO COSMIC Top Secret classification

Originating Country: USA
Creation Date: October 10, 2025
```

**Understanding**: Jean confirms:
- ✅ He has SECRET clearance (matches requirement)
- ✅ France (FRA) is in the releasability list
- ✅ He has NATO-COSMIC COI membership
- **Conclusion**: He meets all requirements to access this document

#### 6. Review Payload Tab
Jean switches to the **Payload** tab:

**A. Encryption Details**
```
Algorithm: AES-256-GCM
IV: Ym9vdHN0cmFwCg==  [Copy]
Auth Tag: ZGF0YQo=  [Copy]
```

**B. Payload Hash**
```
Payload Hash (SHA-384):  ✓ Valid
def456ghi789...abc123
```

**C. Key Access Objects (KAOs)**
```
KAO ID: kao-doc-nato-001
KAS URL: http://localhost:8080
KAS ID: dive-v3-kas
Wrapping Algorithm: RSA-OAEP-256

Policy Binding:
  Clearance Required: SECRET
  Countries Allowed: USA, GBR, FRA, DEU, ITA
  COI Required: NATO-COSMIC
  
Created: October 10, 2025, 14:30:05
```

**Understanding**: Jean learns:
- The document is encrypted with military-grade AES-256-GCM
- A Key Access Object (KAO) stores the wrapped decryption key
- The KAO has policy bindings that **match his attributes exactly**
- Keys are managed by KAS (Key Access Service) on port 8080

**D. Encrypted Chunks**
```
Chunk 0  |  2.4 MB  |  ✓ Valid
abc123def456ghi789...
```

**Understanding**: Content is split into chunks (for large files), each with its own integrity hash.

#### 7. Review Integrity Tab
Jean switches to the **Integrity** tab:

```
╔════════════════════════════════════════╗
║  Overall Integrity Status: ✅ VALID    ║
╚════════════════════════════════════════╝

Validated: October 14, 2025, 16:45:32

Hash Verification Results:
─────────────────────────────────────────
✓ Policy Hash (STANAG 4778)     PASS
  Verifies policy section integrity

✓ Payload Hash                  PASS
  Verifies encrypted content integrity

✓ All Chunk Hashes              PASS
  Verifies individual chunk integrity

───────────────────────────────────────────
✅ Integrity Verified

All cryptographic hashes match their expected values. 
This ZTDF resource has not been tampered with and 
complies with STANAG 4778 cryptographic binding 
requirements.
```

**Understanding**: Jean confirms:
- ✅ Policy hasn't been modified (hash matches)
- ✅ Encrypted content hasn't been tampered with (hash matches)
- ✅ All chunks are intact
- **Conclusion**: The document is authentic and unmodified since creation

### Results

**Jean's Understanding** (End State):
1. ✅ **ZTDF Structure**: He understands ZTDF has 3 parts (manifest, policy, payload)
2. ✅ **Security Labels**: He can read STANAG 4774 display markings and knows what they mean
3. ✅ **Releasability**: He knows why he can access (FRA is in releasability list)
4. ✅ **Encryption**: He understands data is encrypted at rest with AES-256-GCM
5. ✅ **Integrity**: He knows SHA-384 hashes prove the document hasn't been tampered with
6. ✅ **Key Management**: He understands keys are separate from data (KAS holds them)
7. ✅ **Data-Centric Security**: He sees the policy is embedded in the data (travels with it)

**Jean explains to his colleague**:
> "This NATO document uses ZTDF, which is like a secure container. The policy is inside the 
> data itself, not in some external database. It's encrypted with AES-256-GCM, and the key 
> is held separately by KAS. I can access it because I have SECRET clearance, I'm from France 
> (which is in the releasability list), and I have NATO-COSMIC community membership. The 
> integrity hashes all passed, which means no one has tampered with it since NATO created it 
> on October 10th."

### Success Metrics
- [x] User can identify manifest vs policy vs payload
- [x] User can explain what each ZTDF section contains
- [x] User understands integrity hashes prevent tampering
- [x] User can read and interpret security labels
- [x] User knows why they were granted access (attribute matching)
- [x] **Target**: 100% of testers can explain ZTDF structure ✅

---

## Use Case 2: KAS-Mediated Access Flow

### Title
**"Accessing Encrypted FVEY Intelligence via KAS"**

### Actor
**Sarah Johnson** - U.S. Intelligence Analyst  
**Attributes**:
- Clearance: TOP_SECRET
- Country: USA (United States)
- COI: FVEY, US-ONLY
- Organization: U.S. Department of Defense

### Goal
Access an encrypted Five Eyes (FVEY) intelligence summary and understand how KAS (Key Access Service) mediates access through policy re-evaluation.

### Scenario
Sarah needs to review a FVEY intelligence report on maritime activity. The document is ZTDF-encrypted and requires KAS mediation to access the decryption key.

### Steps

#### 1. Locate Resource
Sarah logs in through the U.S. OIDC IdP and finds:
- **Resource**: "FVEY Intelligence Summary - Maritime Activity Q3"
- **Classification**: TOP_SECRET
- **Display Marking**: `TOP SECRET//FVEY//REL USA, GBR, CAN, AUS, NZL`
- **Encryption Status**: 🔒 KAS-Mediated

#### 2. View Resource Details
Sarah clicks on the document and sees the "Access Granted" banner. She notices the ZTDF summary card:

```
Zero Trust Data Format (ZTDF)
Data-centric security with embedded policy

ZTDF Version: 1.0      Encryption: AES-256-GCM
Key Access Objects: 1  Content Type: text/plain

[View ZTDF Details]
```

She also sees:
```
STANAG 4774 Display Marking
╔══════════════════════════════════════════════╗
║  TOP SECRET//FVEY//REL USA, GBR, CAN, AUS, NZL  ║
╚══════════════════════════════════════════════╝
Must appear on all extractions & copies
```

#### 3. Review ZTDF Details
Sarah clicks **"View ZTDF Details"** to understand the protection:

**Policy Tab - Security Label**:
```
Classification: TOP_SECRET 🔴
⚠️ Unauthorized disclosure could cause exceptionally 
grave damage to national security

Releasable To:
✅ USA  ✅ GBR  ✅ CAN  ✅ AUS  ✅ NZL

Communities of Interest:
🔵 FVEY  Five Eyes Intelligence Alliance (USA, GBR, CAN, AUS, NZL)
```

**Payload Tab - Key Access Object**:
```
KAO ID: kao-fvey-001
KAS URL: http://localhost:8080
KAS ID: dive-v3-kas

Policy Binding:
  Clearance Required: TOP_SECRET
  Countries Allowed: USA, GBR, CAN, AUS, NZL
  COI Required: FVEY
```

**Observation**: Sarah confirms she meets all requirements (TOP_SECRET, USA, FVEY).

#### 4. Attempt to View Content
Sarah clicks the **"Back to Resource"** button to return to the main resource view. When she scrolls to the content section, she sees:

```
Document Content
────────────────────────────────────────────
🔐 This resource is encrypted and requires KAS mediation.
Requesting decryption key...

[KAS Key Request Modal appears]
```

#### 5. KAS Flow Visualization

**A KAS Request Modal pops up**, showing real-time progress:

```
╔══════════════════════════════════════════════╗
║      Requesting Key from KAS                  ║
╠══════════════════════════════════════════════╣
║                                              ║
║  1. Resource Access Request    ✅ COMPLETE   ║
║     Requested encrypted resource             ║
║     ⏰ 16:30:00.000                          ║
║                                              ║
║  2. Policy Evaluation          ✅ COMPLETE   ║
║     OPA detected KAS obligation              ║
║     Decision: ALLOW (requires KAS)           ║
║     ⏰ 16:30:00.123                          ║
║                                              ║
║  3. KAS Key Request           ⏳ IN PROGRESS ║
║     Contacting KAS at localhost:8080...      ║
║                                              ║
║  4. KAS Policy Check          ⏸️ PENDING     ║
║     Awaiting policy re-evaluation            ║
║                                              ║
║  5. Key Release               ⏸️ PENDING     ║
║                                              ║
║  6. Content Decryption        ⏸️ PENDING     ║
║                                              ║
╚══════════════════════════════════════════════╝
```

**Understanding**: Sarah sees that:
1. Her request was received ✅
2. OPA (Policy Engine) evaluated and said "ALLOW, but requires KAS" ✅
3. Now contacting KAS...

#### 6. KAS Policy Re-Evaluation (Step 4)

**Modal updates** (2 seconds later):

```
║  3. KAS Key Request           ✅ COMPLETE    ║
║     Key requested from KAS                    ║
║     ⏰ 16:30:00.250                          ║
║                                              ║
║  4. KAS Policy Check          ⏳ IN PROGRESS ║
║     Re-evaluating policy...                  ║
║                                              ║
║     Policy Re-Evaluation Results:            ║
║     ✓ Clearance Check:    PASS              ║
║       TOP_SECRET >= TOP_SECRET              ║
║     ✓ Releasability Check: PASS             ║
║       USA in [USA, GBR, CAN, AUS, NZL]      ║
║     ✓ COI Check:          PASS              ║
║       FVEY ∩ [FVEY] = FVEY                  ║
```

**Understanding**: Sarah observes:
- KAS is **re-checking the policy** (defense in depth)
- Her clearance (TOP_SECRET) meets the requirement (TOP_SECRET) ✓
- Her country (USA) is in the releasability list ✓
- Her COI (FVEY) matches the requirement ✓
- **All checks PASSED** ✓

#### 7. Key Release & Decryption (Steps 5-6)

**Modal updates** (1 second later):

```
║  4. KAS Policy Check          ✅ COMPLETE    ║
║     All policy checks passed                 ║
║     ⏰ 16:30:00.450                          ║
║                                              ║
║  5. Key Release               ✅ COMPLETE    ║
║     DEK released by KAS                      ║
║     ⏰ 16:30:00.500                          ║
║                                              ║
║  6. Content Decryption        ⏳ IN PROGRESS ║
║     Decrypting with released key...          ║
```

**Final Update** (500ms later):

```
║  6. Content Decryption        ✅ COMPLETE    ║
║     Content decrypted successfully           ║
║     ⏰ 16:30:00.550                          ║
║                                              ║
║  ✅ Access Granted - Key Released by KAS     ║
║     Total Time: 550ms                        ║
╚══════════════════════════════════════════════╝

[Modal closes automatically after 2 seconds]
```

#### 8. View Decrypted Content
The document content now appears:

```
Document Content
────────────────────────────────────────────
FVEY INTELLIGENCE SUMMARY - MARITIME ACTIVITY Q3 2025

[Decrypted content displayed here...]

This report contains sensitive FVEY intelligence...
```

**Audit Log Entry** (visible to admin):
```json
{
  "eventType": "KEY_RELEASED",
  "timestamp": "2025-10-14T16:30:00.500Z",
  "subject": "sarah.johnson@mil",
  "resourceId": "doc-fvey-001",
  "kaoId": "kao-fvey-001",
  "outcome": "ALLOW",
  "reason": "Policy authorization successful",
  "latencyMs": 500
}
```

### Results

**Sarah's Understanding** (End State):
1. ✅ **KAS Mediation**: She understands KAS holds the keys separately from data
2. ✅ **Policy Re-Evaluation**: She knows policy is checked **twice** (OPA + KAS)
3. ✅ **Defense in Depth**: She understands KAS can deny even if OPA allowed (fail-safe)
4. ✅ **Key Separation**: She knows DEK (Data Encryption Key) is never stored with data
5. ✅ **Attribute Checking**: She saw her attributes checked in real-time
6. ✅ **Audit Trail**: She knows all access is logged for compliance

**Sarah explains to her manager**:
> "The document was encrypted with ZTDF. When I tried to access it, the system checked 
> my attributes against the policy and said 'ALLOW, but you need to get the key from KAS 
> first.' KAS then re-evaluated the policy independently - it checked my TOP_SECRET clearance, 
> confirmed I'm from the USA (which is in the FVEY releasability list), and verified my FVEY 
> COI membership. Only after all those checks passed did KAS release the decryption key. 
> This took about half a second. The key is never stored with the data, so even if someone 
> compromised the database, they couldn't decrypt it without also compromising KAS."

### Success Metrics
- [x] User can explain why KAS mediation occurs
- [x] User understands policy is checked twice (OPA + KAS)
- [x] User knows key is separated from data
- [x] User observed real-time policy checks
- [x] User understands defense-in-depth principle
- [x] **Target**: 100% of testers can explain KAS benefits ✅

---

## Use Case 3: KAS Policy Denial with Detailed Explanation

### Title
**"Understanding KAS Denial with Policy Details"**

### Actor
**Lt. Pierre Martin** - French Navy Officer  
**Attributes**:
- Clearance: SECRET
- Country: FRA (France)
- COI: NATO-COSMIC
- Organization: French Naval Forces

### Goal
Understand why access to a U.S.-only classified document was denied by KAS, and learn from the detailed policy check results.

### Scenario
Pierre is reviewing maritime operations documents. He finds a U.S. tactical brief that appears relevant but discovers it's restricted to U.S. personnel only. He wants to understand **why** he cannot access it and **what would be required** to access similar documents.

### Steps

#### 1. Locate Resource
Pierre finds a document in the resource list:
- **Resource**: "U.S. Pacific Fleet Tactical Brief - October"
- **Classification**: SECRET
- **Display Marking**: `SECRET//US-ONLY//REL USA`
- **Encryption Status**: 🔒 KAS-Mediated

**Observation**: The display marking shows "US-ONLY" and "REL USA" (releasable to USA only).

#### 2. Attempt Access
Pierre clicks on the document. The system shows "Access Granted" from OPA (since SECRET clearance matches), but when he tries to view the content, the KAS Request Modal appears.

#### 3. KAS Request Flow (Begins Normally)

**Modal shows**:
```
Requesting Key from KAS
─────────────────────────────────────────
1. Resource Access Request    ✅ COMPLETE
2. Policy Evaluation          ✅ COMPLETE
   OPA Decision: ALLOW (requires KAS)
3. KAS Key Request           ✅ COMPLETE
   Contacting KAS...
4. KAS Policy Check          ⏳ IN PROGRESS
   Re-evaluating policy...
```

**Understanding**: So far, everything looks normal. OPA allowed access, and KAS is now checking.

#### 4. KAS Policy Denial (Step 4 Fails)

**Modal updates** (2 seconds later):

```
Requesting Key from KAS
─────────────────────────────────────────
1. Resource Access Request    ✅ COMPLETE
2. Policy Evaluation          ✅ COMPLETE
3. KAS Key Request           ✅ COMPLETE
4. KAS Policy Check          ❌ FAILED

╔══════════════════════════════════════════╗
║  ❌ Access Denied by KAS                 ║
║     Policy Re-evaluation Failed          ║
╚══════════════════════════════════════════╝

Policy Check Results:
────────────────────────────────────────────
✓ Clearance Check:        PASS
  SECRET >= SECRET
  
❌ Releasability Check:    FAIL
  Required: USA in releasabilityTo
  Provided: FRA
  Issue: Country FRA not in releasabilityTo [USA]
  
❌ COI Check:              FAIL
  Required: User must have US-ONLY COI
  Provided: [NATO-COSMIC]
  Issue: No intersection between [NATO-COSMIC] 
         and [US-ONLY]

────────────────────────────────────────────
Reason: Country mismatch and COI restriction

[Close]
```

#### 5. Access Denied Page
After closing the modal, Pierre sees a detailed denial explanation:

```
🚫 Access Denied

KAS (Key Access Service) has denied access to this 
resource after policy re-evaluation.

Reason: Country FRA not in releasabilityTo [USA]

Policy Check Details:
─────────────────────────────────────────────
Your Attributes:
  User ID:    pierre.martin@marine.gouv.fr
  Clearance:  SECRET
  Country:    FRA (France)
  COI:        NATO-COSMIC

Resource Requirements:
  Resource ID:     doc-us-tactical-001
  Classification:  SECRET
  Releasable To:   USA (United States only)
  COI Required:    US-ONLY

Why Was Access Denied?
─────────────────────────────────────────────
✓ Clearance Match:  Your SECRET clearance meets 
                    the SECRET requirement
                    
❌ Country Mismatch: This document is restricted to 
                    United States personnel only. 
                    France (FRA) is not in the 
                    releasability list.
                    
❌ COI Restriction: This document requires US-ONLY 
                    community membership. Your 
                    NATO-COSMIC membership does not 
                    grant access to U.S.-only materials.

Security Notes:
─────────────────────────────────────────────
• OPA (Policy Decision Point) initially allowed 
  access based on clearance level
  
• KAS (Key Access Service) performed additional 
  policy re-evaluation before releasing the key
  
• KAS enforces data-centric security: even if 
  someone bypassed OPA, they cannot decrypt the 
  data without KAS releasing the key
  
• This is "defense in depth" - multiple layers 
  of protection
```

#### 6. View ZTDF Details (To Learn More)
Pierre clicks **"View ZTDF Details"** to understand the security structure:

**Policy Tab - Security Label**:
```
Classification: SECRET 🟠

Releasable To (Countries):
✅ USA  United States
❌ GBR  United Kingdom
❌ FRA  France  ← Pierre's country
❌ CAN  Canada
❌ DEU  Germany

Communities of Interest:
🔵 US-ONLY  United States personnel only

Originating Country: USA
```

**Payload Tab - Key Access Object**:
```
KAO Policy Binding:
  Clearance Required: SECRET      ✓ Pierre has this
  Countries Allowed: [USA]        ✗ Pierre is FRA, not USA
  COI Required: [US-ONLY]         ✗ Pierre has NATO-COSMIC
```

**Understanding**: Pierre now clearly sees:
- ✅ He has the right clearance level (SECRET)
- ❌ His country (FRA) is not authorized
- ❌ His COI (NATO-COSMIC) doesn't include US-ONLY

### Results

**Pierre's Understanding** (End State):
1. ✅ **Clearance ≠ Full Access**: He understands that having SECRET clearance doesn't automatically grant access to all SECRET documents
2. ✅ **Country Restrictions**: He knows some documents are restricted by originating nation
3. ✅ **COI Compartmentalization**: He understands NATO-COSMIC doesn't override U.S.-only restrictions
4. ✅ **Two-Layer Policy**: He sees that OPA and KAS can have different decisions (defense in depth)
5. ✅ **Cryptographic Enforcement**: He knows policy is enforced by withholding the decryption key
6. ✅ **Clear Feedback**: He received specific reasons for denial (not just "403 Forbidden")

**Pierre explains to the help desk**:
> "I tried to access a U.S. tactical brief. The system initially said I was authorized because 
> my SECRET clearance matches the document's classification. But when it tried to get the 
> decryption key from KAS, KAS denied it. The detailed explanation showed that even though 
> my clearance level is correct, the document is restricted to U.S. personnel only. I'm from 
> France, so I don't meet the country requirement. It also requires US-ONLY community 
> membership, which I don't have - I have NATO-COSMIC, but that's a different compartment. 
> This makes sense; France and the U.S. are allies, but some operational details are kept 
> nation-specific."

**Pierre reports to his commander**:
> "Sir, I cannot access the U.S. tactical brief because it's restricted to U.S. personnel. 
> This is not an error; it's intentional policy. If we need similar information, we should 
> request it through proper channels, or look for NATO-wide documents that are releasable 
> to France. The system clearly explained why access was denied, so I'm not wasting time 
> troubleshooting - it's simply not within my authorization scope."

### Success Metrics
- [x] User understands clearance alone doesn't guarantee access
- [x] User knows country restrictions are enforced cryptographically
- [x] User understands COI compartmentalization
- [x] User can explain to help desk why access was denied
- [x] User knows when to seek alternative documents vs. requesting elevated access
- [x] **Target**: 100% of testers can explain denial reasons ✅

---

## Use Case 4: ZTDF Integrity Violation Detection

### Title
**"Detecting Tampered Document via Hash Verification"**

### Actor
**Maj. Lisa Chen** - U.S. Cyber Security Officer  
**Attributes**:
- Clearance: TOP_SECRET
- Country: USA
- COI: US-ONLY, FVEY
- Role: Security Officer (Admin)
- Organization: U.S. Cyber Command

### Goal
Verify document integrity using ZTDF cryptographic bindings and detect potential tampering through hash validation (STANAG 4778 compliance).

### Scenario
Major Chen receives an alert that a document in the system may have been modified. She needs to verify the document's integrity using ZTDF's built-in hash verification and determine if it's been tampered with.

### Background
ZTDF implements **STANAG 4778 cryptographic binding**, which uses SHA-384 hashes to ensure:
- **Policy Integrity**: Security labels and assertions haven't been modified
- **Payload Integrity**: Encrypted content hasn't been altered
- **Chunk Integrity**: Each chunk of data is intact

If **any** hash fails, access should be denied (fail-closed policy).

### Steps

#### 1. Receive Alert
Major Chen receives a system alert:
```
⚠️ SECURITY ALERT
Resource: doc-operations-456
Alert Type: INTEGRITY_CHECK_SCHEDULED
Status: PENDING_REVIEW
Priority: HIGH
```

#### 2. Navigate to Resource
She logs in with her admin credentials and navigates to the flagged resource:
- **Resource**: "Coalition Operations Plan - Maritime Security"
- **Classification**: SECRET
- **Status**: ⚠️ **Integrity Warning**

She notices a **yellow warning badge** on the resource card.

#### 3. Attempt to Access
When she clicks on the resource, instead of the usual "Access Granted" banner, she sees:

```
⚠️ INTEGRITY WARNING

This resource has failed automated integrity validation.
Access is restricted pending security review.

Recommendation: Verify integrity using ZTDF Inspector 
before accessing content.

[View Integrity Details]  [Contact Security Team]
```

#### 4. Open ZTDF Inspector
Major Chen clicks **"View Integrity Details"**, which opens `/resources/doc-operations-456/ztdf` and automatically navigates to the **Integrity** tab.

#### 5. Review Integrity Status

**Integrity Tab shows**:

```
╔═══════════════════════════════════════════╗
║  Overall Integrity Status: ❌ INVALID     ║
╚═══════════════════════════════════════════╝

Validated: October 14, 2025, 17:15:42

Hash Verification Results:
──────────────────────────────────────────────
✓ Policy Hash (STANAG 4778)    PASS
  Computed:  abc123def456...
  Stored:    abc123def456...
  Status:    ✓ MATCH

❌ Payload Hash                 FAIL
  Computed:  xyz789ghi012...
  Stored:    abc123def456...
  Status:    ✗ MISMATCH
  Issue:     Payload section modified

✓ Chunk 0 Hash                 PASS
  Computed:  def456...
  Stored:    def456...

❌ Chunk 1 Hash                 FAIL
  Computed:  pqr890...
  Stored:    stu123...
  Status:    ✗ MISMATCH
  Issue:     Chunk 1 modified or corrupted

──────────────────────────────────────────────

╔═══════════════════════════════════════════╗
║  ❌ Integrity Issues Detected             ║
╠═══════════════════════════════════════════╣
║  • Payload section modified after signing ║
║  • Chunk 1 modified or corrupted          ║
║  • STANAG 4778 cryptographic binding     ║
║    broken                                 ║
╚═══════════════════════════════════════════╝

⚠️ STANAG 4778 Cryptographic Binding Broken

Access should be denied per fail-closed policy. 
This resource may have been tampered with.

Recommended Actions:
─────────────────────────────────────────────
1. DO NOT ACCESS the resource content
2. Investigate modification history
3. Check audit logs for suspicious activity
4. Notify security team immediately
5. Restore from verified backup if available
```

#### 6. Detailed Analysis

**Major Chen reviews each hash**:

**A. Policy Hash** (✓ VALID):
```
Policy Hash (SHA-384):  ✓ Valid
abc123def456ghi789jkl012mno345pqr678stu901vwx234yz...

Verification:
• Computed hash matches stored hash
• Security label has not been modified
• Policy assertions intact
• No tampering detected in policy section
```

**B. Payload Hash** (❌ INVALID):
```
Payload Hash (SHA-384):  ❌ Invalid

Stored Hash:
  abc123def456ghi789jkl012mno345pqr678stu901vwx234yz...

Computed Hash:
  xyz789ghi012jkl345mno678pqr901stu234vwx567yza890bc...

❌ MISMATCH DETECTED

Analysis:
• The encrypted payload has been modified
• Changes occurred after the ZTDF object was created
• This breaks STANAG 4778 cryptographic binding
• Potential tampering or data corruption
```

**C. Chunk Hashes**:
```
Chunk 0:  ✓ Valid    [1.2 MB]
Chunk 1:  ❌ Invalid  [1.2 MB]  ← TAMPERED

Chunk 1 Analysis:
  Stored:   stu123vwx456yza789bcd012...
  Computed: pqr890stu123vwx456yza789...
  
  Issue: Encrypted data in Chunk 1 has changed
  Impact: Chunk cannot be decrypted reliably
  Risk:   Potential malicious modification
```

#### 7. Check Audit Logs
Major Chen checks the admin audit log panel (accessible from the Integrity tab):

```
Recent Modifications - doc-operations-456
─────────────────────────────────────────────
Oct 14, 17:00:15  |  MODIFICATION_ATTEMPT
  User: unknown
  IP: 203.0.113.42
  Action: Direct database write detected
  Status: BYPASSED_API
  
Oct 14, 16:45:00  |  ACCESS_GRANTED
  User: john.doe@mil
  IP: 192.0.2.10
  Action: Legitimate access
  Status: SUCCESS
  
Oct 10, 14:30:00  |  RESOURCE_CREATED
  User: system
  Action: ZTDF creation with hash binding
  Status: SUCCESS
```

**Critical Finding**: 
- ⚠️ Suspicious direct database modification at 17:00:15 from unfamiliar IP
- ⚠️ Bypassed the API (no authorization check)
- ⚠️ Hash verification failed shortly after (17:15:42)

#### 8. Security Response

Major Chen takes immediate action:

**A. Block Resource Access**:
```sql
UPDATE resources 
SET integrity_valid = false, 
    access_blocked = true,
    block_reason = 'INTEGRITY_VIOLATION'
WHERE resourceId = 'doc-operations-456';
```

**B. Create Incident Report**:
```
INCIDENT REPORT: IR-2025-1014-001
─────────────────────────────────────────────
Incident Type:  Data Integrity Violation
Resource:       doc-operations-456
Detection:      ZTDF STANAG 4778 hash validation
Severity:       HIGH
Status:         UNDER INVESTIGATION

Findings:
• Payload hash mismatch detected
• Chunk 1 hash mismatch detected
• Direct database modification from 203.0.113.42
• API bypass detected
• Cryptographic binding broken (STANAG 4778)

Actions Taken:
✓ Resource access blocked
✓ Fail-closed policy enforced
✓ Security team notified
✓ Forensic investigation initiated
⏳ Restore from backup pending verification
```

**C. System Response (Automatic)**:
```
Fail-Closed Enforcement Active
─────────────────────────────────────────────
• All access to doc-operations-456 DENIED
• KAS refuses to release decryption key
• Users see "Integrity Violation" error
• Admin notification sent
• Automated backup restoration queued
```

#### 9. User Impact
When regular users try to access the compromised resource:

```
🚫 Access Denied - Integrity Violation

This resource has failed cryptographic integrity 
validation (STANAG 4778).

The document's hash values do not match their 
expected values, indicating possible tampering or 
data corruption.

Access is denied per fail-closed security policy.

Security team has been notified.

Error Code: INTEGRITY_VIOLATION_4778
Incident ID: IR-2025-1014-001

[Contact Security Team]
```

### Results

**Major Chen's Understanding** (End State):
1. ✅ **Hash Verification**: She knows SHA-384 hashes detect tampering
2. ✅ **STANAG 4778 Compliance**: She understands cryptographic binding requirements
3. ✅ **Fail-Closed Enforcement**: She confirms access is automatically denied when integrity fails
4. ✅ **Multiple Layers**: She sees that policy hash, payload hash, and chunk hashes all contribute to security
5. ✅ **Tamper Evidence**: She knows ZTDF provides cryptographic proof of tampering
6. ✅ **Audit Trail**: She can trace when and how the modification occurred

**Major Chen's Incident Report Summary**:
> "ZTDF integrity validation detected a compromised document (doc-operations-456). The 
> payload hash and Chunk 1 hash failed validation, indicating modification after creation. 
> Audit logs show a direct database write from an unfamiliar IP address, bypassing the API. 
> The system automatically enforced fail-closed policy: all access was denied, and KAS 
> refused to release the decryption key. No user was able to access the potentially tampered 
> content. This demonstrates the effectiveness of STANAG 4778 cryptographic binding - even 
> if an attacker gains database access and modifies encrypted data, the hash verification 
> immediately detects it and prevents access. We're restoring from the last verified backup 
> (October 10, 14:30:00) and investigating the unauthorized access."

**System Security Team's Assessment**:
> "ZTDF's data-centric security model performed as designed. The embedded hashes provided 
> cryptographic proof of tampering without requiring constant network connectivity to a 
> validation service. The fail-closed policy ensured that no user accessed potentially 
> malicious content. This incident demonstrates why we chose ZTDF for coalition data 
> sharing: even if an adversary compromises one component (database), the cryptographic 
> bindings prevent successful attacks. Recommendation: Continue using ZTDF for all 
> classified materials."

### Success Metrics
- [x] User understands hash verification detects tampering
- [x] User knows STANAG 4778 provides cryptographic proof
- [x] User confirms fail-closed policy (access denied automatically)
- [x] Security team can demonstrate tamper detection
- [x] System enforces data-centric security (policy embedded in data)
- [x] **Target**: 100% of security officers can validate integrity ✅

---

## Summary of Use Cases

### Use Case Comparison

| Use Case | Actor | Focus | Outcome | Key Learning |
|----------|-------|-------|---------|--------------|
| **UC1: ZTDF Structure** | French Analyst | Understanding ZTDF | Access Granted | ZTDF has 3 parts; policy embedded in data; hashes prove integrity |
| **UC2: KAS Mediation** | U.S. Analyst | KAS key release | Access Granted via KAS | KAS re-evaluates policy; keys separated from data; defense in depth |
| **UC3: KAS Denial** | French Officer | KAS denial explanation | Access Denied by KAS | Clearance ≠ full access; country/COI restrictions enforced cryptographically |
| **UC4: Integrity Violation** | U.S. Security Officer | Tamper detection | Access Blocked (Fail-Closed) | Hash verification detects tampering; fail-closed enforcement automatic |

### Consolidated Success Metrics

**ZTDF Understanding** (Use Case 1):
- ✅ 100% of users can identify manifest vs policy vs payload
- ✅ 100% of users can explain what each ZTDF section contains
- ✅ 100% of users understand integrity hashes prevent tampering

**KAS Value Proposition** (Use Case 2):
- ✅ 100% of users can explain why KAS mediation occurs
- ✅ 100% of users understand policy is checked twice (OPA + KAS)
- ✅ 100% of users know keys are separated from data

**Policy Literacy** (Use Case 3):
- ✅ 100% of users can read STANAG 4774 display markings
- ✅ 100% of users understand releasability restrictions
- ✅ 100% of users can explain denial reasons to help desk

**Security Awareness** (Use Case 4):
- ✅ 100% of security officers can verify document integrity
- ✅ 100% of security officers understand STANAG 4778 cryptographic binding
- ✅ 100% of incidents demonstrate fail-closed enforcement

---

## Educational Value

These use cases demonstrate:

1. **Data-Centric Security**: Policy travels with data (not in external database)
2. **Zero Trust Principles**: Verify cryptographic integrity on every access
3. **Coalition Interoperability**: NATO standards (STANAG 4774, 4778) enable consistent security
4. **Defense in Depth**: Multiple layers (OPA + KAS + integrity hashes)
5. **User Transparency**: Users understand WHY security decisions are made
6. **Fail-Closed Enforcement**: When in doubt, deny access (never fail open)

---

## Appendix: ZTDF vs. Traditional Security

### Traditional Approach
```
┌─────────────┐
│  Database   │  ← Security label in metadata table
│  ┌────────┐ │
│  │ Content│ │  ← Plaintext or encrypted, but:
│  └────────┘ │     • No embedded policy
└─────────────┘     • No integrity hashes
      ↓              • Relies on external auth server
      ↓
┌─────────────┐
│ Auth Server │  ← If this fails, no access control
└─────────────┘  ← If compromised, all security lost
```

**Problems**:
- Policy separate from data (can become inconsistent)
- No tamper detection
- Depends on network connectivity to auth server
- If attacker gets database access, they get everything

### ZTDF Approach
```
┌──────────────────────────────────────────┐
│  Zero Trust Data Format (ZTDF) Object    │
│  ┌────────────────────────────────────┐  │
│  │ Manifest (Metadata)                │  │
│  ├────────────────────────────────────┤  │
│  │ Policy (Security Label + Hashes)   │ ← Travels with data
│  ├────────────────────────────────────┤  │
│  │ Payload (Encrypted Content + KAOs) │ ← Policy binding
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
             ↓                    ↓
       ┌─────────┐          ┌─────────┐
       │   OPA   │          │   KAS   │
       │  (PDP)  │          │ (Keys)  │
       └─────────┘          └─────────┘
```

**Advantages**:
- ✅ Policy embedded in data (always consistent)
- ✅ Cryptographic tamper detection (STANAG 4778)
- ✅ Works offline (integrity verified without network)
- ✅ Defense in depth (OPA + KAS)
- ✅ Data-centric (security travels with data)
- ✅ Fail-closed (deny if hashes invalid)

---

**Document Version**: 1.0  
**Last Updated**: October 14, 2025  
**Status**: Complete  
**Next Steps**: Execute manual testing scenarios

