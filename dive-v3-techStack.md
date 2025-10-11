# DIVE V3 Tech Stack Document

This document provides a detailed overview of the tech stack used for the DIVE V3 project, including frontend and backend frameworks, database choices, authentication mechanisms, DevOps and hosting configurations, APIs or SDKs integrations, language choices, and other development tools.

## Frontend Frameworks

- **React 18.2**
  - Utilized for building the user interface.
  - Offers a component-based architecture that enhances reusability and maintainability.
  - Supports functional components and hooks for cleaner code and state management.

- **Next.js 13**
  - Provides server-side rendering and static site generation.
  - Enhances performance with automatic code splitting and optimized image handling.
  - Integrated with NextAuth for authentication.

- **Tailwind CSS 3.0**
  - A utility-first CSS framework for styling.
  - Allows for rapid styling with minimal CSS.
  - Configured with a custom theme to match project design requirements.

- **Material-UI 5**
  - A React component library that implements Google's Material Design.
  - Provides a rich set of UI components for consistent styling and user experience.

## Backend Frameworks

- **Node.js 18**
  - A JavaScript runtime built on Chrome's V8 JavaScript engine.
  - Provides an event-driven, non-blocking I/O model.

- **Express.js 4.18**
  - A minimal and flexible Node.js web application framework.
  - Facilitates API development with robust routing and middleware support.

## Database

- **MongoDB 5**
  - NoSQL database used for storing resource metadata.
  - Schema-less design allowing for flexibility in data modeling.
  - Stores documents in a JSON-like format, which aligns with the application's data requirements.

- **PostgreSQL 14**
  - A relational database used for structured data storage.
  - Provides support for advanced data types and indexing capabilities.
  - Ensures data integrity with ACID compliance.

## Authentication

- **Keycloak**
  - Acts as an identity broker for federated sign-in with multiple IdPs (OIDC/SAML).
  - Configured to map and normalize claims into tokens for application sessions.

- **NextAuth.js**
  - A complete open-source authentication solution for Next.js applications.
  - Handles authentication and session management seamlessly.

## DevOps/Hosting

- **Docker**
  - Utilized for containerizing applications to ensure consistency across environments.
  - Supports deployment on both local development environments and production servers.

- **Kubernetes (K8s)**
  - Orchestrates container deployment, scaling, and management.
  - Provides high availability and load balancing for applications.

- **Google Cloud Platform (GCP)**
  - Deployment platform for hosting applications.
  - Offers robust cloud services, including Compute Engine and Cloud Storage.

- **Terraform**
  - Infrastructure as Code (IaC) tool for provisioning and managing cloud resources.
  - Ensures consistent environment setups and scalability.

- **GitHub Actions**
  - CI/CD pipeline for automating build, test, and deployment tasks.
  - Integrates with the repository for continuous integration and delivery.

## APIs or SDKs

- **Open Policy Agent (OPA)**
  - Serves as the policy decision point (PDP) for authorization.
  - Utilizes Rego policies to enforce Attribute-Based Access Control (ABAC).

- **Cloudflare Zero Trust**
  - Acts as the front door for secure access to applications.
  - Protects against threats and enhances security with Zero Trust principles.

## Language Choices

- **TypeScript**
  - Chosen over JavaScript for its static typing and improved developer experience.
  - Provides early error detection and enhanced code readability.

## Other Tools

- **Jest**
  - A testing framework for JavaScript and TypeScript.
  - Used for unit and integration testing of both frontend and backend components.

- **Playwright/Puppeteer**
  - Tools for end-to-end testing and browser automation.
  - Ensures the application behaves as expected across different scenarios.

- **ESLint & Prettier**
  - ESLint for identifying and fixing problems in JavaScript/TypeScript code.
  - Prettier for enforcing consistent code formatting.

This tech stack ensures a robust, scalable, and secure web application that aligns with the project's goals and deliverables.