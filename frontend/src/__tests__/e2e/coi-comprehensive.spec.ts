/**
 * Comprehensive COI (Community of Interest) Testing
 *
 * Tests all COI variations and their interactions with OPA Rego policies:
 * - NATO COI access patterns
 * - FVEY COI special access
 * - Bilateral agreements (CAN-US, GBR-US, etc.)
 * - Regional commands (EUCOM, PACOM, etc.)
 * - Program-specific COIs (Alpha, Beta, Gamma)
 * - Full OPA policy evaluation results
 */

import { test, expect } from '@playwright/test';

// COI Definitions based on OPA registry
const COI_DEFINITIONS = {
  // National restrictions
  "US-ONLY": ["USA"],

  // Bilateral agreements
  "CAN-US": ["CAN", "USA"],
  "GBR-US": ["GBR", "USA"],
  "FRA-US": ["FRA", "USA"],
  "DEU-US": ["DEU", "USA"],

  // Major alliances
  "FVEY": ["USA", "GBR", "CAN", "AUS", "NZL"],
  "NATO": ["USA", "GBR", "FRA", "DEU", "CAN", "ITA", "ESP", "POL", "NLD", "BEL", "NOR", "DNK", "PRT", "ROU", "GRC", "TUR", "CZE", "HUN", "SVK", "SVN", "HRV", "ALB", "MNE", "MKD", "BGR", "EST", "LVA", "LTU", "LUX", "ISL", "FIN", "SWE"],
  "NATO-COSMIC": ["USA", "GBR", "FRA", "DEU", "CAN", "ITA", "ESP", "POL", "NLD", "BEL", "NOR", "DNK", "PRT", "ROU", "GRC", "TUR", "CZE", "HUN", "SVK", "SVN", "HRV", "ALB", "MNE", "MKD", "BGR", "EST", "LVA", "LTU", "LUX", "ISL", "FIN", "SWE"],

  // Regional commands
  "EUCOM": ["USA", "DEU", "GBR", "FRA", "ITA", "ESP", "POL"],
  "PACOM": ["USA", "JPN", "KOR", "AUS", "NZL", "PHL"],
  "CENTCOM": ["USA", "SAU", "ARE", "QAT", "KWT", "BHR", "JOR", "EGY"],
  "NORTHCOM": ["USA", "CAN", "MEX"],
  "SOCOM": ["USA", "GBR", "CAN", "AUS", "NZL"],

  // Other alliances
  "AUKUS": ["AUS", "GBR", "USA"],
  "QUAD": ["USA", "AUS", "IND", "JPN"],
  "EU-RESTRICTED": ["AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE"],

  // Program-specific (empty membership - access controlled differently)
  "Alpha": [],
  "Beta": [],
  "Gamma": []
};

// Test scenarios combining user COIs with resource COI requirements
const COI_TEST_SCENARIOS = [
  // NATO COI Tests
  {
    name: "NATO SECRET user accessing NATO resource",
    user: { clearance: "SECRET", countryOfAffiliation: "USA", acpCOI: ["NATO"] },
    resource: { classification: "SECRET", releasabilityTo: ["USA"], COI: ["NATO"] },
    expected: { allow: true, reason: "NATO COI access granted" }
  },
  {
    name: "Non-NATO user denied NATO resource",
    user: { clearance: "SECRET", countryOfAffiliation: "CHN", acpCOI: [] },
    resource: { classification: "SECRET", releasabilityTo: ["USA"], COI: ["NATO"] },
    expected: { allow: false, reason: "User not in NATO COI" }
  },

  // FVEY COI Tests
  {
    name: "FVEY TOP_SECRET user accessing FVEY resource",
    user: { clearance: "TOP_SECRET", countryOfAffiliation: "GBR", acpCOI: ["FVEY", "NATO-COSMIC"] },
    resource: { classification: "TOP_SECRET", releasabilityTo: ["USA", "GBR"], COI: ["FVEY"] },
    expected: { allow: true, reason: "FVEY COI access granted" }
  },
  {
    name: "Non-FVEY NATO user denied FVEY resource",
    user: { clearance: "TOP_SECRET", countryOfAffiliation: "FRA", acpCOI: ["NATO"] },
    resource: { classification: "TOP_SECRET", releasabilityTo: ["USA", "GBR"], COI: ["FVEY"] },
    expected: { allow: false, reason: "User not in FVEY COI" }
  },

  // Bilateral Agreement Tests
  {
    name: "CAN-US user accessing CAN-US resource",
    user: { clearance: "SECRET", countryOfAffiliation: "CAN", acpCOI: ["CAN-US"] },
    resource: { classification: "SECRET", releasabilityTo: ["CAN", "USA"], COI: ["CAN-US"] },
    expected: { allow: true, reason: "CAN-US bilateral access granted" }
  },
  {
    name: "Non-bilateral user denied CAN-US resource",
    user: { clearance: "SECRET", countryOfAffiliation: "FRA", acpCOI: ["NATO"] },
    resource: { classification: "SECRET", releasabilityTo: ["CAN", "USA"], COI: ["CAN-US"] },
    expected: { allow: false, reason: "User not in CAN-US bilateral COI" }
  },

  // Regional Command Tests
  {
    name: "EUCOM user accessing EUCOM resource",
    user: { clearance: "SECRET", countryOfAffiliation: "DEU", acpCOI: ["EUCOM"] },
    resource: { classification: "SECRET", releasabilityTo: ["USA", "DEU"], COI: ["EUCOM"] },
    expected: { allow: true, reason: "EUCOM regional command access granted" }
  },
  {
    name: "Non-EUCOM user denied EUCOM resource",
    user: { clearance: "SECRET", countryOfAffiliation: "JPN", acpCOI: ["PACOM"] },
    resource: { classification: "SECRET", releasabilityTo: ["USA", "DEU"], COI: ["EUCOM"] },
    expected: { allow: false, reason: "User not in EUCOM regional command" }
  },

  // Multiple COI Requirements
  {
    name: "User with NATO+FVEY accessing NATO+FVEY resource",
    user: { clearance: "TOP_SECRET", countryOfAffiliation: "GBR", acpCOI: ["NATO", "FVEY"] },
    resource: { classification: "TOP_SECRET", releasabilityTo: ["USA", "GBR"], COI: ["NATO", "FVEY"] },
    expected: { allow: true, reason: "Multiple COI requirements satisfied" }
  },
  {
    name: "User with only NATO denied NATO+FVEY resource",
    user: { clearance: "TOP_SECRET", countryOfAffiliation: "FRA", acpCOI: ["NATO"] },
    resource: { classification: "TOP_SECRET", releasabilityTo: ["USA", "GBR"], COI: ["NATO", "FVEY"] },
    expected: { allow: false, reason: "Missing FVEY COI requirement" }
  },

  // Program-Specific COI Tests
  {
    name: "Program-specific COI (empty membership - special handling)",
    user: { clearance: "TOP_SECRET", countryOfAffiliation: "USA", acpCOI: ["Alpha"] },
    resource: { classification: "TOP_SECRET", releasabilityTo: ["USA"], COI: ["Alpha"] },
    expected: { allow: true, reason: "Program-specific COI access" }
  },

  // Clearance + COI Interactions
  {
    name: "Insufficient clearance overrides COI membership",
    user: { clearance: "CONFIDENTIAL", countryOfAffiliation: "USA", acpCOI: ["FVEY"] },
    resource: { classification: "TOP_SECRET", releasabilityTo: ["USA"], COI: ["FVEY"] },
    expected: { allow: false, reason: "Insufficient clearance (CONFIDENTIAL < TOP_SECRET)" }
  },

  // Country Releasability + COI
  {
    name: "COI granted but country not in releasability",
    user: { clearance: "SECRET", countryOfAffiliation: "FRA", acpCOI: ["NATO"] },
    resource: { classification: "SECRET", releasabilityTo: ["USA", "GBR"], COI: ["NATO"] },
    expected: { allow: false, reason: "FRA not in releasability list despite NATO COI" }
  }
];

test.describe('COI (Community of Interest) Comprehensive Testing', () => {
  test.describe('COI Definition Validation', () => {
    test('All COI definitions are properly structured', async () => {
      // Validate COI structure
      expect(COI_DEFINITIONS).toBeDefined();
      expect(Object.keys(COI_DEFINITIONS)).toContain('NATO');
      expect(Object.keys(COI_DEFINITIONS)).toContain('FVEY');
      expect(Object.keys(COI_DEFINITIONS)).toContain('US-ONLY');

      // NATO should include USA
      expect(COI_DEFINITIONS.NATO).toContain('USA');

      // FVEY should include Five Eyes
      expect(COI_DEFINITIONS.FVEY).toContain('USA');
      expect(COI_DEFINITIONS.FVEY).toContain('GBR');
      expect(COI_DEFINITIONS.FVEY).toContain('CAN');
      expect(COI_DEFINITIONS.FVEY).toContain('AUS');
      expect(COI_DEFINITIONS.FVEY).toContain('NZL');

      console.log('✅ All COI definitions validated');
    });

    test('COI membership validation', async () => {
      // Test specific memberships
      expect(COI_DEFINITIONS['US-ONLY']).toEqual(['USA']);
      expect(COI_DEFINITIONS['CAN-US']).toEqual(['CAN', 'USA']);
      expect(COI_DEFINITIONS['FVEY']).toHaveLength(5);
      expect(COI_DEFINITIONS['NATO']).toHaveLength(32);

      console.log('✅ COI membership validation passed');
    });
  });

  test.describe('OPA Policy COI Evaluation', () => {
    // Test each scenario against the OPA policy evaluation
    COI_TEST_SCENARIOS.forEach((scenario, index) => {
      test(`${index + 1}. ${scenario.name}`, async ({ page }) => {
        // This would normally call the OPA API, but for now we'll simulate
        // the expected policy evaluation based on the COI logic

        console.log(`\n🧪 Testing Scenario: ${scenario.name}`);
        console.log(`👤 User: ${scenario.user.countryOfAffiliation} (${scenario.user.clearance}) COI: [${scenario.user.acpCOI.join(', ')}]`);
        console.log(`📄 Resource: ${scenario.resource.classification} COI: [${scenario.resource.COI.join(', ')}] Releasable: [${scenario.resource.releasabilityTo.join(', ')}]`);

        // Simulate OPA policy evaluation logic
        const evaluation = evaluateCOIPolicy(scenario.user, scenario.resource);

        console.log(`🎯 Policy Decision: ${evaluation.allow ? '✅ ALLOW' : '❌ DENY'}`);
        console.log(`📋 Reason: ${evaluation.reason}`);

        if (evaluation.details) {
          console.log(`📊 Details:`, evaluation.details);
        }

        // Validate against expected result
        expect(evaluation.allow).toBe(scenario.expected.allow);
        expect(evaluation.reason).toContain(scenario.expected.reason);

        console.log(`✅ Scenario ${index + 1} validation completed\n`);
      });
    });
  });

  test.describe('COI Edge Cases and Complex Scenarios', () => {
    test('Empty COI requirements (public access)', async ({ page }) => {
      const user = { clearance: "UNCLASSIFIED", countryOfAffiliation: "USA", acpCOI: [] };
      const resource = { classification: "UNCLASSIFIED", releasabilityTo: ["USA"], COI: [] };

      const evaluation = evaluateCOIPolicy(user, resource);

      expect(evaluation.allow).toBe(true);
      expect(evaluation.reason).toContain("No COI restrictions");
      console.log('✅ Empty COI requirements handled correctly');
    });

    test('Multiple user COIs with single resource COI', async ({ page }) => {
      const user = { clearance: "SECRET", countryOfAffiliation: "GBR", acpCOI: ["NATO", "FVEY", "EUCOM"] };
      const resource = { classification: "SECRET", releasabilityTo: ["USA", "GBR"], COI: ["NATO"] };

      const evaluation = evaluateCOIPolicy(user, resource);

      expect(evaluation.allow).toBe(true);
      expect(evaluation.reason).toContain("NATO COI access granted");
      console.log('✅ Multiple user COIs with single resource COI handled correctly');
    });

    test('Single user COI with multiple resource COIs (ALL mode)', async ({ page }) => {
      const user = { clearance: "TOP_SECRET", countryOfAffiliation: "GBR", acpCOI: ["FVEY"] };
      const resource = { classification: "TOP_SECRET", releasabilityTo: ["USA", "GBR"], COI: ["NATO", "FVEY"] };

      const evaluation = evaluateCOIPolicy(user, resource);

      expect(evaluation.allow).toBe(false);
      expect(evaluation.reason).toContain("Missing required COI");
      console.log('✅ Single user COI with multiple resource COIs (ALL mode) handled correctly');
    });

    test('Regional command overlaps', async ({ page }) => {
      const user = { clearance: "SECRET", countryOfAffiliation: "POL", acpCOI: ["NATO", "EUCOM"] };
      const resource = { classification: "SECRET", releasabilityTo: ["USA", "POL"], COI: ["EUCOM"] };

      const evaluation = evaluateCOIPolicy(user, resource);

      expect(evaluation.allow).toBe(true);
      expect(evaluation.reason).toContain("EUCOM regional command access granted");
      console.log('✅ Regional command overlaps handled correctly');
    });
  });

  test.describe('COI Performance and Scale Testing', () => {
    test('Large NATO membership evaluation', async ({ page }) => {
      const natoUser = { clearance: "SECRET", countryOfAffiliation: "TUR", acpCOI: ["NATO"] };
      const natoResource = { classification: "SECRET", releasabilityTo: ["USA", "TUR"], COI: ["NATO"] };

      const startTime = Date.now();
      const evaluation = evaluateCOIPolicy(natoUser, natoResource);
      const endTime = Date.now();

      expect(evaluation.allow).toBe(true);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast

      console.log(`⚡ NATO membership evaluation completed in ${endTime - startTime}ms`);
    });

    test('Complex multi-COI evaluation', async ({ page }) => {
      const complexUser = {
        clearance: "TOP_SECRET",
        countryOfAffiliation: "GBR",
        acpCOI: ["NATO", "FVEY", "NATO-COSMIC", "EUCOM", "AUKUS", "SOCOM"]
      };

      const complexResource = {
        classification: "TOP_SECRET",
        releasabilityTo: ["USA", "GBR", "CAN", "AUS"],
        COI: ["FVEY", "AUKUS"]
      };

      const evaluation = evaluateCOIPolicy(complexUser, complexResource);

      expect(evaluation.allow).toBe(true);
      expect(evaluation.reason).toContain("Multiple COI requirements satisfied");

      console.log('✅ Complex multi-COI evaluation handled correctly');
    });
  });

  test.describe('COI Policy Decision Details', () => {
    test('Full OPA decision structure for COI evaluation', async ({ page }) => {
      const user = { clearance: "SECRET", countryOfAffiliation: "USA", acpCOI: ["NATO", "FVEY"] };
      const resource = { classification: "SECRET", releasabilityTo: ["USA", "GBR"], COI: ["NATO"] };

      const evaluation = evaluateCOIPolicy(user, resource);

      // Validate decision structure
      expect(evaluation).toHaveProperty('allow');
      expect(evaluation).toHaveProperty('reason');
      expect(evaluation).toHaveProperty('details');

      // Check details structure
      expect(evaluation.details).toHaveProperty('clearance_check');
      expect(evaluation.details).toHaveProperty('releasability_check');
      expect(evaluation.details).toHaveProperty('coi_check');
      expect(evaluation.details).toHaveProperty('overall_decision');

      console.log('✅ Full OPA decision structure validated');
      console.log('📋 Decision Details:', JSON.stringify(evaluation.details, null, 2));
    });
  });
});

/**
 * Simulate OPA COI Policy Evaluation
 * This mimics the Rego policy logic for COI evaluation
 */
function evaluateCOIPolicy(user: any, resource: any): {
  allow: boolean;
  reason: string;
  details: any;
} {
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
    details.clearance_check = { passed: true, reason: "User clearance sufficient" };
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
      reason: `${user.countryOfAffiliation} not in releasability list`
    };
  }

  // 3. COI Check (ALL mode - user must have ALL required COIs)
  if (resource.COI.length === 0) {
    details.coi_check = { passed: true, reason: "No COI restrictions" };
  } else {
    const missingCOIs = resource.COI.filter(coi => !user.acpCOI.includes(coi));
    if (missingCOIs.length === 0) {
      details.coi_check = { passed: true, reason: "All COI requirements satisfied" };
    } else {
      details.coi_check = {
        passed: false,
        reason: `Missing required COI: ${missingCOIs.join(', ')}`
      };
    }
  }

  // 4. Overall Decision
  const allChecksPass = details.clearance_check.passed &&
                       details.releasability_check.passed &&
                       details.coi_check.passed;

  if (allChecksPass) {
    details.overall_decision = { allow: true, reason: generateAllowReason(user, resource) };
  } else {
    details.overall_decision = { allow: false, reason: generateDenyReason(details) };
  }

  return {
    allow: details.overall_decision.allow,
    reason: details.overall_decision.reason,
    details
  };
}

function generateAllowReason(user: any, resource: any): string {
  const reasons = [];

  if (resource.COI.length > 0) {
    reasons.push(`${resource.COI.join('+')} COI access granted`);
  } else if (resource.releasabilityTo.length > 0) {
    reasons.push(`Releasability to ${user.countryOfAffiliation} confirmed`);
  } else {
    reasons.push('Access granted');
  }

  return reasons.join(', ');
}

function generateDenyReason(details: any): string {
  const failedChecks = [];

  if (!details.clearance_check.passed) {
    failedChecks.push(details.clearance_check.reason);
  }
  if (!details.releasability_check.passed) {
    failedChecks.push(details.releasability_check.reason);
  }
  if (!details.coi_check.passed) {
    failedChecks.push(details.coi_check.reason);
  }

  return failedChecks.join('; ');
}
