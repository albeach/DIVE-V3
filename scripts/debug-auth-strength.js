#!/usr/bin/env node

/**
 * DEBUG Script: Authentication Strength Insufficient Error
 * 
 * This script comprehensively debugs the "Authentication strength insufficient" error
 * by tracing the entire authorization flow from:
 * 1. JWT token claims (ACR, AMR)
 * 2. Resource metadata from MongoDB
 * 3. OPA policy evaluation
 * 4. Backend middleware enforcement
 * 5. Frontend display
 * 
 * Usage:
 *   node scripts/debug-auth-strength.js <resourceId> [accessToken]
 * 
 * Example:
 *   node scripts/debug-auth-strength.js doc-generated-1762442164745-10321
 */

const https = require('https');
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Config
const BACKEND_URL = process.env.BACKEND_URL || 'https://localhost:4000';
const OPA_URL = process.env.OPA_URL || 'http://localhost:8181';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/dive-v3';

// Allow self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Color console output
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(level, message, data) {
  const timestamp = new Date().toISOString();
  let color = colors.reset;
  
  switch (level) {
    case 'ERROR':
      color = colors.red;
      break;
    case 'WARN':
      color = colors.yellow;
      break;
    case 'SUCCESS':
      color = colors.green;
      break;
    case 'INFO':
      color = colors.cyan;
      break;
    case 'DEBUG':
      color = colors.blue;
      break;
  }
  
  console.log(`${color}[${timestamp}] [${level}]${colors.reset} ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Step 1: Decode JWT token (without verification)
 */
function decodeToken(token) {
  try {
    const decoded = jwt.decode(token, { complete: true });
    return decoded;
  } catch (error) {
    log('ERROR', 'Failed to decode JWT token', { error: error.message });
    return null;
  }
}

/**
 * Step 2: Fetch resource metadata from MongoDB
 */
async function fetchResourceFromMongoDB(resourceId) {
  log('INFO', `🔍 Fetching resource metadata from MongoDB: ${resourceId}`);
  
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    const db = client.db();
    const resource = await db.collection('resources').findOne({ resourceId });
    
    await client.close();
    
    if (!resource) {
      log('ERROR', 'Resource not found in MongoDB', { resourceId });
      return null;
    }
    
    log('SUCCESS', 'Resource metadata retrieved', {
      resourceId: resource.resourceId,
      title: resource.title,
      classification: resource.classification,
      releasabilityTo: resource.releasabilityTo,
      COI: resource.COI,
      encrypted: resource.encrypted,
      hasZTDF: !!resource.ztdf
    });
    
    return resource;
  } catch (error) {
    log('ERROR', 'MongoDB query failed', { error: error.message });
    return null;
  }
}

/**
 * Step 3: Fetch resource via backend API (with authorization)
 */
async function fetchResourceViaAPI(resourceId, accessToken) {
  log('INFO', `🌐 Fetching resource via backend API: ${resourceId}`);
  
  try {
    const response = await axios.get(`${BACKEND_URL}/api/resources/${resourceId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Request-Id': `debug-${Date.now()}`
      },
      httpsAgent,
      validateStatus: () => true // Don't throw on 4xx/5xx
    });
    
    log('INFO', `Backend API response: ${response.status} ${response.statusText}`, {
      status: response.status,
      allow: response.status === 200,
      data: response.data
    });
    
    return response.data;
  } catch (error) {
    log('ERROR', 'Backend API request failed', { error: error.message });
    return null;
  }
}

/**
 * Step 4: Call OPA directly with test input
 */
async function callOPA(opaInput) {
  log('INFO', '🔐 Calling OPA for authorization decision');
  
  try {
    const response = await axios.post(`${OPA_URL}/v1/data/dive/authorization`, opaInput, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000,
      validateStatus: () => true
    });
    
    log('INFO', 'OPA decision received', {
      allow: response.data?.result?.decision?.allow || response.data?.result?.allow,
      reason: response.data?.result?.decision?.reason || response.data?.result?.reason,
      evaluation_details: response.data?.result?.decision?.evaluation_details || response.data?.result?.evaluation_details
    });
    
    return response.data;
  } catch (error) {
    log('ERROR', 'OPA request failed', { error: error.message });
    return null;
  }
}

/**
 * Step 5: Analyze ACR/AMR claims
 */
function analyzeAuthStrength(token) {
  log('INFO', '🔑 Analyzing authentication strength claims');
  
  const payload = token.payload;
  const acr = payload.acr;
  const amr = payload.amr;
  
  log('DEBUG', 'Raw claims from JWT', {
    acr,
    acrType: typeof acr,
    amr,
    amrType: typeof amr,
    amrIsArray: Array.isArray(amr)
  });
  
  // Normalize ACR
  let normalizedAAL = 0;
  if (acr === undefined || acr === null) {
    log('WARN', 'ACR claim is missing - defaulting to AAL1');
    normalizedAAL = 0;
  } else if (typeof acr === 'number') {
    normalizedAAL = acr;
    log('INFO', `ACR is numeric: ${acr} → AAL${acr + 1}`);
  } else {
    const numericACR = parseInt(acr, 10);
    if (!isNaN(numericACR)) {
      normalizedAAL = numericACR;
      log('INFO', `ACR is numeric string: "${acr}" → AAL${numericACR + 1}`);
    } else {
      const acrLower = acr.toLowerCase();
      if (acrLower.includes('bronze') || acrLower.includes('aal1')) {
        normalizedAAL = 0;
        log('INFO', `ACR is URN format: "${acr}" → AAL1`);
      } else if (acrLower.includes('silver') || acrLower.includes('aal2')) {
        normalizedAAL = 1;
        log('INFO', `ACR is URN format: "${acr}" → AAL2`);
      } else if (acrLower.includes('gold') || acrLower.includes('aal3')) {
        normalizedAAL = 2;
        log('INFO', `ACR is URN format: "${acr}" → AAL3`);
      } else {
        log('WARN', `Unknown ACR format: "${acr}" - defaulting to AAL1`);
        normalizedAAL = 0;
      }
    }
  }
  
  // Normalize AMR
  let normalizedAMR = [];
  if (amr === undefined || amr === null) {
    log('WARN', 'AMR claim is missing - defaulting to ["pwd"]');
    normalizedAMR = ['pwd'];
  } else if (Array.isArray(amr)) {
    normalizedAMR = amr;
    log('INFO', `AMR is array: ${JSON.stringify(amr)}`);
  } else if (typeof amr === 'string') {
    try {
      const parsed = JSON.parse(amr);
      if (Array.isArray(parsed)) {
        normalizedAMR = parsed;
        log('INFO', `AMR is JSON string: "${amr}" → ${JSON.stringify(parsed)}`);
      } else {
        normalizedAMR = [amr];
        log('INFO', `AMR is single string: "${amr}" → ["${amr}"]`);
      }
    } catch {
      normalizedAMR = [amr];
      log('INFO', `AMR is single string (not JSON): "${amr}" → ["${amr}"]`);
    }
  }
  
  const isAAL2 = normalizedAAL >= 1;
  const hasMFA = normalizedAMR.length >= 2;
  
  log('INFO', 'Authentication strength summary', {
    normalizedAAL,
    aalLevel: `AAL${normalizedAAL + 1}`,
    isAAL2,
    normalizedAMR,
    factorCount: normalizedAMR.length,
    hasMFA,
    meetsAAL2: isAAL2 || hasMFA
  });
  
  return {
    normalizedAAL,
    normalizedAMR,
    isAAL2,
    hasMFA,
    meetsAAL2: isAAL2 || hasMFA
  };
}

/**
 * Main debug flow
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node debug-auth-strength.js <resourceId> [accessToken]');
    console.log('');
    console.log('Example:');
    console.log('  node debug-auth-strength.js doc-generated-1762442164745-10321');
    process.exit(1);
  }
  
  const resourceId = args[0];
  const accessToken = args[1];
  
  console.log(`${colors.bright}${colors.cyan}============================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}DEBUG: Authentication Strength Error${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}============================================${colors.reset}`);
  console.log('');
  
  // Step 1: Decode JWT token
  if (!accessToken) {
    log('WARN', 'No access token provided - skipping JWT analysis');
    log('INFO', 'To include JWT analysis, provide token as 2nd argument');
  } else {
    console.log(`${colors.bright}--- Step 1: JWT Token Analysis ---${colors.reset}`);
    const decoded = decodeToken(accessToken);
    
    if (decoded) {
      log('SUCCESS', 'JWT token decoded', {
        header: decoded.header,
        payload: {
          sub: decoded.payload.sub,
          uniqueID: decoded.payload.uniqueID,
          clearance: decoded.payload.clearance,
          countryOfAffiliation: decoded.payload.countryOfAffiliation,
          acpCOI: decoded.payload.acpCOI,
          acr: decoded.payload.acr,
          amr: decoded.payload.amr,
          exp: decoded.payload.exp,
          iat: decoded.payload.iat
        }
      });
      
      const authStrength = analyzeAuthStrength(decoded);
      
      if (!authStrength.meetsAAL2) {
        log('ERROR', '❌ Authentication strength INSUFFICIENT for classified resources', {
          required: 'AAL2 (ACR >= 1 OR 2+ AMR factors)',
          actual: `AAL${authStrength.normalizedAAL + 1}, ${authStrength.normalizedAMR.length} factor(s)`,
          recommendation: 'User must complete MFA enrollment or re-authenticate with MFA'
        });
      } else {
        log('SUCCESS', '✅ Authentication strength SUFFICIENT for classified resources', {
          aal: `AAL${authStrength.normalizedAAL + 1}`,
          factors: authStrength.normalizedAMR
        });
      }
    }
    console.log('');
  }
  
  // Step 2: Fetch resource from MongoDB
  console.log(`${colors.bright}--- Step 2: MongoDB Resource Metadata ---${colors.reset}`);
  const mongoResource = await fetchResourceFromMongoDB(resourceId);
  
  if (!mongoResource) {
    log('ERROR', '❌ Resource not found in MongoDB - this explains "UNKNOWN" classification in UI');
    process.exit(1);
  }
  
  // Check resource attributes
  if (!mongoResource.classification) {
    log('ERROR', '❌ Resource missing classification field', { resource: mongoResource });
  }
  if (!mongoResource.releasabilityTo || mongoResource.releasabilityTo.length === 0) {
    log('ERROR', '❌ Resource missing or empty releasabilityTo field', { resource: mongoResource });
  }
  
  console.log('');
  
  // Step 3: Fetch via backend API (if token provided)
  if (accessToken) {
    console.log(`${colors.bright}--- Step 3: Backend API Authorization ---${colors.reset}`);
    const apiResponse = await fetchResourceViaAPI(resourceId, accessToken);
    
    if (apiResponse && apiResponse.error) {
      log('ERROR', `❌ Backend denied access: ${apiResponse.message}`, {
        reason: apiResponse.reason,
        details: apiResponse.details
      });
    } else if (apiResponse) {
      log('SUCCESS', '✅ Backend granted access', apiResponse);
    }
    console.log('');
  }
  
  // Step 4: Test OPA policy directly (if token provided)
  if (accessToken && mongoResource) {
    console.log(`${colors.bright}--- Step 4: OPA Policy Evaluation ---${colors.reset}`);
    
    const decoded = decodeToken(accessToken);
    const authStrength = analyzeAuthStrength(decoded);
    
    // Extract resource attributes (ZTDF or legacy)
    const isZTDF = !!mongoResource.ztdf;
    const classification = isZTDF
      ? mongoResource.ztdf.policy.securityLabel.classification
      : mongoResource.classification;
    const releasabilityTo = isZTDF
      ? mongoResource.ztdf.policy.securityLabel.releasabilityTo
      : mongoResource.releasabilityTo;
    const COI = isZTDF
      ? (mongoResource.ztdf.policy.securityLabel.COI || [])
      : (mongoResource.COI || []);
    
    const opaInput = {
      input: {
        subject: {
          authenticated: true,
          uniqueID: decoded.payload.uniqueID || decoded.payload.preferred_username || decoded.payload.sub,
          clearance: decoded.payload.clearance,
          countryOfAffiliation: decoded.payload.countryOfAffiliation,
          acpCOI: decoded.payload.acpCOI || []
        },
        action: {
          operation: 'view'
        },
        resource: {
          resourceId: mongoResource.resourceId,
          classification,
          releasabilityTo,
          COI,
          encrypted: isZTDF || mongoResource.encrypted
        },
        context: {
          currentTime: new Date().toISOString(),
          sourceIP: '127.0.0.1',
          deviceCompliant: true,
          requestId: `debug-${Date.now()}`,
          acr: String(authStrength.normalizedAAL),
          amr: authStrength.normalizedAMR
        }
      }
    };
    
    log('DEBUG', 'OPA input constructed', opaInput);
    
    const opaResponse = await callOPA(opaInput);
    
    if (opaResponse && opaResponse.result) {
      const decision = opaResponse.result.decision || opaResponse.result;
      
      if (decision.allow) {
        log('SUCCESS', '✅ OPA policy ALLOWS access', {
          reason: decision.reason,
          evaluation_details: decision.evaluation_details
        });
      } else {
        log('ERROR', '❌ OPA policy DENIES access', {
          reason: decision.reason,
          evaluation_details: decision.evaluation_details
        });
        
        // Detailed analysis of denial reason
        if (decision.reason && decision.reason.includes('authentication_strength_insufficient')) {
          log('ERROR', '🔍 Root Cause: Authentication strength insufficient', {
            userACR: authStrength.normalizedAAL,
            userAMR: authStrength.normalizedAMR,
            requiredForClassified: 'AAL2 (ACR >= 1 OR 2+ factors)',
            classification,
            fix: 'User must enroll in MFA or re-authenticate with MFA'
          });
        }
      }
    }
    console.log('');
  }
  
  // Step 5: Summary and recommendations
  console.log(`${colors.bright}${colors.cyan}============================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}Summary & Recommendations${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}============================================${colors.reset}`);
  
  if (!mongoResource) {
    console.log(`${colors.red}❌ Resource not found in MongoDB${colors.reset}`);
    console.log(`   → Check if resource ID is correct: ${resourceId}`);
    console.log(`   → Verify MongoDB connection: ${MONGODB_URI}`);
    console.log(`   → Run: db.resources.findOne({ resourceId: "${resourceId}" })`);
  } else if (!mongoResource.classification || !mongoResource.releasabilityTo) {
    console.log(`${colors.red}❌ Resource metadata incomplete${colors.reset}`);
    console.log(`   → Resource found but missing required fields`);
    console.log(`   → Check classification: ${mongoResource.classification || 'MISSING'}`);
    console.log(`   → Check releasabilityTo: ${JSON.stringify(mongoResource.releasabilityTo || 'MISSING')}`);
  } else if (accessToken) {
    const decoded = decodeToken(accessToken);
    const authStrength = analyzeAuthStrength(decoded);
    
    if (!authStrength.meetsAAL2 && mongoResource.classification !== 'UNCLASSIFIED') {
      console.log(`${colors.red}❌ Authentication strength insufficient${colors.reset}`);
      console.log(`   → User AAL: AAL${authStrength.normalizedAAL + 1} (ACR: ${decoded.payload.acr || 'missing'})`);
      console.log(`   → User factors: ${authStrength.normalizedAMR.length} (AMR: ${JSON.stringify(decoded.payload.amr || 'missing')})`);
      console.log(`   → Required: AAL2 (ACR >= 1 OR 2+ authentication factors)`);
      console.log(`   → Fix: User must enroll in MFA or re-authenticate with MFA`);
      console.log('');
      console.log('   🔧 Possible solutions:');
      console.log('   1. User enrolls in OTP/WebAuthn in Keycloak account console');
      console.log('   2. Admin enables conditional MFA flow for user\'s IdP');
      console.log('   3. Update user attributes to include ACR="1" or AMR=["pwd","otp"]');
    } else {
      console.log(`${colors.green}✅ All checks passed${colors.reset}`);
      console.log(`   → Resource metadata: OK`);
      console.log(`   → Authentication strength: OK`);
      console.log(`   → If access still denied, check clearance/country/COI matching`);
    }
  } else {
    console.log(`${colors.yellow}⚠️  Partial analysis (no access token provided)${colors.reset}`);
    console.log(`   → Resource metadata: OK`);
    console.log(`   → To test authorization, provide access token as 2nd argument`);
  }
  
  console.log('');
}

main().catch(error => {
  log('ERROR', 'Script failed', { error: error.message, stack: error.stack });
  process.exit(1);
});






