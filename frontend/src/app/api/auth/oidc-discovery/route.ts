import { NextResponse } from 'next/server';

export async function GET() {
  // Return OIDC discovery document for NextAuth
  return NextResponse.json({
    issuer: `https://localhost:8443/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}`,
    authorization_endpoint: `https://localhost:8443/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/auth`,
    token_endpoint: `https://localhost:8443/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/token`,
    userinfo_endpoint: `https://localhost:8443/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
    jwks_uri: `https://localhost:8443/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/certs`,
    end_session_endpoint: `https://localhost:8443/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/logout`,
    response_types_supported: ["code", "id_token", "code id_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "profile", "email"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    claims_supported: ["sub", "iss", "auth_time", "name", "given_name", "family_name", "preferred_username", "email"]
  });
}