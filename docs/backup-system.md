# Sauvegardes et restauration

Chaque archive est un ZIP complet du dossier serveur, sauf les locks de session et le secret RCON connu. Elle contient également un manifeste de profil et de plugins pour garder le suivi du contenu cohérent au restore. Les archives vivent hors des dossiers serveurs et sont indexées dans SQLite avec UUID, taille, date, motif et SHA-256.

Serveur actif : `save-off`, puis `save-all flush`, copie en ZIP, contrôle de hash, renommage final, enregistrement et `save-on` dans un `finally`. Si `save-on` ne peut pas être confirmé, un arrêt de sécurité évite de laisser le monde sans sauvegarde. Une opération de lifecycle ne peut pas chevaucher une sauvegarde.

Le disque disponible est vérifié avant copie. La V1 accepte au maximum 64 Go non compressés. Les tâches sont à intervalle et persistantes ; le manager doit rester ouvert. Aucune rétention destructive n’est configurée implicitement.

Restauration : exiger le nom du serveur et l’arrêt effectif ; vérifier SHA-256 ; sauvegarder l’état actuel ; extraire vers un dossier de staging en validant chaque entrée ; valider manifeste et JAR ; réinjecter le secret et conserver les ports actuels ; renommer l’original à part et échanger les dossiers ; restaurer profil et plugins dans une transaction SQLite. Si l’échange ou la transaction échoue, remettre le dossier original. La sauvegarde de sécurité reste disponible.

Un échec disque pendant l’extraction n’endommage pas le serveur original. Une coupure de courant précisément entre les renommages reste un risque : la copie `.previous` et la sauvegarde permettent une récupération manuelle. La récupération automatique après interruption est prévue dans la feuille de route ; ne prétendez pas que la restauration est une transaction distribuée parfaitement atomique.

Les archives manuelles restent jusqu’à leur suppression confirmée. Les archives de réglages et de plugins peuvent consommer de l’espace ; surveillez le disque et supprimez explicitement les anciennes copies si nécessaire.
