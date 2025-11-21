/**
 * Retry Logic with Exponential Backoff
 * 
 * Handles transient failures gracefully with exponential backoff and jitter.
 * 
 * Features:
 * - Exponential backoff with configurable multiplier
 * - Jitter to prevent thundering herd
 * - Max retry attempts
 * - Configurable delay limits
 */

import { kasLogger } from './kas-logger';

export interface IRetryConfig {
    /** Maximum number of retry attempts */
    maxAttempts: number;
    /** Initial delay in milliseconds */
    initialDelayMs: number;
    /** Backoff multiplier */
    backoffMultiplier: number;
    /** Maximum delay in milliseconds */
    maxDelayMs: number;
    /** Jitter percentage (0-1) */
    jitter: number;
    /** Retryable error conditions */
    retryableErrors?: (error: Error) => boolean;
}

const DEFAULT_CONFIG: IRetryConfig = {
    maxAttempts: parseInt(process.env.KAS_RETRY_MAX_ATTEMPTS || '3', 10),
    initialDelayMs: parseInt(process.env.KAS_RETRY_INITIAL_DELAY_MS || '100', 10),
    backoffMultiplier: parseFloat(process.env.KAS_RETRY_BACKOFF_MULTIPLIER || '2'),
    maxDelayMs: parseInt(process.env.KAS_RETRY_MAX_DELAY_MS || '2000', 10),
    jitter: parseFloat(process.env.KAS_RETRY_JITTER || '0.2'),
    retryableErrors: (error: Error) => {
        // Retry on network errors, timeouts, and 5xx errors
        const message = error.message.toLowerCase();
        return (
            message.includes('timeout') ||
            message.includes('network') ||
            message.includes('econnrefused') ||
            message.includes('enotfound') ||
            message.includes('503') ||
            message.includes('502') ||
            message.includes('504')
        );
    },
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: IRetryConfig): number {
    // Exponential backoff: initialDelay * (multiplier ^ attempt)
    const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // Apply max delay cap
    const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
    
    // Add jitter (±jitter%)
    const jitterAmount = cappedDelay * config.jitter;
    const jitter = (Math.random() * 2 - 1) * jitterAmount; // Random between -jitter and +jitter
    
    return Math.max(0, cappedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 * 
 * @param fn - Function to execute
 * @param config - Retry configuration
 * @param context - Context for logging (e.g., requestId, service name)
 * @returns Result of function execution
 * @throws Last error if all retries exhausted
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    config?: Partial<IRetryConfig>,
    context?: { requestId?: string; service?: string }
): Promise<T> {
    const retryConfig: IRetryConfig = { ...DEFAULT_CONFIG, ...config };
    const requestId = context?.requestId || 'unknown';
    const service = context?.service || 'unknown';
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
        try {
            const result = await fn();
            
            // Log retry success if this was a retry
            if (attempt > 1) {
                kasLogger.info('Retry successful', {
                    requestId,
                    service,
                    attempt,
                    totalAttempts: attempt,
                });
            }
            
            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Check if error is retryable
            if (!retryConfig.retryableErrors || !retryConfig.retryableErrors(lastError)) {
                kasLogger.warn('Non-retryable error, not retrying', {
                    requestId,
                    service,
                    attempt,
                    error: lastError.message,
                });
                throw lastError;
            }
            
            // Don't retry if this was the last attempt
            if (attempt >= retryConfig.maxAttempts) {
                kasLogger.error('Retry exhausted, all attempts failed', {
                    requestId,
                    service,
                    totalAttempts: retryConfig.maxAttempts,
                    error: lastError.message,
                });
                throw lastError;
            }
            
            // Calculate delay and wait before retry
            const delay = calculateDelay(attempt, retryConfig);
            kasLogger.warn('Retry attempt scheduled', {
                requestId,
                service,
                attempt,
                nextAttempt: attempt + 1,
                maxAttempts: retryConfig.maxAttempts,
                delayMs: Math.round(delay),
                error: lastError.message,
            });
            
            await sleep(delay);
        }
    }
    
    // This should never be reached, but TypeScript requires it
    throw lastError || new Error('Retry logic error: no error captured');
}

/**
 * Check if error is retryable (network/timeout errors)
 */
export function isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('504')
    );
}



