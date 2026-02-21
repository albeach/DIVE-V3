/**
 * DIVE V3 SCIM Utilities
 * Helper functions for SCIM 2.0 operations
 */

import { logger } from './logger';

/**
 * Parse SCIM filter expression
 * Simple implementation - production would need full SCIM filter parser
 */
export function parseSCIMFilter(filter: string): Record<string, unknown> {
  const parsed: Record<string, unknown> = {};
  
  if (!filter) {
    return parsed;
  }

  try {
    // Handle basic equality filters
    const eqMatch = filter.match(/(\w+(?:\.\w+)*)\s+eq\s+"([^"]+)"/);
    if (eqMatch) {
      const [, attribute, value] = eqMatch;
      parsed.attribute = attribute;
      parsed.operator = 'eq';
      parsed.value = value;
    }

    // Handle presence filters
    const prMatch = filter.match(/(\w+(?:\.\w+)*)\s+pr/);
    if (prMatch) {
      const [, attribute] = prMatch;
      parsed.attribute = attribute;
      parsed.operator = 'pr';
    }

    // Handle complex filters (and/or)
    if (filter.includes(' and ')) {
      parsed.operator = 'and';
      parsed.filters = filter.split(' and ').map(f => parseSCIMFilter(f.trim()));
    } else if (filter.includes(' or ')) {
      parsed.operator = 'or';
      parsed.filters = filter.split(' or ').map(f => parseSCIMFilter(f.trim()));
    }

  } catch (error) {
    logger.warn('Failed to parse SCIM filter', {
      filter,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return parsed;
}

/**
 * Validate SCIM resource type
 */
export function validateResourceType(resourceType: string): boolean {
  const validTypes = ['User', 'Group', 'ServiceProviderConfig', 'Schema'];
  return validTypes.includes(resourceType);
}

/**
 * Build SCIM error response
 */
export function buildSCIMError(status: number, detail: string, scimType?: string): Record<string, unknown> {
  return {
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    status: status.toString(),
    scimType,
    detail
  };
}

/**
 * Validate SCIM patch operation
 */
export function validatePatchOperation(operation: { op?: string; path?: string; value?: unknown }): boolean {
  const validOps = ['add', 'remove', 'replace'];
  
  if (!operation.op || !validOps.includes(operation.op)) {
    return false;
  }

  // Remove operations only need op and path
  if (operation.op === 'remove') {
    return !!operation.path;
  }

  // Add and replace need op, path, and value
  return !!(operation.path && operation.value !== undefined);
}

/**
 * Parse SCIM attribute path
 */
export function parseAttributePath(path: string): {
  attribute: string;
  subAttribute?: string;
  filter?: string;
} {
  // Handle paths like "emails[type eq \"work\"].value"
  const filterMatch = path.match(/^(\w+)\[([^\]]+)\](?:\.(\w+))?$/);
  if (filterMatch) {
    const [, attribute, filter, subAttribute] = filterMatch;
    return { attribute, filter, subAttribute };
  }

  // Handle simple paths like "name.givenName"
  const parts = path.split('.');
  if (parts.length === 1) {
    return { attribute: parts[0] };
  }

  return {
    attribute: parts[0],
    subAttribute: parts.slice(1).join('.')
  };
}

/**
 * Apply SCIM attribute filtering
 */
export function filterAttributes(resource: Record<string, unknown>, attributes?: string[], excludedAttributes?: string[]): Record<string, unknown> {
  if (!attributes && !excludedAttributes) {
    return resource;
  }

  // Deep clone the resource
  const filtered = JSON.parse(JSON.stringify(resource));

  // Apply included attributes filter
  if (attributes && attributes.length > 0) {
    // allowed variable defined but not used - keeping for potential future use
    // const allowed = new Set(attributes);
    const result: Record<string, unknown> = {
      schemas: filtered.schemas,
      id: filtered.id
    };

    for (const attr of attributes) {
      if (filtered.hasOwnProperty(attr)) {
        result[attr] = filtered[attr];
      }
    }

    return result;
  }

  // Apply excluded attributes filter
  if (excludedAttributes && excludedAttributes.length > 0) {
    for (const attr of excludedAttributes) {
      delete filtered[attr];
    }
  }

  return filtered;
}

/**
 * Validate clearance level
 */
export function isValidClearance(clearance: string): boolean {
  const validLevels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
  return validLevels.includes(clearance);
}

/**
 * Validate country code (ISO 3166-1 alpha-3)
 */
export function isValidCountryCode(country: string): boolean {
  const validCountries = [
    'USA', 'GBR', 'CAN', 'AUS', 'NZL', // Five Eyes
    'FRA', 'DEU', 'ITA', 'ESP', 'POL', 'NLD', // NATO partners
    'BEL', 'DNK', 'NOR', 'TUR', 'GRC', 'PRT'
  ];
  return validCountries.includes(country);
}

/**
 * Normalize SCIM multi-valued attributes
 */
export function normalizeMultiValuedAttribute(values: (string | Record<string, unknown>)[]): Record<string, unknown>[] {
  return values.map((value, index) => {
    if (typeof value === 'string') {
      return {
        value,
        primary: index === 0
      };
    }
    
    // Ensure primary flag
    if (!value.hasOwnProperty('primary')) {
      value.primary = index === 0;
    }
    
    return value;
  });
}
