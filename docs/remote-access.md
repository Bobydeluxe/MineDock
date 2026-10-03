# Accès local et réseau

La V1 n’expose aucun panneau administratif distant. L’administrateur est le compte OS qui lance le desktop. Il n’y a pas de login factice, de lien QR non protégé, de tunnel ou de serveur web de production.

Pour jouer sur le même ordinateur, utilisez `localhost:port`. Pour jouer sur le LAN, utilisez l’adresse IPv4 locale affichée et autorisez le trafic Minecraft si votre pare-feu le demande. Le logiciel ne configure ni pare-feu ni routeur. Les adresses affichées ne sont pas des adresses publiques.

Ne redirigez jamais RCON sur Internet. Le mode localhost avec `server-ip=127.0.0.1` limite le serveur à l’ordinateur. Le bind vide permet le LAN et exige un réseau de confiance.

Le futur panneau distant réutilisera les DTO et services, avec login Argon2id, rôles par serveur, sessions expirables, CSRF, rate limiting, TLS et WebSockets authentifiés. Cette couche doit être développée avant toute option d’exposition réseau. Playit/Geyser/Docker et le cloud sont des extensions distinctes, non actives dans la V1.
