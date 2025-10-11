# Project Requirements Document: DIVE V3

## Project Overview
DIVE V3 is a web application designed to facilitate secure document sharing and access control within a coalition-friendly Identity, Credential, and Access Management (ICAM) framework. The project aims to demonstrate a pilot environment for the USA/NATO using an Attribute-Based Access Control (ABAC) model to manage access to sensitive resources based on identity attributes and resource metadata. Key components include federated sign-in through multiple Identity Providers (IdPs), dynamic policy-driven authorization using Open Policy Agent (OPA) and Rego, and secure key release through a Key Access Service (KAS).

## Tech Stack and Tools
- **Front-end:** React, Next.js, Tailwind CSS, Material-UI
- **Back-end:** Node.js, Express.js
- **Database:** PostgreSQL, MongoDB
- **Authentication & Authorization:** Keycloak, NextAuth.js, OPA, Rego, JWT, OAuth, SAML
- **Infrastructure & Deployment:** Docker, Kubernetes, Terraform, Google Cloud
- **CI/CD:** GitHub Actions
- **Testing:** Playwright, Puppeteer, Jest
- **Additional Tools:** Cloudflare Zero Trust, KAS

## Target Audience
The primary users of DIVE V3 are military and defense personnel from the USA, France, Canada, and industry partners involved in the pilot project. These users require a secure and reliable system to access classified and sensitive information, ensuring compliance with relevant security standards and policies.

## Features
- **Federated Identity Management:** Support for multiple IdPs (U.S., France, Canada, industry partner) with OIDC and SAML protocols.
- **Attribute-Based Access Control (ABAC):** OPA/Rego policies enforce access control based on identity attributes and resource metadata.
- **Policy Enforcement Point (PEP) Integration:** Secure decision-making process that involves the evaluation of policies and attributes.
- **User Interface:** Simple web UI for IdP selection, access request results, and policy details.
- **Secure Document Sharing:** Enforces access decisions at the API level and controls document decryption through KAS.
- **Key Access Service (Stretch Goal):** Conditional key release based on policy-bound access permissions.

## Authentication
- **Sign-up/Log-in:** Users authenticate via federated IdPs brokered through Keycloak, supporting both OIDC and SAML.
- **Account Management:** Keycloak handles user sessions and claims mapping, ensuring secure and seamless access across different IdPs.

## New User Flow
1. **Access Application:** User lands on the web UI and is prompted to select an IdP (U.S., France, Canada, Industry).
2. **Authentication:** The user is redirected to the chosen IdP for authentication.
3. **Session Initiation:** Upon successful authentication, Keycloak normalizes claims and initiates a session via NextAuth.
4. **Access Request:** User attempts to access a resource, triggering the PEP to construct an OPA input with identity and resource metadata.
5. **Policy Evaluation:** OPA evaluates the request based on ABAC policies and returns a decision (Permit/Deny).
6. **Access Granted/Denied:** Based on the OPA decision, the user is either granted access or provided with a denial reason.
7. **Secure Key Request (Stretch):** If access is granted and the resource is encrypted, the user requests a decryption key from KAS, which enforces additional ABAC checks.

## Constraints
- **Technical Limitations:** Non-prod pilot with no high availability (HA) or hardware security modules (HSM) within the initial 4-week scope.
- **Browser Support:** Modern browsers with support for JavaScript and secure communications.
- **Performance Requirements:** Efficient claim normalization and policy evaluation to prevent user-perceived delays.

## Known Issues
- **Claim Enrichment:** Potential need for claim enrichment when tokens from non-NGA/industry IdPs lack required attributes.
- **Clock-Skew Impact:** Possible issues with `creationDate` embargo enforcement due to time synchronization discrepancies.
- **KAS Integration:** Ensuring seamless operation between PDP and KAS, particularly when KAS denies key release despite PDP approval.

This comprehensive requirements document outlines the scope, technology, audience, and functionalities necessary to successfully implement and demonstrate the DIVE V3 project within the constraints of the pilot environment.