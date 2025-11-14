/**
 * Redis Mock for Testing
 * 
 * BEST PRACTICE: Mock ioredis with ioredis-mock for testing
 * 
 * This provides a fully functional in-memory Redis that:
 * - Works identically to real Redis
 * - No external Redis service needed
 * - Fast in-memory operations
 * - Proper command support
 * - Industry standard mocking approach
 * 
 * Usage: Automatically used by Jest module mocking
 */

import RedisMock from 'ioredis-mock';

/**
 * Export RedisMock as default (matches ioredis export)
 * 
 * When any code does `import Redis from 'ioredis'`, 
 * Jest will use this mock instead
 */
export default RedisMock;

/**
 * Also export as named export for compatibility
 */
export const Redis = RedisMock;

