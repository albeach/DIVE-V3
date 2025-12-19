/**
 * DIVE V3 Load Testing with k6
 * 
 * Phase 13: Performance & Scalability Optimization
 * 
 * Tests:
 * - Authorization decisions (100+ concurrent users)
 * - Resource search and retrieval
 * - Federation workflows
 * - Authentication flows
 * 
 * Performance Targets:
 * - p95 response time < 500ms for all endpoints
 * - Support 100+ concurrent users
 * - 99.9% success rate
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const authzSuccessRate = new Rate('authz_success');
const authzLatency = new Trend('authz_latency_ms');
const searchSuccessRate = new Rate('search_success');
const searchLatency = new Trend('search_latency_ms');
const federationSuccessRate = new Rate('federation_success');
const federationLatency = new Trend('federation_latency_ms');
const authSuccessRate = new Rate('auth_success');
const authLatency = new Trend('auth_latency_ms');
const errorRate = new Counter('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '10m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests should be below 500ms
    'http_req_failed': ['rate<0.01'],   // Less than 1% errors
    'authz_success': ['rate>0.99'],      // 99% success rate for authz
    'search_success': ['rate>0.99'],     // 99% success rate for search
    'federation_success': ['rate>0.95'], // 95% success rate for federation
    'auth_success': ['rate>0.99'],       // 99% success rate for auth
  },
};

// Base URLs (from environment or defaults)
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const FRONTEND_URL = __ENV.FRONTEND_URL || 'http://localhost:3000';
const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://localhost:8081';

// Test users (with different clearances)
const testUsers = [
  { username: 'testuser-unclassified', password: 'test123', clearance: 'UNCLASSIFIED' },
  { username: 'testuser-confidential', password: 'test123', clearance: 'CONFIDENTIAL' },
  { username: 'testuser-secret', password: 'test123', clearance: 'SECRET' },
  { username: 'testuser-topsecret', password: 'test123', clearance: 'TOP_SECRET' },
];

// Test resources (with different classifications)
const testResources = [
  'doc-unclassified-001',
  'doc-confidential-001',
  'doc-secret-001',
  'doc-topsecret-001',
];

/**
 * Get authentication token
 */
function getAuthToken(username, password) {
  const url = `${KEYCLOAK_URL}/realms/dive-v3-broker/protocol/openid-connect/token`;
  const params = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  const payload = {
    grant_type: 'password',
    client_id: 'dive-v3-client',
    client_secret: __ENV.CLIENT_SECRET || 'test-secret',
    username: username,
    password: password,
  };

  const response = http.post(url, payload, params);
  const success = check(response, {
    'auth status is 200': (r) => r.status === 200,
  });

  authSuccessRate.add(success);
  authLatency.add(response.timings.duration);

  if (response.status === 200) {
    const body = JSON.parse(response.body);
    return body.access_token;
  }

  return null;
}

/**
 * Test authorization decision endpoint
 */
function testAuthorization(token, resourceId) {
  const url = `${BASE_URL}/api/resources/${resourceId}`;
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Request-ID': `k6-${Date.now()}-${Math.random()}`,
    },
  };

  const response = http.get(url, params);
  const success = check(response, {
    'authz status is 200 or 403': (r) => r.status === 200 || r.status === 403,
    'authz response time < 500ms': (r) => r.timings.duration < 500,
  });

  authzSuccessRate.add(success);
  authzLatency.add(response.timings.duration);

  if (!success) {
    errorRate.add(1);
  }

  return response;
}

/**
 * Test resource search endpoint
 */
function testSearch(token, query) {
  const url = `${BASE_URL}/api/resources/search`;
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Request-ID': `k6-${Date.now()}-${Math.random()}`,
    },
  };
  const payload = JSON.stringify({
    query: query,
    limit: 10,
    offset: 0,
  });

  const response = http.post(url, payload, params);
  const success = check(response, {
    'search status is 200': (r) => r.status === 200,
    'search response time < 500ms': (r) => r.timings.duration < 500,
    'search returns results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.resources && Array.isArray(body.resources);
      } catch {
        return false;
      }
    },
  });

  searchSuccessRate.add(success);
  searchLatency.add(response.timings.duration);

  if (!success) {
    errorRate.add(1);
  }

  return response;
}

/**
 * Test federation endpoint
 */
function testFederation(token, targetInstance) {
  const url = `${BASE_URL}/api/resources/federated-search`;
  const params = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Request-ID': `k6-${Date.now()}-${Math.random()}`,
    },
  };
  const payload = JSON.stringify({
    query: 'test',
    instances: [targetInstance],
    limit: 10,
  });

  const response = http.post(url, payload, params);
  const success = check(response, {
    'federation status is 200': (r) => r.status === 200,
    'federation response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  federationSuccessRate.add(success);
  federationLatency.add(response.timings.duration);

  if (!success) {
    errorRate.add(1);
  }

  return response;
}

/**
 * Main test function
 */
export default function () {
  // Select random user
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  
  // Authenticate
  const token = getAuthToken(user.username, user.password);
  if (!token) {
    errorRate.add(1);
    return;
  }

  // Test authorization decisions (70% of requests)
  if (Math.random() < 0.7) {
    const resourceId = testResources[Math.floor(Math.random() * testResources.length)];
    testAuthorization(token, resourceId);
  }
  // Test search (20% of requests)
  else if (Math.random() < 0.9) {
    const queries = ['test', 'document', 'classified', 'federation'];
    const query = queries[Math.floor(Math.random() * queries.length)];
    testSearch(token, query);
  }
  // Test federation (10% of requests)
  else {
    const instances = ['FRA', 'GBR', 'DEU'];
    const instance = instances[Math.floor(Math.random() * instances.length)];
    testFederation(token, instance);
  }

  sleep(1); // Wait 1 second between requests
}

/**
 * Setup function (runs once before all VUs)
 */
export function setup() {
  console.log('Starting DIVE V3 load test');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Keycloak URL: ${KEYCLOAK_URL}`);
  return {};
}

/**
 * Teardown function (runs once after all VUs)
 */
export function teardown(data) {
  console.log('Load test complete');
}
