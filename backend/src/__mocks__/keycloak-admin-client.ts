/**
 * Mock for @keycloak/keycloak-admin-client
 * Used in Jest tests to avoid ESM import issues
 */

export class KeycloakAdminClient {
    private config: any = {};
    
    constructor(config?: any) {
        this.config = config || {};
    }
    
    setConfig(config: any) {
        this.config = { ...this.config, ...config };
    }
    
    async auth() {
        return Promise.resolve();
    }
    
    identityProviders = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ alias: 'test-idp' }),
        update: jest.fn().mockResolvedValue({}),
        del: jest.fn().mockResolvedValue({})
    };
    
    users = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0)
    };
    
    realms = {
        findOne: jest.fn().mockResolvedValue({ realm: 'test' })
    };
}

export default KeycloakAdminClient;
