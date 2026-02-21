#!/usr/bin/env bash
# =============================================================================
# DIVE V3 CLI - Guided Mode Message Library
# =============================================================================
# Plain-language explanations for every concept in the DIVE platform.
# Written at Flesch-Kincaid grade level 8 (readability score 70-80).
#
# Naming convention:  GUIDED_MSG_<TOPIC>_<ASPECT>
#   TOPIC: HUB, SPOKE, VAULT, IDP, FEDERATION, AUTH_CODE, OPAL, CERT, ...
#   ASPECT: WHAT, WHY, HELP, INTRO, ...
# =============================================================================

# Guard against double-sourcing
[ -n "${_GUIDED_MESSAGES_LOADED:-}" ] && return 0
_GUIDED_MESSAGES_LOADED=1

# =============================================================================
# CORE CONCEPTS
# =============================================================================

GUIDED_MSG_HUB_WHAT="A Hub is the central command center for your data-sharing network.
It manages user identities, security policies, and coordinates all
the connected spokes. Think of it as the main office that everything
reports back to."

GUIDED_MSG_SPOKE_WHAT="A Spoke is a regional or partner node in your network.
Each spoke runs its own services and manages its own data,
but connects to the Hub for shared identity and policy decisions.
Think of it like a branch office that works with the main office."

GUIDED_MSG_VAULT_WHAT="A Vault is a secure digital safe for passwords and encryption keys.
Instead of storing sensitive information in plain text files, we lock
them in the vault where only authorized services can access them."

GUIDED_MSG_IDP_WHAT="An identity provider (IdP) is the service that verifies who you are.
Think of it like the security desk at a building — it checks your ID
before letting you in. We use Keycloak as our IdP."

GUIDED_MSG_OPAL_WHAT="OPAL is the policy engine that decides what data each user can see.
It checks your clearance level, nationality, and role, then applies
the rules to determine your access. Think of it as the rulebook
that the security desk follows."

GUIDED_MSG_FEDERATION_WHAT="Federation connects two separate systems so their users can access
both without creating new accounts. It's like how your driver's license
from one state is accepted in another."

GUIDED_MSG_AUTH_CODE_WHAT="An authorization code is a one-time password that the Hub admin
gives you. It proves that the Hub trusts your spoke and allows the
two systems to connect securely."

GUIDED_MSG_CERT_WHAT="Certificates are digital ID cards that prove a service is who it
claims to be. They also encrypt the connection between services so
no one can eavesdrop. We generate these automatically."

GUIDED_MSG_DOMAIN_WHAT="A domain is the web address people use to reach your services.
For example, dev-fra-app.dive25.com. If you don't have a domain yet,
we can set one up for you during deployment."

# =============================================================================
# SPOKE DEPLOY FLOW
# =============================================================================

GUIDED_MSG_SPOKE_DEPLOY_INTRO="We are going to set up a new Spoke in your DIVE network.

This process will:
  1. Connect to your Hub (the central command center)
  2. Verify your authorization code
  3. Set up a secure vault for passwords and keys
  4. Start all services (database, identity, policy engine, web app)
  5. Register with the Hub and set up secure communication

The whole process takes about 5-10 minutes."

GUIDED_MSG_HUB_URL_HELP="This is the web address of the Hub you want to connect to.
Your Hub admin can provide this. It usually looks like:
  dev-usa-api.dive25.com  or  hub.yourorg.com"

GUIDED_MSG_AUTH_CODE_HELP="Your Hub admin creates this code by running:
  ./dive spoke authorize <YOUR-CODE>
The code is a long unique string. It can only be used once
and expires after 72 hours."

GUIDED_MSG_DOMAIN_HELP="Each spoke needs its own web address. If you are using dive25.com,
this is automatically set based on your environment and country code.
If you have a custom domain, enter it here."

GUIDED_MSG_SPOKE_DEPLOY_CONFIRM="The deployment will start now. Here is what will happen:

  Phase 1: INITIALIZATION  — Create folders, generate certificates
  Phase 2: DEPLOYMENT      — Start databases and services
  Phase 3: CONFIGURATION   — Connect to Hub, set up federation
  Phase 4: SEEDING         — Load sample data (if enabled)
  Phase 5: VERIFICATION    — Check that everything is working"

# =============================================================================
# HUB DEPLOY FLOW
# =============================================================================

GUIDED_MSG_HUB_DEPLOY_INTRO="We are going to set up the Hub — the central command center for
your DIVE network.

This process will:
  1. Set up a secure vault cluster for secrets management
  2. Start the database, identity provider, and policy engine
  3. Configure security policies and user roles
  4. Set up the web application

The Hub deployment takes about 10-15 minutes."

# =============================================================================
# PHASE PROGRESS DESCRIPTIONS
# =============================================================================

GUIDED_MSG_PHASE_PREFLIGHT="Checking your system to make sure everything is ready.
We will verify Docker is running, ports are available, and
all required tools are installed."

GUIDED_MSG_PHASE_INITIALIZATION="Setting up the workspace — creating folders, generating
security certificates, and preparing configuration files."

GUIDED_MSG_PHASE_DEPLOYMENT="Starting all services — this includes your database,
identity provider, policy engine, and web application.
This usually takes 2-5 minutes."

GUIDED_MSG_PHASE_CONFIGURATION="Connecting to the Hub and setting up secure communication.
Your spoke will register with the Hub, exchange security
credentials, and verify the connection."

GUIDED_MSG_PHASE_SEEDING="Loading initial data into the system. This includes
sample users, security policies, and classification rules."

GUIDED_MSG_PHASE_VERIFICATION="Running health checks on all services to make sure
everything is working correctly."

# =============================================================================
# VAULT MESSAGES
# =============================================================================

GUIDED_MSG_VAULT_INIT="Setting up your spoke's secure vault. This creates an encrypted
store where all passwords, keys, and certificates are kept safe.
No sensitive data will be stored in plain text files."

GUIDED_MSG_VAULT_UNSEAL="Unlocking the vault so services can access their secrets.
The vault starts locked every time for security — we unlock it
with a special key that only your spoke has."

GUIDED_MSG_VAULT_MIGRATE="Securely copying your spoke's secrets from the Hub vault to
your local vault. After this, your spoke will be self-sufficient —
it won't need to ask the Hub for secrets anymore."

# =============================================================================
# AUTHORIZATION MESSAGES
# =============================================================================

GUIDED_MSG_AUTH_NO_CODE="You need an authorization code to connect to a Hub.

This is a security measure — it prevents unauthorized spokes from
joining the network. Ask your Hub administrator to create a code:

  On the Hub, run: ./dive spoke authorize $(echo "${INSTANCE_CODE:-YOUR-CODE}" | tr '[:lower:]' '[:upper:]')

They will give you a code that looks like:
  a1b2c3d4-e5f6-7890-abcd-ef1234567890"

GUIDED_MSG_AUTH_VALIDATING="Checking your authorization code with the Hub.
This confirms that the Hub recognizes and trusts this spoke."

GUIDED_MSG_AUTH_VALID="Your authorization code is valid. The Hub has approved
this spoke to join the network."

GUIDED_MSG_AUTH_EXPIRED="Your authorization code has expired. Authorization codes
are valid for 72 hours after creation.

Ask your Hub admin to create a new one:
  ./dive spoke authorize $(echo "${INSTANCE_CODE:-YOUR-CODE}" | tr '[:lower:]' '[:upper:]')"

GUIDED_MSG_AUTH_CONSUMED="This authorization code has already been used. Each code
can only be used once for security reasons.

Ask your Hub admin to create a new one:
  ./dive spoke authorize $(echo "${INSTANCE_CODE:-YOUR-CODE}" | tr '[:lower:]' '[:upper:]')"

# =============================================================================
# ERROR MESSAGES
# =============================================================================

GUIDED_MSG_ERR_NO_DOCKER="Docker is not running or not installed.

Docker is the tool that runs all DIVE services in isolated containers.
To install it, visit: https://docs.docker.com/get-docker/"

GUIDED_MSG_ERR_HUB_UNREACHABLE="Could not reach the Hub at the address you provided.

This could mean:
  - The Hub is not deployed yet
  - The address is incorrect
  - A firewall is blocking the connection

Check the address and try again, or ask your Hub admin for help."

GUIDED_MSG_ERR_REGISTRATION_FAILED="The Hub did not accept this spoke's registration.

This usually means:
  - The authorization code is invalid or expired
  - The spoke country code is not recognized
  - The Hub's registration service is temporarily unavailable"

# =============================================================================
# SUCCESS MESSAGES
# =============================================================================

GUIDED_MSG_SPOKE_DEPLOY_SUCCESS="Your spoke is deployed and connected to the Hub!

What was set up:
  - Secure vault for secrets management
  - Database for local data storage
  - Identity provider (Keycloak) for user authentication
  - Policy engine (OPAL) for access control
  - Web application for data access
  - Federation link to the Hub

Next steps:
  - Open your spoke's web app in a browser
  - Log in with your Hub credentials (federation is active)
  - Run ./dive spoke verify to check health anytime"

GUIDED_MSG_HUB_DEPLOY_SUCCESS="Your Hub is deployed and ready!

What was set up:
  - Vault HA cluster for secrets management
  - PostgreSQL + MongoDB databases
  - Keycloak identity provider with security policies
  - OPAL policy engine with clearance rules
  - Backend API and web application
  - Certificate authority for TLS

Next steps:
  - Open your Hub's web app in a browser
  - Create spoke authorization codes: ./dive spoke authorize <CODE>
  - Monitor health: ./dive hub verify"
