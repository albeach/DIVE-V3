meta:
  source_document: "ACP 240 SUPP-5(A) AMDT 1 — Data-Centric Security Interoperability - Encryption Specifications"
  date: "08 MAY 2025"
  scope_focus: "Key Access Service (KAS) rewrap protocol v1.0 + required interoperability behaviors"
  note_on_traceability: "Trace values reference ACP paragraph numbers and approximate PDF page numbers."

requirements:

# ---------------------------------------------------------------------
# A. Overall KAS role / scope
# ---------------------------------------------------------------------
- id: KAS-REQ-001
  category: Scope
  level: MUST
  requirement: >
    Implement the KAS as a trusted service whose primary responsibility is to implement
    a key rewrap protocol that enables authorized clients to obtain decryption key material
    for ZTDF payloads, based on evaluation of the client's attributes against the embedded
    access control policy.
  trace: "Paras 301-304 (PDF p14)"

- id: KAS-REQ-002
  category: Scope
  level: MUST
  requirement: >
    Support “rewrapping” as decrypting encrypted key material using the KAS private key
    and re-encrypting (rewrapping) it for the requesting client using a client-provided
    ephemeral public key.
  trace: "Paras 308, 313e, 341 (PDF p15-16, p24)"

- id: KAS-REQ-003
  category: Interoperability
  level: MUST
  requirement: >
    Support key material that may represent either (a) the full payload Data Encryption Key (DEK)
    or (b) a “Key Split” (portion of the DEK) that can be recombined client-side with other splits.
  trace: "Paras 208, 310, 335, 341 (PDF p9, p15, p24)"

# ---------------------------------------------------------------------
# B. Key access objects (KAO) and policy grouping
# ---------------------------------------------------------------------
- id: KAS-REQ-010
  category: Data Model
  level: MUST
  requirement: >
    Accept rewrap requests containing an array of request groups, where each group contains
    exactly one policy object and an array of keyAccessObjects governed by that policy.
  trace: "Paras 315-316, 320, 324 (PDF p16-18, p20)"

- id: KAS-REQ-011
  category: Data Model
  level: MUST
  requirement: >
    For each keyAccessObject entry, support a client-provided unique keyAccessObjectId that is
    unique across the entire rewrap request, and preserve it in the corresponding response result.
  trace: "Paras 324, 326d, 345-346 (PDF p20-21, p26)"

- id: KAS-REQ-012
  category: Data Model
  level: MUST
  requirement: >
    For each keyAccessObject, support and process at least the following fields:
    wrappedKey, url, kid, policyBinding, sid. Support encryptedMetadata as optional.
  trace: "Paras 319, 320, 322, 345 (PDF p17-18, p19, p26)"

- id: KAS-REQ-013
  category: Data Model
  level: SHOULD
  requirement: >
    Where present, accept and ignore/validate additional key access object fields such as
    type and protocol (e.g., type='wrapped', protocol='kas') to maintain interoperability with
    ZTDF metadata.
  trace: "Para 319 & Key Object Example (PDF p17)"

# ---------------------------------------------------------------------
# C. API endpoint / transport requirements
# ---------------------------------------------------------------------
- id: KAS-REQ-020
  category: API
  level: MUST
  requirement: >
    Expose a rewrap API endpoint with method POST and path /rewrap.
  trace: "Paras 328-329, 347 (PDF p22, p27)"

- id: KAS-REQ-021
  category: API
  level: MUST
  requirement: >
    Require HTTPS (or equivalent secure channel) for all client–KAS communications.
  trace: "Para 351 (PDF p29)"

- id: KAS-REQ-022
  category: API
  level: MUST
  requirement: >
    Require 'Content-Type: application/json' for /rewrap requests and return JSON responses.
  trace: "Paras 329, 347 (PDF p22, p27)"

- id: KAS-REQ-023
  category: API
  level: MUST
  requirement: >
    Accept request bodies containing the rewrap request structure with top-level field clientPublicKey
    and an array field requests, as shown in the request body examples.
  trace: "Paras 320, 324-326, 347 (PDF p18, p20-21, p27-28)"

- id: KAS-REQ-024
  category: API
  level: SHOULD
  requirement: >
    Be tolerant to the spec’s illustrated “signedRequestToken” wrapper pattern, if encountered,
    by either (a) accepting the direct JSON request body as the normative format, or (b) supporting
    a wrapper field that carries a signed request token—provided DPoP verification is still enforced.
  trace: "Paras 329-332 vs 347 (PDF p22, p27)"

# ---------------------------------------------------------------------
# D. Authentication / DPoP / request validation
# ---------------------------------------------------------------------
- id: KAS-REQ-030
  category: AuthN
  level: MUST
  requirement: >
    Authenticate clients using an access token presented via the HTTP Authorization header
    in the form 'Authorization: Bearer <clientAccessToken>'.
  trace: "Paras 329-330, 334a, 347 (PDF p22-23, p27)"

- id: KAS-REQ-031
  category: AuthN
  level: MUST
  requirement: >
    Enforce Demonstrable Proof-of-Possession (DPoP) per RFC 9449 by requiring a DPoP header
    and verifying the DPoP proof for /rewrap requests.
  trace: "Paras 309, 327-331, 334b, 347, 354 (PDF p15, p22-23, p27, p29-30)"

- id: KAS-REQ-032
  category: AuthN
  level: MUST
  requirement: >
    Verify the DPoP proof using at minimum: the clientAccessToken, the client's public DPoP key
    obtained via a trusted method, the HTTP method (POST), and the request target URI (/rewrap),
    plus any other required DPoP parameters.
  trace: "Para 334b(i-v) (PDF p23)"

- id: KAS-REQ-033
  category: AuthN
  level: SHOULD
  requirement: >
    Maintain a trusted mechanism to obtain and validate the client’s public DPoP key (e.g., during
    client registration or via secure key distribution), suitable for verifying DPoP proofs.
  trace: "Para 334b(ii) (PDF p23)"

# ---------------------------------------------------------------------
# E. Integrity protection: per-KAO signature and policy binding
# ---------------------------------------------------------------------
- id: KAS-REQ-040
  category: Integrity
  level: MUST
  requirement: >
    For each keyAccessObject that the KAS is responsible for, verify the client-provided signature
    included alongside the keyAccessObject (signature.alg + signature.sig), where the signature covers
    the contents of the keyAccessObject excluding the signature field itself.
  trace: "Paras 320, 324, 334c (PDF p18, p20, p24)"

- id: KAS-REQ-041
  category: Integrity
  level: MUST
  requirement: >
    Treat failure to validate a keyAccessObject signature as an invalid request and respond with
    HTTP 400 Bad Request (or equivalent error handling aligned with the spec).
  trace: "Paras 334c, 357 Table 3-1 (PDF p24, p30)"

- id: KAS-REQ-042
  category: Integrity
  level: MUST
  requirement: >
    Verify policy integrity using the policyBinding value, where the policy is cryptographically bound
    to the decrypted key material (key split/DEK), to detect policy tampering.
  trace: "Paras 311-312, 336-337, 352; Figure 3-2 shows HMAC-based binding (PDF p15, p24, p29, p23)"

- id: KAS-REQ-043
  category: Integrity
  level: MUST
  requirement: >
    If policyBinding verification fails, reject processing for that keyAccessObject with HTTP 400 Bad Request
    and an error message indicating potential policy tampering.
  trace: "Para 337; Table 3-1 400; (PDF p24, p30)"

# ---------------------------------------------------------------------
# F. KAS cryptographic operations (unwrap / rewrap)
# ---------------------------------------------------------------------
- id: KAS-REQ-050
  category: Cryptography
  level: MUST
  requirement: >
    Decrypt the encrypted key material carried in keyAccessObject.wrappedKey using the KAS private key
    corresponding to the public key that encrypted that wrappedKey.
  trace: "Para 335; Figure 3-2 'KAS Unwrap' (PDF p24, p23)"

- id: KAS-REQ-051
  category: Cryptography
  level: MUST
  requirement: >
    Support selecting the correct KAS private key for unwrap operations based on the keyAccessObject.kid
    (key identifier) and/or local routing configuration.
  trace: "Paras 319-320 (kid present), 335 (unwrap using matching private key) (PDF p17-18, p24)"

- id: KAS-REQ-052
  category: Cryptography
  level: MUST
  requirement: >
    Rewrap the decrypted key material by encrypting it to the request’s clientPublicKey and place the result
    in the response field kasWrappedKey.
  trace: "Paras 323-324 (clientPublicKey), 341, 345; Figure 3-2 'Entity Rewrap' (PDF p20, p24, p26, p23)"

- id: KAS-REQ-053
  category: Cryptography
  level: SHOULD
  requirement: >
    Treat the clientPublicKey as an ephemeral public key and perform rewrap encryption such that only the
    client possessing the corresponding ephemeral private key can unwrap the returned kasWrappedKey.
  trace: "Paras 313a, 323, 341, 353; Figure 3-1/3-2 (PDF p16, p20, p24, p29, p17, p23)"

# ---------------------------------------------------------------------
# G. Authorization decision (policy evaluation / ABAC)
# ---------------------------------------------------------------------
- id: KAS-REQ-060
  category: Authorization
  level: MUST
  requirement: >
    Evaluate the provided policy object against the client's attributes and relevant context to determine
    whether access to the requested key material is allowed.
  trace: "Paras 302, 307-308, 313d, 338-340; Figure 3-2 shows ABAC check (PDF p14-16, p24, p23)"

- id: KAS-REQ-061
  category: Authorization
  level: MUST
  requirement: >
    Obtain client attributes from the clientAccessToken and/or another trusted channel, and use those
    attributes as inputs to policy evaluation.
  trace: "Para 338a (PDF p24)"

- id: KAS-REQ-062
  category: Authorization
  level: MUST
  requirement: >
    When policy evaluation denies access to a keyAccessObject, do not return rewrapped key material for it.
  trace: "Para 340a (deny), Para 345 error example lacks kasWrappedKey (PDF p24, p26)"

- id: KAS-REQ-063
  category: Authorization
  level: MUST
  requirement: >
    Support returning policy denial as HTTP 403 Forbidden and/or as a per-keyAccessObject error result
    in the aggregated response structure (to support mixed outcomes in one call).
  trace: "Para 340a (403), Para 345 (per-result error), Table 3-1 403 (PDF p24, p26, p30)"

# ---------------------------------------------------------------------
# H. Encrypted metadata extension
# ---------------------------------------------------------------------
- id: KAS-REQ-070
  category: Metadata
  level: MAY
  requirement: >
    If keyAccessObject.encryptedMetadata is present, decrypt it using the decrypted key material
    (key split/DEK), and return the decrypted content in a response metadata field (content is application-defined).
  trace: "Paras 312, 342, 345-346 (PDF p15, p24, p26-27)"

- id: KAS-REQ-071
  category: Metadata
  level: MUST
  requirement: >
    If encryptedMetadata is present but cannot be decrypted with the key material (e.g., corruption),
    treat it as a failure for that keyAccessObject and return an error status/result consistent with the spec’s
    invalid request / internal error handling.
  trace: "Para 342 (decrypt metadata), Para 357 400/500 handling (PDF p24, p30)"

# ---------------------------------------------------------------------
# I. Key access brokering / forwarding between KAS instances
# ---------------------------------------------------------------------
- id: KAS-REQ-080
  category: Federation
  level: MUST
  requirement: >
    Support key access brokering: when receiving a rewrap request containing keyAccessObjects targeted at
    other KAS instances (as indicated by keyAccessObject.url), forward those keyAccessObjects to the relevant
    KAS endpoints for resolution.
  trace: "Paras 314-316, 313c, 343 (PDF p16, p15-16, p24)"

- id: KAS-REQ-081
  category: Federation
  level: MUST
  requirement: >
    Preserve the association between forwarded keyAccessObjects and their governing policy when brokering,
    using the request’s grouping structure, and ensure responses can be correlated back to the original request.
  trace: "Paras 315a-315c, 316 (PDF p16)"

- id: KAS-REQ-082
  category: Federation
  level: MUST
  requirement: >
    Aggregate responses received from downstream KAS instances into a single response to the client, maintaining:
    (a) the per-policy grouping, and (b) per-keyAccessObjectId results.
  trace: "Paras 313e, 315c, 344-345 (PDF p16, p25-26)"

- id: KAS-REQ-083
  category: Federation
  level: MUST
  requirement: >
    Ensure each KAS that processes a keyAccessObject signs its individual response result, so an aggregating
    KAS can return a multi-signed aggregated response and the client can verify integrity per result.
  trace: "Para 316; Paras 345-346 (signature field); Para 356 (forwarding security) (PDF p16, p26-27, p30)"

- id: KAS-REQ-084
  category: Federation
  level: MUST
  requirement: >
    Use a secure inter-KAS forwarding mechanism (e.g., PKI-based trust) so the receiving KAS can verify authenticity
    and integrity of forwarded keyAccessObjects and associated policy.
  trace: "Para 356 (PDF p30)"

- id: KAS-REQ-085
  category: Federation
  level: MUST
  requirement: >
    In a brokering flow, ensure the downstream KAS validates the client-provided keyAccessObject signature (and
    policyBinding) to mitigate tampering by an intermediary/initial KAS.
  trace: "Para 334c (protect against initial KAS tampering), Para 356 (forwarding security) (PDF p24, p30)"

# ---------------------------------------------------------------------
# J. Response format requirements
# ---------------------------------------------------------------------
- id: KAS-REQ-090
  category: Response
  level: MUST
  requirement: >
    Return responses in a structure containing a top-level responses array, with each entry keyed by policyId and
    containing a results array of per-keyAccessObject results.
  trace: "Paras 345-346, 347 Response example (PDF p26-29)"

- id: KAS-REQ-091
  category: Response
  level: MUST
  requirement: >
    Each per-keyAccessObject result MUST include: keyAccessObjectId, status, signature, sid; and MUST include
    kasWrappedKey when status indicates success.
  trace: "Para 345 (result fields), Para 346 (where fields) (PDF p26-27)"

- id: KAS-REQ-092
  category: Response
  level: SHOULD
  requirement: >
    When status indicates error, include a human-readable error field describing the cause (e.g., 'Policy evaluation failed').
  trace: "Para 345 error example (PDF p26)"

- id: KAS-REQ-093
  category: Response
  level: MUST
  requirement: >
    Preserve and return sid from each keyAccessObject in the corresponding result to support client correlation.
  trace: "Paras 319-320 (sid), 345 (sid in results) (PDF p17-18, p26)"

# ---------------------------------------------------------------------
# K. Error handling / HTTP status codes
# ---------------------------------------------------------------------
- id: KAS-REQ-100
  category: ErrorHandling
  level: MUST
  requirement: >
    Return HTTP 400 Bad Request for invalid request format, missing parameters, invalid policy signature (policyBinding),
    or invalid keyAccessObject signature.
  trace: "Paras 337, 357 Table 3-1 (PDF p24, p30)"

- id: KAS-REQ-101
  category: ErrorHandling
  level: MUST
  requirement: >
    Return HTTP 401 Unauthorized when client authentication fails.
  trace: "Para 357 Table 3-1 (PDF p30)"

- id: KAS-REQ-102
  category: ErrorHandling
  level: MUST
  requirement: >
    Return HTTP 403 Forbidden when access is denied based on policy evaluation (noting the spec also shows per-result errors).
  trace: "Para 340a; Para 357 Table 3-1 (PDF p24, p30)"

- id: KAS-REQ-103
  category: ErrorHandling
  level: MUST
  requirement: >
    Return HTTP 500 Internal Error for unexpected errors during processing.
  trace: "Para 357 Table 3-1 (PDF p30)"

- id: KAS-REQ-104
  category: ErrorHandling
  level: SHOULD
  requirement: >
    Return HTTP 503 Service Unavailable when the KAS is unavailable; note the spec mentions relation to a /health endpoint
    that is not defined here.
  trace: "Para 357 Table 3-1 (PDF p30)"

# ---------------------------------------------------------------------
# L. Security / key management / crypto agility
# ---------------------------------------------------------------------
- id: KAS-REQ-110
  category: Security
  level: MUST
  requirement: >
    Securely manage KAS private keys and ensure their confidentiality and integrity.
  trace: "Para 349 (PDF p29)"

- id: KAS-REQ-111
  category: Security
  level: MUST
  requirement: >
    Rely on strong client authentication using access tokens AND DPoP to prevent unauthorized access and reduce
    replay/token theft risks.
  trace: "Paras 350, 354 (PDF p29-30)"

- id: KAS-REQ-112
  category: Security
  level: MUST
  requirement: >
    Enforce policy integrity verification using policyBinding to prevent unauthorized policy modification.
  trace: "Para 352 (PDF p29)"

- id: KAS-REQ-113
  category: Cryptography
  level: SHOULD
  requirement: >
    Support RSA and ECC for key wrapping and signing operations, using industry-standard algorithms and key sizes.
    Do not hard-mandate specific identifiers/lengths to preserve crypto agility.
  trace: "Para 355 (PDF p30)"

- id: KAS-REQ-114
  category: CryptoRoadmap
  level: SHOULD
  requirement: >
    Maintain a migration plan toward quantum-resistant / FIPS-compliant algorithms aligned to current NIST end-of-use guidance,
    recognizing the spec anticipates future quantum resistance.
  trace: "Para 201 (PDF p8)"

# ---------------------------------------------------------------------
# M. Interop implications from multi-KAS encryption modes (KAS-facing)
# ---------------------------------------------------------------------
- id: KAS-REQ-120
  category: Interoperability
  level: MUST
  requirement: >
    Support processing of rewrap requests where multiple KAOs exist for the same policy, including scenarios where:
    (a) Any-Of access exists (DEK encrypted independently to multiple KASes), and/or
    (b) All-Of access exists (multiple KASes each control required key splits).
  trace: "Paras 208-211, 213-221; Paras 315-316; Protocol overview 313 (PDF p9-12, p16)"

- id: KAS-REQ-121
  category: Interoperability
  level: SHOULD
  requirement: >
    Support operational scenarios where an attribute may specify multiple KAS options (e.g., tactical edge / break-glass),
    enabling alternate KAS-based acquisition paths for the same logical access requirement.
  trace: "Paras 222-223 (PDF p13)"
