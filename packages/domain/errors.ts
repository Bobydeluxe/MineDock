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
      return 'Certains paramètres sont invalides. Vérifiez les champs saisis et leurs limites.';
    if (/ENOSPC/.test(error.message))
      return 'Espace disque insuffisant. Libérez de l’espace puis réessayez.';
    if (/EACCES|EPERM/.test(error.message))
      return 'Accès refusé. Vérifiez les permissions du dossier.';
    if (/fetch failed|ECONN|ENOTFOUND|timeout|abort/i.test(error.message))
      return 'Connexion impossible ou interrompue. Vérifiez votre réseau puis réessayez.';
    return error.message;
  }
  return 'Une erreur inattendue est survenue.';
}
