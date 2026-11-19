// Central application store synced with the SQLite backend (/api/bootstrap & /api/user/state).
import { $, UNIFIED_IMAGE } from './utils.js';
import { api, setApiDemoMode } from './api.js';
import { seedStaticDemoDefaults, handleDemoApi } from './demoBackend.js';

export const STORAGE_KEY = 'crimson_anime_state_v1';

/** Catalog populated by loadBootstrap(): { titles, notifications, subtitles } */
export const catalog = { titles: [], notifications: [], subtitles: [] };

/** Current logged-in SQL user (or null when signed out). */
export const auth = { user: null };

/** Runtime flags shared across modules. */
export const app = {
  view: 'dashboard',       // 'dashboard' | 'player'
  liveEditMode: false,     // true when admin toggles Live Click-to-Edit on the page
  sqlConnected: false,
};

export const DEFAULT_SITE_CONFIG = {
  brand: {
    brandName: 'CRIMSON',
    pageTitle: 'CRIMSON — Anime Streaming Dashboard & Player',
    logoColor: '#ff1e38',
    searchPlaceholder: 'Search movies, series...',
    announcement: '',
    requireLoginGate: false,
  },
  navigation: [
    { key: 'home',      label: 'Home',      visible: true },
    { key: 'movies',    label: 'Movies',    visible: true },
    { key: 'series',    label: 'Series',    visible: true },
    { key: 'anime',     label: 'Anime',     visible: true },
    { key: 'mylist',    label: 'My List',   visible: true },
    { key: 'downloads', label: 'Downloads', visible: true },
  ],
  sections: {
    showHero: true,
    showContinueWatching: true,
    showPopularMovies: true,
    showNotifications: true,
    showCastButton: true,
    continueTitle: 'Continue Watching',
    popularTitle: 'Popular Movies',
    moviesHeading: 'Popular Movies',
    moviesSub: 'Acclaimed theatrical anime films in crystal-clear 4K HDR',
    seriesHeading: 'Anime Series',
    seriesSub: 'Long-running sagas and seasonal simulcasts',
    animeHeading: 'All Anime Catalog',
    animeSub: 'Browse every featured series and theatrical masterpiece',
    mylistHeading: 'My List',
    downloadsHeading: 'Offline Downloads',
    downloadsSub: 'Watch downloaded episodes anywhere with zero buffering',
    homeOrder: ['hero', 'continue', 'popular'],
  },
  theme: {
    crimson: '#e50914',
    crimsonBright: '#ff1e38',
    darkBg: '#0a0a0e',
    darkCardBg: '#121218',
    lightBg: '#f4f3f7',
    lightCardBg: '#ffffff',
    radiusMd: 14,
    radiusLg: 18,
    blur: 18,
    heroMinHeight: 430,
    cardMinWidth: 232,
    defaultMode: 'system',
  },
  player: {
    introStartSec: 15,
    introEndSec: 90,
    introSkipToSec: 92,
    defaultQuality: '1080p',
    defaultAudio: 'SUB',
  },
  footer: {
    visible: true,
    brandName: '',
    tagline: 'Curated anime streaming experience in 4K HDR.',
    content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    col1Title: 'Browse',
    col1Links: 'Home|home\nMovies|movies\nSeries|series\nAll Anime|anime',
    col2Title: 'Library & Account',
    col2Links: 'My List|mylist\nDownloads|downloads\nSettings|#settings\nAccount|#auth',
    col3Title: 'Legal & Info',
    col3Links: 'Terms of Service|#lorem\nPrivacy Policy|#lorem\nDMCA Notice|#lorem\nHelp Center|#lorem',
    copyright: '© 2026 CRIMSON. Lorem ipsum dolor sit amet — All rights reserved.',
  },
};

export let siteConfig = structuredClone(DEFAULT_SITE_CONFIG);
export let DEFAULT_STATE = null;
export let state = null;

export const isAdmin = () => Boolean(auth.user && auth.user.role === 'admin');

export function getArtworkForTitle(title) {
  return (title && title.artworkUrl && title.artworkUrl.trim()) || UNIFIED_IMAGE;
}

export function setSiteConfig(incoming = {}) {
  siteConfig = {
    brand: { ...DEFAULT_SITE_CONFIG.brand, ...(incoming.brand || {}) },
    navigation: Array.isArray(incoming.navigation) && incoming.navigation.length
      ? incoming.navigation
      : structuredClone(DEFAULT_SITE_CONFIG.navigation),
    sections: { ...DEFAULT_SITE_CONFIG.sections, ...(incoming.sections || {}) },
    theme: { ...DEFAULT_SITE_CONFIG.theme, ...(incoming.theme || {}) },
    player: { ...DEFAULT_SITE_CONFIG.player, ...(incoming.player || {}) },
    footer: { ...DEFAULT_SITE_CONFIG.footer, ...(incoming.footer || {}) },
  };
  return siteConfig;
}

export function setCatalogData(data = {}) {
  if (Array.isArray(data.titles)) catalog.titles = data.titles;
  if (Array.isArray(data.notifications)) catalog.notifications = data.notifications;
  if (Array.isArray(data.subtitles)) catalog.subtitles = data.subtitles;
  if (state) syncNotificationsWithCatalog();
}

function buildDefaultState() {
  const now = Date.now();
  return {
    activeNav: 'home',
    myList: ['naruto-shippuden', 'your-name'],
    downloads: [
      { titleId: 'naruto-shippuden', epId: 'naruto-s1-e1', code: 'S1 E1', size: '485 MB' },
      { titleId: 'your-name', epId: 'yn-movie', code: 'MOVIE', size: '1.8 GB' },
    ],
    watchProgress: {
      'one-piece':       { season: 1, epId: 'op-s1-e1024', code: 'S1 E1024', time: 490, duration: 1440, progress: 0.34, updatedAt: now - 1000 },
      'demon-slayer':    { season: 4, epId: 'ds-s4-e1',    code: 'S4 E1',    time: 605, duration: 1440, progress: 0.42, updatedAt: now - 2000 },
      'steins-gate':     { season: 1, epId: 'sg-s1-e1',    code: 'S1 E1',    time: 634, duration: 1440, progress: 0.44, updatedAt: now - 3000 },
      'attack-on-titan': { season: 4, epId: 'aot-s4-e7',   code: 'S4 E7',    time: 518, duration: 1440, progress: 0.36, updatedAt: now - 4000 },
      'jujutsu-kaisen':  { season: 2, epId: 'jjk-s2-e17',  code: 'S2 E17',   time: 979, duration: 1440, progress: 0.68, updatedAt: now - 5000 },
    },
    settings: { ambientGlow: true, autoNext: true, audioMode: 'SUB', quality: '1080p', reducedMotion: false },
    readNotifIds: [],
    notifications: structuredClone(catalog.notifications),
  };
}

function syncNotificationsWithCatalog() {
  const readSet = new Set(state.readNotifIds || []);
  state.notifications = catalog.notifications.map((n) => ({
    ...n,
    unread: !readSet.has(n.id),
  }));
}

export function applyUserStateFromSQL(sqlState) {
  if (!state) initState();
  if (!sqlState) return;
  state.myList = Array.isArray(sqlState.myList) ? sqlState.myList : state.myList;
  state.watchProgress = sqlState.watchProgress || {};
  state.downloads = Array.isArray(sqlState.downloads) ? sqlState.downloads : [];
  state.readNotifIds = Array.isArray(sqlState.readNotifIds) ? sqlState.readNotifIds : [];
  state.settings = { ...DEFAULT_STATE.settings, ...(sqlState.settings || {}) };
  syncNotificationsWithCatalog();
}

export async function loadCatalog() {
  // 1. Try SQLite + Flask backend (/api/bootstrap)
  try {
    const data = await api.get('/api/bootstrap');
    app.sqlConnected = true;
    setApiDemoMode(false);
    setSiteConfig(data.siteConfig || {});
    setCatalogData(data.catalog || {});
    auth.user = data.user || null;
    initState();
    if (data.userState) applyUserStateFromSQL(data.userState);
    return true;
  } catch (err) {
    // 2. Static hosting fallback (GitHub Pages / python -m http.server):
    //    loads data/site-config.json + data/catalog.json and activates local demo mode.
    try {
      const [catRes, cfgRes] = await Promise.all([
        fetch('data/catalog.json', { cache: 'no-cache' }),
        fetch('data/site-config.json', { cache: 'no-cache' }).catch(() => null),
      ]);
      if (!catRes.ok) throw new Error(`HTTP ${catRes.status}`);
      const catalogData = await catRes.json();
      const cfgData = cfgRes && cfgRes.ok ? await cfgRes.json() : structuredClone(DEFAULT_SITE_CONFIG);

      app.sqlConnected = false;
      seedStaticDemoDefaults(cfgData, catalogData);
      setApiDemoMode(true);

      const boot = await handleDemoApi('GET', '/api/bootstrap');
      setSiteConfig(boot.siteConfig || cfgData);
      setCatalogData(boot.catalog || catalogData);
      auth.user = boot.user || null;
      initState();
      if (boot.userState) applyUserStateFromSQL(boot.userState);
      return true;
    } catch (fallbackErr) {
      console.error('[crimson] could not load /api/bootstrap or data/catalog.json', err, fallbackErr);
      $('#catalog-error')?.classList.remove('is-hidden');
      return false;
    }
  }
}

export function initState() {
  DEFAULT_STATE = buildDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = structuredClone(DEFAULT_STATE);
    } else {
      const parsed = JSON.parse(raw);
      state = {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
        watchProgress: { ...DEFAULT_STATE.watchProgress, ...(parsed.watchProgress || {}) },
      };
    }
  } catch {
    state = structuredClone(DEFAULT_STATE);
  }
  syncNotificationsWithCatalog();
  return state;
}

let sqlSyncTimer = null;

export function saveState() {
  if (!state) return;
  // Derive readNotifIds from state.notifications
  state.readNotifIds = (state.notifications || []).filter((n) => !n.unread).map((n) => n.id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }

  if (auth.user) {
    clearTimeout(sqlSyncTimer);
    sqlSyncTimer = setTimeout(() => {
      api.put('/api/user/state', {
        myList: state.myList,
        watchProgress: state.watchProgress,
        downloads: state.downloads,
        readNotifIds: state.readNotifIds,
        settings: state.settings,
      }).catch(() => { /* ignore transient offline errors */ });
    }, 220);
  }
}

export function resetWatchProgress() {
  state.watchProgress = structuredClone(DEFAULT_STATE.watchProgress);
  saveState();
}

export function getTitleById(id) {
  return catalog.titles.find((t) => t.id === id) || catalog.titles[0];
}
