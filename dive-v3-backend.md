# Backend Structure Document for DIVE V3

## Table of Contents

1. [Endpoints](#endpoints)
2. [Controllers and Services](#controllers-and-services)
3. [Database Schema](#database-schema)
4. [Data Flow](#data-flow)
5. [Third-party Integrations](#third-party-integrations)
6. [State Management Logic](#state-management-logic)
7. [Error Handling](#error-handling)
8. [API Documentation](#api-documentation)

---

## Endpoints

### Complete List of API Routes with Methods

#### Authentication
- **POST /auth/login**
  - **Request:** `{ "username": "string", "password": "string" }`
  - **Response:** `{ "token": "string", "expiresIn": "number" }`

- **POST /auth/logout**
  - **Request:** `{ "token": "string" }`
  - **Response:** `{ "message": "Logged out successfully" }`

- **GET /auth/idp-discovery**
  - **Request:** `Headers: { "Authorization": "Bearer token" }`
  - **Response:** `{ "idps": ["U.S.", "France", "Canada", "Industry"] }`

#### User Management
- **GET /users/:id**
  - **Request:** `Headers: { "Authorization": "Bearer token" }`
  - **Response:** `{ "uniqueID": "string", "clearance": "string", "countryOfAffiliation": "string", "acpCOI": "string" }`

#### Resource Access
- **GET /resources/:id**
  - **Request:** `Headers: { "Authorization": "Bearer token" }`
  - **Response:** `{ "resourceId": "string", "classification": "string", "releasabilityTo": ["country"], "COI": "string", "creationDate": "string" }`

- **POST /resources/request-key**
  - **Request:** `{ "resourceId": "string", "identityAttributes": { "uniqueID": "string", "clearance": "string" } }`
  - **Response:** `{ "key": "string", "message": "Access granted" }`

## Controllers and Services

### Responsibilities and Interactions

#### Controllers

- **AuthController**
  - Handles login, logout, and IdP discovery.
  - Interacts with `AuthService` for authentication logic.

- **UserController**
  - Manages user-related operations.
  - Uses `UserService` for fetching and updating user data.

- **ResourceController**
  - Handles resource access requests and key management.
  - Collaborates with `ResourceService` and `KASService`.

#### Services

- **AuthService**
  - Validates user credentials, manages tokens, and interacts with Keycloak for IdP brokering.

- **UserService**
  - Interfaces with the MongoDB database to retrieve and update user information.

- **ResourceService**
  - Fetches resource metadata and applies access policies using OPA.

- **KASService**
  - Manages key requests and enforces ABAC policies for key release.

## Database Schema

### Tables/Collections with Fields, Types, and Relationships

#### User Collection
- `userId`: String (Primary Key)
- `clearance`: String (Enum: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
- `countryOfAffiliation`: String (ISO 3166-1 alpha-3)
- `acpCOI`: String

#### Resource Collection
- `resourceId`: String (Primary Key)
- `classification`: String (Enum: UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET)
- `releasabilityTo`: Array of Strings (ISO 3166-1 alpha-3)
- `COI`: String
- `creationDate`: Date

## Data Flow

### How Data Moves Through the System from Request to Response

1. **User Authentication**
   - Request: User submits login credentials.
   - Response: `AuthController` validates credentials via `AuthService`, issues JWT token.

2. **Resource Access**
   - Request: User requests access to a resource.
   - Response: `ResourceController` retrieves metadata, evaluates policies using OPA, and responds with access decision or key request via `KASService`.

## Third-party Integrations

- **Keycloak**: For federated identity management and SSO.
- **OPA (Open Policy Agent)**: For policy-driven access control.
- **MongoDB**: As the database for storing user and resource data.
- **Cloudflare Zero Trust**: As the security front door for API requests.

## State Management Logic

### Queues, Caching Strategies, Session Management

- **Session Management**: Managed using JWTs with configurable expiration times.
- **Caching**: Use of in-memory caching (e.g., Redis) for temporary storage of frequently accessed data.
- **Queues**: Not applicable unless specified in future integrations.

## Error Handling

### How Errors Are Caught, Logged, and Returned to Clients

- **Error Catching**: Centralized middleware to catch and handle exceptions.
- **Logging**: Errors logged with detailed context using a logging service (e.g., Winston).
- **Client Response**: Errors returned in a standardized format `{ "error": "string", "message": "string" }`.

## API Documentation

### Format for Documenting Endpoints

- **Documentation Tool**: OpenAPI/Swagger for API endpoint documentation.
- **Structure**:
  - **Endpoint**: Description of the route and method.
  - **Request**: Parameters and example payloads.
  - **Response**: Structure and example outputs.
  - **Errors**: Possible error codes and messages.

```yaml
openapi: 3.0.0
info:
  title: DIVE V3 API
  version: 1.0.0
paths:
  /auth/login:
    post:
      summary: User login
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                username:
                  type: string
                password:
                  type: string
      responses:
        '200':
          description: Login successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  token:
                    type: string
                  expiresIn:
                    type: number
```

This backend structure document outlines a comprehensive plan for the development of the DIVE V3 project, providing a clear blueprint for implementation.