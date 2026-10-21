# tonú Privé

Site de rencontres adultes (18+) avec annonces modérées, stockage d’images et abonnement **Stripe**.

## Démarrage rapide

1. **Node.js 18+** installé.
2. Copier la configuration :
   ```bash
   copy .env.example .env
   ```
3. Renseigner au minimum `JWT_SECRET`. Pour Stripe : clés test du [Dashboard Stripe](https://dashboard.stripe.com/test/apikeys) et un **Price ID** d’abonnement récurrent (`STRIPE_PRICE_ID`).
4. Installer et lancer :
   ```bash
   npm install
   npm start
   ```
5. Ouvrir [http://localhost:3000](http://localhost:3000)

Au premier lancement, un compte **admin** est créé si `ADMIN_EMAIL` / `ADMIN_PASSWORD` sont définis dans `.env`.

## Stripe

1. Créer un produit **Abonnement mensuel Premium** en mode test.
2. Copier le `price_...` dans `STRIPE_PRICE_ID`.
3. Webhooks locaux (Stripe CLI) :
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Copier le secret `whsec_...` dans `STRIPE_WEBHOOK_SECRET`.

Événements gérés : `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

## API (résumé)

| Route | Description |
|--------|-------------|
| `POST /api/auth/register` | Inscription |
| `POST /api/auth/login` | Connexion → JWT |
| `GET /api/auth/me` | Profil (Bearer token) |
| `GET /api/annonces` | Annonces **approuvées** |
| `POST /api/annonces` | Publier (Premium, `multipart/form-data`, champ `photos`) |
| `GET /api/admin/pending` | File modération (admin/modérateur) |
| `POST /api/stripe/create-checkout-session` | Redirection Checkout Stripe |

Fichiers uploadés : dossier `uploads/`. Base SQLite : `data/app.db`.

## Modération

Les nouvelles annonces sont en statut **pending** jusqu’à approbation sur `/admin.html` (compte admin).
