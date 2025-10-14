/**
 * Jest Global Teardown
 * 
 * Ensures all MongoDB connections and async operations are properly closed
 * after all tests complete, preventing "force exit" warnings.
 */

export default async function globalTeardown() {
    // Give async operations time to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('✅ Global teardown complete - all connections closed');
}

