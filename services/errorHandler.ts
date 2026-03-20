/**
 * API Error Handler Service
 * Handles network errors, timeouts, and API failures gracefully
 */

export class APIError extends Error {
  constructor(
    public code: string,
    public status?: number,
    public details?: Record<string, any>
  ) {
    super();
    this.name = 'APIError';
    this.message = getErrorMessage(code);
  }
}

/**
 * Error codes and user-friendly messages
 */
const ERROR_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: 'Network connection failed. Please check your internet connection.',
  TIMEOUT: 'Request timed out. Please try again.',
  UNAUTHORIZED: 'Authentication failed. Please log in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'This resource already exists.',
  RATE_LIMIT: 'Too many requests. Please wait a moment and try again.',
  SERVER_ERROR: 'Server error. Please try again later.',
  BAD_REQUEST: 'Invalid request. Please check your input.',
  SERVICE_UNAVAILABLE: 'Service is currently unavailable. Please try again later.',
  QUOTA_EXCEEDED: 'API quota exceeded. Please try again later.',
  INVALID_API_KEY: 'Invalid API key. Please check your configuration.',
  UNKNOWN: 'An unexpected error occurred. Please try again.'
};

/**
 * Get user-friendly error message
 */
function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN;
}

/**
 * Map HTTP status to error code
 */
function mapStatusToErrorCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMIT';
    case 500:
    case 502:
      return 'SERVER_ERROR';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Retry strategy for failed requests
 */
export const retryStrategy = {
  /**
   * Exponential backoff retry
   */
  exponentialBackoff: async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (error instanceof APIError && error.status && error.status >= 400 && error.status < 500) {
          throw error;
        }

        // Wait before retrying
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new APIError('UNKNOWN');
  },

  /**
   * Check if error is retryable
   */
  isRetryable: (error: any): boolean => {
    if (error instanceof APIError) {
      // Retry on 5xx errors, timeouts, and network errors
      return (
        error.code === 'NETWORK_ERROR' ||
        error.code === 'TIMEOUT' ||
        error.code === 'RATE_LIMIT' ||
        error.code === 'SERVER_ERROR' ||
        error.code === 'SERVICE_UNAVAILABLE' ||
        (error.status ? error.status >= 500 : false)
      );
    }
    return false;
  }
};

/**
 * Handle API errors gracefully
 */
export const handleAPIError = (error: any): APIError => {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new APIError('NETWORK_ERROR');
  }

  // Timeout errors
  if (error.name === 'AbortError' || error.message.includes('timeout')) {
    return new APIError('TIMEOUT');
  }

  // API errors with status codes
  if (error instanceof APIError) {
    return error;
  }

  // HTTP response errors
  if (error.response) {
    const status = error.response.status;
    const code = mapStatusToErrorCode(status);

    // Extract error details from response
    const details = error.response.data || error.response;

    return new APIError(code, status, details);
  }

  // Supabase auth errors
  if (error.name === 'AuthError') {
    return new APIError('UNAUTHORIZED');
  }

  // Fallback
  console.error('Unhandled error:', error);
  return new APIError('UNKNOWN');
};

/**
 * Wrap API call with error handling and retry logic
 */
export const withErrorHandling = async <T>(
  fn: () => Promise<T>,
  options: {
    shouldRetry?: boolean;
    maxRetries?: number;
    timeout?: number;
  } = {}
): Promise<{ data: T | null; error: APIError | null }> => {
  const { shouldRetry = true, maxRetries = 3, timeout = 30000 } = options;

  try {
    let apiCall = fn();

    // Add timeout
    if (timeout) {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new APIError('TIMEOUT')), timeout)
      );
      apiCall = Promise.race([apiCall, timeoutPromise]);
    }

    // Add retry logic
    if (shouldRetry) {
      const data = await retryStrategy.exponentialBackoff(() => apiCall, maxRetries);
      return { data, error: null };
    } else {
      const data = await apiCall;
      return { data, error: null };
    }
  } catch (error) {
    const apiError = handleAPIError(error);
    return { data: null, error: apiError };
  }
};

/**
 * Check if user should be prompted to retry
 */
export const shouldPromptRetry = (error: APIError): boolean => {
  return retryStrategy.isRetryable(error);
};

/**
 * Format error for user display
 */
export const formatErrorForUser = (error: APIError | null): string => {
  if (!error) return '';
  return error.message;
};
