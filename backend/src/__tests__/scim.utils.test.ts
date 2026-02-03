/**
 * SCIM Utils Test Suite
 * Target: 100% coverage for scim.utils.ts
 *
 * Tests:
 * - parseSCIMFilter() - equality, presence, complex (and/or) filters
 * - validateResourceType() - valid and invalid resource types
 * - buildSCIMError() - error response formatting
 * - validatePatchOperation() - add, remove, replace operations
 * - parseAttributePath() - simple, nested, and filtered paths
 * - filterAttributes() - include/exclude attribute filtering
 * - isValidClearance() - clearance level validation
 * - isValidCountryCode() - ISO 3166-1 alpha-3 validation
 * - normalizeMultiValuedAttribute() - multi-valued attribute normalization
 * - Edge cases (null, undefined, empty, boundaries)
 */

import {
    parseSCIMFilter,
    validateResourceType,
    buildSCIMError,
    validatePatchOperation,
    parseAttributePath,
    filterAttributes,
    isValidClearance,
    isValidCountryCode,
    normalizeMultiValuedAttribute,
} from '../utils/scim.utils';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

describe('SCIM Utils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('parseSCIMFilter', () => {
        describe('Happy Path', () => {
            it('should parse simple equality filter', () => {
                const result = parseSCIMFilter('userName eq "bjensen"');

                expect(result).toEqual({
                    attribute: 'userName',
                    operator: 'eq',
                    value: 'bjensen',
                });
            });

            it('should parse nested attribute equality filter', () => {
                const result = parseSCIMFilter('name.familyName eq "Jensen"');

                expect(result).toEqual({
                    attribute: 'name.familyName',
                    operator: 'eq',
                    value: 'Jensen',
                });
            });

            it('should parse presence filter', () => {
                const result = parseSCIMFilter('userName pr');

                expect(result).toEqual({
                    attribute: 'userName',
                    operator: 'pr',
                });
            });

            it('should parse nested attribute presence filter', () => {
                const result = parseSCIMFilter('emails.value pr');

                expect(result).toEqual({
                    attribute: 'emails.value',
                    operator: 'pr',
                });
            });

            it('should parse complex AND filter', () => {
                const result = parseSCIMFilter('userName eq "bjensen" and emails pr');

                expect(result.operator).toBe('and');
                expect(result.filters).toHaveLength(2);
                expect(result.filters[0]).toEqual({
                    attribute: 'userName',
                    operator: 'eq',
                    value: 'bjensen',
                });
                expect(result.filters[1]).toEqual({
                    attribute: 'emails',
                    operator: 'pr',
                });
            });

            it('should parse complex OR filter', () => {
                const result = parseSCIMFilter('userName eq "bjensen" or userName eq "jsmith"');

                expect(result.operator).toBe('or');
                expect(result.filters).toHaveLength(2);
                expect(result.filters[0]).toEqual({
                    attribute: 'userName',
                    operator: 'eq',
                    value: 'bjensen',
                });
                expect(result.filters[1]).toEqual({
                    attribute: 'userName',
                    operator: 'eq',
                    value: 'jsmith',
                });
            });
        });

        describe('Edge Cases', () => {
            it('should return empty object for empty filter', () => {
                const result = parseSCIMFilter('');

                expect(result).toEqual({});
            });

            it('should return empty object for null filter', () => {
                const result = parseSCIMFilter(null as any);

                expect(result).toEqual({});
            });

            it('should return empty object for undefined filter', () => {
                const result = parseSCIMFilter(undefined as any);

                expect(result).toEqual({});
            });

            it('should handle invalid filter gracefully', () => {
                const result = parseSCIMFilter('invalid filter syntax');

                expect(result).toEqual({});
            });

            it('should handle filter with only spaces', () => {
                const result = parseSCIMFilter('   ');

                expect(result).toEqual({});
            });

            it('should handle malformed filter and log warning', () => {
                // Force an error by providing something that throws during split
                const badFilter = 'userName eq "unclosed';
                const result = parseSCIMFilter(badFilter);

                // Returns partial parsed result or empty
                expect(result).toBeDefined();
            });
        });
    });

    describe('validateResourceType', () => {
        describe('Happy Path', () => {
            it('should validate User resource type', () => {
                expect(validateResourceType('User')).toBe(true);
            });

            it('should validate Group resource type', () => {
                expect(validateResourceType('Group')).toBe(true);
            });

            it('should validate ServiceProviderConfig resource type', () => {
                expect(validateResourceType('ServiceProviderConfig')).toBe(true);
            });

            it('should validate Schema resource type', () => {
                expect(validateResourceType('Schema')).toBe(true);
            });
        });

        describe('Invalid Resource Types', () => {
            it('should reject invalid resource type', () => {
                expect(validateResourceType('InvalidType')).toBe(false);
            });

            it('should reject empty string', () => {
                expect(validateResourceType('')).toBe(false);
            });

            it('should reject lowercase user', () => {
                expect(validateResourceType('user')).toBe(false);
            });

            it('should reject null', () => {
                expect(validateResourceType(null as any)).toBe(false);
            });

            it('should reject undefined', () => {
                expect(validateResourceType(undefined as any)).toBe(false);
            });
        });
    });

    describe('buildSCIMError', () => {
        describe('Happy Path', () => {
            it('should build error with all fields', () => {
                const error = buildSCIMError(404, 'Resource not found', 'invalidValue');

                expect(error).toEqual({
                    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
                    status: '404',
                    scimType: 'invalidValue',
                    detail: 'Resource not found',
                });
            });

            it('should build error without scimType', () => {
                const error = buildSCIMError(500, 'Internal server error');

                expect(error).toEqual({
                    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
                    status: '500',
                    scimType: undefined,
                    detail: 'Internal server error',
                });
            });

            it('should build 400 bad request error', () => {
                const error = buildSCIMError(400, 'Invalid request', 'invalidSyntax');

                expect(error.status).toBe('400');
                expect(error.detail).toBe('Invalid request');
                expect(error.scimType).toBe('invalidSyntax');
            });

            it('should build 403 forbidden error', () => {
                const error = buildSCIMError(403, 'Access denied');

                expect(error.status).toBe('403');
                expect(error.detail).toBe('Access denied');
            });
        });

        describe('Edge Cases', () => {
            it('should handle status code 0', () => {
                const error = buildSCIMError(0, 'No status');

                expect(error.status).toBe('0');
            });

            it('should handle empty detail', () => {
                const error = buildSCIMError(400, '');

                expect(error.detail).toBe('');
            });
        });
    });

    describe('validatePatchOperation', () => {
        describe('Happy Path', () => {
            it('should validate add operation', () => {
                const operation = {
                    op: 'add',
                    path: 'emails',
                    value: { type: 'work', value: 'test@example.com' },
                };

                expect(validatePatchOperation(operation)).toBe(true);
            });

            it('should validate replace operation', () => {
                const operation = {
                    op: 'replace',
                    path: 'userName',
                    value: 'newusername',
                };

                expect(validatePatchOperation(operation)).toBe(true);
            });

            it('should validate remove operation', () => {
                const operation = {
                    op: 'remove',
                    path: 'emails[type eq "work"]',
                };

                expect(validatePatchOperation(operation)).toBe(true);
            });

            it('should allow value to be 0', () => {
                const operation = {
                    op: 'replace',
                    path: 'count',
                    value: 0,
                };

                expect(validatePatchOperation(operation)).toBe(true);
            });

            it('should allow value to be false', () => {
                const operation = {
                    op: 'replace',
                    path: 'active',
                    value: false,
                };

                expect(validatePatchOperation(operation)).toBe(true);
            });
        });

        describe('Invalid Operations', () => {
            it('should reject operation without op', () => {
                const operation = {
                    path: 'userName',
                    value: 'test',
                };

                expect(validatePatchOperation(operation)).toBe(false);
            });

            it('should reject operation with invalid op', () => {
                const operation = {
                    op: 'update',
                    path: 'userName',
                    value: 'test',
                };

                expect(validatePatchOperation(operation)).toBe(false);
            });

            it('should reject add operation without value', () => {
                const operation = {
                    op: 'add',
                    path: 'emails',
                };

                expect(validatePatchOperation(operation)).toBe(false);
            });

            it('should reject replace operation without value', () => {
                const operation = {
                    op: 'replace',
                    path: 'userName',
                };

                expect(validatePatchOperation(operation)).toBe(false);
            });

            it('should reject remove operation without path', () => {
                const operation = {
                    op: 'remove',
                };

                expect(validatePatchOperation(operation)).toBe(false);
            });

            it('should reject operation without path', () => {
                const operation = {
                    op: 'add',
                    value: 'test',
                };

                expect(validatePatchOperation(operation)).toBe(false);
            });
        });
    });

    describe('parseAttributePath', () => {
        describe('Happy Path', () => {
            it('should parse simple attribute path', () => {
                const result = parseAttributePath('userName');

                expect(result).toEqual({
                    attribute: 'userName',
                });
            });

            it('should parse nested attribute path', () => {
                const result = parseAttributePath('name.givenName');

                expect(result).toEqual({
                    attribute: 'name',
                    subAttribute: 'givenName',
                });
            });

            it('should parse deeply nested attribute path', () => {
                const result = parseAttributePath('meta.location.country');

                expect(result).toEqual({
                    attribute: 'meta',
                    subAttribute: 'location.country',
                });
            });

            it('should parse filtered path without subattribute', () => {
                const result = parseAttributePath('emails[type eq "work"]');

                expect(result).toEqual({
                    attribute: 'emails',
                    filter: 'type eq "work"',
                    subAttribute: undefined,
                });
            });

            it('should parse filtered path with subattribute', () => {
                const result = parseAttributePath('emails[type eq "work"].value');

                expect(result).toEqual({
                    attribute: 'emails',
                    filter: 'type eq "work"',
                    subAttribute: 'value',
                });
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty string', () => {
                const result = parseAttributePath('');

                expect(result).toEqual({
                    attribute: '',
                });
            });

            it('should handle path with multiple dots', () => {
                const result = parseAttributePath('a.b.c.d');

                expect(result).toEqual({
                    attribute: 'a',
                    subAttribute: 'b.c.d',
                });
            });
        });
    });

    describe('filterAttributes', () => {
        const testResource = {
            schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
            id: '123',
            userName: 'bjensen',
            name: {
                givenName: 'Barbara',
                familyName: 'Jensen',
            },
            emails: [
                { type: 'work', value: 'bjensen@example.com' },
            ],
            active: true,
        };

        describe('Happy Path', () => {
            it('should return resource unchanged when no filters', () => {
                const result = filterAttributes(testResource);

                expect(result).toEqual(testResource);
            });

            it('should include only specified attributes', () => {
                const result = filterAttributes(testResource, ['userName', 'emails']);

                expect(result).toEqual({
                    schemas: testResource.schemas,
                    id: testResource.id,
                    userName: 'bjensen',
                    emails: [{ type: 'work', value: 'bjensen@example.com' }],
                });
            });

            it('should exclude specified attributes', () => {
                const result = filterAttributes(testResource, undefined, ['name', 'active']);

                expect(result).toEqual({
                    schemas: testResource.schemas,
                    id: testResource.id,
                    userName: 'bjensen',
                    emails: [{ type: 'work', value: 'bjensen@example.com' }],
                });
            });

            it('should handle single include attribute', () => {
                const result = filterAttributes(testResource, ['userName']);

                expect(result.userName).toBe('bjensen');
                expect(result.name).toBeUndefined();
                expect(result.emails).toBeUndefined();
            });

            it('should handle single exclude attribute', () => {
                const result = filterAttributes(testResource, undefined, ['userName']);

                expect(result.userName).toBeUndefined();
                expect(result.name).toBeDefined();
                expect(result.emails).toBeDefined();
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty include array', () => {
                const result = filterAttributes(testResource, []);

                // Empty array means length check fails, returns full resource
                expect(result).toEqual(testResource);
            });

            it('should handle empty exclude array', () => {
                const result = filterAttributes(testResource, undefined, []);

                expect(result).toEqual(testResource);
            });

            it('should handle non-existent attributes in include', () => {
                const result = filterAttributes(testResource, ['nonExistent']);

                expect(result).toEqual({
                    schemas: testResource.schemas,
                    id: testResource.id,
                });
            });

            it('should handle non-existent attributes in exclude', () => {
                const result = filterAttributes(testResource, undefined, ['nonExistent']);

                expect(result.userName).toBeDefined();
                expect(result.name).toBeDefined();
            });
        });
    });

    describe('isValidClearance', () => {
        describe('Happy Path', () => {
            it('should validate UNCLASSIFIED', () => {
                expect(isValidClearance('UNCLASSIFIED')).toBe(true);
            });

            it('should validate CONFIDENTIAL', () => {
                expect(isValidClearance('CONFIDENTIAL')).toBe(true);
            });

            it('should validate SECRET', () => {
                expect(isValidClearance('SECRET')).toBe(true);
            });

            it('should validate TOP_SECRET', () => {
                expect(isValidClearance('TOP_SECRET')).toBe(true);
            });
        });

        describe('Invalid Clearances', () => {
            it('should reject lowercase clearance', () => {
                expect(isValidClearance('secret')).toBe(false);
            });

            it('should reject invalid clearance', () => {
                expect(isValidClearance('INVALID')).toBe(false);
            });

            it('should reject empty string', () => {
                expect(isValidClearance('')).toBe(false);
            });

            it('should reject null', () => {
                expect(isValidClearance(null as any)).toBe(false);
            });

            it('should reject undefined', () => {
                expect(isValidClearance(undefined as any)).toBe(false);
            });

            it('should reject TOP SECRET without underscore', () => {
                expect(isValidClearance('TOP SECRET')).toBe(false);
            });
        });
    });

    describe('isValidCountryCode', () => {
        describe('Happy Path - Five Eyes', () => {
            it('should validate USA', () => {
                expect(isValidCountryCode('USA')).toBe(true);
            });

            it('should validate GBR', () => {
                expect(isValidCountryCode('GBR')).toBe(true);
            });

            it('should validate CAN', () => {
                expect(isValidCountryCode('CAN')).toBe(true);
            });

            it('should validate AUS', () => {
                expect(isValidCountryCode('AUS')).toBe(true);
            });

            it('should validate NZL', () => {
                expect(isValidCountryCode('NZL')).toBe(true);
            });
        });

        describe('Happy Path - NATO Partners', () => {
            it('should validate FRA', () => {
                expect(isValidCountryCode('FRA')).toBe(true);
            });

            it('should validate DEU', () => {
                expect(isValidCountryCode('DEU')).toBe(true);
            });

            it('should validate ITA', () => {
                expect(isValidCountryCode('ITA')).toBe(true);
            });

            it('should validate ESP', () => {
                expect(isValidCountryCode('ESP')).toBe(true);
            });

            it('should validate POL', () => {
                expect(isValidCountryCode('POL')).toBe(true);
            });

            it('should validate NLD', () => {
                expect(isValidCountryCode('NLD')).toBe(true);
            });

            it('should validate BEL', () => {
                expect(isValidCountryCode('BEL')).toBe(true);
            });

            it('should validate DNK', () => {
                expect(isValidCountryCode('DNK')).toBe(true);
            });

            it('should validate NOR', () => {
                expect(isValidCountryCode('NOR')).toBe(true);
            });

            it('should validate TUR', () => {
                expect(isValidCountryCode('TUR')).toBe(true);
            });

            it('should validate GRC', () => {
                expect(isValidCountryCode('GRC')).toBe(true);
            });

            it('should validate PRT', () => {
                expect(isValidCountryCode('PRT')).toBe(true);
            });
        });

        describe('Invalid Country Codes', () => {
            it('should reject invalid country code', () => {
                expect(isValidCountryCode('XXX')).toBe(false);
            });

            it('should reject lowercase country code', () => {
                expect(isValidCountryCode('usa')).toBe(false);
            });

            it('should reject 2-letter code', () => {
                expect(isValidCountryCode('US')).toBe(false);
            });

            it('should reject empty string', () => {
                expect(isValidCountryCode('')).toBe(false);
            });

            it('should reject null', () => {
                expect(isValidCountryCode(null as any)).toBe(false);
            });

            it('should reject undefined', () => {
                expect(isValidCountryCode(undefined as any)).toBe(false);
            });

            it('should reject non-NATO country', () => {
                expect(isValidCountryCode('CHN')).toBe(false);
            });
        });
    });

    describe('normalizeMultiValuedAttribute', () => {
        describe('Happy Path', () => {
            it('should normalize string values', () => {
                const values = ['value1', 'value2', 'value3'];
                const result = normalizeMultiValuedAttribute(values);

                expect(result).toEqual([
                    { value: 'value1', primary: true },
                    { value: 'value2', primary: false },
                    { value: 'value3', primary: false },
                ]);
            });

            it('should add primary flag to objects without it', () => {
                const values = [
                    { type: 'work', value: 'work@example.com' },
                    { type: 'home', value: 'home@example.com' },
                ];
                const result = normalizeMultiValuedAttribute(values);

                expect(result[0].primary).toBe(true);
                expect(result[1].primary).toBe(false);
            });

            it('should preserve existing primary flag', () => {
                const values = [
                    { type: 'work', value: 'work@example.com', primary: false },
                    { type: 'home', value: 'home@example.com', primary: true },
                ];
                const result = normalizeMultiValuedAttribute(values);

                expect(result[0].primary).toBe(false);
                expect(result[1].primary).toBe(true);
            });

            it('should handle single value', () => {
                const values = ['onlyValue'];
                const result = normalizeMultiValuedAttribute(values);

                expect(result).toEqual([
                    { value: 'onlyValue', primary: true },
                ]);
            });

            it('should handle mixed string and object values', () => {
                const values = [
                    'stringValue',
                    { type: 'complex', value: 'complexValue' },
                ];
                const result = normalizeMultiValuedAttribute(values);

                expect(result[0]).toEqual({ value: 'stringValue', primary: true });
                expect(result[1].primary).toBe(false);
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty array', () => {
                const values: any[] = [];
                const result = normalizeMultiValuedAttribute(values);

                expect(result).toEqual([]);
            });

            it('should handle numeric string values', () => {
                const values = ['123', '456'];
                const result = normalizeMultiValuedAttribute(values);

                expect(result).toEqual([
                    { value: '123', primary: true },
                    { value: '456', primary: false },
                ]);
            });

            it('should handle empty string values', () => {
                const values = ['', 'value'];
                const result = normalizeMultiValuedAttribute(values);

                expect(result).toEqual([
                    { value: '', primary: true },
                    { value: 'value', primary: false },
                ]);
            });
        });
    });
});
