# CRIMSON / Absnsfw — Anime Streaming Dashboard, Visual Website Studio & SQL System

Responsive (phone → desktop) anime streaming dashboard & canvas video player with **Dark / Light / Auto** themes, a **Relational SQL User & Content Database (SQLite 3 + Python Flask)**, an **Editable Lorem Ipsum Footer**, and an **8-Tab Visual Website Studio UI + Live Click-to-Edit Mode**.

- **GitHub Repository**: https://github.com/BexonSR/absnsfw
- **GitHub Pages Live Demo** *(static demo with browser localStorage backend)*: https://bexonsr.github.io/absnsfw/

## 1. Quick Start (Full-Stack SQL + Flask)

```bash
pip install -r requirements.txt
python backend/app.py
# Open http://localhost:8000
```

On first run, `backend/app.py` automatically creates `db/crimson.db`, executes `db/schema.sql` and `db/seed.sql`, and seeds the catalog from `data/catalog.json`.

### Default Demo Accounts
| Role | Username | Password | Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin (Studio Editor)** | `admin` | `admin123` | Unlocks the **Visual Website Studio**, **Live Edit Page** mode, **Footer Editor**, and **SQL User Directory** |
| **Standard Viewer** | `itachi` | `crimson123` | Personal Watchlist, Continue Watching progress, Downloads & Profile settings (`Studio` UI is strictly hidden) |

You can also create new accounts via **Sign In → Create Account** with live username availability checking.

---

## 2. Live Demo Deployment Options

1. **GitHub Pages (Static Interactive Live Demo)**
   - Included workflow: [`.github/workflows/pages.yml`](.github/workflows/pages.yml)
   - In GitHub repository **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
   - Every push to `main` publishes `index.html`, `css/`, `js/`, `data/`, and `assets/` to `https://bexonsr.github.io/absnsfw/`.
   - When hosted statically without Flask, [`js/demoBackend.js`](js/demoBackend.js) automatically activates so Sign In, Account Creation, and all 8 Studio tabs work interactively in `localStorage`.

2. **Full-Stack Hosting (Real SQLite + Python Flask)**
   - Ready for **Railway** or **Render** via [`requirements.txt`](requirements.txt), [`Procfile`](Procfile), and [`render.yaml`](render.yaml):
     ```bash
     gunicorn backend.app:app --bind 0.0.0.0:$PORT
     ```

---

## 3. Multi-Language Project Structure

```text
index.html                  Semantic HTML markup (Dashboard, Player, Footer, Auth Modal, 8-Tab Studio)
db/
  schema.sql                SQLite DDL for 11 relational tables + indexes
  seed.sql                  Default site_config rows (brand, navigation, sections, theme, player, footer)
backend/
  app.py                    Flask HTTP server serving static assets + /api/* endpoints on port 8000
  db.py                     SQLite connection manager, schema/seed runner, bcrypt password helpers
  auth.py                   /api/auth/* (login, register, check-username, profile) & /api/users/*
  cms.py                    /api/bootstrap, /api/user/state, and /api/cms/*
css/
  tokens.css                Dark & Light CSS variables (dynamically overrideable by Studio Theme Editor)
  base.css                  Reset, typography, focus rings, scrollbar, icon utilities
  components.css            Glass surfaces, buttons, forms, media cards, hero, footer, player controls
  layout.css                App shell, proximity triangle trigger & sidebar drawer, topbar, bottom tabbar
  animations.css            GPU-friendly keyframes, scroll reveal, reduced-motion, visibility pause
  responsive.css            Mobile (<640px, <768px), tablet, laptop (1024px+), and wide desktop rules
  auth.css                  Sign In / Register / Profile modal & role badges
  cms.css                   8-Tab Visual Website Studio modal, floating Admin dock, live edit outlines
js/
  main.js                   Bootstrapping & global event wiring
  api.js                    REST fetch client with static-hosting fallback
  demoBackend.js            Browser localStorage API adapter for GitHub Pages static demo
  store.js                  Central state synced with /api/bootstrap and /api/user/state
  auth.js                   Login, registration, live username checker, profile editor, strict admin UI gate
  cms.js                    8-Tab Visual Website Studio + Footer Editor + Live Click-to-Edit engine
  theme.js                  Dark / Light / Auto theme switcher + live CSS variable injector
  ui.js                     Toasts, proximity triangle menu, mobile drawer, bottom tab bar, notifications
  hero.js                   Hero carousel (autoplay, swipe gestures, off-screen pause)
  cards.js                  Media cards, category views, My List toggling, quick "✎ Edit" admin chip
  search.js                 Real-time search filter
  player.js                 HTML5 canvas video player, controls, touch gestures, episode panel
  animations.js             IntersectionObserver scroll reveal & hidden-tab animation pause
  utils.js                  DOM helpers, time formatter, SVG sprite helpers
data/
  catalog.json              Catalog titles, episodes, notifications & subtitles
  site-config.json          Exported brand, theme, navigation, sections & footer config for static demo
assets/
  hero-art.svg              Vector crimson blood-moon anime artwork
scripts/
  build_catalog.py          CLI validator (python scripts/build_catalog.py --check --stats)
```
