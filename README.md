# tonú Privé

Site de rencontres adultes (18+) avec annonces modérées, commentaires, stockage d'images et abonnement **Stripe**.

## 🎯 Fonctionnalités

- **Consultation gratuite** : Parcourir les annonces sans compte
- **Compte utilisateur** : Inscription/connexion, gestion du profil
- **Commentaires** : Les utilisateurs connectés peuvent commenter les annonces
- **Publication Premium** : Payer via Stripe pour publier des annonces avec photos
- **Modération** : Les annonces sont soumises à validation avant publication
- **Admin** : Interface de modération pour approuver/refuser les annonces
- **Design premium** : Interface moderne avec curseur personnalisé, animations et responsive

## 🚀 Démarrage rapide

### Prérequis
- **Node.js 18+** installé
- **Stripe account** (mode test ou production)

### Installation

1. **Cloner le projet** (si applicable) ou naviguer dans le dossier

2. **Configurer l'environnement** :
   ```bash
   copy .env.example .env
   ```

3. **Éditer `.env`** avec vos configurations :
   ```env
   PORT=3000
   BASE_URL=http://localhost:3000
   JWT_SECRET=votre_secret_jwt_ici
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=votre_mot_de_passe_admin

   # Stripe (requis pour les paiements)
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_ID=price_...
   ```

4. **Installer les dépendances** :
   ```bash
   npm install
   ```

5. **Lancer le serveur** :
   ```bash
   npm start
   ```
   Pour le développement avec auto-reload :
   ```bash
   npm run dev
   ```

6. **Ouvrir le site** : [http://localhost:3000](http://localhost:3000)

### Compte Admin

Au premier lancement, un compte admin est automatiquement créé si `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont définis dans `.env`. Ce compte permet d'accéder à la page de modération (`/admin.html`).

## 💳 Configuration Stripe

### Créer un produit d'abonnement

1. Connectez-vous au [Dashboard Stripe](https://dashboard.stripe.com)
2. Créez un **produit** de type "Abonnement mensuel Premium"
3. Configurez le prix (ex: 4 990 FCFA ou équivalent)
4. Copiez le **Price ID** (format `price_...`) dans votre `.env` comme `STRIPE_PRICE_ID`

### Webhooks Stripe

#### En développement (local) :
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```
Copiez le secret webhook (`whsec_...`) dans `STRIPE_WEBHOOK_SECRET`.

#### En production :
Configurez l'URL du webhook dans votre dashboard Stripe :
```
https://votre-domaine.com/api/stripe/webhook
```

### Événements Stripe gérés
- `checkout.session.completed` : Activation du Premium après paiement
- `customer.subscription.updated` : Mise à jour de la date d'expiration
- `customer.subscription.deleted` : Désactivation du Premium

## 📡 API Routes

### Authentification
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/auth/register` | POST | Inscription (email, password, pseudo, age) |
| `/api/auth/login` | POST | Connexion → retourne JWT |
| `/api/auth/me` | GET | Profil utilisateur (Bearer token requis) |

### Annonces
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/annonces` | GET | Liste des annonces approuvées (filtres: cat, city, gender) |
| `/api/annonces/:id` | GET | Détail d'une annonce |
| `/api/annonces/mine` | GET | Annonces de l'utilisateur connecté |
| `/api/annonces` | POST | Publier une annonce (Premium requis, multipart/form-data) |
| `/api/annonces/:id` | DELETE | Supprimer une annonce |

### Commentaires
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/comments/:annonceId` | GET | Liste des commentaires d'une annonce |
| `/api/comments/:annonceId` | POST | Ajouter un commentaire (auth requis) |
| `/api/comments/:annonceId/:commentId` | DELETE | Supprimer un commentaire |

### Admin
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/admin/pending` | GET | File d'attente modération |
| `/api/admin/annonces/:id/approve` | POST | Approuver une annonce |
| `/api/admin/annonces/:id/reject` | POST | Refuser une annonce |

### Stripe
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/stripe/config` | GET | Configuration Stripe |
| `/api/stripe/create-checkout-session` | POST | Créer une session de paiement |
| `/api/stripe/webhook` | POST | Webhook Stripe |

## 🗄️ Base de données

Le site utilise **SQLite** (via `better-sqlite3`) pour une simplicité de déploiement.

- **Fichier** : `data/app.db`
- **Tables** :
  - `users` : Comptes utilisateurs
  - `annonces` : Annonces
  - `annonce_photos` : Photos des annonces
  - `comments` : Commentaires
  - `stripe_events` : Événements Stripe traités

Les migrations sont automatiques au démarrage.

## 📁 Structure du projet

```
tonu-prive/
├── server/              # Backend Express
│   ├── routes/         # Routes API
│   │   ├── auth.js
│   │   ├── annonces.js
│   │   ├── comments.js
│   │   ├── admin.js
│   │   └── stripe.js
│   ├── middleware/      # Middleware (auth)
│   ├── lib/            # Utilitaires (serialize)
│   ├── db.js           # Database & migrations
│   ├── config.js       # Configuration
│   └── index.js        # Point d'entrée serveur
├── uploads/            # Images uploadées (créé auto)
├── data/               # Base SQLite (créé auto)
├── images/             # Images statiques (demo)
├── index.html          # Page d'accueil
├── product.html        # Listing & détail annonces
├── publier.html        # Publication annonce
├── premium.html        # Page abonnement
├── compte.html         # Connexion/Inscription
├── admin.html          # Modération
├── shared.css          # Styles globaux
├── shared.js           # JS partagé (auth, UI)
├── api.js              # Client API
├── package.json
└── .env                # Configuration (à créer)
```

## 🚢 Déploiement

### Options d'hébergement

#### 1. VPS (DigitalOcean, Hetzner, etc.)

```bash
# Sur le serveur
git clone <votre-repo>
cd tonu-prive
npm install --production
cp .env.example .env
# Éditer .env avec vos clés de production Stripe
npm start
```

Utilisez **PM2** pour la production :
```bash
npm install -g pm2
pm2 start server/index.js --name tonu-prive
pm2 startup
pm2 save
```

#### 2. Platform as a Service (Render, Railway, etc.)

La plupart des PaaS supportent Node.js. Configurez :
- **Build command** : `npm install`
- **Start command** : `npm start`
- **Environment variables** : Ajoutez toutes les variables du `.env`

#### 3. Docker (optionnel)

Créez un `Dockerfile` :
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server/index.js"]
```

## 🔒 Sécurité

- **JWT** pour l'authentification (7 jours par défaut)
- **Bcrypt** pour le hashage des mots de passe
- **Validation** des entrées utilisateur
- **Age gate** : Vérification 18+ à l'entrée du site
- **Modération** : Les annonces sont validées avant publication
- **Stripe** : Paiements sécurisés via leur infrastructure

## 📝 Notes importantes

- Le site est conçu pour les adultes (18+)
- Les images uploadées sont stockées localement dans `uploads/`
- En production, configurez un backup régulier de `data/app.db`
- Pour un hébergement avec load balancing, utilisez un stockage externe (S3, etc.) pour les uploads
- Le mode démo fonctionne sans serveur (données fictives en JS)

## 🐛 Dépannage

### Stripe ne fonctionne pas
- Vérifiez que `STRIPE_SECRET_KEY` et `STRIPE_PRICE_ID` sont corrects
- En test, utilisez des clés `sk_test_`
- Vérifiez que le webhook est configuré correctement

### Les images ne s'affichent pas
- Vérifiez que le dossier `uploads/` a les droits d'écriture
- En production, vérifiez que `BASE_URL` pointe vers votre domaine réel

### Erreur de connexion
- Vérifiez que `JWT_SECRET` est défini dans `.env`
- Supprimez le fichier `data/app.db` pour réinitialiser la base

## 📄 Licence

Ce projet est privé. Tous droits réservés.
