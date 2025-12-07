// @ts-nocheck
/**
 * Seed deterministic test users with clearance attributes and optional TOTP secrets.
 *
 * - Creates/updates users: testuser-{instance}-{1..4}
 * - Sets password to TESTUSER_PASSWORD (env) or default "TestUser2025!Pilot"
 * - Sets clearance/country/COI attributes
 * - Keeps CONFIGURE_TOTP required action ON so real MFA flow is exercised
 * - Stores TOTP secret as a user attribute if provided via env (for traceability)
 *
 * Usage:
 *   KEYCLOAK_URL=https://localhost:8443 \
 *   KEYCLOAK_ADMIN_PASSWORD=... \
 *   TESTUSER_USA_TOTP_SECRET=BASE32 \
 *   NODE_OPTIONS='-r ts-node/register' npx ts-node backend/src/scripts/seed-test-users-totp.ts
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

type Instance = 'USA' | 'FRA' | 'GBR' | 'DEU';

const REALM = 'dive-v3-broker';
const INSTANCES: Instance[] = ['USA', 'FRA', 'GBR', 'DEU'];
const PASSWORD = process.env.TESTUSER_PASSWORD || 'TestUser2025!Pilot';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://localhost:8443';
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD || 'DivePilot2025!SecureAdmin';

const TOTP_SECRETS: Partial<Record<Instance, string | undefined>> = {
  USA: process.env.TESTUSER_USA_TOTP_SECRET,
  FRA: process.env.TESTUSER_FRA_TOTP_SECRET,
  GBR: process.env.TESTUSER_GBR_TOTP_SECRET,
  DEU: process.env.TESTUSER_DEU_TOTP_SECRET,
};

interface ClearanceProfile {
  clearance: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
  coi: string[];
}

const CLEARANCE_LEVELS: Record<'1' | '2' | '3' | '4', ClearanceProfile> = {
  '1': { clearance: 'UNCLASSIFIED', coi: [] },
  '2': { clearance: 'CONFIDENTIAL', coi: [] },
  '3': { clearance: 'SECRET', coi: ['NATO'] },
  '4': { clearance: 'TOP_SECRET', coi: ['FVEY', 'NATO-COSMIC'] },
};

async function getAdminToken(): Promise<string> {
  const tokenUrl = `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`;
  const resp = await axios.post(
    tokenUrl,
    new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'admin',
      password: ADMIN_PASSWORD,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );
  return resp.data.access_token;
}

async function ensureUser(
  client: any,
  instance: Instance,
  level: '1' | '2' | '3' | '4',
): Promise<void> {
  const username = `testuser-${instance.toLowerCase()}-${level}`;
  const profile = CLEARANCE_LEVELS[level];

  const existing = await client.users.find({
    realm: REALM,
    username,
    exact: true,
  });

  let userId: string | undefined = existing?.[0]?.id;

  const baseUser: UserRepresentation = {
    username,
    email: `${username}@example.test`,
    enabled: true,
    firstName: 'Test',
    lastName: `${instance}-${level}`,
    attributes: {
      clearance: [profile.clearance],
      countryOfAffiliation: [instance],
      uniqueID: [username],
      userType: ['military'],
      organization: [`${instance} Defense`],
      organizationType: ['GOV'],
      pilot_user: ['true'],
      clearance_level: [level],
      coi: profile.coi,
    } as Record<string, any>,
  };

  // Store TOTP secret as attribute for audit (actual enrollment happens at login)
  const totpSecret = TOTP_SECRETS[instance];
  if (totpSecret) {
    const attrs = baseUser.attributes as Record<string, any>;
    attrs['totpSecretHint'] = [totpSecret];
  }

  if (userId) {
    await client.users.update({ realm: REALM, id: userId }, baseUser);
  } else {
    const created = await client.users.create({ ...baseUser, realm: REALM });
    userId = created.id;
  }

  if (!userId) {
    throw new Error(`Failed to ensure user ${username}`);
  }

  // Set password (skip if history blocks reuse)
  try {
    await client.users.resetPassword({
      realm: REALM,
      id: userId,
      credential: {
        temporary: false,
        type: 'password',
        value: PASSWORD,
      },
    });
  } catch (err: any) {
    if (err?.responseData?.error === 'invalidPasswordHistoryMessage') {
      console.warn(`    Password not changed due to history policy; continuing.`);
    } else {
      throw err;
    }
  }

  // Enforce TOTP required action for AAL > 1
  const requiredActions =
    profile.clearance === 'UNCLASSIFIED'
      ? []
      : ['CONFIGURE_TOTP'];

  await client.users.update({ realm: REALM, id: userId }, { requiredActions });
}

async function main() {
  console.log('Seeding deterministic test users with TOTP requirements');
  const client = new KcAdminClient({ baseUrl: KEYCLOAK_URL, realmName: 'master' });
  const token = await getAdminToken();
  await client.auth({
    username: 'admin',
    password: ADMIN_PASSWORD,
    grantType: 'password',
    clientId: 'admin-cli',
  });

  for (const instance of INSTANCES) {
    for (const level of ['1', '2', '3', '4'] as const) {
      await ensureUser(client, instance, level);
      console.log(`  ✓ ${instance} level ${level} seeded`);
    }
  }

  console.log('\nDone. NOTE: TOTP secrets (if provided) are stored as user attribute totpSecretHint; actual enrollment still occurs at login.');
  console.log('Provide env TESTUSER_<ISO3>_TOTP_SECRET to reuse the same secret during Playwright MFA handling.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export {};

