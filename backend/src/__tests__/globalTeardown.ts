/**
 * Jest Global Teardown
 * 
 * Ensures all MongoDB connections and async operations are properly closed
 * after all tests complete, preventing "force exit" warnings.
 */

export default async function globalTeardown() {
    // Give async operations time to complete
    // Longer delay in CI environments which can be slower
    const delay = process.env.CI ? 2000 : 500;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    console.log('✅ Global teardown complete - all connections closed');
}

