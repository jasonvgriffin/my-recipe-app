/** Turn unknown throwables (Error, Supabase PostgrestError, strings) into a single line. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Something went wrong.';
}

/** Network / offline failures are retried from the offline queue; other failures surface as sync errors. */
export function isOfflineError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('aborted') ||
    message.includes('load failed') ||
    message.includes('internet')
  );
}

export function syncErrorMessage(error: unknown): string {
  if (isOfflineError(error)) {
    return 'You appear to be offline. Changes stay on this device until the next sync.';
  }
  return errorMessage(error);
}
