# Sentinel-2 Copernicus (frontend)

Application web permettant de sélectionner une zone d’intérêt (BBox) sur une carte et de récupérer/afficher une image Sentinel‑2 (L2A) pour une période donnée, via les API Copernicus Data Space Ecosystem.

## Fonctionnalités

- **Sélection de zone (BBox) sur la carte**
  - Sur desktop: sélection par clic droit + glisser.
  - Affichage visuel de la zone sélectionnée.

- **Recherche de dates disponibles**
  - Récupération d’un ensemble de dates (jour) disponibles pour la BBox sélectionnée.
  - Sélecteur “dates disponibles” (liste des 5 dates les plus récentes).

- **Chargement d’une image Sentinel‑2**
  - Choix d’une plage de dates (Date début / Date fin) (section masquable).
  - Appel de l’API Process pour générer une image **PNG** (composition RGB B04/B03/B02).
  - Affichage de la date/heure d’acquisition quand disponible.

- **Affichage cartographique**
  - Carte basée sur OpenStreetMap.
  - Overlay de l’image Sentinel‑2 sur l’emprise (bounds) retournée.

- **UI/UX**
  - **Mode clair/sombre**.
  - **Encart d’aide** en entête **masquable**.

## Technologies utilisées

- **React**
- **TypeScript**
- **Vite** (dev server + build)
- **Material UI (MUI)** (composants, `Collapse`, etc.)
- **Tailwind CSS** (mise en page utilitaire)
- **Leaflet** + **react-leaflet** (carte)
- **Copernicus Data Space Ecosystem**
  - OAuth2 token endpoint
  - STAC Catalog (`/catalog/v1/search`)
  - Process API (`/process/v1`)

## Prérequis

- Node.js (LTS recommandé)
- Un compte / client applicatif Copernicus Data Space Ecosystem avec:
  - `client_id`
  - `client_secret`

## Configuration

### Développement local

En développement, l’application passe par les routes locales `__cdse_*` (proxy Vite).

### Déploiement Netlify (recommandé)

Le token OAuth et les appels vers Copernicus sont gérés **côté serveur** via des **Netlify Functions**.

Configurer dans Netlify (Site settings -> Build & deploy -> Environment) :

```bash
CDSE_CLIENT_ID=...
CDSE_CLIENT_SECRET=...
```

Le frontend ne contient pas de secret.

#### Déployer sur Netlify

Pour déployer des **Functions**, il faut utiliser :

- un déploiement **via Git** (Netlify build)
- ou **Netlify CLI**

L’upload manuel (drag&drop d’un zip) est adapté aux sites statiques, mais ne publie pas correctement les Netlify Functions.

## Installation

```bash
npm install
```

## Lancer en développement

```bash
npm run dev
```

Par défaut Vite écoute sur le port `5173`.

### Accès via l’adresse IP (réseau)

Le projet est configuré pour exposer le serveur Vite sur le réseau (équivalent `0.0.0.0`).

- Sur ta machine: `http://localhost:5173`
- Depuis une autre machine: `http://<TON_IP>:5173`

Si l’accès réseau ne fonctionne pas:

- Vérifier le firewall Windows (autoriser le port `5173`).

## Build production

```bash
npm run build
```

## Prévisualiser le build

```bash
npm run preview
```

Par défaut, `vite preview` écoute sur `4173`.

## Notes techniques

- Les appels vers Copernicus Data Space sont effectués via des routes locales :
  - `/_ _cdse_sh/*` (Catalog + Process)
  - `/_ _cdse_token` (optionnel)
- En dev : ces routes sont **proxyfiées par Vite**.
- Sur Netlify : ces routes sont routées vers des **Netlify Functions** (dossier `/.netlify/functions` dans le build) via le fichier `/_redirects`.
