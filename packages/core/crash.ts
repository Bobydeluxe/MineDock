export function analyzeCrash(text: string, java: number): string {
  if (/OutOfMemoryError|Java heap space/.test(text))
    return 'Le serveur manque de mémoire. Augmentez la RAM allouée ou réduisez la distance de vue.';
  if (
    /UnsupportedClassVersionError|UnsupportedClassVersion|requires.*Java|Java.*required/i.test(text)
  )
    return `La version de Java est incompatible. Vérifiez le runtime Java ${java} du serveur.`;
  if (/Address already in use|FAILED TO BIND|BindException/i.test(text))
    return 'Le port réseau est déjà utilisé. Choisissez un autre port.';
  if (/missing.*depend|requires.*fabric|Could not load.*plugin/i.test(text))
    return 'Un plugin ou un mod semble manquer d’une dépendance ou être incompatible.';
  if (/Invalid.*(config|properties)|Failed to load.*properties/i.test(text))
    return 'La configuration du serveur semble invalide. Vérifiez les derniers changements.';
  if (/corrupt|ZipException|invalid.*(jar|zip)/i.test(text))
    return 'Un fichier du serveur semble endommagé. Vérifiez les sauvegardes ou réinstallez le contenu concerné.';
  return 'Le serveur s’est arrêté de façon inattendue. Consultez les dernières lignes de console pour identifier la cause.';
}
