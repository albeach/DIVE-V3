/**
 * Health Check All Instances
 */

import axios from 'axios';

const INSTANCES = [
    { code: 'USA', backend: 'https://localhost:4000', keycloak: 'https://localhost:8443', frontend: 'https://localhost:3000' },
    { code: 'FRA', backend: 'https://localhost:4001', keycloak: 'https://localhost:8444', frontend: 'https://localhost:3001' },
    { code: 'GBR', backend: 'https://localhost:4002', keycloak: 'https://localhost:8445', frontend: 'https://localhost:3002' },
    { code: 'DEU', backend: 'https://deu-api.prosecurity.biz', keycloak: 'https://deu-idp.prosecurity.biz', frontend: 'https://deu-app.prosecurity.biz' }
];

const httpsAgent = new (require('https').Agent)({ rejectUnauthorized: false });

async function checkHealth(url: string, name: string): Promise<{ status: string; responseTime?: number }> {
    const start = Date.now();
    try {
        const response = await axios.get(url, {
            httpsAgent,
            timeout: 5000,
            validateStatus: () => true // Accept any status code
        });
        const responseTime = Date.now() - start;

        if (response.status >= 200 && response.status < 400) {
            return { status: `✅ ${response.status}`, responseTime };
        } else {
            return { status: `⚠️  ${response.status}`, responseTime };
        }
    } catch (error: any) {
        const responseTime = Date.now() - start;
        if (error.code === 'ECONNREFUSED') {
            return { status: '❌ Connection Refused', responseTime };
        } else if (error.code === 'ETIMEDOUT') {
            return { status: '❌ Timeout', responseTime };
        } else {
            return { status: `❌ ${error.message}`, responseTime };
        }
    }
}

async function checkInstance(instance: typeof INSTANCES[0]) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Instance: ${instance.code}`);
    console.log('='.repeat(60));

    // Backend Health
    console.log(`  Backend: ${instance.backend}/health`);
    const backendHealth = await checkHealth(`${instance.backend}/health`, 'Backend');
    console.log(`    ${backendHealth.status} (${backendHealth.responseTime}ms)`);

    // Keycloak Health
    console.log(`  Keycloak: ${instance.keycloak}/health`);
    const keycloakHealth = await checkHealth(`${instance.keycloak}/health`, 'Keycloak');
    console.log(`    ${keycloakHealth.status} (${keycloakHealth.responseTime}ms)`);

    // Frontend
    console.log(`  Frontend: ${instance.frontend}`);
    const frontendHealth = await checkHealth(instance.frontend, 'Frontend');
    console.log(`    ${frontendHealth.status} (${frontendHealth.responseTime}ms)`);

    return {
        code: instance.code,
        backend: backendHealth.status.includes('✅'),
        keycloak: keycloakHealth.status.includes('✅'),
        frontend: frontendHealth.status.includes('✅')
    };
}

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║     Health Check - All Instances                               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    const results = [];
    for (const instance of INSTANCES) {
        const result = await checkInstance(instance);
        results.push(result);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('HEALTH SUMMARY');
    console.log('='.repeat(60));

    results.forEach(r => {
        const backend = r.backend ? '✅' : '❌';
        const keycloak = r.keycloak ? '✅' : '❌';
        const frontend = r.frontend ? '✅' : '❌';
        console.log(`${r.code}: Backend=${backend} Keycloak=${keycloak} Frontend=${frontend}`);
    });
}

if (require.main === module) {
    main().catch(console.error);
}





