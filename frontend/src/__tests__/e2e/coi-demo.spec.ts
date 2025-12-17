/**
 * COI Evaluation Demo
 *
 * Demonstrates OPA Rego policy evaluation for different COI scenarios
 */

import { test, expect } from '@playwright/test';

// COI Definitions (from OPA registry)
const COI_MEMBERS = {
  "US-ONLY": ["USA"],
  "CAN-US": ["CAN", "USA"],
  "GBR-US": ["GBR", "USA"],
  "FRA-US": ["FRA", "USA"],
  "DEU-US": ["DEU", "USA"],
  "FVEY": ["USA", "GBR", "CAN", "AUS", "NZL"],
  "NATO": ["USA", "GBR", "FRA", "DEU", "CAN", "ITA", "ESP", "POL", "NLD", "BEL", "NOR", "DNK", "PRT", "ROU", "GRC", "TUR", "CZE", "HUN", "SVK", "SVN", "HRV", "ALB", "MNE", "MKD", "BGR", "EST", "LVA", "LTU", "LUX", "ISL", "FIN", "SWE"],
  "NATO-COSMIC": ["USA", "GBR", "FRA", "DEU", "CAN", "ITA", "ESP", "POL", "NLD", "BEL", "NOR", "DNK", "PRT", "ROU", "GRC", "TUR", "CZE", "HUN", "SVK", "SVN", "HRV", "ALB", "MNE", "MKD", "BGR", "EST", "LVA", "LTU", "LUX", "ISL", "FIN", "SWE"],
  "EUCOM": ["USA", "DEU", "GBR", "FRA", "ITA", "ESP", "POL"],
  "AUKUS": ["AUS", "GBR", "USA"],
  "Alpha": [], // Program-specific
  "Beta": [],  // Program-specific
  "Gamma": []  // Program-specific
};

test.describe('COI Evaluation Demo - Full OPA Policy Results', () => {

  test('1. NATO COI Access - USA SECRET user accessing NATO SECRET resource', async ({ page }) => {
    const user = { clearance: "SECRET", countryOfAffiliation: "USA", acpCOI: ["NATO"] };
    const resource = { classification: "SECRET", releasabilityTo: ["USA"], COI: ["NATO"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 NATO COI ACCESS TEST');
    console.log('👤 User: USA SECRET with NATO COI');
    console.log('📄 Resource: SECRET classification, NATO COI required');
    console.log(`✅ Decision: ${result.allow ? 'ALLOW' : 'DENY'}`);
    console.log(`📋 Reason: ${result.reason}`);

    expect(result.allow).toBe(true);
    expect(result.details.clearance_check.passed).toBe(true);
    expect(result.details.releasability_check.passed).toBe(true);
    expect(result.details.coi_check.passed).toBe(true);
  });

  test('2. FVEY COI Access - UK TOP_SECRET user accessing FVEY resource', async ({ page }) => {
    const user = { clearance: "TOP_SECRET", countryOfAffiliation: "GBR", acpCOI: ["FVEY", "NATO-COSMIC"] };
    const resource = { classification: "TOP_SECRET", releasabilityTo: ["USA", "GBR"], COI: ["FVEY"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 FVEY COI ACCESS TEST');
    console.log('👤 User: GBR TOP_SECRET with FVEY+NATO-COSMIC COI');
    console.log('📄 Resource: TOP_SECRET classification, FVEY COI required');
    console.log(`✅ Decision: ${result.allow ? 'ALLOW' : 'DENY'}`);
    console.log(`📋 Reason: ${result.reason}`);

    expect(result.allow).toBe(true);
    expect(result.details.coi_check.passed).toBe(true);
  });

  test('3. COI Denial - French user denied FVEY resource', async ({ page }) => {
    const user = { clearance: "TOP_SECRET", countryOfAffiliation: "FRA", acpCOI: ["NATO"] };
    const resource = { classification: "TOP_SECRET", releasabilityTo: ["USA", "GBR"], COI: ["FVEY"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 FVEY COI DENIAL TEST');
    console.log('👤 User: FRA TOP_SECRET with NATO COI only');
    console.log('📄 Resource: TOP_SECRET classification, FVEY COI required');
    console.log(`❌ Decision: ${result.allow ? 'ALLOW' : 'DENY'}`);
    console.log(`📋 Reason: ${result.reason}`);

    expect(result.allow).toBe(false);
    expect(result.details.coi_check.passed).toBe(false);
    expect(result.details.coi_check.reason).toContain('Missing required COI: FVEY');
  });

  test('4. Bilateral Agreement - CAN-US COI access', async ({ page }) => {
    const user = { clearance: "SECRET", countryOfAffiliation: "CAN", acpCOI: ["CAN-US"] };
    const resource = { classification: "SECRET", releasabilityTo: ["CAN", "USA"], COI: ["CAN-US"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 BILATERAL COI ACCESS TEST');
    console.log('👤 User: CAN SECRET with CAN-US bilateral COI');
    console.log('📄 Resource: SECRET classification, CAN-US COI required');
    console.log(`✅ Decision: ${result.allow ? 'ALLOW' : 'DENY'}`);
    console.log(`📋 Reason: ${result.reason}`);

    expect(result.allow).toBe(true);
    expect(result.details.coi_check.passed).toBe(true);
  });

  test('5. Regional Command - EUCOM access', async ({ page }) => {
    const user = { clearance: "SECRET", countryOfAffiliation: "POL", acpCOI: ["EUCOM"] };
    const resource = { classification: "SECRET", releasabilityTo: ["USA", "POL"], COI: ["EUCOM"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 REGIONAL COMMAND COI TEST');
    console.log('👤 User: POL SECRET with EUCOM regional command COI');
    console.log('📄 Resource: SECRET classification, EUCOM COI required');
    console.log(`✅ Decision: ${result.allow ? 'ALLOW' : 'DENY'}`);
    console.log(`📋 Reason: ${result.reason}`);

    expect(result.allow).toBe(true);
  });

  test('6. Multiple COI Requirements - NATO + FVEY needed', async ({ page }) => {
    const user = { clearance: "TOP_SECRET", countryOfAffiliation: "GBR", acpCOI: ["NATO", "FVEY"] };
    const resource = { classification: "TOP_SECRET", releasabilityTo: ["USA", "GBR"], COI: ["NATO", "FVEY"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 MULTIPLE COI REQUIREMENTS TEST');
    console.log('👤 User: GBR TOP_SECRET with NATO + FVEY COI');
    console.log('📄 Resource: TOP_SECRET classification, NATO + FVEY COI required');
    console.log(`✅ Decision: ${result.allow ? 'ALLOW' : 'DENY'}`);
    console.log(`📋 Reason: ${result.reason}`);

    expect(result.allow).toBe(true);
    expect(result.details.coi_check.passed).toBe(true);
  });

  test('7. Clearance Override - COI granted but clearance insufficient', async ({ page }) => {
    const user = { clearance: "CONFIDENTIAL", countryOfAffiliation: "USA", acpCOI: ["FVEY"] };
    const resource = { classification: "TOP_SECRET", releasabilityTo: ["USA"], COI: ["FVEY"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 CLEARANCE OVERRIDE TEST');
    console.log('👤 User: USA CONFIDENTIAL with FVEY COI');
    console.log('📄 Resource: TOP_SECRET classification, FVEY COI required');
    console.log(`❌ Decision: ${result.allow ? 'ALLOW' : 'DENY'}`);
    console.log(`📋 Reason: ${result.reason}`);

    expect(result.allow).toBe(false);
    expect(result.details.clearance_check.passed).toBe(false);
    expect(result.details.coi_check.passed).toBe(true); // COI passes but clearance fails
  });

  test('8. Country Releasability Block - COI granted but wrong country', async ({ page }) => {
    const user = { clearance: "SECRET", countryOfAffiliation: "FRA", acpCOI: ["NATO"] };
    const resource = { classification: "SECRET", releasabilityTo: ["USA", "GBR"], COI: ["NATO"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 COUNTRY RELEASABILITY BLOCK TEST');
    console.log('👤 User: FRA SECRET with NATO COI');
    console.log('📄 Resource: SECRET classification, NATO COI, but only USA/GBR releasable');
    console.log(`❌ Decision: ${result.allow ? 'ALLOW' : 'DENY'}`);
    console.log(`📋 Reason: ${result.reason}`);

    expect(result.allow).toBe(false);
    expect(result.details.coi_check.passed).toBe(true); // COI passes
    expect(result.details.releasability_check.passed).toBe(false); // Country fails
  });

  test('9. Program-Specific COI - Empty membership special handling', async ({ page }) => {
    const user = { clearance: "TOP_SECRET", countryOfAffiliation: "USA", acpCOI: ["Alpha"] };
    const resource = { classification: "TOP_SECRET", releasabilityTo: ["USA"], COI: ["Alpha"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 PROGRAM-SPECIFIC COI TEST');
    console.log('👤 User: USA TOP_SECRET with Alpha program COI');
    console.log('📄 Resource: TOP_SECRET classification, Alpha program COI required');
    console.log(`✅ Decision: ${result.allow ? 'ALLOW' : 'DENY'}`);
    console.log(`📋 Reason: ${result.reason}`);

    // Program-specific COIs have empty membership but should still grant access
    // when user has the matching program COI
    expect(result.allow).toBe(true);
  });

  test('10. Full OPA Decision Structure Demo', async ({ page }) => {
    const user = { clearance: "SECRET", countryOfAffiliation: "USA", acpCOI: ["NATO", "FVEY"] };
    const resource = { classification: "SECRET", releasabilityTo: ["USA"], COI: ["NATO"] };

    const result = evaluateCOIPolicy(user, resource);

    console.log('\n🎯 FULL OPA DECISION STRUCTURE DEMO');
    console.log('👤 User: USA SECRET with NATO + FVEY COI');
    console.log('📄 Resource: SECRET classification, NATO COI required');
    console.log('\n📊 OPA EVALUATION DETAILS:');
    console.log(JSON.stringify(result.details, null, 2));

    expect(result.allow).toBe(true);
    expect(result.details.clearance_check.passed).toBe(true);
    expect(result.details.releasability_check.passed).toBe(true);
    expect(result.details.coi_check.passed).toBe(true);
    expect(result.details.overall_decision.allow).toBe(true);
  });
});

/**
 * Simulate Complete OPA COI Policy Evaluation
 * Based on dive.authz Rego policy logic
 */
function evaluateCOIPolicy(user: any, resource: any) {
  const details = {
    clearance_check: { passed: false, reason: "" },
    releasability_check: { passed: false, reason: "" },
    coi_check: { passed: false, reason: "" },
    overall_decision: { allow: false, reason: "" }
  };

  // 1. Clearance Check
  const clearanceLevels = { UNCLASSIFIED: 1, CONFIDENTIAL: 2, SECRET: 3, TOP_SECRET: 4 };
  const userLevel = clearanceLevels[user.clearance];
  const resourceLevel = clearanceLevels[resource.classification];

  if (userLevel >= resourceLevel) {
    details.clearance_check = { passed: true, reason: "User clearance meets requirement" };
  } else {
    details.clearance_check = {
      passed: false,
      reason: `Insufficient clearance (${user.clearance} < ${resource.classification})`
    };
  }

  // 2. Releasability Check
  if (resource.releasabilityTo.includes(user.countryOfAffiliation)) {
    details.releasability_check = { passed: true, reason: "Country in releasability list" };
  } else {
    details.releasability_check = {
      passed: false,
      reason: `${user.countryOfAffiliation} not in releasability list [${resource.releasabilityTo.join(', ')}]`
    };
  }

  // 3. COI Check (ALL mode - user must have ALL required COIs)
  if (resource.COI.length === 0) {
    details.coi_check = { passed: true, reason: "No COI restrictions" };
  } else {
    // Special handling for program-specific COIs (empty membership)
    const programCOIs = ['Alpha', 'Beta', 'Gamma'];
    const hasProgramCOIs = resource.COI.some((coi: string) => programCOIs.includes(coi));

    if (hasProgramCOIs) {
      // Program COIs use different logic - check if user has matching program COI
      const userHasMatchingProgramCOI = resource.COI.some((coi: string) => user.acpCOI.includes(coi));
      if (userHasMatchingProgramCOI) {
        details.coi_check = { passed: true, reason: "Program-specific COI access granted" };
      } else {
        details.coi_check = { passed: false, reason: "Missing program-specific COI membership" };
      }
    } else {
      // Standard COI check - user must have ALL required COIs
      const missingCOIs = resource.COI.filter((coi: string) => !user.acpCOI.includes(coi));
      if (missingCOIs.length === 0) {
        const coiNames = resource.COI.length > 1 ? resource.COI.join(' + ') : resource.COI[0];
        details.coi_check = { passed: true, reason: `${coiNames} COI access granted` };
      } else {
        details.coi_check = {
          passed: false,
          reason: `Missing required COI: ${missingCOIs.join(', ')}`
        };
      }
    }
  }

  // 4. Overall Decision (ALL checks must pass)
  const allChecksPass = details.clearance_check.passed &&
                       details.releasability_check.passed &&
                       details.coi_check.passed;

  if (allChecksPass) {
    details.overall_decision = { allow: true, reason: details.coi_check.reason };
  } else {
    const failedReasons = [];
    if (!details.clearance_check.passed) failedReasons.push(details.clearance_check.reason);
    if (!details.releasability_check.passed) failedReasons.push(details.releasability_check.reason);
    if (!details.coi_check.passed) failedReasons.push(details.coi_check.reason);

    details.overall_decision = { allow: false, reason: failedReasons.join('; ') };
  }

  return {
    allow: details.overall_decision.allow,
    reason: details.overall_decision.reason,
    details
  };
}
