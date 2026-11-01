# Connecteur Google Scholar facultatif

Swipaper utilise le service tiers SerpApi depuis un serveur Cloudflare Worker. Google Scholar n'a pas d'API de recherche publique officielle.

Le connecteur nécessite un compte SerpApi. Les secrets Cloudflare SERPAPI_KEY et CLIENT_ACCESS_TOKEN doivent être créés séparément via Wrangler (wrangler secret put). La clé SerpApi ne doit jamais être inscrite dans le dépôt.

Le Worker limite les appels à cinq requêtes par minute via un binding de limitation Cloudflare. Le jeton d'accès doit être long et aléatoire. Pour une ouverture publique, prévoir une véritable authentification utilisateur, des quotas et un contrôle des coûts.

Après déploiement du dossier cloudflare-scholar-worker, renseigner l'URL du Worker et son jeton dans les paramètres de Swipaper. Le jeton n'est conservé que pour la session du navigateur.

Les résultats du fournisseur doivent être comparés à OpenAlex pour confirmer titre, résumé et date. Les références sans métadonnées vérifiables sont exclues du flux principal.

Sans configuration, les recherches externes Scholar et les imports BibTeX ou EndNote restent disponibles.
