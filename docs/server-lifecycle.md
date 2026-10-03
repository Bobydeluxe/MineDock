# Cycle de vie

Une installation crée un UUID, résout une version officielle et un build stable épinglé, installe Java, vérifie le JAR, écrit les propriétés et enregistre le consentement EULA explicitement donné dans le wizard. Les installations échouées sont affichées avec leur erreur ; un serveur incomplet ne peut pas être lancé.

Au démarrage : vérifier runtime, JAR, EULA, port Minecraft et port RCON. Lancer Java sans shell dans le dossier du serveur, enregistrer PID et heure. Lire stdout/stderr et passer « En ligne » sur le marqueur `Done`. Le démarrage est borné à cinq minutes. Le heap minimum/maximum correspond aux valeurs du profil ; aucun quota CPU natif n’est annoncé.

À l’arrêt : tenter `save-all flush` par RCON, envoyer `stop` sur stdin et attendre trente secondes. Le processus n’est terminé de force qu’après ce délai ; un deuxième délai borne la confirmation d’arrêt. L’arrêt attendu et le crash sont distingués.

Les redémarrages automatiques attendent quinze puis trente secondes ; trois crashes en dix minutes suspendent la reprise et produisent une alerte/audit. L’utilisateur peut désactiver la reprise par serveur. Les reprises utilisent la même exclusion mutuelle que les actions utilisateur.

À la fermeture de MineDock, tâches et téléchargements sont arrêtés, les opérations en cours se terminent ou s’annulent, les processus sont arrêtés et SQLite est sauvegardé. Une terminaison brutale du manager peut laisser Java en vie. Un PID persistant encore vivant n’est jamais tué automatiquement, car l’OS pourrait l’avoir réattribué : le serveur est bloqué avec une explication jusqu’à fermeture de cet ancien processus ou redémarrage de l’ordinateur.

Les joueurs sont découverts par les logs et par `list` via RCON. Le protocole authentifie chaque connexion, vérifie les tailles, collecte les réponses fragmentées et borne les délais. Minecraft ne fournit pas le ping ou l’UUID des joueurs via `list` ; la V1 ne fabrique pas ces valeurs.
