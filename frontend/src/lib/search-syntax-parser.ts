/**
 * Search Syntax Parser
 * 
 * Phase 2: Search & Discovery Enhancement
 * Advanced search syntax parser for DIVE V3
 * 
 * Supports:
 * - Boolean operators: AND, OR, NOT
 * - Exact phrases: "fuel inventory"
 * - Field-specific searches: classification:SECRET
 * - Range queries: date:>2025-01-01
 * - Parentheses grouping: (USA OR FRA) AND SECRET
 * - Negation: -encrypted
 */

// ============================================
// Types
// ============================================

export interface IFieldFilter {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains';
  value: string;
  negated: boolean;
}

export interface IParsedQuery {
  /** Free text search terms */
  textSearch: string;
  /** Exact phrases from quoted strings */
  phrases: string[];
  /** Field-specific filters */
  filters: IFieldFilter[];
  /** Boolean operator connecting terms (default AND) */
  booleanOperator: 'AND' | 'OR';
  /** Negated terms (NOT prefix) */
  negatedTerms: string[];
  /** Original raw query */
  rawQuery: string;
  /** Whether the query is valid */
  isValid: boolean;
  /** Parse errors if any */
  errors: string[];
  /** Query tokens for debugging */
  tokens: IToken[];
}

export interface IToken {
  type: 'TERM' | 'PHRASE' | 'FIELD' | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'NEGATION';
  value: string;
  position: number;
}

export interface ISearchSyntaxHelp {
  syntax: string;
  description: string;
  example: string;
}

// ============================================
// Constants
// ============================================

const FIELD_MAPPINGS: Record<string, string> = {
  // Classification
  'classification': 'classification',
  'class': 'classification',
  'c': 'classification',
  'clearance': 'classification',
  
  // Country/Releasability
  'country': 'releasabilityTo',
  'releasability': 'releasabilityTo',
  'rel': 'releasabilityTo',
  
  // COI
  'coi': 'COI',
  'community': 'COI',
  
  // Instance/Origin
  'instance': 'originRealm',
  'origin': 'originRealm',
  'realm': 'originRealm',
  
  // Encryption
  'encrypted': 'encrypted',
  'enc': 'encrypted',
  
  // Date
  'date': 'creationDate',
  'created': 'creationDate',
  'creationdate': 'creationDate',
  
  // Title
  'title': 'title',
  'name': 'title',
  
  // ID
  'id': 'resourceId',
  'resourceid': 'resourceId',
};

const BOOLEAN_OPERATORS = ['AND', 'OR', 'NOT'];

const COMPARISON_OPERATORS: Record<string, IFieldFilter['operator']> = {
  ':': '=',
  '=': '=',
  '!=': '!=',
  '<>': '!=',
  '>': '>',
  '<': '<',
  '>=': '>=',
  '<=': '<=',
  '~': 'contains',
};

// ============================================
// Tokenizer
// ============================================

function tokenize(input: string): IToken[] {
  const tokens: IToken[] = [];
  let position = 0;
  const chars = input.split('');

  while (position < chars.length) {
    const char = chars[position];

    // Skip whitespace
    if (/\s/.test(char)) {
      position++;
      continue;
    }

    // Parentheses
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position });
      position++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position });
      position++;
      continue;
    }

    // Quoted phrase
    if (char === '"' || char === "'") {
      const quote = char;
      const start = position;
      position++; // Skip opening quote
      let phrase = '';
      
      while (position < chars.length && chars[position] !== quote) {
        phrase += chars[position];
        position++;
      }
      position++; // Skip closing quote
      
      if (phrase) {
        tokens.push({ type: 'PHRASE', value: phrase, position: start });
      }
      continue;
    }

    // Negation prefix
    if (char === '-' && position + 1 < chars.length && /[a-zA-Z]/.test(chars[position + 1])) {
      tokens.push({ type: 'NEGATION', value: '-', position });
      position++;
      continue;
    }

    // Word or field:value
    if (/[a-zA-Z0-9_]/.test(char)) {
      const start = position;
      let word = '';
      
      while (position < chars.length && /[a-zA-Z0-9_-]/.test(chars[position])) {
        word += chars[position];
        position++;
      }

      // Check for boolean operators
      const upperWord = word.toUpperCase();
      if (BOOLEAN_OPERATORS.includes(upperWord)) {
        tokens.push({ type: 'OPERATOR', value: upperWord, position: start });
        continue;
      }

      // Check for field:value pattern
      if (position < chars.length && /[:=<>!~]/.test(chars[position])) {
        let operator = chars[position];
        position++;
        
        // Handle multi-char operators (>=, <=, !=, <>)
        if (position < chars.length && /[=<>]/.test(chars[position])) {
          operator += chars[position];
          position++;
        }
        
        // Skip whitespace after operator
        while (position < chars.length && /\s/.test(chars[position])) {
          position++;
        }
        
        // Get value
        let value = '';
        if (position < chars.length) {
          if (chars[position] === '"' || chars[position] === "'") {
            // Quoted value
            const quote = chars[position];
            position++;
            while (position < chars.length && chars[position] !== quote) {
              value += chars[position];
              position++;
            }
            position++;
          } else {
            // Unquoted value
            while (position < chars.length && !/[\s()]/.test(chars[position])) {
              value += chars[position];
              position++;
            }
          }
        }
        
        tokens.push({
          type: 'FIELD',
          value: `${word}${operator}${value}`,
          position: start,
        });
        continue;
      }

      // Regular term
      tokens.push({ type: 'TERM', value: word, position: start });
      continue;
    }

    // Skip unknown characters
    position++;
  }

  return tokens;
}

// ============================================
// Parser
// ============================================

export function parseSearchQuery(input: string): IParsedQuery {
  const result: IParsedQuery = {
    textSearch: '',
    phrases: [],
    filters: [],
    booleanOperator: 'AND',
    negatedTerms: [],
    rawQuery: input,
    isValid: true,
    errors: [],
    tokens: [],
  };

  if (!input || !input.trim()) {
    return result;
  }

  const tokens = tokenize(input.trim());
  result.tokens = tokens;

  const textTerms: string[] = [];
  let isNegated = false;
  let currentBooleanOp: 'AND' | 'OR' = 'AND';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case 'NEGATION':
        isNegated = true;
        break;

      case 'OPERATOR':
        if (token.value === 'NOT') {
          isNegated = true;
        } else if (token.value === 'AND' || token.value === 'OR') {
          currentBooleanOp = token.value;
        }
        break;

      case 'TERM':
        if (isNegated) {
          result.negatedTerms.push(token.value);
          isNegated = false;
        } else {
          textTerms.push(token.value);
        }
        break;

      case 'PHRASE':
        if (isNegated) {
          result.negatedTerms.push(`"${token.value}"`);
          isNegated = false;
        } else {
          result.phrases.push(token.value);
        }
        break;

      case 'FIELD':
        const filter = parseFieldToken(token.value, isNegated);
        if (filter) {
          result.filters.push(filter);
        } else {
          result.errors.push(`Invalid field syntax: ${token.value}`);
        }
        isNegated = false;
        break;

      case 'LPAREN':
      case 'RPAREN':
        // For now, we ignore parentheses in simple parsing
        // A full implementation would build an AST
        break;
    }
  }

  result.textSearch = textTerms.join(' ');
  result.booleanOperator = currentBooleanOp;
  result.isValid = result.errors.length === 0;

  return result;
}

// ============================================
// Field Token Parser
// ============================================

function parseFieldToken(token: string, negated: boolean): IFieldFilter | null {
  // Match field:value, field=value, field>value, etc.
  const match = token.match(/^([a-zA-Z_]+)([:=<>!~]+)(.*)$/);
  if (!match) return null;

  const [, rawField, rawOperator, rawValue] = match;
  
  // Map field name
  const field = FIELD_MAPPINGS[rawField.toLowerCase()] || rawField;
  
  // Map operator
  let operator = COMPARISON_OPERATORS[rawOperator] || '=';
  
  // Handle negation
  if (negated) {
    if (operator === '=') operator = '!=';
    else if (operator === 'contains') operator = 'not_contains';
  }

  // Normalize value
  const value = normalizeFieldValue(field, rawValue);

  return {
    field,
    operator,
    value,
    negated,
  };
}

// ============================================
// Value Normalizer
// ============================================

function normalizeFieldValue(field: string, value: string): string {
  const upperValue = value.toUpperCase();

  // Classification normalization
  if (field === 'classification') {
    const classificationMap: Record<string, string> = {
      'U': 'UNCLASSIFIED',
      'UNCLASS': 'UNCLASSIFIED',
      'R': 'RESTRICTED',
      'C': 'CONFIDENTIAL',
      'S': 'SECRET',
      'TS': 'TOP_SECRET',
      'TOPSECRET': 'TOP_SECRET',
      'TOP SECRET': 'TOP_SECRET',
    };
    return classificationMap[upperValue] || upperValue;
  }

  // Boolean normalization
  if (field === 'encrypted') {
    const boolMap: Record<string, string> = {
      'TRUE': 'true',
      'YES': 'true',
      '1': 'true',
      'FALSE': 'false',
      'NO': 'false',
      '0': 'false',
    };
    return boolMap[upperValue] || value.toLowerCase();
  }

  // Country code normalization
  if (field === 'releasabilityTo' || field === 'originRealm') {
    const countryMap: Record<string, string> = {
      'US': 'USA',
      'FR': 'FRA',
      'UK': 'GBR',
      'GB': 'GBR',
      'DE': 'DEU',
      'CA': 'CAN',
    };
    return countryMap[upperValue] || upperValue;
  }

  return value;
}

// ============================================
// Query Builder for MongoDB
// ============================================

export function buildMongoQuery(parsed: IParsedQuery): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  // Text search
  if (parsed.textSearch.trim()) {
    const searchRegex = { $regex: parsed.textSearch.trim(), $options: 'i' };
    conditions.push({
      $or: [
        { title: searchRegex },
        { resourceId: searchRegex },
      ],
    });
  }

  // Exact phrases
  parsed.phrases.forEach(phrase => {
    conditions.push({
      $or: [
        { title: { $regex: phrase, $options: 'i' } },
        { resourceId: { $regex: phrase, $options: 'i' } },
      ],
    });
  });

  // Field filters
  parsed.filters.forEach(filter => {
    const condition: Record<string, unknown> = {};
    
    switch (filter.operator) {
      case '=':
        condition[filter.field] = filter.value;
        break;
      case '!=':
        condition[filter.field] = { $ne: filter.value };
        break;
      case '>':
        condition[filter.field] = { $gt: filter.value };
        break;
      case '<':
        condition[filter.field] = { $lt: filter.value };
        break;
      case '>=':
        condition[filter.field] = { $gte: filter.value };
        break;
      case '<=':
        condition[filter.field] = { $lte: filter.value };
        break;
      case 'contains':
        condition[filter.field] = { $regex: filter.value, $options: 'i' };
        break;
      case 'not_contains':
        condition[filter.field] = { $not: { $regex: filter.value, $options: 'i' } };
        break;
    }
    
    // Handle array fields (releasabilityTo, COI)
    if (filter.field === 'releasabilityTo' || filter.field === 'COI') {
      if (filter.operator === '=') {
        condition[filter.field] = { $in: [filter.value] };
      } else if (filter.operator === '!=') {
        condition[filter.field] = { $nin: [filter.value] };
      }
    }

    // Handle boolean fields
    if (filter.field === 'encrypted') {
      condition[filter.field] = filter.value === 'true';
    }

    conditions.push(condition);
  });

  // Negated terms
  parsed.negatedTerms.forEach(term => {
    const cleanTerm = term.replace(/^"|"$/g, '');
    conditions.push({
      $and: [
        { title: { $not: { $regex: cleanTerm, $options: 'i' } } },
        { resourceId: { $not: { $regex: cleanTerm, $options: 'i' } } },
      ],
    });
  });

  // Combine with appropriate operator
  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return parsed.booleanOperator === 'OR'
    ? { $or: conditions }
    : { $and: conditions };
}

// ============================================
// Query Validator
// ============================================

export function validateSearchQuery(input: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for unmatched quotes
  const quoteCount = (input.match(/"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    errors.push('Unmatched quotation marks');
  }

  // Check for unmatched parentheses
  let parenDepth = 0;
  for (const char of input) {
    if (char === '(') parenDepth++;
    if (char === ')') parenDepth--;
    if (parenDepth < 0) {
      errors.push('Unmatched closing parenthesis');
      break;
    }
  }
  if (parenDepth > 0) {
    errors.push('Unmatched opening parenthesis');
  }

  // Check for invalid field names
  const fieldMatches = input.match(/([a-zA-Z_]+)[:=]/g) || [];
  fieldMatches.forEach(match => {
    const field = match.replace(/[:=]$/, '').toLowerCase();
    if (!FIELD_MAPPINGS[field]) {
      errors.push(`Unknown field: ${field}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================
// Syntax Help
// ============================================

export const SEARCH_SYNTAX_HELP: ISearchSyntaxHelp[] = [
  {
    syntax: 'AND',
    description: 'Find documents containing both terms',
    example: 'SECRET AND FVEY',
  },
  {
    syntax: 'OR',
    description: 'Find documents containing either term',
    example: 'USA OR FRA',
  },
  {
    syntax: 'NOT / -',
    description: 'Exclude documents with term',
    example: 'NOT encrypted / -encrypted',
  },
  {
    syntax: '"phrase"',
    description: 'Exact phrase match',
    example: '"fuel inventory"',
  },
  {
    syntax: 'field:value',
    description: 'Field-specific filter',
    example: 'classification:SECRET',
  },
  {
    syntax: 'field>value',
    description: 'Range query (>, <, >=, <=)',
    example: 'date:>2025-01-01',
  },
  {
    syntax: 'field~value',
    description: 'Contains match',
    example: 'title~inventory',
  },
];

export const AVAILABLE_FIELDS: { field: string; aliases: string[]; description: string }[] = [
  { field: 'classification', aliases: ['class', 'c', 'clearance'], description: 'Security classification level' },
  { field: 'country', aliases: ['rel', 'releasability'], description: 'Country releasability' },
  { field: 'coi', aliases: ['community'], description: 'Community of Interest' },
  { field: 'instance', aliases: ['origin', 'realm'], description: 'Federation instance' },
  { field: 'encrypted', aliases: ['enc'], description: 'Encryption status' },
  { field: 'date', aliases: ['created', 'creationdate'], description: 'Creation date' },
  { field: 'title', aliases: ['name'], description: 'Document title' },
  { field: 'id', aliases: ['resourceid'], description: 'Resource ID' },
];

export default parseSearchQuery;






