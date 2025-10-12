Awesome goal. Here’s a battle-tested blueprint to make DIVE V3 interoperable and “bring-your-own-IdP” friendly while keeping your app code simple and future-proof.

# 1) High-level architecture (what talks to what)

* **Keycloak as the single broker** (a.k.a. your federation hub)

  * Add **identity providers (IdPs)** to Keycloak (OIDC or SAML).
  * Do all **attribute normalization/mapping in Keycloak** using built-in mappers and/or small Script Mappers.
  * Enforce your **minimum attribute contract** with Keycloak **User Profile**.
  * JIT-provision users on first login via **First Login Flow**.
* **DIVE V3 App (Next.js/NextAuth)** treats **Keycloak as the only OIDC provider**.

  * NextAuth uses `provider = "keycloak"`; your app never integrates with 3rd-party IdPs directly.
* **Resource APIs (Express, etc.)** validate **Keycloak-issued JWTs** via JWKS.

  * No IdP-specific logic in services.

This separation keeps partner differences out of your app and locks them inside Keycloak.

---

# 2) Define your canonical identity contract (the “minimum attributes”)

Create a compact, global schema with stable names. Example:

**Required (must be present after mapping):**

* `sub` (stable subject identifier from Keycloak)
* `first_name` (string)
* `last_name` (string)
* `email` (string, verified if possible)
* `loa` (level of assurance: `low|substantial|high` or numeric per NIST/eIDAS)
* `issuer` (string: IdP issuer/entityID)
* `acr` (authentication context class ref when available)
* `amr` (methods references: `pwd`, `otp`, `hwk`, etc.)

**Recommended:**

* `middle_name`
* `preferred_username`
* `locale`
* `affiliations` / `org`
* `entitlements` (for roles/clearances if applicable)
* `attributes.version` (to version your contract over time)

Put these in Keycloak **User Profile** (Admin → Realm Settings → User Profile) and mark Required/Optional with validation rules. That way, if a partner omits something, Keycloak can pause first login and collect/transform it before releasing tokens.

---

# 3) Normalize anything to your contract (mapping layer)

### OIDC partners

* Use **OIDC Claim Mapper** (Claim to user attribute) to map partner claims to your canonical attributes.
* Example mappings:

  * `given_name` → `first_name`
  * `family_name` → `last_name`
  * `email` → `email`
  * `acr`/`amr` passthrough
* If the partner has localized or custom fields (`"Prénom"`, `"prenom"`, `"firstName_fr"`, etc.), use a **Script Mapper** to coalesce:

  ```javascript
  // Mapper type: Script (IdP mapper)
  // Map any source to user attribute "first_name"
  var val = userSession.getContext().getAuthenticationSession().getClientNote("kc.client.extension"); // not required, example
  var srcs = [
    "given_name",
    "prenom",
    "Prénom",
    "firstName_fr",
    "firstName"
  ];
  var claimSet = identity.getContextData(); // OIDC claims
  for (var i = 0; i < srcs.length; i++) {
    var v = claimSet.get(srcs[i]);
    if (v) {
      user.setSingleAttribute("first_name", String(v));
      break;
    }
  }
  ```

  *(For OIDC you can also do this with multiple Claim Mappers if you prefer declarative over scripting.)*

### SAML partners

* Add **Attribute Importer** mappers per SAML Attribute/NameID.
* Common examples:

  * SAML `urn:oid:2.5.4.42` or `givenName` → `first_name`
  * SAML `urn:oid:2.5.4.4` or `sn` → `last_name`
  * `mail` → `email`
  * NameID or `persistent` → a stable external ID
* Enforce **signed assertions** and **wanted NameID format** (`persistent` preferred).

### Gaps at first login

* Enable **First Login Flow** with “Review Profile” to prompt the user for any missing required attributes (e.g., if partner didn’t send email).
* Use **Conditional** execution based on “Attribute missing” so you don’t force everyone through it.

---

# 4) Self-service onboarding for any OIDC/SAML IdP (streamlined partner UX)

Build a small **Onboarding Portal** (or an admin-only form) that:

1. Accepts **OIDC Discovery URL** or **SAML metadata URL/XML**.
2. Lets a partner select a **template** (e.g., “AzureAD OIDC”, “ADFS SAML”, “PingOne OIDC”, “FranceConnect-like”, etc.).
3. Lets them **declare which of their fields map to your contract** (with suggestions/autocomplete).
4. Validates the config with a built-in **test login**.
5. Saves the IdP into Keycloak using the **Admin REST API** (or `kcadm.sh`) and generates the standard mappers.

**Keycloak Admin REST** quick pattern (server-side):

* Create IdP: `POST /{realm}/identity-provider/instances`
* Add mappers: `POST /{realm}/identity-provider/instances/{alias}/mappers`
* Optionally add **default groups/roles**, Authn context requirements, signature requirements.

**Automation/GitOps:**
Store IdP configs (JSON) in git; apply via **Keycloak Operator** or CI calling `kcadm.sh`. This gives you repeatability for a hackathon demo and production.

---

# 5) NextAuth (DIVE V3 web) + Keycloak (single OIDC)

* In NextAuth, configure just Keycloak:

  ```ts
  // app/api/auth/[...nextauth]/route.ts
  import NextAuth from "next-auth";
  import Keycloak from "next-auth/providers/keycloak";

  const handler = NextAuth({
    providers: [
      Keycloak({
        clientId: process.env.KEYCLOAK_CLIENT_ID!,
        clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
        issuer: process.env.KEYCLOAK_ISSUER!, // https://kc.example.com/realms/dive
      }),
    ],
    callbacks: {
      async jwt({ token, account, profile }) {
        // Pull normalized claims from Keycloak's ID token / userinfo
        if (account?.id_token) {
          // You can decode and copy through your canonical claims if needed
        }
        return token;
      },
      async session({ session, token }) {
        // Expose normalized attributes on the session
        // (Keycloak should already have normalized them; use /userinfo)
        return session;
      },
    },
    session: { strategy: "jwt" },
  });

  export { handler as GET, handler as POST };
  ```
* Request scopes from your Keycloak client that include your normalized claims.
  In Keycloak, create **Protocol Mappers (User Attribute → OIDC claim)** to emit `first_name`, `last_name`, `loa`, `acr`, etc., in **ID token** and **userinfo**.

---

# 6) Resource servers (Express, etc.) – simple, IdP-agnostic

* Validate **Keycloak JWT** via JWKS using `kid` and `alg` (RS256/PS256).
* Check `aud`, `iss`, expiration, and optionally require `acr`/`loa` based on endpoint sensitivity.
* **Never parse 3rd-party IdP tokens** here; you only trust Keycloak.

Example (Express + `jose`):

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
const JWKS = createRemoteJWKSet(new URL(process.env.KEYCLOAK_JWKS!));

export async function authz(req, res, next) {
  try {
    const auth = req.headers.authorization ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.KEYCLOAK_ISSUER,
      audience: "dive-api",
    });
    // Optionally gate on payload.acr / payload.loa
    req.user = payload;
    next();
  } catch {
    res.status(401).send("Unauthorized");
  }
}
```

---

# 7) Templates for common brokers and countries

Create ready-to-go IdP templates to cut onboarding to minutes:

* **Azure AD / Entra (OIDC):**

  * Discovery URL, use `upn` as fallback username, `given_name`, `family_name`, `email` (or `preferred_username`).
* **PingOne (OIDC/SAML):**

  * Strong defaults; prefer `persistent` NameID for SAML.
* **Okta (OIDC):**

  * Standard OIDC claims; caution: sometimes `email_verified` is absent—treat as unverified.
* **France-style IdPs (“Prénom”):**

  * OIDC: custom claim names; attach Script Mapper to map `Prénom` → `first_name`.
  * SAML: map `givenName` or localized attribute to `first_name`.

Each template = JSON for IdP + JSON list of mappers.

---

# 8) First-class brokerage support (Auth0, CILogon, eduGAIN, national hubs)

You can plug a **broker to broker**:

* If a partner doesn’t manage their own IdP but uses a brokerage, just treat that brokerage as an OIDC/SAML IdP in Keycloak.
* Keep your contract identical; the brokerage will emit consistent claims (or you map them once).
* For academic/government federations: use their metadata aggregate (SAML) or OIDC discovery, then narrow with attribute release policies.

*(Optional, advanced)* Explore **OIDC Dynamic Client Registration** and **OIDC Federation 1.0** later for automated trust bootstrap. For the hackathon, metadata-URL + mappers is faster and more predictable.

---

# 9) Assurance, security, and compliance knobs

* **SAML**: require signed assertions, check `Destination`, enforce `POST` binding, and prefer `persistent` NameID.
* **OIDC**: enforce `nonce`, `state`, **PKCE**, alg allowlist, HTTPS only.
* **ACR/AMR/LOA**: passthrough from brokers to your tokens; define app policies like “admin endpoints require `acr >= substantial` or `amr` includes `hwk`”.
* **Email verification**: if not provided by partner, Keycloak can verify on first login or mark as unverified in your token claim.
* **Data minimization**: only map what you need; drop the rest.
* **Audit**: enable Keycloak events for admin changes and log IdP alias, user, mapper outcomes.

---

# 10) Operator/GitOps + repeatability (critical for a hackathon demo)

* Use **Keycloak Operator** (Kubernetes) or compose with **realm export JSON**.
* Check in:

  * `realm.json` (clients, roles, user profile, flows)
  * `idp-templates/*.json`
  * `mappers/*.json`
  * small `kcadm.sh` scripts to apply deltas
* CI: on merge, apply to your cluster; your demo becomes a one-click spin-up.

---

# 11) Example: create an OIDC IdP + mappers (kcadm.sh)

```bash
# Login
kcadm.sh config credentials --server "$KC_URL" --realm master \
  --user "$KC_ADMIN" --password "$KC_PASS"

# Create IdP (OIDC)
kcadm.sh create identity-provider/instances -r dive \
  -s alias="partner-france-oidc" \
  -s providerId="oidc" \
  -s enabled=true \
  -s 'config.useJwksUrl="true"' \
  -s 'config.issuer="https://idp.france.example/.well-known/openid-configuration"' \
  -s 'config.clientId="XXXXX"' \
  -s 'config.clientSecret="YYYYY"' \
  -s 'config.defaultScope="openid email profile acr amr"'

# Map Prénom → first_name (Claim to User Attribute)
kcadm.sh create identity-provider/instances/partner-france-oidc/mappers -r dive \
  -b '{
    "name":"prenom-to-first_name",
    "identityProviderAlias":"partner-france-oidc",
    "identityProviderMapper":"oidc-user-attribute-idp-mapper",
    "config":{
      "claim":"Prénom",
      "user.attribute":"first_name"
    }
  }'

# Fallback given_name → first_name
kcadm.sh create identity-provider/instances/partner-france-oidc/mappers -r dive \
  -b '{
    "name":"given_name-to-first_name",
    "identityProviderAlias":"partner-france-oidc",
    "identityProviderMapper":"oidc-user-attribute-idp-mapper",
    "config":{
      "claim":"given_name",
      "user.attribute":"first_name"
    }
  }'
```

And similarly for SAML (`saml-user-attribute-idp-mapper`).

---

# 12) Token emission to the app (Protocol Mappers on your DIVE client)

Add OIDC mappers on the **DIVE client** in Keycloak:

* User Attribute → Claim:

  * `first_name` → `first_name` (ID Token + UserInfo)
  * `last_name` → `last_name`
  * `email` → `email`
  * `loa` → `loa`
  * `issuer` (IdP alias) → `issuer`
* Hard-require them in your **User Profile** so they’re always present post-login.

---

# 13) Handling “minimum attributes or reject”

* Configure IdP mappers and **First Login Flow** to ensure your minimum set is filled.
* If after flow the minimum set is still missing (e.g., IdP denies email), **abort login** with a friendly error (“Your provider did not release required attributes. Contact your admin.”).
* For partners, the **Onboarding Portal** validates these before go-live (test user round-trip).

---

# 14) Developer ergonomics & DX

* A tiny **/whoami** endpoint in your API returning the normalized claims helps partners verify end-to-end quickly.
* A **Claim Diff** screen in your portal comparing **raw incoming** vs **normalized** attributes is gold during onboarding.
* Ship **copy-paste mapper recipes** for common IdPs.

---

## TL;DR (the “best-practice core”)

1. **Keycloak is the only IdP your app knows.**
2. **Define a strict minimum attribute contract** and enforce via **User Profile** + **First Login Flow**.
3. **Normalize partner fields in Keycloak** with Claim/Attribute mappers (and small Script Mappers for edge cases like `Prénom`).
4. **Self-service onboarding**: upload metadata/discovery, pick a template, declare mappings, run a test, then auto-provision the IdP + mappers via Admin REST.
5. **Apps and APIs consume only Keycloak tokens**, never partner tokens.
6. **Automate everything** with realm JSON, operator, and `kcadm.sh` so your hackathon demo is repeatable.

If you want, I can draft:

* A ready-to-import **realm JSON** (with User Profile + First Login Flow)
* **IdP templates** (Azure AD, Okta, PingOne, “France/Prénom”)
* A minimal **NextAuth** config and an **Express** JWT guard
  — all wired to your contract.
