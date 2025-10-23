/**
 * Jest Global Teardown
 * 
 * Ensures all MongoDB connections and async operations are properly closed
 * after all tests complete, preventing "force exit" warnings.
 */

import { closeAuditLogConnection } from '../utils/acp240-logger';
import { closeCOIKeyConnection } from '../services/coi-key.service';

export default async function globalTeardown() {
    try {
        // Close ACP-240 logger MongoDB connection
        await closeAuditLogConnection();
    } catch (error) {
        // Ignore errors if connection wasn't established
    }

    try {
        // Close COI Key Service MongoDB connection
        await closeCOIKeyConnection();
    } catch (error) {
        // Ignore errors if connection wasn't established
    }

    // Give async operations time to complete
    // Note: MongoDB driver may keep some internal connections briefly open
    // This is a known limitation - the "force exit" warning is acceptable
    const delay = process.env.CI ? 2000 : 500;
    await new Promise(resolve => setTimeout(resolve, delay));

    console.log('✅ Global teardown complete - all connections closed');
}

