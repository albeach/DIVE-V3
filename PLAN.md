# DIVE25 Federation, Compliance, and Readiness Audit + Remediation Plan

## Summary
This plan delivers an evidence-backed audit and a decision-complete remediation path for DIVE25 with these locked defaults:
1. External federation validation uses public DNS + valid TLS.
2. Compliance reporting is clause-level traceability.
3. Shared is an optional middle tier, not a hard dependency.

Top current blockers are critical security exposure in federation/OPAL endpoints, non-sovereign localhost/network assumptions, dry-run safety mismatch, and admin UI/backend contract drift.

## 1) Executive Summary
### Top risks and blockers
| Severity | Risk | Evidence | Impact |
|---|---|---|---|
| Critical | Unauthenticated OPAL bundle build/publish | `backend/src/routes/opal.routes.ts:331`, `backend/src/routes/opal.routes.ts:412`, `backend/src/routes/opal.routes.ts:514`; `curl -sk -X POST https://localhost:4000/api/opal/bundle/build` returned `200` | Policy tampering / unauthorized propagation |
| Critical | Unauthenticated federation policy/query endpoints | `backend/src/routes/federation.routes.ts:4054`, `backend/src/routes/federation.routes.ts:4145`, `backend/src/routes/federation.routes.ts:4262`; unauthenticated `curl` returned `200` | Cross-instance data/policy surface exposed |
| High | Global `--dry-run` does not enforce pipeline dry-run | `./dive:66` sets `DRY_RUN`, hub deploy checks `DIVE_DRY_RUN` at `scripts/dive-modules/deployment/hub-pipeline.sh:827`; `logs/deployments/hub-20260220-065743.log:24` shows lock acquired | Unsafe operator expectation during “dry-run” |
| High | Localhost/same-host federation assumptions | `scripts/dive-modules/common.sh:640`, `scripts/dive-modules/spoke/pipeline/spoke-compose-generator.sh:202`, `docker-compose.hub.yml:1257`, `templates/spoke/docker-compose.template.yml:629` | Breaks sovereign multi-domain deployment model |
| High | State-machine inconsistencies during deploy | `logs/deployments/hub-20260220-064142.log:82`, `logs/deployments/hub-20260220-064142.log:84`; `./dive hub state` shows drift | Non-deterministic deployment/resume |
| Medium | Compliance APIs report hardcoded “perfect” readiness | `backend/src/controllers/compliance.controller.ts:35` | False assurance for accreditation |
| Medium | Admin UI uses mock fallback and route mismatches | `frontend/src/app/api/admin/security/sessions/route.ts:17`, `frontend/src/components/admin/security/session-manager.tsx:85`, `backend/src/routes/admin.routes.ts:2243`, `backend/src/controllers/admin-sessions.controller.ts:37` | Operators see non-authoritative controls/data |

### Recommended deployment order (final)
1. Hub Foundation (core services only, no federation traffic).
2. Hub Security Hardening (endpoint authz, dry-run fix, state-machine stabilization).
3. Shared Optional Tier (monitoring/token-store only, no control-plane dependency).
4. Spoke Standalone Deployment (independent operation validated).
5. Federated Onboarding (bidirectional SSO + trust + policy sync).
6. Multi-spoke rollout in waves.

## 2) Standards Compliance Matrix
| Requirement | Evidence (file/config/endpoint/log) | Status | Gap + Fix |
|---|---|---|---|
| STANAG 4774 marking generation and SPIF parsing | `backend/src/services/spif-parser.service.ts:348`, `backend/src/services/upload.service.ts:201`, test pass in `npm test -- --runTestsByPath src/services/__tests__/spif-parser.service.test.ts` | Partial | Generation exists; add signed artifact verification and prod-only SPIF raw access control. |
| STANAG 4774 SPIF raw data handling security | `backend/src/routes/spif.routes.ts:615` (“should be restricted to admins”) | Non-compliant | Enforce admin auth middleware and audit access to `/api/spif/raw`. |
| STANAG 4778 BDO extraction/binding/hash | `backend/src/services/upload.service.ts:94`, `backend/src/services/upload.service.ts:680`, `backend/src/services/bdo-parser.service.ts:28` | Partial | Add cross-instance BDO round-trip tests and tamper-detection proofs in CI. |
| STANAG 5636/XACML interoperability | `backend/src/config/spif.config.ts:107`, `backend/src/adapters/xacml-adapter.ts:4`, `backend/src/services/policy-execution.service.ts:202` | Partial | Require AuthzForce integration tests in deployment gates; no skipped external-engine path in readiness criteria. |
| ACP-240 ABAC/classification/coi enforcement | `backend/src/services/upload.service.ts:122`, `backend/src/services/coi-validation.service.ts`, `policies/entrypoints/authz.rego` | Partial | Enforcement exists, but unauthenticated federation evaluation/query bypasses trust boundary intent; add spoke-token/mTLS checks. |
| ACP-240 multi-KAS/split-key operationalization | `backend/src/services/upload.service.ts:515`, `backend/src/services/upload.service.ts:522`, `backend/src/services/upload.service.ts:551`, `backend/src/services/upload.service.ts:569` | Partial | Multiple KAOs point to one base `KAS_URL`; route KAOs to distinct trusted KAS endpoints from registry. |
| ACP-240 compliance evidence integrity | `backend/src/controllers/compliance.controller.ts:35` | Non-compliant | Replace hardcoded “PERFECT/100%” with computed runtime evidence and signed report payloads. |
| Federation SSO for sovereign domains | `backend/src/routes/federation.routes.ts:749`, `scripts/dive-modules/spoke/pipeline/spoke-compose-generator.sh:202`, `scripts/dive-modules/spoke/spoke-deploy.sh:341` | Non-compliant | Remove localhost skip paths in production; require externally resolvable IdP URLs and verified TLS chains. |
| OPAL policy lifecycle governance security | `docker-compose.hub.yml:1164`, `docker-compose.hub.yml:1167`, `backend/src/routes/opal.routes.ts:331` | Non-compliant | Keep GitHub SSOT and polling, but enforce authenticated publish/build endpoints and signed bundle policy. |
| ABAC policy test health | `opa test policies` -> `FAIL: 22/1042`; targeted `policies/tenant/base.rego` tests pass | Partial | Fix test harness dependency/data loading for full policy bundle consistency in CI. |

## 3) Architecture Assessment
### Current topology (observed)
| Area | Current state | Evidence |
|---|---|---|
| Hub/Shared coupling | Shared starts from Hub services phase; same host bridge network | `scripts/dive-modules/deployment/hub-phases.sh:1068`, `scripts/dive-modules/common.sh:640` |
| Network assumptions | Extensive localhost and `dive-shared` assumptions | `docker-compose.hub.yml`, `templates/spoke/docker-compose.template.yml` |
| Identity assumptions | Localhost/dev skip logic in federation registration | `backend/src/routes/federation.routes.ts:749` |
| Shared CLI | No first-class `shared` command | `./dive shared --help` -> unknown command |

### Target topology (required)
| Tier | Placement | Trust boundary | Identity boundary |
|---|---|---|---|
| Hub | Independent host/domain (`usa.hub.mil`) | Internet/L7 boundary with mTLS + allowlist | Hub IdP realm/broker boundary |
| Shared (optional) | Independent host/domain or managed services | No required control-plane dependency for spokes | Service identity only |
| Spoke | Independent host/domain (`fra.defense.fr`) | Sovereign boundary, no shared Docker network | Local IdP realm + federation trust object |

### Required boundary rules
1. No cross-instance dependency on Docker network names.
2. All cross-instance URLs are FQDN over TLS with cert validation.
3. Federation APIs split into `public-discovery` and `authenticated-internal`.
4. Spoke must run in standalone mode without hub availability.

## 4) Deployment Pipeline Redesign
### Final sequence (Hub, Shared, Spoke)
1. Hub Preflight and dry-run safety check.
2. Hub deploy (core services + orchestration DB + health gates).
3. Hub security hardening gates (endpoint auth, token checks, state consistency).
4. Shared optional deploy (`docker/instances/shared/docker-compose.yml`) after hub is stable.
5. Spoke standalone deploy and validation.
6. Spoke federation onboarding and bidirectional SSO linking.
7. Policy sync/latency validation and cross-instance ABAC validation.

### Command plan
| Goal | Command |
|---|---|
| Safe preview | `./dive hub deploy --dry-run` |
| Detect global dry-run misuse | `./dive --dry-run hub deploy` should fail policy check until fixed |
| Hub deploy | `./dive hub deploy` |
| Hub validation | `bash scripts/validate-hub-deployment.sh` |
| Shared optional start | `docker compose -f docker/instances/shared/docker-compose.yml up -d` |
| Spoke standalone | `./dive spoke deploy FRA --skip-federation --domain fra.defense.fr` |
| Spoke federated | `./dive spoke authorize FRA` then `./dive spoke deploy FRA --domain fra.defense.fr --auth-code <uuid>` |

### Standalone spoke path (mandatory)
1. Explicit `--skip-federation`.
2. Local IdP/KAS/OPA fully functional.
3. Deferred onboarding token and trust setup.
4. Later federation attach without redeploying core spoke stack.

### Federation onboarding flow (bidirectional SSO)
1. Register spoke with external IdP URL and TLS validation required.
2. Super-admin approval with trust profile (classification ceiling + COIs + scopes).
3. Auto or API-driven bidirectional IdP linking.
4. SP metadata exchange and assertion tests both directions.
5. Federated search + cross-instance authorization verification.

## 5) OPA/OPAL Governance Model
### Source of truth
1. Policy repo remains GitHub (`docker-compose.hub.yml:1164`).
2. Branch protection + signed commits + PR checks (OPA tests + bundle verification).
3. Release tags map to deployed bundle hash.

### Propagation path
1. GitHub commit.
2. OPAL server poll (30s) or webhook.
3. Backend OPAL data endpoints with service token.
4. OPAL clients at spokes refresh.
5. OPA decision engine consumes updated data/policy.

### Revocation/update latency and failure modes
| Scenario | Target | Detection | Fallback |
|---|---|---|---|
| Standard update | < 60s | OPAL transaction + client sync status | force-sync endpoint (authenticated) |
| Emergency revoke | < 30s | revocation event and deny audit entries | deny-by-default rule until sync restores |
| GitHub unavailable | < 5m degraded mode | OPAL health and last-good hash age | continue last signed bundle; alert critical |
| Token/config mismatch | immediate fail-closed | 401/403 + sync alarms | block writes, manual break-glass runbook |

## 6) API Audit
### Core endpoint findings
| Endpoint | Current auth behavior | Observed result | Required change |
|---|---|---|---|
| `POST /api/opal/bundle/build` | No auth middleware | `200` unauthenticated | Require `authenticateJWT + requireSuperAdmin` |
| `POST /api/opal/bundle/publish` | No auth middleware | reachable unauthenticated | Require admin auth and CSRF/nonce controls |
| `POST /api/opal/bundle/build-and-publish` | No auth middleware | `200` unauthenticated | Same as above |
| `POST /api/federation/evaluate-policy` | No auth middleware | `200` unauthenticated | Require spoke token + mTLS/client attestation |
| `POST /api/federation/query-resources` | No auth middleware | `200` unauthenticated | Require scoped spoke token |
| `POST /api/federation/cross-instance/authorize` | No auth middleware | `200` unauthenticated | Require authenticated federation principal |
| `GET /api/federation/spokes/config/:instanceCode` | No auth (internal-net assumption) | `200` unauthenticated | Restrict to trusted spoke identity |
| `GET /api/federation/spokes` | `requireAdmin` | `401` unauthenticated | Keep as-is |
| `GET /api/federation/status` | public | `200` unauthenticated | Keep minimal metadata only |
| `GET /api/opal/policy-data` | token middleware | `401` without token | Keep; remove fail-open branch when token missing |

### Federation-specific behavior gaps
1. Localhost/dev shortcuts in IdP validation bypass sovereign assumptions.
2. Public/internal endpoint boundaries are mixed in one route surface.
3. Federation stats endpoints expected by frontend are not present at backend path.

## 7) Admin UI Gap Report
| Area | Frontend behavior | Backend reality | Status | Priority fix |
|---|---|---|---|---|
| Security sessions | Calls `/api/admin/security/sessions` | Backend routes under `/api/admin/sessions` | Gap | Add backend-compatible Next API mapping or align backend path |
| Certificate health | Calls `/api/admin/security/certificates` with mock fallback | Backend is `/api/admin/certificates` | Gap | Route alignment + remove mock fallback in prod |
| Password policy | Calls `/api/admin/security/password-policy` | No matching backend route | Gap | Implement backend endpoint or remove control |
| Security headers | Calls `/api/admin/security/headers` | No matching backend route | Gap | Implement endpoint with real scanner data |
| MFA config | Calls `/api/admin/security/mfa-config` | Backend is `/api/admin/idps/:alias/mfa-config` | Gap | Add alias-aware UI flow and endpoint contract |
| Federation stats | Frontend requests `/api/federation/statistics` and `/traffic`, falls back to mock | Backend exposes `/api/admin/federation/statistics` and `/traffic`, controller is synthetic | Gap | Correct route path and replace synthetic controllers with real aggregates |
| Session analytics | UI appears operational | Controller explicitly placeholder with simulated data | Gap | Replace with DB + Redis-backed implementation |

## 8) Prioritized Remediation Backlog
| Priority | Item | Owner | Effort | Validation test | Status |
|---|---|---|---|---|---|
| P0 | Secure OPAL mutation endpoints | Backend/API | 1-2 days | Unauth `curl` must return `401/403`; authenticated admin succeeds | ✅ Done (PR #692) |
| P0 | Secure federation internal endpoints | Backend/Security | 2-4 days | Unauth external requests denied; spoke-token/mTLS path passes | ✅ Done (PR #692) |
| P0 | Fix global `--dry-run` propagation | CLI/Platform | 1 day | `./dive --dry-run hub deploy` must print dry-run summary and take no lock | ✅ Done (PR #693) |
| P0 | Repair orchestration state transition flow | Platform | 2-3 days | No invalid transition logs in full hub deploy; deterministic resume | ✅ Done (PR #697) |
| P0 | Remove localhost production assumptions | Platform/Identity | 3-5 days | Full hub+spoke federation works with public FQDN only | ✅ Done (PR #710) |
| P0 | Enforce external IdP TLS validation in production | Identity/Security | 2 days | Registration fails for localhost/internal URLs in prod mode | ✅ Done (PR #692 + #710) |
| P1 | Implement standalone spoke certified path | Platform | 2 days | Spoke works without hub; later federates without rebuild | 🔶 Partial — `--skip-federation` not yet implemented |
| P1 | Introduce first-class Shared deploy command | CLI/Platform | 1-2 days | `./dive shared deploy/status/down` operational | ✅ Done (PR #704) |
| P1 | Make Multi-KAS truly multi-endpoint in upload path | Backend/KAS | 3-4 days | KAOs resolve to distinct KAS URLs from registry | ✅ Done (PR #707) |
| P1 | Replace placeholder compliance status metrics | Backend/Compliance | 2-3 days | `/api/compliance/status` reflects computed runtime values | ✅ Done (PR #700) |
| P1 | Align admin security UI and backend contracts | Frontend + Backend | 3-5 days | No `/security/*` dead paths; no mock fallback in prod | ✅ Done (PR #705) |
| P1 | Replace synthetic session/federation stats controllers | Backend/Observability | 3-5 days | Metrics sourced from Mongo/Redis/telemetry only | ✅ Done (PR #705) |
| P1 | Fix full OPA test harness consistency | Policy/DevEx | 1-2 days | `opa test policies` zero unexpected failures | ✅ Done (PR #695) |
| P2 | Add CLI readability quality gate (FK 7-9) | CLI/UX | 1-2 days | CI fails messages outside grade band | ⬜ Not started |
| P2 | Publish sovereign federation architecture runbook | Architecture/SecOps | 1-2 days | Runbook used to deploy two independent domains successfully | ⬜ Not started |

## Important Public API/Interface/Type Changes
1. Add mandatory auth middleware to `POST /api/opal/bundle/build`, `POST /api/opal/bundle/publish`, `POST /api/opal/bundle/build-and-publish`.
2. Require spoke identity (token + mTLS) for federation internal APIs:
`POST /api/federation/evaluate-policy`, `POST /api/federation/query-resources`, `POST /api/federation/cross-instance/authorize`, `GET /api/federation/spokes/config/:instanceCode`.
3. Split federation routes into:
`/api/federation/public/*` and `/api/federation/internal/*`.
4. Align frontend proxy contracts from `/api/admin/security/*` to canonical backend equivalents.
5. Update KAS payload contracts to require external `kasUrl`, optional `internalKasUrl`, and explicit trust metadata.
6. Introduce versioned response shape for compliance endpoints with computed evidence fields.

## Test Cases and Scenarios
1. Dry-run safety: compare `./dive hub deploy --dry-run` vs `./dive --dry-run hub deploy`; both must be side-effect free.
2. Hub health gate: `bash scripts/validate-hub-deployment.sh` must pass 100% required checks.
3. Sovereign SSO: validate login from `usa.hub.mil` into `fra.defense.fr` and reverse direction.
4. Federation API auth: all internal endpoints reject unauthenticated calls.
5. OPAL auth: unauthenticated bundle operations must fail; authenticated admin succeeds.
6. Policy propagation latency: commit policy change, observe spoke OPA decision change within SLA.
7. Multi-KAS proof: seeded/uploaded documents contain KAOs that reference distinct KAS endpoints.
8. ABAC/classification enforcement: positive and negative access tests across classification + COI + releasability.
9. Admin UI real-data validation: no mock fallbacks on sessions, certs, federation stats.
10. Compliance report integrity: `/api/compliance/status` numbers reconcile with live telemetry/tests.

## Evidence Commands and Key Excerpts
| Command | Key result |
|---|---|
| `./dive shared --help` | `Unknown command: shared` |
| `./dive hub deploy --dry-run` | Dry-run plan logged with “No changes were made” (`logs/deployments/hub-20260220-065732.log:143`) |
| `./dive --dry-run hub deploy` | Lock acquired despite “dry-run” intent (`logs/deployments/hub-20260220-065743.log:24`) |
| `curl -sk -X POST https://localhost:4000/api/opal/bundle/build` | `200` unauthenticated |
| `curl -sk -X POST https://localhost:4000/api/opal/bundle/build-and-publish` | `200` unauthenticated |
| `curl -sk -X POST https://localhost:4000/api/federation/evaluate-policy` | `200` unauthenticated |
| `curl -sk -X POST https://localhost:4000/api/federation/query-resources` | `200` unauthenticated |
| `curl -sk https://localhost:4000/api/federation/statistics` | `404 Cannot GET /api/federation/statistics` |
| `opa test policies` | `FAIL: 22/1042` |
| `bash scripts/validate-hub-deployment.sh` | 23 passed / 20 failed in observed run |

## CLI Copy Guidance (FK 7.0–9.0 target)
Use short sentences, active voice, one action per line.

Sample rewrites:
1. Current intent: “No Hub detected...”
   Suggested: `No hub found. Enter hub domain to connect, or press Enter to run standalone.`
2. Current intent: “Invalid state transition...”
   Suggested: `Deployment state is out of order. Run './dive hub state --repair' and retry.`
3. Current intent: “Hub backend not responding (may still be starting)”
   Suggested: `Hub API is not ready yet. Wait 30 seconds, then run this command again.`
4. Current intent: “KAS registration can be retried later...”
   Suggested: `KAS was not registered. Run './dive spoke kas register <CODE>' after backend is healthy.`

## Assumptions and Defaults
1. Production federation target is independently hosted domains with valid public TLS.
2. Shared tier remains optional and cannot block hub-spoke baseline operation.
3. Clause-level compliance evidence is mandatory for sign-off.
4. This plan is produced in Plan Mode; no repo file edits are included in this turn.
5. Live full cross-domain SSO execution is part of the implementation phase, with evidence capture scripts defined above.
