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
- **SQLite** (better-sqlite3, mode WAL), migrations automatiques au démarrage
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
```

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
| `DATA_DIR` | `./data` | Base SQLite et sauvegardes |
| `UPLOADS_DIR` | `./uploads` | Photos traitées, dossier inscriptible |
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

La suite démarre un serveur isolé sur un port libre, avec des dossiers temporaires, et couvre : en-têtes de sécurité et non-exposition des fichiers internes, inscriptions et doublons, sessions, filtres/recherche/pagination, commentaires, blocage de publication sans Premium, upload et suppression EXIF, visibilité privée des annonces en attente, modération, refus motivés, rôles, suspensions, signalements, export RGPD, suppression de compte et dégradation propre sans Stripe.

Aucune vraie clé Stripe ni aucun fichier `.env` n'est utilisé par les tests.

## Déploiement

### Option 1 — Render (Docker + disque persistant)

`render.yaml` décrit un service Docker avec un disque persistant de 1 Go. La base SQLite et les photos vivent dans `/var/data`, en dehors du conteneur : elles survivent aux redéploiements. Contrairement à Vercel, Render exécute le serveur Express, donc l'API, l'authentification et Stripe fonctionnent.

1. Poussez le dépôt sur GitHub, puis dans Render : **New → Blueprint**, sélectionnez le dépôt et appliquez `render.yaml`.
2. Renseignez les variables secrètes demandées :
   - `BASE_URL` : URL HTTPS finale, sans slash final (ex. `https://tonu-prive.onrender.com` ou votre domaine) ;
   - `ADMIN_EMAIL` et `ADMIN_PASSWORD` (12 caractères minimum) : le compte admin est créé au premier démarrage s'il n'en existe aucun ;
   - `SUPPORT_EMAIL`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`.

   `JWT_SECRET` est généré par Render. `DATA_DIR`, `UPLOADS_DIR` et `TRUST_PROXY` sont déjà définis.
3. Le conteneur démarre en root uniquement pour corriger les droits du disque, puis l'application tourne avec l'utilisateur `node`.
4. Ajoutez le domaine dans **Settings → Custom Domains**, mettez `BASE_URL` à jour, puis redéployez.
5. Créez le webhook Stripe vers `https://votre-domaine/api/stripe/webhook` avec les événements listés plus bas.

Un disque Render nécessite une offre payante ; l'offre gratuite ne conserve pas SQLite ni les photos. Le plan `0.5c-512mb` suffit pour démarrer, augmentez la RAM si vous traitez beaucoup de photos en parallèle. Render crée un snapshot du disque toutes les 24 h, conservé au moins 7 jours, et permet de copier des fichiers via SCP.

Commandes dans le **Shell** Render (toujours en tant que `node`) :

```bash
gosu node npm run user:reset-password -- membre@exemple.com 'NouveauMotDePasse!'
gosu node npm run admin:create -- admin@exemple.com 'MotDePasseSolide!'
```

> **Vercel** ne peut pas héberger cette application telle quelle : `public/` y est servi, mais toutes les routes `/api/*` renvoient 404 (pas de serveur Express, de SQLite ni d'uploads). Utilisez l'URL Render ou votre domaine comme adresse du site.

### Option 2 — Docker auto-hébergé

Le `Dockerfile` utilise Node 24 et un healthcheck ; l'application tourne avec l'utilisateur `node`, après correction des droits du volume par l'entrypoint. `docker-compose.yml` persiste la base et les photos dans des volumes nommés.

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
- [ ] Mot de passe admin unique de 12+ caractères ; `SUPPORT_EMAIL` réel
- [ ] `SEED_DEMO=false`
- [ ] Clés Stripe **live**, webhook signé et testé, portail client activé
- [ ] Identité de l'éditeur et coordonnées de l'hébergeur complétées dans `public/mentions-legales.html`
- [ ] Pages CGU, confidentialité, sécurité et mentions légales relues par un conseil juridique
- [ ] Sauvegardes automatiques de `data/` et `uploads/` testées (restauration comprise)
- [ ] Reverse proxy TLS, pare-feu, accès SSH restreint, journaux et supervision en place
- [ ] Parcours complet vérifié : inscription, commentaire, paiement test, webhook, publication, modération

## Sauvegardes et maintenance

SQLite est en mode WAL : ne copiez pas `app.db` seul pendant que l'application tourne. Utilisez la sauvegarde en ligne :

```bash
# Hôte, hors Docker
node -e "const D=require('better-sqlite3');const d=new D('data/app.db');d.backup('backup-app.db').then(()=>d.close())"

# Docker
docker compose exec --user node app node -e "const D=require('better-sqlite3');const d=new D('/app/data/app.db');d.backup('/app/data/backup-app.db').then(()=>d.close())"
docker compose cp app:/app/data/backup-app.db ./backup-app.db

# Render (Shell du service)
gosu node node -e "const D=require('better-sqlite3');const d=new D('/var/data/app.db');d.backup('/var/data/backup-app.db').then(()=>d.close())"
```

Sauvegardez également `uploads/` (photos) ou les volumes `tonu-data` et `tonu-uploads`. Sur Render, le disque `/var/data` contient la base et les photos ; récupérez une copie via SCP ou Magic Wormhole. Testez régulièrement une restauration sur un environnement séparé.

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
- Dossiers `data/`, `uploads/`, `.env` et `legacy/` exclus de Git ; code serveur non servi par le front

Points de vigilance opérateur :

- **Site réservé aux adultes** : vérifiez les obligations de votre juridiction en matière de preuve d'âge, de modération, de signalement de contenus illicites et de conservation. La porte d'entrée 18+ est déclarative et ne constitue pas une vérification d'identité.
- Les pages légales sont des modèles à faire valider ; l'identité de l'éditeur et de l'hébergeur doit être complétée avant mise en ligne.
- Aucun email transactionnel n'est envoyé (vérification d'adresse, mot de passe oublié). Utilisez `npm run user:reset-password` ou intégrez un fournisseur SMTP avant d'ouvrir à grande échelle.
- L'architecture est mono-instance : SQLite et fichiers locaux ne permettent pas de répartir la charge sur plusieurs serveurs sans base et stockage partagés.
- La modération est humaine et doit être organisée (délais de traitement, escalade des contenus graves).
- Faites vérifier la conformité fiscale, commerciale et RGPD de votre activité avant exploitation.

## Structure

```
.
├── server/            API Express (routes, middleware, validation, upload, Stripe)
├── public/            Front statique servi au navigateur
├── scripts/           Création admin et réinitialisation de mot de passe
├── test/              Tests unitaires et d'intégration (node:test)
├── data/              Base SQLite (créée au démarrage, ignorée par Git)
├── uploads/           Photos traitées (créé au démarrage, ignoré par Git)
├── legacy/            Anciennes pages inutilisées, hors du dossier servi
├── Dockerfile
├── docker-entrypoint.sh
├── docker-compose.yml
├── render.yaml
└── .env.example
```

Le projet est privé. Tous droits réservés.
