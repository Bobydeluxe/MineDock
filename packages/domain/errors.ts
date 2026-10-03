export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
export function readableError(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof Error) {
    if (error.name === 'ZodError')
      return 'Some settings are invalid. Check the entered values and their limits.';
    if (/ENOSPC/.test(error.message))
      return 'Not enough disk space. Free some space and try again.';
    if (/EACCES|EPERM/.test(error.message)) return 'Access denied. Check the folder permissions.';
    if (/fetch failed|ECONN|ENOTFOUND|timeout|abort/i.test(error.message))
      return 'Connection failed or was interrupted. Check your network and try again.';
    return error.message;
  }
  return 'An unexpected error occurred.';
}
