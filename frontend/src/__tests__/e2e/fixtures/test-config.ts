/**
 * Test Configuration for E2E Tests
 *
 * Centralized configuration to avoid hardcoded values
 * Environment-aware settings for local, CI, and staging
 *
 * Usage:
 * ```typescript
 * import { TEST_CONFIG } from '../fixtures/test-config';
 *
 * await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.NETWORK);
 * ```
 */

/**
 * Test environment detection
 */
export const TEST_ENV = {
  IS_CI: process.env.CI === 'true',
  IS_LOCAL: process.env.CI !== 'true',
  IS_DEBUG: process.env.DEBUG === 'true' || process.env.PWDEBUG === '1',
  IS_HEADED: process.env.HEADED === 'true',
} as const;

/**
 * Timeouts (in milliseconds)
 *
 * CI timeouts are 2x local to account for slower infrastructure
 */
export const TIMEOUTS = {
  /**
   * Default action timeout (button click, fill, etc.)
   */
  ACTION: TEST_ENV.IS_CI ? 10000 : 5000,

  /**
   * Navigation timeout (page.goto, waitForURL)
   */
  NAVIGATION: TEST_ENV.IS_CI ? 30000 : 15000,

  /**
   * Network request timeout (API calls)
   */
  NETWORK: TEST_ENV.IS_CI ? 20000 : 10000,

  /**
   * Authentication flow timeout (Keycloak redirect)
   */
  AUTH_FLOW: TEST_ENV.IS_CI ? 40000 : 20000,

  /**
   * MFA setup timeout (OTP/WebAuthn setup)
   */
  MFA_SETUP: TEST_ENV.IS_CI ? 60000 : 30000,

  /**
   * Resource loading timeout (large documents)
   */
  RESOURCE_LOAD: TEST_ENV.IS_CI ? 20000 : 10000,

  /**
   * Debounce wait (after user input)
   */
  DEBOUNCE: 500,

  /**
   * Short wait (UI animations)
   */
  SHORT: 1000,

  /**
   * Medium wait (complex interactions)
   */
  MEDIUM: 3000,

  /**
   * Long wait (heavy operations)
   */
  LONG: 5000,
} as const;

/**
 * URLs
 *
 * IMPORTANT: Use relative paths in tests (e.g., '/login')
 * Playwright's baseURL config handles the full URL
 */
export const URLS = {
  /**
   * Base URL (from Playwright config or env var)
   * HTTP for local development (no certificates needed), HTTPS for CI/tunnel
   */
  BASE: process.env.BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || (TEST_ENV.IS_CI ? 'https://dev-app.dive25.com' : 'http://localhost:3000'),

  /**
   * Backend API base URL
   * HTTP for local development, HTTPS for CI/tunnel
   */
  API_BASE: process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || (TEST_ENV.IS_CI ? 'https://dev-api.dive25.com' : 'http://localhost:4000'),

  /**
   * Keycloak base URL (for MFA flow detection)
   * Always HTTPS for Keycloak (mkcert certificates in Docker)
   */
  KEYCLOAK_BASE: process.env.KEYCLOAK_URL || 'https://localhost:8443',
} as const;

/**
 * Test retry configuration
 */
export const RETRY = {
  /**
   * Number of retries for failed tests
   * CI: 2 retries (flaky network)
   * Local: 0 retries (fail fast for development)
   */
  COUNT: TEST_ENV.IS_CI ? 2 : 0,

  /**
   * Number of retries for flaky selectors
   */
  SELECTOR_RETRIES: 3,
} as const;

/**
 * Screenshot and video settings
 */
export const ARTIFACTS = {
  /**
   * Take screenshots on failure
   */
  SCREENSHOT_ON_FAILURE: true,

  /**
   * Take screenshots on all steps (debug mode)
   */
  SCREENSHOT_ALL_STEPS: TEST_ENV.IS_DEBUG,

  /**
   * Record video of test execution
   * 'on': Always record
   * 'retain-on-failure': Only keep videos for failed tests
   * 'off': Never record
   */
  VIDEO_MODE: TEST_ENV.IS_CI ? 'retain-on-failure' : 'off',

  /**
   * Enable Playwright trace
   * 'on': Always trace
   * 'retain-on-failure': Only keep traces for failed tests
   * 'off': Never trace
   */
  TRACE_MODE: TEST_ENV.IS_CI ? 'retain-on-failure' : TEST_ENV.IS_DEBUG ? 'on' : 'off',
} as const;

/**
 * Selectors - Common data-testid values
 *
 * Update these if component data-testids change
 */
export const SELECTORS = {
  // Auth
  USER_MENU: '[data-testid="user-menu"]',
  LOGOUT_BUTTON: '[data-testid="logout-button"]',

  // Resources
  RESOURCE_CARD: '[data-testid="resource-card"]',
  RESOURCE_SEARCH: '[data-testid="resource-search"]',
  RESOURCE_FILTER: '[data-testid="resource-filter"]',

  // Identity
  IDENTITY_DRAWER: '[data-testid="identity-drawer"]',
  USER_CLEARANCE: '[data-testid="user-clearance"]',
  USER_COUNTRY: '[data-testid="user-country"]',
  USER_COI: '[data-testid="user-coi"]',

  // IdP Management
  IDP_CARD: '[data-testid="idp-card"]',
  IDP_LIST: '[data-testid="idp-list"]',

  // Authorization
  AUTH_DECISION: '[data-testid="auth-decision"]',
  AUTH_REASON: '[data-testid="auth-reason"]',
  DECISION_ALLOW: '[data-testid="decision-allow"]',
  DECISION_DENY: '[data-testid="decision-deny"]',

  // Admin layout & shared components
  ADMIN_SIDEBAR: '[data-testid="admin-sidebar"]',
  ADMIN_HEADING: '[data-testid="admin-heading"]',
  ADMIN_TAB: '[role="tab"]',
  ADMIN_TAB_PANEL: '[role="tabpanel"]',
  ADMIN_TABLE: '[data-testid="admin-table"]',
  ADMIN_MODAL: '[role="dialog"]',
  ADMIN_TOAST: '[data-sonner-toast]',
  ADMIN_REFRESH: '[data-testid="refresh-button"]',
  ADMIN_SEARCH: '[data-testid="admin-search"]',
  ADMIN_PAGINATION: '[data-testid="pagination"]',
  ADMIN_EMPTY_STATE: '[data-testid="empty-state"]',
  ADMIN_ERROR: '[data-testid="error-boundary"]',
} as const;

/**
 * Keycloak selectors
 *
 * Update these if Keycloak UI changes
 * Version: Keycloak 23+
 */
export const KEYCLOAK_SELECTORS = {
  /**
   * Login form
   */
  USERNAME_INPUT: '#username',
  PASSWORD_INPUT: '#password',
  LOGIN_BUTTON: '#kc-login',

  /**
   * OTP setup
   */
  OTP_SECRET: '.kc-totp-secret',
  OTP_QR_CODE: '.kc-totp-qrcode',
  OTP_INPUT: '#totp',
  OTP_SUBMIT: '#kc-otp-settings-form button[type="submit"]',

  /**
   * WebAuthn/Passkey
   */
  WEBAUTHN_REGISTER: '#kc-register-button, .webauthn-register, button[name="register"]',
  WEBAUTHN_AUTHENTICATE: '#kc-authenticate-button, .webauthn-authenticate, button[name="authenticate"]',
  WEBAUTHN_SETUP: '.kc-webauthn-setup, .webauthn-setup',
  WEBAUTHN_SUCCESS: '.kc-webauthn-success, .webauthn-success',

  /**
   * Error messages
   */
  ERROR_MESSAGE: '.kc-feedback-text',
  ERROR_ALERT: '.alert-error',
} as const;

/**
 * Feature flags
 *
 * Enable/disable test scenarios based on feature availability
 */
export const FEATURES = {
  /**
   * MFA testing enabled
   * Requires Keycloak OTP/WebAuthn configuration
   */
  MFA_TESTS: process.env.ENABLE_MFA_TESTS !== 'false',

  /**
   * Policies Lab tests enabled
   * Requires /policies/lab route
   */
  POLICIES_LAB_TESTS: true,

  /**
   * KAS (Key Access Service) tests enabled
   * Stretch goal - may not be implemented
   */
  KAS_TESTS: process.env.ENABLE_KAS_TESTS === 'true',

  /**
   * Admin features tests enabled
   * Requires admin credentials
   */
  ADMIN_TESTS: true,

  /**
   * NATO expansion tests enabled (6 additional nations)
   * Requires DEU, GBR, ITA, ESP, POL, NLD IdPs
   */
  NATO_EXPANSION_TESTS: true,

  /**
   * Classification equivalency tests enabled
   * Requires French clearance mapping
   */
  CLASSIFICATION_EQUIVALENCY_TESTS: true,
} as const;

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  // Resources
  RESOURCES_LIST: '/api/resources',
  RESOURCE_BY_ID: (id: string) => `/api/resources/${id}`,
  RESOURCE_REQUEST_KEY: '/api/resources/request-key',

  // Policies
  POLICIES_LIST: '/api/policies',
  POLICY_BY_ID: (id: string) => `/api/policies/${id}`,

  // Policies Lab
  POLICIES_LAB_UPLOAD: '/api/policies-lab',
  POLICIES_LAB_EVALUATE: '/api/policies-lab/evaluate',
  POLICIES_LAB_DELETE: (id: string) => `/api/policies-lab/${id}`,

  // Admin
  ADMIN_IDPS: '/api/admin/idps',
  ADMIN_IDP_BY_ALIAS: (alias: string) => `/api/admin/idps/${alias}`,
  ADMIN_LOGS: '/api/admin/logs',
  ADMIN_ANALYTICS: '/api/admin/analytics',
  ADMIN_USERS: '/api/admin/users',
  ADMIN_USER_BY_ID: (userId: string) => `/api/admin/users/${userId}`,
  ADMIN_CLEARANCE_COUNTRIES: '/api/admin/clearance/countries',
  ADMIN_CLEARANCE_MAPPINGS: '/api/admin/clearance/mappings',
  ADMIN_CLEARANCE_VALIDATE: '/api/admin/clearance/validate',
  ADMIN_CERTIFICATES: '/api/admin/certificates',
  ADMIN_CERTIFICATES_HEALTH: '/api/admin/certificates/health',
  ADMIN_APPROVALS_PENDING: '/api/admin/approvals/pending',
  ADMIN_FEDERATION_HEALTH: '/api/admin/federation/health',
  ADMIN_FEDERATION_INSTANCES: '/api/admin/federation/instances',

  // Health
  HEALTH: '/api/health',
  HEALTH_READY: '/api/health/ready',

  // Public
  PUBLIC_IDPS: '/api/public/idps/public',
} as const;

/**
 * Test data paths
 */
export const TEST_DATA_PATHS = {
  /**
   * Sample Rego policy file
   */
  SAMPLE_REGO_POLICY: 'test-data/sample-policy.rego',

  /**
   * Sample XACML policy file
   */
  SAMPLE_XACML_POLICY: 'test-data/sample-policy.xml',

  /**
   * Sample document for upload
   */
  SAMPLE_DOCUMENT: 'test-data/sample-document.txt',
} as const;

/**
 * Consolidated test configuration
 */
export const TEST_CONFIG = {
  ENV: TEST_ENV,
  TIMEOUTS,
  URLS,
  RETRY,
  ARTIFACTS,
  SELECTORS,
  KEYCLOAK_SELECTORS,
  FEATURES,
  API_ENDPOINTS,
  TEST_DATA_PATHS,
} as const;

export default TEST_CONFIG;
