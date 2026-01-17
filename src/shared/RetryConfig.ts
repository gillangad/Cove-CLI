/**
 * Configuration for automatic retry behavior
 */
export const RETRY_CONFIG = {
  maxAutoRetries: 1,
  retryableErrors: [
    "ECONNRESET",
    "ETIMEDOUT",
    "ENETUNREACH",
    "ENOTFOUND",
    "ECONNREFUSED",
    "File busy",
    "Locked",
    "EAGAIN",
    "EBUSY",
    "Resource temporarily unavailable",
    "socket hang up",
    "network timeout",
  ],
};

/**
 * Check if an error message indicates a retryable condition
 */
export function isRetryableError(errorMessage: string): boolean {
  const lowerError = errorMessage.toLowerCase();
  return RETRY_CONFIG.retryableErrors.some(
    (pattern) => lowerError.includes(pattern.toLowerCase())
  );
}

/**
 * Delay for exponential backoff
 */
export function getRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 10000);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
