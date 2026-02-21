# DIVE V3 Manual Testing Workflow (UI-First + Zero Trust Protocol)

**Last updated:** 2026-02-21  
**Scope:** Completed federation capabilities in Phases A-F, plus optional Phase G checks if those endpoints are enabled in your current branch.

## 1) What This Guide Is

This is a step-by-step **operator workflow** for manually validating federation behavior end to end.

Important reality check:
1. The federation admin UI is strong for monitoring, policy, OPAL, audit, and drift.
2. The **V2 enrollment lifecycle** (discover, enroll, verify fingerprint, approve, exchange, activate, revoke) is still primarily **CLI/API-driven**, not full click-through UI yet.

This guide stitches both paths into one test runbook.

## 2) Test Topology (Recommended)

Use one Hub and two Spokes so you can validate both hub-spoke and mesh behavior:
1. Hub: `USA`
2. Spoke A: `GBR`
3. Spoke B: `FRA`

Deploy and verify:

```bash
./dive hub deploy
./dive spoke deploy GBR
./dive spoke deploy FRA

./dive hub status
./dive spoke status GBR
./dive spoke status FRA
```

Use status output as source-of-truth for URLs. Typical local defaults:
1. Hub app: `https://localhost:3000`
2. Hub API: `https://localhost:4000`

Set variables for convenience:

```bash
export HUB_APP_URL="https://localhost:3000"
export HUB_API_URL="https://localhost:4000"
export GBR_API_URL="<from ./dive spoke status GBR>"
export FRA_API_URL="<from ./dive spoke status FRA>"
```

## 3) Browser Session Setup (UI Workflow)

Use separate browser profiles to avoid session confusion:
1. Profile 1: Hub Admin session
2. Profile 2: GBR Admin session
3. Profile 3: FRA Admin session

If you use seeded demo credentials:
1. Username pattern: `admin-<instance>` (example: `admin-usa`)
2. Password: `Admin2025!Secure`
3. OTP (demo): `123456`

Reference: `docs/DEMO_CREDENTIALS.md`

## 4) UI Workflow: Hub Admin Federation Operations

Run these in Hub Admin profile.

### 4.1 Dashboard baseline
1. Open `${HUB_APP_URL}/admin/dashboard`.
2. Confirm federation health cards/widgets render.
3. Click refresh controls and confirm updated timestamps/metrics.

Expected:
1. No auth loops or 5xx UI errors.
2. Federation widgets render with live data.

### 4.2 Spokes registry workflow
1. Open `${HUB_APP_URL}/admin/federation/spokes`.
2. Validate tabs: `All`, `Pending`, `Active`, `Suspended`, `Revoked`.
3. Use search field and confirm filter behavior.
4. Open a spoke row details panel (`View Details` icon) when available.
5. In detail panel, verify tabs: `Overview`, `Health`, `Policies`, `Token`.
6. Trigger safe actions as needed:
7. `Force Policy Sync` from Policies tab.
8. `Rotate Token` from Token tab (if appropriate for your environment).

Expected:
1. Status cards and counts align with registry data.
2. Detail panel operations succeed without page reload.

### 4.3 Policy management workflow
1. Open `${HUB_APP_URL}/admin/federation/policies`.
2. `Policy Bundles` tab:
3. Select scopes in `Policy Bundle Builder`.
4. Click `Build Bundle`.
5. Click `Publish` (or `Build & Publish`).
6. Confirm `Current Bundle` updates (version/hash/timestamp/signature state).
7. Confirm `Policy Sync Status` updates and `Sync All` works.
8. `Trusted Issuers` tab:
9. Search/filter issuers.
10. Use `Sync`.
11. Add/remove issuer only if you intentionally want to mutate trust config.
12. `Trust Matrix` tab:
13. Use `Export`.
14. Use `Sync`.
15. Toggle one trust edge only if you intentionally want to test config mutation.

Expected:
1. Bundle operations complete and update metadata.
2. Sync dashboard reflects spoke version/sync state.
3. Issuers and matrix views render and refresh correctly.

### 4.4 OPAL status workflow
1. Open `${HUB_APP_URL}/admin/federation/opal`.
2. Validate OPAL server health, uptime, endpoint status, websocket status.
3. In connected clients, test `Ping` and `Force Sync` for one client.
4. In transaction log:
5. Filter by transaction type.
6. Export JSON and CSV.

Expected:
1. OPAL metrics load and refresh every cycle.
2. Ping/sync actions create visible transaction records.

### 4.5 Statistics workflow
1. Open `${HUB_APP_URL}/admin/federation/statistics`.
2. Validate both tabs: `Overview` and `Traffic Details`.
3. Click `Refresh`.

Expected:
1. Charts/tables render without empty-state regressions when data exists.
2. Latency/request metrics look internally consistent.

### 4.6 Audit workflow
1. Open `${HUB_APP_URL}/admin/federation/audit`.
2. Filter by outcome, event type, and spoke.
3. Use search.
4. Expand a row and inspect event details.
5. Export filtered result set.

Expected:
1. Cross-spoke records aggregate correctly.
2. Export contains filtered rows.

### 4.7 Drift workflow
1. Open `${HUB_APP_URL}/admin/federation/drift`.
2. Click `Refresh`.
3. If drift exists, test `Reconcile All`.
4. Resolve one drift event if present.

Expected:
1. Drift state and unresolved counts update after reconciliation.

## 5) V2 Zero Trust Enrollment Workflow (CLI/API Path)

This validates core Phase A-F protocol behavior.

### 5.1 Discovery + identity (GBR -> Hub)
On GBR:

```bash
./dive federation discover "$HUB_API_URL"
./dive federation show-fingerprint
./dive federation enroll "$HUB_API_URL"
```

Capture `ENROLLMENT_ID` from enroll output.

Expected:
1. Discovery shows remote metadata and fingerprint.
2. Enrollment returns an ID and enters `pending_verification`.

### 5.2 Fingerprint verification + approval (Hub admin)
On Hub:

```bash
./dive federation enrollments
./dive federation verify-fingerprint <ENROLLMENT_ID>
./dive federation approve-enrollment <ENROLLMENT_ID>
```

Expected:
1. Enrollment transitions `pending_verification -> fingerprint_verified -> approved`.

### 5.3 Credential exchange + activation (GBR side)
Back on GBR:

```bash
./dive federation exchange <ENROLLMENT_ID> "$HUB_API_URL"
```

If needed:

```bash
./dive federation activate <ENROLLMENT_ID> "$HUB_API_URL"
```

Expected:
1. Exchange succeeds.
2. Enrollment reaches `credentials_exchanged` then `active`.

### 5.4 Verify graph + status from both sides

```bash
curl -sk "$HUB_API_URL/api/federation/enrollment/<ENROLLMENT_ID>/status" | jq
curl -sk "$HUB_API_URL/api/federation/graph" | jq
curl -sk "$GBR_API_URL/api/federation/graph" | jq
```

Expected:
1. Status is `active`.
2. Graph includes both nodes and an edge for the enrollment.
3. `isHub` reflects instance role correctly (`true` on Hub, `false` on Spoke).

### 5.5 SSE enrollment stream check
Use the `sseToken` returned by enroll response:

```bash
curl -Nsk "$HUB_API_URL/api/federation/enrollment/<ENROLLMENT_ID>/events?token=<SSE_TOKEN>"
```

Negative check:

```bash
curl -isk "$HUB_API_URL/api/federation/enrollment/<ENROLLMENT_ID>/events"
```

Expected:
1. Valid token stream emits status events.
2. Missing token returns `401`.

## 6) Security and Hardening Checks

### 6.1 Enrollment rate limit

```bash
for i in {1..5}; do
  curl -sk -o /dev/null -w "%{http_code}\n" \
    -X POST "$HUB_API_URL/api/federation/enroll" \
    -H "Content-Type: application/json" \
    -d '{}'
done
```

Expected:
1. First requests fail validation (`400`) for bad payload.
2. After limit threshold, endpoint returns `429`.

### 6.2 Revocation signature verification (invalid signature)

```bash
curl -sk -X POST "$HUB_API_URL/api/federation/notify-revocation" \
  -H "Content-Type: application/json" \
  -d '{"enrollmentId":"enr_test","revokerInstanceCode":"GBR","reason":"test","signature":"invalid","signerCertPEM":"not-a-cert"}' | jq
```

Expected:
1. Response indicates invalid signature (typically `401`).

### 6.3 Secrets encrypted-at-rest flag (Vault Transit)
Check recent enrollment docs directly:

```bash
MONGO_CONTAINER=$(docker ps --format '{{.Names}}' | rg 'mongodb' | head -n 1)
docker exec "$MONGO_CONTAINER" mongosh dive-v3 --quiet --eval '
db.federation_enrollments.find({}, {enrollmentId:1,_secretsEncrypted:1,status:1,approverCredentials:1,requesterCredentials:1})
  .sort({_id:-1}).limit(3).forEach(printjson)
'
```

Expected:
1. `_secretsEncrypted: true` when Vault Transit is healthy.
2. If Vault is unavailable, `_secretsEncrypted: false` is acceptable fallback behavior.

## 7) Revocation Cascade Workflow

### 7.1 Revoke from Hub

```bash
./dive federation revoke GBR --confirm --reason "manual cascade test"
```

Expected:
1. CLI attempts V2 revocation first for active enrollment.
2. Enrollment transitions to `revoked`.
3. Cross-wire local cleanup runs on partner side.

### 7.2 Verify cleanup

```bash
curl -sk "$HUB_API_URL/api/federation/graph" | jq
curl -sk "$GBR_API_URL/api/federation/graph" | jq
```

Expected:
1. Edge for GBR/Hub enrollment is removed from graph.
2. Policy/issuer/matrix entries associated with revoked trust are gone after sync.

### 7.3 CRL behavior smoke check
Try re-enrolling immediately from the same revoked instance identity.

Expected:
1. Enrollment is blocked or rejected due to revocation/CRL checks unless identity/cert rotates.

## 8) Mesh Workflow (Spoke-to-Spoke)

Run the same V2 protocol between FRA and GBR to validate mesh behavior:
1. FRA discovers and enrolls into GBR.
2. GBR verifies fingerprint and approves.
3. FRA runs exchange and activation.
4. Verify both local graphs include FRA<->GBR edge.

Commands (example):

```bash
# On FRA
./dive federation discover "$GBR_API_URL"
./dive federation enroll "$GBR_API_URL"

# On GBR (admin)
./dive federation enrollments
./dive federation verify-fingerprint <ENROLLMENT_ID_FRA_GBR>
./dive federation approve-enrollment <ENROLLMENT_ID_FRA_GBR>

# Back on FRA
./dive federation exchange <ENROLLMENT_ID_FRA_GBR> "$GBR_API_URL"
```

Expected:
1. Spoke-side approver auto-activation works (no Hub-only assumption).
2. Graph reflects non-Hub federation edges.

## 9) Optional Phase G Checks (If Enabled In Your Branch)

Only run this if these endpoints exist in your running backend:
1. `POST /api/federation/notify-policy-update`
2. `GET /api/federation/policy-summary`
3. `GET /api/federation/policy-drift`

Quick checks:

```bash
curl -sk "$HUB_API_URL/api/federation/policy-summary" | jq
curl -sk "$HUB_API_URL/api/federation/policy-drift" | jq
```

Expected:
1. Policy summary returns topic hashes + timestamp.
2. Drift report returns partner-by-partner comparison status.

## 10) Capability Coverage Map (A-F)

Use this to confirm you hit all major outcomes:
1. Discovery metadata: Section 5.1
2. Signed enrollment submission: Section 5.1
3. OOB fingerprint verification: Section 5.2
4. Approval and credential generation: Section 5.2
5. Mutual credential exchange: Section 5.3
6. Auto/manual activation: Section 5.3
7. Secrets encryption flag: Section 6.3
8. Enrollment rate limiting: Section 6.1
9. SSE auth and streaming: Section 5.5
10. Audit trail visibility: Section 4.6
11. Revocation cascade: Section 7
12. Cross-wire signature validation: Section 6.2
13. V2-first revoke CLI behavior: Section 7.1
14. Hub role detection via graph `isHub`: Section 5.4
15. Mesh federation behavior: Section 8
16. Federation graph API: Sections 5.4 and 7.2

## 11) End-of-Run Exit Criteria

Call the run complete when all are true:
1. At least one Hub<->Spoke enrollment reached `active`.
2. At least one revoke removed trust artifacts and graph edges.
3. UI federation pages load cleanly and actions work.
4. Security checks passed (`429`, SSE `401` without token, signature rejection).
5. (Optional) Mesh enrollment between two spokes reached `active`.
6. (Optional) Phase G summary/drift endpoints respond correctly.
