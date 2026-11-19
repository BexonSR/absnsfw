// Static-hosting fallback backend (used on GitHub Pages when Flask + SQLite isn't running).
// Mirrors the /api/auth/*, /api/users/*, /api/user/state, and /api/cms/* endpoints in localStorage.

const DEMO_DB_KEY = 'absnsfw_static_demo_db_v1';
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;

let seedSiteConfig = {};
let seedCatalog = { titles: [], notifications: [], subtitles: [] };

export function seedStaticDemoDefaults(siteConfig, catalog) {
  seedSiteConfig = structuredClone(siteConfig || {});
  seedCatalog = structuredClone(catalog || { titles: [], notifications: [], subtitles: [] });
}

function defaultDemoUsers() {
  const now = Date.now();
  const baseProgress = {
    'one-piece':       { season: 1, epId: 'op-s1-e1024', code: 'S1 E1024', time: 490, duration: 1440, progress: 0.34, updatedAt: now - 1000 },
    'demon-slayer':    { season: 4, epId: 'ds-s4-e1',    code: 'S4 E1',    time: 605, duration: 1440, progress: 0.42, updatedAt: now - 2000 },
    'steins-gate':     { season: 1, epId: 'sg-s1-e1',    code: 'S1 E1',    time: 634, duration: 1440, progress: 0.44, updatedAt: now - 3000 },
    'attack-on-titan': { season: 4, epId: 'aot-s4-e7',   code: 'S4 E7',    time: 518, duration: 1440, progress: 0.36, updatedAt: now - 4000 },
    'jujutsu-kaisen':  { season: 2, epId: 'jjk-s2-e17',  code: 'S2 E17',   time: 979, duration: 1440, progress: 0.68, updatedAt: now - 5000 },
  };
  const baseList = ['naruto-shippuden', 'your-name'];
  const baseDownloads = [
    { titleId: 'naruto-shippuden', epId: 'naruto-s1-e1', code: 'S1 E1', size: '485 MB' },
    { titleId: 'your-name', epId: 'yn-movie', code: 'MOVIE', size: '1.8 GB' },
  ];
  const baseSettings = { ambientGlow: true, autoNext: true, audioMode: 'SUB', quality: '1080p', reducedMotion: false };

  return [
    {
      id: 1, username: 'admin', displayName: 'Crimson Admin', password: 'admin123',
      role: 'admin', planBadge: 'Studio Director', avatarUrl: '', themePref: 'system',
      createdAt: new Date().toISOString(),
      state: { myList: [...baseList], watchProgress: structuredClone(baseProgress), downloads: structuredClone(baseDownloads), readNotifIds: [], settings: { ...baseSettings } },
    },
    {
      id: 2, username: 'itachi', displayName: 'Itachi U.', password: 'crimson123',
      role: 'user', planBadge: 'Premium 4K', avatarUrl: '', themePref: 'system',
      createdAt: new Date().toISOString(),
      state: { myList: [...baseList], watchProgress: structuredClone(baseProgress), downloads: structuredClone(baseDownloads), readNotifIds: [], settings: { ...baseSettings } },
    },
  ];
}

function loadDB() {
  try {
    const raw = localStorage.getItem(DEMO_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        siteConfig: { ...structuredClone(seedSiteConfig), ...(parsed.siteConfig || {}) },
        catalog: parsed.catalog?.titles?.length ? parsed.catalog : structuredClone(seedCatalog),
        users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : defaultDemoUsers(),
        currentUserId: parsed.currentUserId ?? null,
      };
    }
  } catch { /* ignore */ }
  return {
    siteConfig: structuredClone(seedSiteConfig),
    catalog: structuredClone(seedCatalog),
    users: defaultDemoUsers(),
    currentUserId: null,
  };
}

function saveDB(db) {
  try { localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db)); } catch { /* ignore */ }
}

const publicUser = (u) => ({
  id: u.id, username: u.username, displayName: u.displayName, role: u.role,
  planBadge: u.planBadge, avatarUrl: u.avatarUrl || '', themePref: u.themePref || 'system',
  createdAt: u.createdAt,
});

const slugify = (text) => (text || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'new-title';

function fail(status, error) {
  const err = new Error(error);
  err.status = status;
  throw err;
}

export async function handleDemoApi(method, url, body) {
  const [path, queryStr] = url.split('?');
  const params = new URLSearchParams(queryStr || '');
  const db = loadDB();
  const currentUser = db.users.find((u) => u.id === db.currentUserId) || null;

  const requireAuth = () => { if (!currentUser) fail(401, 'Authentication required.'); return currentUser; };
  const requireAdmin = () => { const u = requireAuth(); if (u.role !== 'admin') fail(403, 'Admin privileges required.'); return u; };

  if (path === '/api/bootstrap' && method === 'GET') {
    return {
      ok: true,
      siteConfig: db.siteConfig,
      catalog: db.catalog,
      user: currentUser ? publicUser(currentUser) : null,
      userState: currentUser ? currentUser.state : null,
    };
  }

  if (path === '/api/auth/check-username' && method === 'GET') {
    const u = (params.get('u') || '').trim();
    const excl = Number(params.get('excludeId') || 0);
    if (!USERNAME_RE.test(u)) return { ok: true, available: false, valid: false, message: '3-24 chars (letters, numbers, _ . -)' };
    const taken = db.users.some((x) => x.username.toLowerCase() === u.toLowerCase() && x.id !== excl);
    return { ok: true, available: !taken, valid: true, message: taken ? `@${u} is already taken` : `@${u} is available` };
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const uname = (body?.username || '').trim().toLowerCase();
    const found = db.users.find((x) => x.username.toLowerCase() === uname && x.password === (body?.password || ''));
    if (!found) fail(401, 'Invalid username or password.');
    db.currentUserId = found.id;
    saveDB(db);
    return { ok: true, token: `demo-${found.id}`, user: publicUser(found), userState: found.state };
  }

  if (path === '/api/auth/register' && method === 'POST') {
    const u = (body?.username || '').trim();
    if (!USERNAME_RE.test(u)) fail(400, 'Username must be 3-24 characters (letters, numbers, _ . -).');
    if ((body?.password || '').length < 4) fail(400, 'Password must be at least 4 characters.');
    if (db.users.some((x) => x.username.toLowerCase() === u.toLowerCase())) fail(409, `Username '@${u}' is already taken.`);
    const nextId = Math.max(0, ...db.users.map((x) => x.id)) + 1;
    const newUser = {
      id: nextId, username: u, displayName: (body?.displayName || u).trim(), password: body.password,
      role: 'user', planBadge: (body?.planBadge || 'Premium 4K').trim(), avatarUrl: '', themePref: 'system',
      createdAt: new Date().toISOString(),
      state: structuredClone(db.users[0].state),
    };
    db.users.push(newUser);
    db.currentUserId = newUser.id;
    saveDB(db);
    return { ok: true, token: `demo-${newUser.id}`, user: publicUser(newUser), userState: newUser.state };
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    db.currentUserId = null;
    saveDB(db);
    return { ok: true };
  }

  if (path === '/api/auth/profile' && method === 'PUT') {
    const me = requireAuth();
    const u = (body?.username || me.username).trim();
    if (!USERNAME_RE.test(u)) fail(400, 'Invalid username format.');
    if (db.users.some((x) => x.username.toLowerCase() === u.toLowerCase() && x.id !== me.id)) fail(409, `Username '@${u}' is already taken.`);
    me.username = u;
    me.displayName = (body?.displayName || me.displayName).trim();
    me.planBadge = (body?.planBadge || me.planBadge).trim();
    me.avatarUrl = (body?.avatarUrl ?? me.avatarUrl).trim();
    if (body?.newPassword) me.password = body.newPassword;
    saveDB(db);
    return { ok: true, user: publicUser(me) };
  }

  if (path === '/api/user/state' && method === 'PUT') {
    const me = requireAuth();
    me.state = { ...me.state, ...body };
    saveDB(db);
    return { ok: true, userState: me.state };
  }

  if (path === '/api/users' && method === 'GET') {
    requireAdmin();
    return { ok: true, users: db.users.map(publicUser) };
  }

  if (path === '/api/users' && method === 'POST') {
    requireAdmin();
    const u = (body?.username || '').trim();
    if (!USERNAME_RE.test(u)) fail(400, 'Invalid username format.');
    if (db.users.some((x) => x.username.toLowerCase() === u.toLowerCase())) fail(409, `Username '@${u}' already exists.`);
    const nextId = Math.max(0, ...db.users.map((x) => x.id)) + 1;
    const nu = {
      id: nextId, username: u, displayName: (body?.displayName || u).trim(), password: body?.password || 'crimson123',
      role: body?.role === 'admin' ? 'admin' : 'user', planBadge: (body?.planBadge || 'Premium 4K').trim(),
      avatarUrl: '', themePref: 'system', createdAt: new Date().toISOString(),
      state: structuredClone(db.users[0].state),
    };
    db.users.push(nu);
    saveDB(db);
    return { ok: true, user: publicUser(nu) };
  }

  const userMatch = path.match(/^\/api\/users\/(\d+)$/);
  if (userMatch) {
    const me = requireAdmin();
    const targetId = Number(userMatch[1]);
    const idx = db.users.findIndex((x) => x.id === targetId);
    if (idx < 0) fail(404, 'User not found.');
    if (method === 'PUT') {
      const target = db.users[idx];
      const u = (body?.username || target.username).trim();
      if (db.users.some((x) => x.username.toLowerCase() === u.toLowerCase() && x.id !== targetId)) fail(409, 'Username taken.');
      target.username = u;
      target.displayName = (body?.displayName || target.displayName).trim();
      target.role = body?.role === 'admin' ? 'admin' : 'user';
      target.planBadge = (body?.planBadge || target.planBadge).trim();
      if (body?.password) target.password = body.password;
      saveDB(db);
      return { ok: true, user: publicUser(target) };
    }
    if (method === 'DELETE') {
      if (targetId === me.id) fail(400, 'Cannot delete active admin.');
      db.users.splice(idx, 1);
      saveDB(db);
      return { ok: true };
    }
  }

  if (path === '/api/cms/config' && method === 'PUT') {
    requireAdmin();
    for (const [k, v] of Object.entries(body || {})) {
      if (v && typeof v === 'object' && !Array.isArray(v) && db.siteConfig[k] && typeof db.siteConfig[k] === 'object') {
        db.siteConfig[k] = { ...db.siteConfig[k], ...v };
      } else {
        db.siteConfig[k] = v;
      }
    }
    saveDB(db);
    return { ok: true, siteConfig: db.siteConfig };
  }

  if (path === '/api/cms/titles' && method === 'POST') {
    requireAdmin();
    let tid = slugify(body?.id || body?.title);
    let c = 2;
    while (db.catalog.titles.some((t) => t.id === tid)) { tid = `${slugify(body?.id || body?.title)}-${c++}`; }
    const created = { ...body, id: tid, seasons: body?.seasons || { 1: [{ id: `${tid}-s1-e1`, season: 1, number: 1, code: 'S1 E1', title: 'Episode 1', duration: 1440, synopsis: body?.synopsis || '' }] } };
    db.catalog.titles.push(created);
    saveDB(db);
    return { ok: true, titleId: tid, catalog: db.catalog };
  }

  if (path === '/api/cms/titles/reorder' && method === 'POST') {
    requireAdmin();
    const order = new Map((body?.ids || []).map((id, i) => [id, i]));
    db.catalog.titles.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    saveDB(db);
    return { ok: true, catalog: db.catalog };
  }

  const epMatch = path.match(/^\/api\/cms\/titles\/([^/]+)\/episodes$/);
  if (epMatch && method === 'PUT') {
    requireAdmin();
    const t = db.catalog.titles.find((x) => x.id === decodeURIComponent(epMatch[1]));
    if (!t) fail(404, 'Title not found.');
    t.seasons = body?.seasons || t.seasons;
    saveDB(db);
    return { ok: true, catalog: db.catalog };
  }

  const titleMatch = path.match(/^\/api\/cms\/titles\/([^/]+)$/);
  if (titleMatch) {
    requireAdmin();
    const tid = decodeURIComponent(titleMatch[1]);
    const idx = db.catalog.titles.findIndex((x) => x.id === tid);
    if (idx < 0) fail(404, 'Title not found.');
    if (method === 'PUT') {
      db.catalog.titles[idx] = { ...db.catalog.titles[idx], ...body, id: tid };
      saveDB(db);
      return { ok: true, titleId: tid, catalog: db.catalog };
    }
    if (method === 'DELETE') {
      if (db.catalog.titles.length <= 1) fail(400, 'Cannot delete last title.');
      db.catalog.titles.splice(idx, 1);
      saveDB(db);
      return { ok: true, catalog: db.catalog };
    }
  }

  if (path === '/api/cms/subtitles' && method === 'PUT') {
    requireAdmin();
    db.catalog.subtitles = body?.subtitles || [];
    saveDB(db);
    return { ok: true, catalog: db.catalog };
  }

  if (path === '/api/cms/notifications' && method === 'PUT') {
    requireAdmin();
    db.catalog.notifications = body?.notifications || [];
    saveDB(db);
    return { ok: true, catalog: db.catalog };
  }

  if (path === '/api/cms/export' && method === 'GET') {
    requireAdmin();
    return { ok: true, version: 1, siteConfig: db.siteConfig, catalog: db.catalog };
  }

  if (path === '/api/cms/import' && method === 'POST') {
    requireAdmin();
    if (body?.siteConfig) db.siteConfig = body.siteConfig;
    if (body?.catalog) db.catalog = body.catalog;
    saveDB(db);
    return { ok: true, siteConfig: db.siteConfig, catalog: db.catalog };
  }

  if (path === '/api/cms/reset' && method === 'POST') {
    requireAdmin();
    db.siteConfig = structuredClone(seedSiteConfig);
    db.catalog = structuredClone(seedCatalog);
    saveDB(db);
    return { ok: true, siteConfig: db.siteConfig, catalog: db.catalog };
  }

  fail(404, 'Endpoint unavailable in static demo mode.');
}
