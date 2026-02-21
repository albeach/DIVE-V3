/**
 * Federation Trace: GBR -> USA
 *
 * Automates the GBR IdP login against the USA hub broker, captures the auth code,
 * exchanges it for tokens, and prints decoded claims (access token, ID token, userinfo).
 *
 * Prereqs:
 *   - Playwright installed (dev dependency in repo)
 *   - USA hub running locally on 3000/8443, GBR IdP on 8446
 *   - Env: KEYCLOAK_CLIENT_SECRET=<hub broker client secret> (for dive-v3-broker-usa)
 *
 * Run:
 *   KEYCLOAK_CLIENT_SECRET=... npx ts-node scripts/tests/federation-trace-gbr-to-usa.ts
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';

// Use built-in fetch (Node 18+)
const fetchFn: typeof fetch = (...args: Parameters<typeof fetch>) =>
    (globalThis.fetch as any)(...args) as ReturnType<typeof fetch>;

// Broker auth entrypoint (hub) and the broker endpoint redirect (what Keycloak uses when acting as a broker).
const HUB_AUTH_URL =
    'https://localhost:8443/realms/dive-v3-broker-usa/protocol/openid-connect/auth?response_type=code&client_id=dive-v3-broker-usa&redirect_uri=https%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fcallback%2Fkeycloak&scope=openid+profile+email&kc_idp_hint=gbr-federation';
const HUB_BROKER_ENDPOINT_REDIRECT =
    'https://localhost:8443/realms/dive-v3-broker-usa/broker/gbr-federation/endpoint';

const HUB_TOKEN_URL =
    'https://localhost:8443/realms/dive-v3-broker-usa/protocol/openid-connect/token';
const GBR_TOKEN_URL =
    'https://localhost:8446/realms/dive-v3-broker-gbr/protocol/openid-connect/token';
const HUB_ADMIN_TOKEN_URL =
    'https://localhost:8443/realms/master/protocol/openid-connect/token';
const HUB_CLIENTS_URL =
    'https://localhost:8443/admin/realms/dive-v3-broker-usa/clients';
// For code exchange: default to the real frontend callback; allow override via env.
const REDIRECT_URI =
    process.env.REDIRECT_URI ?? 'https://localhost:3000/api/auth/callback/keycloak';

const USERNAME = process.env.TEST_USERNAME ?? 'testuser-gbr-1';
const PASSWORD = process.env.TEST_PASSWORD ?? 'TestUser2025!Pilot';
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin';
let ADMIN_PASS = process.env.KEYCLOAK_ADMIN_PASSWORD ?? null;
const CLIENT_ID = 'dive-v3-broker-usa';

function decodeJwt(jwt: string) {
    const [, payload] = jwt.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(normalized, 'base64').toString('utf8');
    return JSON.parse(json);
}

function tryDockerEnv(container: string, envVar: string): string | null {
    try {
        const val = execSync(`docker exec ${container} printenv ${envVar}`, {
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
            timeout: 2000,
        }).trim();
        return val || null;
    } catch {
        return null;
    }
}

async function getAdminToken() {
    if (!ADMIN_PASS) {
        ADMIN_PASS = tryDockerEnv('dive-v3-keycloak', 'KEYCLOAK_ADMIN_PASSWORD') ?? ADMIN_PASS;
    }
    if (!ADMIN_PASS) return null;
    const body = new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: ADMIN_USER,
        password: ADMIN_PASS,
    });
    const res = await fetchFn(HUB_ADMIN_TOKEN_URL, { method: 'POST', body });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
}

async function getClientSecretFromAdmin(): Promise<string | null> {
    const token = await getAdminToken();
    if (!token) return null;
    const listRes = await fetchFn(`${HUB_CLIENTS_URL}?clientId=${CLIENT_ID}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) return null;
    const list = (await listRes.json()) as Array<{ id: string }>;
    const id = list[0]?.id;
    if (!id) return null;
    const secRes = await fetchFn(`${HUB_CLIENTS_URL}/${id}/client-secret`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!secRes.ok) return null;
    const sec = (await secRes.json()) as { value?: string };
    return sec.value ?? null;
}

async function exchangeCode(code: string) {
    // Primary attempt: exchange at hub for the broker client (expected final tokens).
    let clientSecret: string | null = process.env.KEYCLOAK_CLIENT_SECRET ?? null;
    if (!clientSecret) {
        clientSecret = await getClientSecretFromAdmin();
    }
    console.log('Exchange attempt #1 (hub):', {
        token_url: HUB_TOKEN_URL,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_prefix: code.substring(0, 12),
        client_secret_len: clientSecret?.length ?? 0,
    });
    const primaryBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code,
    });
    if (clientSecret) {
        primaryBody.set('client_secret', clientSecret);
    }
    const primaryRes = await fetchFn(HUB_TOKEN_URL, {
        method: 'POST',
        body: primaryBody,
    });
    const primaryText = await primaryRes.text();
    if (primaryRes.ok) {
        return JSON.parse(primaryText);
    }
    console.warn('Primary exchange failed:', primaryRes.status, primaryRes.statusText, primaryText);

    // Fallback: exchange against GBR IdP using its federation client (public) to debug code validity.
    console.log('Exchange attempt #2 (GBR IdP for diagnostics):', {
        token_url: GBR_TOKEN_URL,
        client_id: 'dive-v3-usa-federation',
        redirect_uri: HUB_BROKER_ENDPOINT_REDIRECT,
        code_prefix: code.substring(0, 12),
    });
    const fallbackBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'dive-v3-usa-federation',
        redirect_uri: HUB_BROKER_ENDPOINT_REDIRECT,
        code,
    });
    const fallbackRes = await fetchFn(GBR_TOKEN_URL, { method: 'POST', body: fallbackBody });
    const fallbackText = await fallbackRes.text();
    if (fallbackRes.ok) {
        return JSON.parse(fallbackText);
    }

    throw new Error(
        `Token exchange failed. Primary: ${primaryRes.status} ${primaryRes.statusText} - ${primaryText}. ` +
        `Fallback: ${fallbackRes.status} ${fallbackRes.statusText} - ${fallbackText}`
    );
}

async function loginAndCaptureCode(page: any): Promise<string> {
    console.log('Navigating directly to hub auth with GBR hint (bypassing NextAuth state)...');
    await page.goto(HUB_AUTH_URL, { waitUntil: 'networkidle' });
    console.log('At hub auth URL:', page.url());

    // Wait for redirect to GBR IdP login
    await page.waitForURL(/dive-v3-broker-gbr/, { timeout: 15000 });
    console.log('At GBR IdP login:', page.url());

    // Prepare to capture the callback request (contains code)
    let brokerCode: string | null = null;
    let callbackCode: string | null = null;
    page.on('request', (req: any) => {
        const url = req.url();
        if (url.includes('/broker/gbr-federation/endpoint') && url.includes('code=')) {
            const code = new URL(url).searchParams.get('code');
            if (code) {
                brokerCode = code;
                console.log('Captured code from broker endpoint request:', code);
            }
        }
    });
    page.on('requestfinished', (req: any) => {
        const url = req.url();
        if (url.includes('/api/auth/callback/keycloak') && url.includes('code=')) {
            const code = new URL(url).searchParams.get('code');
            if (code) {
                callbackCode = code;
                console.log('Captured code from callback request:', code);
            }
        }
    });
    page.on('response', async (res: any) => {
        const url = res.url();
        if (url.includes('/broker/gbr-federation/endpoint') && url.includes('code=')) {
            const code = new URL(url).searchParams.get('code');
            if (code) {
                brokerCode = code;
                console.log('Captured code from broker endpoint response:', code);
            }
        }
    });

    // Fill credentials on GBR login form
    await page.fill('input[name="username"]', USERNAME);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('button[type="submit"]'),
    ]);

    const finalUrl = page.url();
    console.log('Post-login URL:', finalUrl);

    // If callback code not yet captured, give it a moment to appear
    if (!callbackCode) {
        try {
            const callbackReq = await page.waitForRequest(
                (req: any) => req.url().includes('/api/auth/callback/keycloak') && req.url().includes('code='),
                { timeout: 8000 }
            );
            const code = new URL(callbackReq.url()).searchParams.get('code');
            if (code) {
                callbackCode = code;
                console.log('Captured code from delayed callback request:', code);
            }
        } catch {
            // ignore timeout
        }
    }

    // As a fallback, wait for the browser to reach the callback URL directly.
    if (!callbackCode) {
        try {
            await page.waitForURL('https://localhost:3000/api/auth/callback/keycloak*', {
                timeout: 8000,
            });
            const urlObj = new URL(page.url());
            const code = urlObj.searchParams.get('code');
            if (code) {
                callbackCode = code;
                console.log('Captured code from callback URL after wait:', code);
            }
        } catch {
            // still nothing
        }
    }

    // Prefer callback code (client-facing); fall back to broker code if needed
    const selectedCode = callbackCode ?? brokerCode;
    if (selectedCode) {
        console.log(`Using ${callbackCode ? 'callback' : 'broker'} code for exchange.`);
        return selectedCode;
    }

    const urlObj = new URL(finalUrl);
    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');
    if (!code) {
        console.error('Page content on error:\n', await page.content());
        throw new Error(`No code param found in final URL: ${finalUrl} (error=${error ?? 'none'})`);
    }
    return code;
}

async function main() {
    console.log('Starting federation trace GBR -> USA...');
    console.log(`User: ${USERNAME}`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        ignoreHTTPSErrors: true,
    });

    try {
        const code = await loginAndCaptureCode(page);
        console.log(`Captured auth code: ${code}`);

        const tokens = await exchangeCode(code);
        console.log('Token response keys:', Object.keys(tokens));

        const { access_token, id_token } = tokens;
        if (access_token) {
            console.log('Decoded access_token claims:', decodeJwt(access_token));
        }
        if (id_token) {
            console.log('Decoded id_token claims:', decodeJwt(id_token));
        }

        // Optionally call userinfo
        if (access_token) {
            const uiRes = await fetchFn('https://localhost:8443/realms/dive-v3-broker-usa/protocol/openid-connect/userinfo', {
                method: 'GET',
                headers: { Authorization: `Bearer ${access_token}` },
            });
            const uiText = await uiRes.text();
            console.log('Userinfo status:', uiRes.status);
            console.log('Userinfo body:', uiText);
        }
    } catch (err) {
        console.error('Trace failed:', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

main();
