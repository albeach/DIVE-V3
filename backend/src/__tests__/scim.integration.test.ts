/**
 * DIVE V3 SCIM 2.0 Integration Tests
 * Tests SCIM user provisioning with Keycloak integration
 */

import request from 'supertest';
import app from '../server';
import { SCIMService } from '../services/scim.service';
import { SPManagementService } from '../services/sp-management.service';
import { ISCIMUser } from '../types/sp-federation.types';
import { clearResourceServiceCache } from '../services/resource.service';
import { clearAuthzCaches } from '../middleware/authz.middleware';

// Mock services
jest.mock('../services/scim.service');
jest.mock('../services/sp-management.service');

describe('SCIM 2.0 Integration Tests', () => {
  const mockSP = {
    spId: 'SP-SCIM-001',
    name: 'Test SCIM Provider',
    organizationType: 'MILITARY' as const,
    country: 'GBR',
    clientId: 'sp-gbr-scim',
    clientSecret: 'test-scim-secret',
    clientType: 'confidential' as const,
    allowedScopes: ['scim:read', 'scim:write'],
    allowedGrantTypes: ['client_credentials'],
    status: 'ACTIVE' as const
  };

  const mockUser: ISCIMUser = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: 'user-123',
    externalId: 'ext-user-123',
    userName: 'john.doe@nato.int',
    name: {
      formatted: 'John Doe',
      familyName: 'Doe',
      givenName: 'John'
    },
    emails: [{
      value: 'john.doe@nato.int',
      type: 'work',
      primary: true
    }],
    active: true,
    "urn:dive:params:scim:schemas:extension:2.0:User": {
      clearance: 'SECRET',
      countryOfAffiliation: 'USA',
      acpCOI: ['NATO-COSMIC', 'FVEY'],
      dutyOrg: 'U.S. Army'
    },
    meta: {
      resourceType: "User",
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      version: "1"
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearAuthzCaches();
    clearResourceServiceCache();
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('GET /scim/v2/ServiceProviderConfig', () => {
    it('should return service provider configuration', async () => {
      const response = await request(app)
        .get('/scim/v2/ServiceProviderConfig')
        .expect(200);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        patch: { supported: true },
        bulk: { supported: false },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: true },
        etag: { supported: false },
        authenticationSchemes: expect.arrayContaining([
          expect.objectContaining({
            type: 'oauthbearertoken',
            name: 'OAuth Bearer Token'
          })
        ])
      });
    });
  });

  describe('GET /scim/v2/Schemas', () => {
    it('should return supported schemas', async () => {
      const response = await request(app)
        .get('/scim/v2/Schemas')
        .expect(200);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        Resources: expect.arrayContaining([
          expect.objectContaining({
            id: "urn:ietf:params:scim:schemas:core:2.0:User"
          }),
          expect.objectContaining({
            id: "urn:dive:params:scim:schemas:extension:2.0:User"
          })
        ])
      });
    });

    it('should return DIVE V3 extension schema', async () => {
      const response = await request(app)
        .get('/scim/v2/Schemas/urn:dive:params:scim:schemas:extension:2.0:User')
        .expect(200);

      expect(response.body).toMatchObject({
        id: "urn:dive:params:scim:schemas:extension:2.0:User",
        name: "DIVE V3 User Extension",
        attributes: expect.arrayContaining([
          expect.objectContaining({
            name: "clearance",
            type: "string",
            multiValued: false,
            required: true,
            canonicalValues: ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]
          }),
          expect.objectContaining({
            name: "countryOfAffiliation",
            type: "string",
            multiValued: false,
            required: true
          }),
          expect.objectContaining({
            name: "acpCOI",
            type: "string",
            multiValued: true,
            required: false
          })
        ])
      });
    });
  });

  describe('GET /scim/v2/Users', () => {
    beforeEach(() => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.searchUsers = jest.fn().mockResolvedValue({
        total: 1,
        items: [mockUser]
      });

      const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
      mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(mockSP);
    });

    it('should list users with pagination', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          startIndex: 1,
          count: 20
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: 1,
        startIndex: 1,
        itemsPerPage: 1,
        Resources: expect.arrayContaining([
          expect.objectContaining({
            userName: mockUser.userName,
            id: mockUser.id
          })
        ])
      });
    });

    it('should filter users by userName', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          filter: 'userName eq "john.doe@nato.int"'
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body.totalResults).toBeGreaterThanOrEqual(0);
    });

    it('should filter users by email', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          filter: 'emails[type eq "work"].value eq "john.doe@nato.int"'
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"]
      });
    });

    it('should reject requests without SCIM scope', async () => {
      const invalidSP = { ...mockSP, allowedScopes: ['resource:read'] };
      const mockSPService = SPManagementService as jest.MockedClass<typeof SPManagementService>;
      mockSPService.prototype.getByClientId = jest.fn().mockResolvedValue(invalidSP);

      const response = await request(app)
        .get('/scim/v2/Users')
        .set('Authorization', 'Bearer test-sp-token')
        .expect(403);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "403",
        detail: "Insufficient scope for SCIM operations"
      });
    });

    it('should support attribute projection', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          attributes: 'userName,emails'
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body.Resources).toBeDefined();
    });

    it('should support excluded attributes', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          excludedAttributes: 'emails'
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body.Resources).toBeDefined();
    });

    it('should support sorting', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          sortBy: 'userName',
          sortOrder: 'ascending'
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body.Resources).toBeDefined();
    });
  });

  describe('GET /scim/v2/Users/:id', () => {
    beforeEach(() => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.getUserById = jest.fn().mockResolvedValue(mockUser);
    });

    it('should return user by ID', async () => {
      const response = await request(app)
        .get('/scim/v2/Users/user-123')
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body).toMatchObject({
        id: mockUser.id,
        userName: mockUser.userName,
        "urn:dive:params:scim:schemas:extension:2.0:User": {
          clearance: 'SECRET',
          countryOfAffiliation: 'USA'
        }
      });
    });

    it('should return 404 for non-existent user', async () => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.getUserById = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .get('/scim/v2/Users/non-existent')
        .set('Authorization', 'Bearer test-sp-token')
        .expect(404);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "404",
        detail: "User not found"
      });
    });
  });

  describe('POST /scim/v2/Users', () => {
    beforeEach(() => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.createUser = jest.fn().mockResolvedValue(mockUser);
    });

    it('should create a new user', async () => {
      const newUser: Partial<ISCIMUser> = {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: 'jane.smith@nato.int',
        name: {
          givenName: 'Jane',
          familyName: 'Smith'
        },
        emails: [{
          value: 'jane.smith@nato.int',
          type: 'work',
          primary: true
        }],
        active: true,
        "urn:dive:params:scim:schemas:extension:2.0:User": {
          clearance: 'CONFIDENTIAL',
          countryOfAffiliation: 'GBR',
          acpCOI: ['NATO']
        }
      };

      const response = await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', 'Bearer test-sp-token')
        .send(newUser)
        .expect(201);

      expect(response.body).toMatchObject({
        userName: expect.any(String),
        id: expect.any(String),
        meta: expect.objectContaining({
          created: expect.any(String)
        })
      });
    });

    it('should reject user without required DIVE V3 attributes', async () => {
      const invalidUser = {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: 'invalid@test.com',
        // Missing DIVE V3 extension
      };

      const response = await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', 'Bearer test-sp-token')
        .send(invalidUser)
        .expect(400);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "400"
      });
    });

    it('should reject duplicate userName', async () => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.createUser = jest.fn().mockRejectedValue(
        new Error('User already exists')
      );

      const response = await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', 'Bearer test-sp-token')
        .send(mockUser)
        .expect(409);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "409",
        detail: expect.stringContaining('already exists')
      });
    });

    it('should validate clearance levels', async () => {
      const invalidUser = {
        ...mockUser,
        "urn:dive:params:scim:schemas:extension:2.0:User": {
          clearance: 'INVALID_LEVEL',
          countryOfAffiliation: 'USA'
        }
      };

      const response = await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', 'Bearer test-sp-token')
        .send(invalidUser)
        .expect(400);

      expect(response.body.status).toBe("400");
    });

    it('should validate country codes', async () => {
      const invalidUser = {
        ...mockUser,
        "urn:dive:params:scim:schemas:extension:2.0:User": {
          clearance: 'SECRET',
          countryOfAffiliation: 'INVALID'
        }
      };

      const response = await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', 'Bearer test-sp-token')
        .send(invalidUser)
        .expect(400);

      expect(response.body.status).toBe("400");
    });
  });

  describe('PUT /scim/v2/Users/:id', () => {
    beforeEach(() => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.updateUser = jest.fn().mockResolvedValue(mockUser);
    });

    it('should update existing user', async () => {
      const updatedUser = {
        ...mockUser,
        name: {
          ...mockUser.name,
          givenName: 'Jonathan'
        }
      };

      const response = await request(app)
        .put('/scim/v2/Users/user-123')
        .set('Authorization', 'Bearer test-sp-token')
        .send(updatedUser)
        .expect(200);

      expect(response.body).toMatchObject({
        id: mockUser.id,
        meta: expect.objectContaining({
          lastModified: expect.any(String)
        })
      });
    });

    it('should return 404 for non-existent user', async () => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.updateUser = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .put('/scim/v2/Users/non-existent')
        .set('Authorization', 'Bearer test-sp-token')
        .send(mockUser)
        .expect(404);

      expect(response.body.status).toBe("404");
    });
  });

  describe('PATCH /scim/v2/Users/:id', () => {
    beforeEach(() => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.patchUser = jest.fn().mockResolvedValue(mockUser);
    });

    it('should patch user with replace operation', async () => {
      const patchOp = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [
          {
            op: 'replace',
            path: 'active',
            value: false
          }
        ]
      };

      const response = await request(app)
        .patch('/scim/v2/Users/user-123')
        .set('Authorization', 'Bearer test-sp-token')
        .send(patchOp)
        .expect(200);

      expect(response.body.id).toBe(mockUser.id);
    });

    it('should patch user with add operation', async () => {
      const patchOp = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [
          {
            op: 'add',
            path: 'emails',
            value: [{
              value: 'john.doe.alt@nato.int',
              type: 'work',
              primary: false
            }]
          }
        ]
      };

      const response = await request(app)
        .patch('/scim/v2/Users/user-123')
        .set('Authorization', 'Bearer test-sp-token')
        .send(patchOp)
        .expect(200);

      expect(response.body.id).toBe(mockUser.id);
    });

    it('should patch user with remove operation', async () => {
      const patchOp = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [
          {
            op: 'remove',
            path: 'emails[type eq "work"]'
          }
        ]
      };

      const response = await request(app)
        .patch('/scim/v2/Users/user-123')
        .set('Authorization', 'Bearer test-sp-token')
        .send(patchOp)
        .expect(200);

      expect(response.body.id).toBe(mockUser.id);
    });

    it('should patch DIVE V3 extension attributes', async () => {
      const patchOp = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [
          {
            op: 'replace',
            path: 'urn:dive:params:scim:schemas:extension:2.0:User:clearance',
            value: 'TOP_SECRET'
          }
        ]
      };

      const response = await request(app)
        .patch('/scim/v2/Users/user-123')
        .set('Authorization', 'Bearer test-sp-token')
        .send(patchOp)
        .expect(200);

      expect(response.body.id).toBe(mockUser.id);
    });

    it('should reject invalid patch operations', async () => {
      const invalidPatch = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
        Operations: [
          {
            op: 'invalid',
            path: 'active',
            value: false
          }
        ]
      };

      const response = await request(app)
        .patch('/scim/v2/Users/user-123')
        .set('Authorization', 'Bearer test-sp-token')
        .send(invalidPatch)
        .expect(400);

      expect(response.body.status).toBe("400");
    });
  });

  describe('DELETE /scim/v2/Users/:id', () => {
    beforeEach(() => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.deleteUser = jest.fn().mockResolvedValue(true);
    });

    it('should delete user', async () => {
      const response = await request(app)
        .delete('/scim/v2/Users/user-123')
        .set('Authorization', 'Bearer test-sp-token')
        .expect(204);

      expect(response.body).toEqual({});
    });

    it('should return 404 for non-existent user', async () => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.deleteUser = jest.fn().mockResolvedValue(false);

      const response = await request(app)
        .delete('/scim/v2/Users/non-existent')
        .set('Authorization', 'Bearer test-sp-token')
        .expect(404);

      expect(response.body.status).toBe("404");
    });
  });

  describe('Keycloak Synchronization', () => {
    it('should sync user attributes to Keycloak', async () => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      const createSpy = jest.fn().mockResolvedValue(mockUser);
      mockSCIMService.prototype.createUser = createSpy;

      await request(app)
        .post('/scim/v2/Users')
        .set('Authorization', 'Bearer test-sp-token')
        .send(mockUser)
        .expect(201);

      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        userName: mockUser.userName,
        "urn:dive:params:scim:schemas:extension:2.0:User": expect.objectContaining({
          clearance: 'SECRET',
          countryOfAffiliation: 'USA'
        })
      }));
    });

    it('should map SCIM attributes to Keycloak attributes', async () => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.getUserById = jest.fn().mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/scim/v2/Users/user-123')
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      // Verify DIVE V3 attributes are present
      const diveAttrs = response.body["urn:dive:params:scim:schemas:extension:2.0:User"];
      expect(diveAttrs).toMatchObject({
        clearance: expect.any(String),
        countryOfAffiliation: expect.any(String),
        acpCOI: expect.any(Array)
      });
    });
  });

  describe('Bulk Operations', () => {
    it('should reject bulk operations (not supported)', async () => {
      const bulkOp = {
        schemas: ["urn:ietf:params:scim:api:messages:2.0:BulkRequest"],
        Operations: [
          {
            method: "POST",
            path: "/Users",
            bulkId: "user1",
            data: mockUser
          }
        ]
      };

      const response = await request(app)
        .post('/scim/v2/Bulk')
        .set('Authorization', 'Bearer test-sp-token')
        .send(bulkOp)
        .expect(501);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "501",
        detail: "Bulk operations not supported"
      });
    });
  });

  describe('Filter Parsing', () => {
    beforeEach(() => {
      const mockSCIMService = SCIMService as jest.MockedClass<typeof SCIMService>;
      mockSCIMService.prototype.searchUsers = jest.fn().mockResolvedValue({
        total: 0,
        items: []
      });
    });

    it('should parse simple equality filter', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          filter: 'userName eq "john.doe@nato.int"'
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body.totalResults).toBeGreaterThanOrEqual(0);
    });

    it('should parse complex filter with AND', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          filter: 'userName eq "john.doe@nato.int" and active eq true'
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body.totalResults).toBeGreaterThanOrEqual(0);
    });

    it('should parse filter with nested attributes', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          filter: 'emails[type eq "work" and value co "@nato.int"]'
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(200);

      expect(response.body.totalResults).toBeGreaterThanOrEqual(0);
    });

    it('should reject invalid filter syntax', async () => {
      const response = await request(app)
        .get('/scim/v2/Users')
        .query({
          filter: 'invalid filter syntax =='
        })
        .set('Authorization', 'Bearer test-sp-token')
        .expect(400);

      expect(response.body).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "400",
        detail: expect.stringContaining('Invalid filter')
      });
    });
  });
});

