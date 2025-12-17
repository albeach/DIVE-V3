/**
 * DIVE V3 Authentication Flow Load Test
 * 
 * Tests complete authentication flow:
 * - OIDC login
 * - Token refresh
 * - Session management
 * 
 * Performance Targets:
 * - Authentication < 2s
 * - Token refresh < 500ms
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const authSuccessRate = new Rate('auth_success');
const authLatency = new Trend('auth_latency_ms');
const refreshSuccessRate = new Rate('refresh_success');
const refreshLatency = new Trend('refresh_latency_ms');

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'auth_latency_ms': ['p(95)<2000'],
    'refresh_latency_ms': ['p(95)<500'],
    'auth_success': ['rate>0.99'],
    'refresh_success': ['rate>0.99'],
  },
};

const KEYCLOAK_URL = __ENV.KEYCLOAK_URL || 'http://localhost:8081';
const testUser = {
  username: 'testuser-secret',
  password: 'test123',
};

function authenticate() {
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
    username: testUser.username,
    password: testUser.password,
  };

  const response = http.post(url, payload, params);
  const success = check(response, {
    'auth status is 200': (r) => r.status === 200,
    'auth response time < 2s': (r) => r.timings.duration < 2000,
  });

  authSuccessRate.add(success);
  authLatency.add(response.timings.duration);

  if (response.status === 200) {
    return JSON.parse(response.body);
  }

  return null;
}

function refreshToken(refreshToken) {
  const url = `${KEYCLOAK_URL}/realms/dive-v3-broker/protocol/openid-connect/token`;
  const params = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  const payload = {
    grant_type: 'refresh_token',
    client_id: 'dive-v3-client',
    client_secret: __ENV.CLIENT_SECRET || 'test-secret',
    refresh_token: refreshToken,
  };

  const response = http.post(url, payload, params);
  const success = check(response, {
    'refresh status is 200': (r) => r.status === 200,
    'refresh response time < 500ms': (r) => r.timings.duration < 500,
  });

  refreshSuccessRate.add(success);
  refreshLatency.add(response.timings.duration);

  return response.status === 200;
}

export default function () {
  // Authenticate
  const tokens = authenticate();
  if (!tokens) {
    return;
  }

  sleep(2);

  // Refresh token
  refreshToken(tokens.refresh_token);

  sleep(1);
}

