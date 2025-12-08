/**
 * Search Syntax Parser Tests
 * 
 * Tests for @/lib/search-syntax-parser.ts
 * Phase 2: Search Enhancement
 * 
 * Coverage targets:
 * - Query tokenization
 * - Boolean operators (AND, OR, NOT)
 * - Phrase matching
 * - Field-specific searches
 * - Range queries
 * - Negation
 * - Error handling
 */

import {
  parseSearchQuery,
  tokenize,
  buildMongoQuery,
  validateSearchQuery,
  AVAILABLE_FIELDS,
  SEARCH_SYNTAX_HELP,
} from '@/lib/search-syntax-parser';

describe('search-syntax-parser', () => {
  describe('tokenize', () => {
    it('should tokenize simple terms', () => {
      const tokens = tokenize('fuel inventory');
      
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toEqual({ type: 'TERM', value: 'fuel' });
      expect(tokens[1]).toEqual({ type: 'TERM', value: 'inventory' });
    });

    it('should tokenize quoted phrases', () => {
      const tokens = tokenize('"fuel inventory report"');
      
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toEqual({ type: 'PHRASE', value: 'fuel inventory report' });
    });

    it('should tokenize field:value syntax', () => {
      const tokens = tokenize('classification:SECRET');
      
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toEqual({ type: 'FIELD', value: 'classification:SECRET' });
    });

    it('should tokenize boolean operators', () => {
      const tokens = tokenize('fuel AND inventory');
      
      expect(tokens).toHaveLength(3);
      expect(tokens[1]).toEqual({ type: 'OPERATOR', value: 'AND' });
    });

    it('should handle case-insensitive operators', () => {
      const tokensLower = tokenize('fuel and inventory');
      const tokensUpper = tokenize('fuel AND inventory');
      
      expect(tokensLower[1]).toEqual({ type: 'OPERATOR', value: 'AND' });
      expect(tokensUpper[1]).toEqual({ type: 'OPERATOR', value: 'AND' });
    });

    it('should tokenize negation with hyphen', () => {
      const tokens = tokenize('-classified');
      
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toEqual({ type: 'NEGATION', value: 'classified' });
    });

    it('should tokenize parentheses', () => {
      const tokens = tokenize('(fuel OR gas) AND inventory');
      
      expect(tokens).toContainEqual({ type: 'LPAREN', value: '(' });
      expect(tokens).toContainEqual({ type: 'RPAREN', value: ')' });
    });

    it('should handle mixed syntax', () => {
      const tokens = tokenize('classification:SECRET "fuel report" -draft');
      
      expect(tokens).toHaveLength(3);
      expect(tokens[0].type).toBe('FIELD');
      expect(tokens[1].type).toBe('PHRASE');
      expect(tokens[2].type).toBe('NEGATION');
    });

    it('should handle empty input', () => {
      const tokens = tokenize('');
      expect(tokens).toHaveLength(0);
    });

    it('should handle whitespace-only input', () => {
      const tokens = tokenize('   ');
      expect(tokens).toHaveLength(0);
    });
  });

  describe('parseSearchQuery', () => {
    it('should parse simple text search', () => {
      const result = parseSearchQuery('fuel inventory');
      
      expect(result.textSearch).toBe('fuel inventory');
      expect(result.phrases).toHaveLength(0);
      expect(result.filters).toHaveLength(0);
    });

    it('should extract phrases', () => {
      const result = parseSearchQuery('"fuel inventory" report');
      
      expect(result.phrases).toContain('fuel inventory');
      expect(result.textSearch).toContain('report');
    });

    it('should extract field filters', () => {
      const result = parseSearchQuery('classification:SECRET');
      
      expect(result.filters).toHaveLength(1);
      expect(result.filters[0]).toEqual({
        field: 'classification',
        operator: ':',
        value: 'SECRET',
        negated: false,
      });
    });

    it('should handle multiple field filters', () => {
      const result = parseSearchQuery('classification:SECRET country:USA');
      
      expect(result.filters).toHaveLength(2);
      expect(result.filters[0].field).toBe('classification');
      expect(result.filters[1].field).toBe('country');
    });

    it('should detect AND operator', () => {
      const result = parseSearchQuery('fuel AND inventory');
      
      expect(result.booleanOperator).toBe('AND');
    });

    it('should detect OR operator', () => {
      const result = parseSearchQuery('fuel OR gas');
      
      expect(result.booleanOperator).toBe('OR');
    });

    it('should extract negated terms', () => {
      const result = parseSearchQuery('fuel -draft');
      
      expect(result.negatedTerms).toContain('draft');
    });

    it('should handle NOT operator', () => {
      const result = parseSearchQuery('fuel NOT draft');
      
      expect(result.negatedTerms).toContain('draft');
    });

    it('should handle negated field filters', () => {
      const result = parseSearchQuery('-classification:UNCLASSIFIED');
      
      expect(result.filters[0].negated).toBe(true);
    });

    it('should normalize classification values', () => {
      const shorthand = parseSearchQuery('classification:S');
      const full = parseSearchQuery('classification:SECRET');
      
      expect(shorthand.filters[0].value).toBe('SECRET');
      expect(full.filters[0].value).toBe('SECRET');
    });

    it('should handle comparison operators', () => {
      const result = parseSearchQuery('date:>2024-01-01');
      
      expect(result.filters[0].operator).toBe('>');
      expect(result.filters[0].value).toBe('2024-01-01');
    });

    it('should preserve raw query', () => {
      const query = 'classification:SECRET "fuel report"';
      const result = parseSearchQuery(query);
      
      expect(result.raw).toBe(query);
    });

    it('should handle complex queries', () => {
      const result = parseSearchQuery(
        'classification:SECRET country:USA "fuel inventory" -draft'
      );
      
      expect(result.filters).toHaveLength(2);
      expect(result.phrases).toContain('fuel inventory');
      expect(result.negatedTerms).toContain('draft');
    });

    it('should collect parsing errors', () => {
      const result = parseSearchQuery('classification:"unclosed');
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('quote');
    });

    it('should handle empty query', () => {
      const result = parseSearchQuery('');
      
      expect(result.textSearch).toBe('');
      expect(result.filters).toHaveLength(0);
    });
  });

  describe('buildMongoQuery', () => {
    it('should build text search query', () => {
      const parsed = parseSearchQuery('fuel inventory');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(mongoQuery.$text).toBeDefined();
      expect(mongoQuery.$text.$search).toContain('fuel');
    });

    it('should build phrase query', () => {
      const parsed = parseSearchQuery('"fuel inventory"');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(mongoQuery.$text.$search).toContain('"fuel inventory"');
    });

    it('should build field filter query', () => {
      const parsed = parseSearchQuery('classification:SECRET');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(mongoQuery.classification).toBe('SECRET');
    });

    it('should build negated filter query', () => {
      const parsed = parseSearchQuery('-classification:UNCLASSIFIED');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(mongoQuery.classification).toEqual({ $ne: 'UNCLASSIFIED' });
    });

    it('should build array field query (country)', () => {
      const parsed = parseSearchQuery('country:USA');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(mongoQuery.releasabilityTo).toEqual({ $in: ['USA'] });
    });

    it('should build comparison query', () => {
      const parsed = parseSearchQuery('date:>2024-01-01');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(mongoQuery.createdAt).toEqual({ $gt: '2024-01-01' });
    });

    it('should handle OR with $or', () => {
      const parsed = parseSearchQuery('fuel OR gas');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(mongoQuery.$or).toBeDefined();
    });

    it('should handle negated terms with $nor', () => {
      const parsed = parseSearchQuery('fuel -draft');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(mongoQuery.$text.$search).not.toContain('draft');
    });

    it('should build empty query for empty input', () => {
      const parsed = parseSearchQuery('');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(Object.keys(mongoQuery)).toHaveLength(0);
    });

    it('should combine multiple filters with $and', () => {
      const parsed = parseSearchQuery('classification:SECRET country:USA');
      const mongoQuery = buildMongoQuery(parsed);
      
      expect(mongoQuery.classification).toBe('SECRET');
      expect(mongoQuery.releasabilityTo).toBeDefined();
    });
  });

  describe('validateSearchQuery', () => {
    it('should pass valid queries', () => {
      const result = validateSearchQuery('classification:SECRET');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect unmatched quotes', () => {
      const result = validateSearchQuery('"unclosed phrase');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/quote/i));
    });

    it('should detect unmatched parentheses', () => {
      const result = validateSearchQuery('(fuel AND gas');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/parenthes/i));
    });

    it('should detect invalid field names', () => {
      const result = validateSearchQuery('invalidfield:value');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(expect.stringMatching(/unknown.*field|invalid.*field/i));
    });

    it('should suggest valid field names', () => {
      const result = validateSearchQuery('class:SECRET');
      
      expect(result.suggestions).toContain('classification');
    });

    it('should pass empty queries', () => {
      const result = validateSearchQuery('');
      
      expect(result.valid).toBe(true);
    });

    it('should validate complex valid queries', () => {
      const result = validateSearchQuery(
        'classification:SECRET country:USA "fuel report" -draft'
      );
      
      expect(result.valid).toBe(true);
    });
  });

  describe('AVAILABLE_FIELDS', () => {
    it('should contain classification field', () => {
      const classField = AVAILABLE_FIELDS.find(f => f.name === 'classification');
      
      expect(classField).toBeDefined();
      expect(classField?.examples).toContain('SECRET');
    });

    it('should contain country field', () => {
      const countryField = AVAILABLE_FIELDS.find(f => f.name === 'country');
      
      expect(countryField).toBeDefined();
      expect(countryField?.examples).toContain('USA');
    });

    it('should contain coi field', () => {
      const coiField = AVAILABLE_FIELDS.find(f => f.name === 'coi');
      
      expect(coiField).toBeDefined();
      expect(coiField?.examples).toContain('NATO');
    });

    it('should contain encrypted field', () => {
      const encryptedField = AVAILABLE_FIELDS.find(f => f.name === 'encrypted');
      
      expect(encryptedField).toBeDefined();
    });

    it('should contain date field', () => {
      const dateField = AVAILABLE_FIELDS.find(f => f.name === 'date');
      
      expect(dateField).toBeDefined();
    });

    it('should have descriptions for all fields', () => {
      AVAILABLE_FIELDS.forEach(field => {
        expect(field.description).toBeTruthy();
      });
    });
  });

  describe('SEARCH_SYNTAX_HELP', () => {
    it('should have operators documentation', () => {
      expect(SEARCH_SYNTAX_HELP.operators).toBeDefined();
      expect(SEARCH_SYNTAX_HELP.operators).toContain('AND');
      expect(SEARCH_SYNTAX_HELP.operators).toContain('OR');
    });

    it('should have phrases documentation', () => {
      expect(SEARCH_SYNTAX_HELP.phrases).toBeDefined();
    });

    it('should have fields documentation', () => {
      expect(SEARCH_SYNTAX_HELP.fields).toBeDefined();
    });

    it('should have negation documentation', () => {
      expect(SEARCH_SYNTAX_HELP.negation).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle multiple spaces', () => {
      const result = parseSearchQuery('fuel   inventory');
      
      expect(result.textSearch).toBe('fuel inventory');
    });

    it('should handle leading/trailing spaces', () => {
      const result = parseSearchQuery('  fuel inventory  ');
      
      expect(result.textSearch).toBe('fuel inventory');
    });

    it('should handle special characters in phrases', () => {
      const result = parseSearchQuery('"fuel & gas report"');
      
      expect(result.phrases).toContain('fuel & gas report');
    });

    it('should handle colon in phrase', () => {
      const result = parseSearchQuery('"time: 14:30"');
      
      expect(result.phrases).toContain('time: 14:30');
    });

    it('should handle unicode characters', () => {
      const result = parseSearchQuery('Müller café');
      
      expect(result.textSearch).toContain('Müller');
      expect(result.textSearch).toContain('café');
    });

    it('should handle classification abbreviations', () => {
      const abbrevs = [
        { input: 'classification:U', expected: 'UNCLASSIFIED' },
        { input: 'classification:C', expected: 'CONFIDENTIAL' },
        { input: 'classification:S', expected: 'SECRET' },
        { input: 'classification:TS', expected: 'TOP_SECRET' },
      ];
      
      abbrevs.forEach(({ input, expected }) => {
        const result = parseSearchQuery(input);
        expect(result.filters[0].value).toBe(expected);
      });
    });

    it('should be case-insensitive for field values', () => {
      const lowerCase = parseSearchQuery('classification:secret');
      const upperCase = parseSearchQuery('classification:SECRET');
      
      expect(lowerCase.filters[0].value).toBe(upperCase.filters[0].value);
    });

    it('should handle empty field value', () => {
      const result = parseSearchQuery('classification:');
      
      expect(result.errors).toHaveLength(1);
    });
  });
});







