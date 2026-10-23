# tonú Privé

Plateforme de rencontres pour adultes (18+) avec annonces modérées, commentaires et abonnement **Stripe**.

Le fonctionnement est volontairement simple :

| Action | Accès |
|---|---|
| Consulter les annonces et les profils | Gratuit, sans compte |
| Commenter une annonce | Compte gratuit obligatoire |
| Publier une annonce avec photos | Abonnement **Premium** payé via Stripe, puis validation par la modération |
| Gérer son abonnement | Portail client Stripe depuis l'espace compte |

## Stack

- **Node.js 20+** (recommandé : 22 ou 24), Express 4
- **PostgreSQL** managé (Supabase, offre gratuite), migrations automatiques au démarrage ; en développement sans `DATABASE_URL`, un Postgres embarqué (PGlite) est utilisé dans `./data/pglite`
- **Supabase Storage** : photos des annonces (bucket public), rien n'est écrit sur le disque local
- **Stripe** : abonnement récurrent, Checkout, portail client, webhooks signés et idempotents
- **Sharp** : re-encodage des photos en JPEG, suppression des métadonnées EXIF/GPS, redimensionnement
- Front statique servi uniquement depuis `public/` — le code serveur, la base et les scripts ne sont jamais exposés
- JWT + bcrypt (coût 12), limitation de débit, Helmet/CSP, validation et échappement systématiques

## Démarrage local

Prérequis : Node.js 20+ et npm.

```bash
npm install
cp .env.example .env        # Windows : copy .env.example .env
```

Renseignez au minimum dans `.env` :

```env
JWT_SECRET=<32 caractères aléatoires minimum>
ADMIN_EMAIL=admin@votre-domaine.com
ADMIN_PASSWORD=<12 caractères minimum>
# Requis pour publier des photos (projet Supabase gratuit)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<clé service_role>
```

Sans `DATABASE_URL`, un Postgres embarqué (PGlite) est créé dans `./data/pglite` — pratique pour tester, mais les données sont locales. Publier une photo exige une configuration Supabase Storage ; la consultation, l'inscription et les commentaires fonctionnent sans.

Générer un secret JWT :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Puis :

```bash
npm start       # production locale
npm run dev     # rechargement automatique
```

- Site : http://localhost:3000
- Modération : http://localhost:3000/admin.html
- Santé de l'API : http://localhost:3000/api/health

Au premier démarrage, si aucun administrateur n'existe et que `ADMIN_EMAIL` / `ADMIN_PASSWORD` sont renseignés, ce compte est créé automatiquement. Modifier ces variables ensuite ne change pas le mot de passe d'un admin existant : utilisez `npm run user:reset-password`. En développement, `SEED_DEMO` vaut `true` par défaut ; les annonces de démonstration ne sont jamais créées en production.

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `NODE_ENV` | `development` | `production` active les contrôles stricts, HSTS et le cache adapté |
| `PORT` | `3000` | Port HTTP interne |
| `BASE_URL` | `http://localhost:3000` | URL publique **HTTPS**, sans slash final. Obligatoire pour Stripe |
| `TRUST_PROXY` | `false` | `true` derrière nginx, Caddy, Cloudflare… |
| `JWT_SECRET` | — | Secret de signature, 32 caractères minimum en production |
| `DATABASE_URL` | — | URI Postgres (Supabase, pooler de session). Absent en dev : Postgres embarqué PGlite |
| `SUPABASE_URL` | — | URL du projet Supabase (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Clé `service_role` (secrète, jamais côté navigateur) |
| `SUPABASE_BUCKET` | `photos` | Bucket public des photos, créé au démarrage s'il manque |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Création du premier administrateur ; mot de passe de 12 caractères min. en production |
| `SUPPORT_EMAIL` | `contact@example.com` | Adresse affichée sur les pages légales et de contact |
| `SEED_DEMO` | `true` en dev | À laisser `false` en production |
| `MAX_UPLOAD_BYTES` | `8388608` | Taille maximale par photo (8 Mo) |
| `MAX_ADS_PER_USER` | `10` | Annonces actives maximum par membre |
| `STRIPE_SECRET_KEY` | — | Clé `sk_test_…` ou `sk_live_…` |
| `STRIPE_PRICE_ID` | — | Prix récurrent `price_…` de l'abonnement Premium |
| `STRIPE_WEBHOOK_SECRET` | — | Secret `whsec_…` du endpoint webhook, requis en production |
| `TERMS_VERSION` | `1.0` | Version des CGU acceptée à l'inscription |

La configuration est vérifiée au démarrage en production : `JWT_SECRET` fort, `BASE_URL` HTTPS, secret webhook si Stripe est actif, mot de passe admin d'au moins 12 caractères.

## Configuration Stripe

1. Créez un **produit** avec un **prix récurrent** dans le [dashboard Stripe](https://dashboard.stripe.com/products).
2. Renseignez `STRIPE_SECRET_KEY` et `STRIPE_PRICE_ID` dans `.env`.
3. Créez un endpoint webhook vers `https://votre-domaine.com/api/stripe/webhook` et abonnez-le aux événements :
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copiez le secret de signature dans `STRIPE_WEBHOOK_SECRET`.
5. Activez le **portail client** Stripe (Paramètres → Facturation → Portail client), utilisé par « Gérer mon abonnement ».

En local, avec la CLI Stripe :

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Testez d'abord en mode test (`sk_test_…`, carte `4242 4242 4242 4242`), puis basculez sur les clés live. Un webhook non signé est refusé en production ; les événements déjà traités sont ignorés grâce à la table `stripe_events`.

## Modération et administration

- Les annonces sont créées avec le statut `pending` et restent invisibles du public.
- L'admin approuve ou refuse avec un motif ; le motif est affiché à l'auteur.
- Toute modification par l'auteur renvoie l'annonce en modération.
- Les signalements (annonces et commentaires) sont consultables, résolus ou rejetés depuis `/admin.html`.
- Les rôles `admin` et `moderator` existent : un modérateur modère les annonces et signalements, mais seul un admin peut suspendre un compte.

Scripts utiles :

```bash
npm run admin:create -- admin@votre-domaine.com 'MotDePasseSolide!' 'Admin'
npm run user:reset-password -- membre@exemple.com 'NouveauMotDePasse!'
```

Ils lisent aussi `ADMIN_EMAIL` / `ADMIN_PASSWORD` ou `RESET_EMAIL` / `RESET_PASSWORD`. Un administrateur ne peut pas supprimer le dernier compte admin.

## Routes API principales

Toutes les routes sont préfixées par `/api`.

| Domaine | Routes |
|---|---|
| Public | `GET /health`, `GET /meta`, `GET /stats` |
| Authentification | `POST /auth/register`, `POST /auth/login`, `GET/PATCH /auth/me`, `POST /auth/me/password`, `GET /auth/me/export`, `DELETE /auth/me` |
| Annonces | `GET /annonces`, `GET /annonces/mine`, `GET /annonces/:id`, `POST /annonces`, `PATCH /annonces/:id`, `DELETE /annonces/:id` |
| Commentaires | `GET/POST /comments/:annonceId`, `DELETE /comments/:annonceId/:commentId` |
| Signalements | `POST /reports` |
| Administration | `GET /admin/stats`, `GET /admin/annonces`, `POST /admin/annonces/:id/approve`, `POST /admin/annonces/:id/reject`, `GET /admin/reports`, `POST /admin/reports/:id/resolve`, `GET /admin/users`, `POST /admin/users/:id/ban` |
| Stripe | `GET /stripe/config`, `POST /stripe/create-checkout-session`, `POST /stripe/portal`, `GET /stripe/session-status`, `POST /stripe/webhook` |

Les routes protégées attendent un en-tête `Authorization: Bearer <token>`.

## Tests

```bash
npm test
```

La suite démarre un serveur isolé sur un port libre, avec un Postgres embarqué en mémoire (PGlite exposé en TCP) et un serveur Storage Supabase factice, et couvre : en-têtes de sécurité et non-exposition des fichiers internes, inscriptions et doublons, sessions, filtres/recherche/pagination, commentaires, blocage de publication sans Premium, upload vers Storage et suppression EXIF, visibilité privée des annonces en attente, modération, refus motivés, rôles, suspensions, signalements, export RGPD, suppression de compte et dégradation propre sans Stripe.

Aucune vraie clé Stripe ni aucun fichier `.env` n'est utilisé par les tests.

## Déploiement

### Option 1 — Render (gratuit) + Supabase (gratuit) — recommandé

L'application est **sans état** : la base vit dans Supabase (Postgres), les photos dans Supabase Storage. Le conteneur Render n'a donc besoin d'aucun disque — le plan **free** suffit. Contrairement à Vercel, Render exécute le serveur Express, donc l'API, l'authentification et Stripe fonctionnent.

**1. Créez le projet Supabase (gratuit)** sur [supabase.com](https://supabase.com), puis récupérez :

- `DATABASE_URL` : Project Settings → Database → Connection string → URI, onglet **Session pooler** (port 5432). Remplacez `[YOUR-PASSWORD]` par le mot de passe de la base ;
- `SUPABASE_URL` : Project Settings → API → Project URL ;
- `SUPABASE_SERVICE_ROLE_KEY` : Project Settings → API → `service_role` (secrète).

Le bucket `photos` est créé automatiquement au premier démarrage. Les migrations de tables s'exécutent aussi au démarrage — rien à faire dans l'éditeur SQL.

**2. Déployez sur Render** : poussez le dépôt sur GitHub, puis dans Render : **New → Blueprint**, sélectionnez le dépôt et appliquez `render.yaml` (service Docker, plan free, healthcheck `/api/health`). Renseignez les variables secrètes demandées :

- `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` ;
- `BASE_URL` : URL HTTPS finale, sans slash final (ex. `https://tonu-prive.onrender.com` ou votre domaine) ;
- `ADMIN_EMAIL` et `ADMIN_PASSWORD` (12 caractères minimum) : le compte admin est créé au premier démarrage ;
- `SUPPORT_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.

`JWT_SECRET` est généré par Render ; `TRUST_PROXY` et `SUPABASE_BUCKET` sont déjà définis.

**3. Finalisez** : ajoutez le domaine dans **Settings → Custom Domains**, mettez `BASE_URL` à jour, redéployez, puis créez le webhook Stripe vers `https://votre-domaine/api/stripe/webhook`.

Limites de l'offre gratuite : Render suspend le service après 15 min d'inactivité (réveil en ~30 s à la requête suivante) ; Supabase met le projet en pause après 7 jours sans activité (réactivez depuis le dashboard) ; quotas 500 Mo de base, 1 Go de stockage, 5 Go de trafic sortant/mois. Scripts dans le **Shell** Render :

```bash
npm run user:reset-password -- membre@exemple.com 'NouveauMotDePasse!'
npm run admin:create -- admin@exemple.com 'MotDePasseSolide!'
```

> **Vercel** ne peut pas héberger cette application telle quelle : `public/` y est servi, mais toutes les routes `/api/*` renvoient 404 (pas de serveur Express). Utilisez l'URL Render ou votre domaine comme adresse du site.

### Option 2 — Docker auto-hébergé

Le `Dockerfile` utilise Node 24 et un healthcheck ; l'application tourne avec l'utilisateur `node`. Renseignez `DATABASE_URL` et les variables Supabase dans `.env` — aucun volume n'est nécessaire puisque ni la base ni les photos ne sont locales.

```bash
cp .env.example .env
# Renseignez .env : BASE_URL=https://votre-domaine.com, JWT_SECRET, admin, Stripe…
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

Le service est publié sur `127.0.0.1:3000` uniquement : ajoutez un reverse proxy TLS (Caddy, nginx, Traefik) devant. Avec Caddy :

```caddyfile
votre-domaine.com {
  reverse_proxy 127.0.0.1:3000
  request_body {
    max_size 10MB
  }
}
```

Avec nginx, dans votre bloc TLS :

```nginx
client_max_body_size 10m;

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Mettez `TRUST_PROXY=true` dans `.env` derrière un proxy. Si le port 3000 est déjà occupé sur l'hôte, modifiez la partie gauche du mapping dans `docker-compose.yml`, pas `PORT` du conteneur.

Commandes dans le conteneur :

```bash
docker compose exec --user node app npm run admin:create -- admin@votre-domaine.com 'MotDePasseSolide!' 'Admin'
docker compose exec --user node app npm run user:reset-password -- membre@exemple.com 'NouveauMotDePasse!'
```

### Option 3 — VPS sans Docker

```bash
npm ci --omit=dev
cp .env.example .env    # à remplir
npm start
```

Gardez le processus sous PM2 ou systemd, avec redémarrage automatique, et placez HTTPS devant. `NODE_ENV=production` et `BASE_URL=https://…` sont obligatoires.

### Liste de contrôle avant ouverture

- [ ] `NODE_ENV=production`, `BASE_URL` en HTTPS, `JWT_SECRET` aléatoire de 32+ caractères
- [ ] `DATABASE_URL` (pooler de session), `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` renseignés ; bucket créé au démarrage
- [ ] Mot de passe admin unique de 12+ caractères ; `SUPPORT_EMAIL` réel
- [ ] `SEED_DEMO=false`
- [ ] Clés Stripe **live**, webhook signé et testé, portail client activé
- [ ] Identité de l'éditeur et coordonnées de l'hébergeur complétées dans `public/mentions-legales.html`
- [ ] Pages CGU, confidentialité, sécurité et mentions légales relues par un conseil juridique
- [ ] Sauvegarde Supabase testée (restauration comprise)
- [ ] Reverse proxy TLS, pare-feu, accès SSH restreint, journaux et supervision en place
- [ ] Parcours complet vérifié : inscription, commentaire, paiement test, webhook, publication, modération

## Sauvegardes et maintenance

La base et les photos vivent dans Supabase — aucun fichier local à sauvegarder.

- **Base** : l'offre gratuite Supabase n'inclut pas de sauvegardes automatiques. Exportez régulièrement : Dashboard → Database → Backups (selon offre) ou en ligne de commande `pg_dump "<DATABASE_URL>" -F c -f backup.dump`. Restauration : `pg_restore -d "<DATABASE_URL>" backup.dump`.
- **Photos** : bucket Storage. Export possible via la CLI Supabase (`supabase storage ls/download`) ou en dupliquant les objets via l'API. Les URL publiques sont immuables, une suppression de projet est donc définitive.
- Testez régulièrement une restauration sur un projet Supabase séparé.

## Sécurité et conformité

Mesures en place :

- Mots de passe hachés avec bcrypt (coût 12), jetons JWT expirant après 7 jours, comptes suspendus bloqués à chaque requête
- Limitation de débit sur l'API, l'authentification, les commentaires, les signalements, les publications et le paiement
- Validation stricte des entrées et échappement HTML de tous les contenus affichés (protection XSS stocké)
- Redirections post-paiement limitées à une liste blanche (protection contre l'open redirect)
- Upload limité à 3 photos de 8 Mo ; contenu réellement décodé par Sharp, ré-encodé en JPEG et débarrassé des métadonnées EXIF/GPS
- Annonces en attente et refusées invisibles du public (sauf auteur et modération)
- Webhooks Stripe signés, événements idempotents, aucune confiance accordée au retour navigateur
- Export JSON des données et suppression définitive du compte depuis l'espace membre (RGPD)
- `.env` et `data/` (Postgres embarqué de dev) exclus de Git ; code serveur non servi par le front ; la clé `service_role` ne quitte jamais le serveur

Points de vigilance opérateur :

- **Site réservé aux adultes** : vérifiez les obligations de votre juridiction en matière de preuve d'âge, de modération, de signalement de contenus illicites et de conservation. La porte d'entrée 18+ est déclarative et ne constitue pas une vérification d'identité.
- Les pages légales sont des modèles à faire valider ; l'identité de l'éditeur et de l'hébergeur doit être complétée avant mise en ligne.
- Aucun email transactionnel n'est envoyé (vérification d'adresse, mot de passe oublié). Utilisez `npm run user:reset-password` ou intégrez un fournisseur SMTP avant d'ouvrir à grande échelle.
- L'application est sans état et peut être répliquée, mais respectez les limites du pool de connexions Postgres (5 par instance) et les quotas de l'offre gratuite Supabase.
- La modération est humaine et doit être organisée (délais de traitement, escalade des contenus graves).
- Faites vérifier la conformité fiscale, commerciale et RGPD de votre activité avant exploitation.

## Structure

```
.
├── server/            API Express (routes, middleware, validation, upload, Stripe)
├── public/            Front statique servi au navigateur
├── scripts/           Création admin et réinitialisation de mot de passe
├── test/              Tests unitaires et d'intégration (node:test)
├── data/pglite/       Postgres embarqué de développement uniquement (ignoré par Git)
├── legacy/            Anciennes pages inutilisées, hors du dossier servi
├── Dockerfile
├── docker-compose.yml
├── render.yaml
└── .env.example
```

Le projet est privé. Tous droits réservés.
