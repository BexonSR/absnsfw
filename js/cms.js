// Visual Website Editor Studio (7-tab CMS) + Live On-Page Click-to-Edit Engine.
// Strictly accessible only when logged in as an admin user (isAdmin() === true).
import { $, $$, escapeHtml } from './utils.js';
import { api } from './api.js';
import {
  app,
  catalog,
  siteConfig,
  DEFAULT_SITE_CONFIG,
  setSiteConfig,
  setCatalogData,
  getTitleById,
  getArtworkForTitle,
  isAdmin,
  state,
} from './store.js';
import { applyCustomThemeTokens } from './theme.js';
import { showToast, positionSidebarPill, renderNotifications, updateBadges, switchNavTab, openSettingsModal } from './ui.js';
import { renderHero, updateHeroMyListBtn } from './hero.js';
import { renderContinueWatching, renderPopularMovies, renderCategoryView } from './cards.js';
import { syncAuthUI, openAuthModal } from './auth.js';

let activeStudioTab = 'brand';
let editingTitleId = null;     // null = new title, string = existing title id
let selectedEpTitleId = null;  // title selected in Seasons & Episodes tab
let selectedEpSeason = '1';
let draftSeasons = {};
let sqlUsersList = [];

/* ============================================================================
   1. APPLY SITE_CONFIG TO LIVE DOM (Brand, Nav, Sections, Theme)
   ============================================================================ */

export function applySiteConfigToDOM() {
  const { brand, navigation, sections, theme, footer } = siteConfig;

  // 1. Brand
  document.title = brand.pageTitle || 'CRIMSON — Anime Streaming Dashboard & Player';
  $$('[data-brand-name]').forEach((el) => { el.textContent = brand.brandName || 'CRIMSON'; });
  const logoPath = $('#brand-logo-path');
  if (logoPath) logoPath.setAttribute('stroke', brand.logoColor || '#ff1e38');
  const triggerLogoPath = $('#trigger-logo-path');
  if (triggerLogoPath) triggerLogoPath.setAttribute('stroke', brand.logoColor || '#ff1e38');
  const footerLogoPath = $('#footer-logo-path');
  if (footerLogoPath) footerLogoPath.setAttribute('stroke', brand.logoColor || '#ff1e38');
  const searchInput = $('#search-input');
  if (searchInput) searchInput.placeholder = brand.searchPlaceholder || 'Search movies, series...';

  const ann = $('#announcement-banner');
  if (ann) {
    const txt = (brand.announcement || '').trim();
    ann.textContent = txt;
    ann.classList.toggle('is-hidden', !txt);
  }

  // 2. Navigation labels & visibility
  (navigation || []).forEach((item) => {
    const sideBtn = $(`#sidebar-nav .nav-item[data-nav="${item.key}"]`);
    if (sideBtn) {
      const lbl = sideBtn.querySelector('.nav-label');
      if (lbl) lbl.textContent = item.label;
      sideBtn.classList.toggle('is-hidden', item.visible === false);
    }
    const tabBtn = $(`#tabbar .tab[data-nav="${item.key}"]`);
    if (tabBtn) {
      const lbl = tabBtn.querySelector('span');
      if (lbl) lbl.textContent = item.label;
      tabBtn.classList.toggle('is-hidden', item.visible === false);
    }
  });
  requestAnimationFrame(() => positionSidebarPill(state?.activeNav || 'home', true));

  // 3. Homepage sections visibility, headings & order
  const heroEl = $('#hero-banner');
  const contSec = $('#home-continue-section');
  const popSec = $('#home-popular-section');
  if (heroEl) heroEl.classList.toggle('is-hidden', sections.showHero === false);
  if (contSec) contSec.classList.toggle('is-hidden', sections.showContinueWatching === false);
  if (popSec) popSec.classList.toggle('is-hidden', sections.showPopularMovies === false);

  const contTitle = $('#continue-section-title');
  if (contTitle) contTitle.textContent = sections.continueTitle || 'Continue Watching';
  const popTitle = $('#popular-section-title');
  if (popTitle) popTitle.textContent = sections.popularTitle || 'Popular Movies';

  $('#notif-wrap')?.classList.toggle('is-hidden', sections.showNotifications === false);
  $('#cast-btn')?.classList.toggle('is-hidden', sections.showCastButton === false);

  // Reorder homepage sections according to sections.homeOrder
  const homeContainer = $('#home-view-section');
  if (homeContainer && Array.isArray(sections.homeOrder)) {
    const map = { hero: heroEl, continue: contSec, popular: popSec };
    sections.homeOrder.forEach((key) => {
      if (map[key]) homeContainer.appendChild(map[key]);
    });
  }

  // 4. Footer
  renderFooterDOM(brand, footer);

  // 5. Theme tokens
  applyCustomThemeTokens(theme);
  syncAuthUI();
}

function renderFooterColumn(titleSel, listSel, titleText, rawLinks) {
  const titleEl = $(titleSel);
  const listEl = $(listSel);
  if (titleEl) titleEl.textContent = titleText || '';
  if (!listEl) return;

  const lines = String(rawLinks || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  listEl.innerHTML = lines
    .map((line) => {
      const [labelPart, targetPart] = line.split('|');
      const label = (labelPart || '').trim();
      const target = (targetPart || '#lorem').trim();
      return `<li><button type="button" class="site-footer__link" data-footer-target="${escapeHtml(target)}">${escapeHtml(label)}</button></li>`;
    })
    .join('');

  $$('button[data-footer-target]', listEl).forEach((btn) => {
    btn.addEventListener('click', () => {
      const tgt = btn.dataset.footerTarget;
      if (['home', 'movies', 'series', 'anime', 'mylist', 'downloads'].includes(tgt)) {
        switchNavTab(tgt);
      } else if (tgt === '#settings') {
        openSettingsModal();
      } else if (tgt === '#auth') {
        openAuthModal('login');
      } else if (/^https?:\/\//i.test(tgt)) {
        window.open(tgt, '_blank', 'noopener,noreferrer');
      } else {
        showToast(`${btn.textContent} — Lorem ipsum dolor sit amet.`);
      }
    });
  });
}

function renderFooterDOM(brand, footer = {}) {
  const el = $('#site-footer');
  if (!el) return;
  const f = { ...DEFAULT_SITE_CONFIG.footer, ...footer };
  el.classList.toggle('is-hidden', f.visible === false);

  const fBrand = (f.brandName || '').trim() || brand.brandName || 'CRIMSON';
  $('#footer-brand-name').textContent = fBrand;
  $('#footer-tagline').textContent = f.tagline || '';
  $('#footer-content').textContent = f.content || '';
  $('#footer-copyright').textContent = f.copyright || `© 2026 ${fBrand}. All rights reserved.`;

  renderFooterColumn('#footer-col1-title', '#footer-col1-links', f.col1Title, f.col1Links);
  renderFooterColumn('#footer-col2-title', '#footer-col2-links', f.col2Title, f.col2Links);
  renderFooterColumn('#footer-col3-title', '#footer-col3-links', f.col3Title, f.col3Links);
}

export function refreshAllViews() {
  applySiteConfigToDOM();
  renderHero();
  renderContinueWatching();
  renderPopularMovies();
  renderNotifications();
  updateBadges();
  updateHeroMyListBtn();
  if (state && state.activeNav !== 'home') {
    renderCategoryView(state.activeNav);
  }
}

/* ============================================================================
   2. OPEN / CLOSE STUDIO & SWITCH TABS
   ============================================================================ */

export function openStudio(tabKey = 'brand', targetId = null) {
  if (!isAdmin()) return;
  activeStudioTab = tabKey;
  $('#studio-modal')?.classList.remove('is-hidden');
  switchStudioTab(tabKey, targetId);
}

export function closeStudio() {
  $('#studio-modal')?.classList.add('is-hidden');
}

export const isStudioOpen = () => !$('#studio-modal')?.classList.contains('is-hidden');

export function switchStudioTab(tabKey, targetId = null) {
  if (!isAdmin()) return;
  activeStudioTab = tabKey;
  $$('[data-studio-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.studioTab === tabKey));
  $$('[data-studio-pane]').forEach((p) => p.classList.toggle('is-hidden', p.dataset.studioPane !== tabKey));

  if (tabKey === 'brand') populateBrandPane();
  else if (tabKey === 'theme') populateThemePane();
  else if (tabKey === 'catalog') populateCatalogPane(targetId);
  else if (tabKey === 'episodes') populateEpisodesPane(targetId);
  else if (tabKey === 'player') populatePlayerPane();
  else if (tabKey === 'notifications') populateNotificationsPane();
  else if (tabKey === 'users') populateUsersPane();
  else if (tabKey === 'footer') populateFooterPane();
}

/* ============================================================================
   3. TAB 1: BRAND, NAVIGATION & HOMEPAGE SECTIONS
   ============================================================================ */

function populateBrandPane() {
  const { brand, navigation, sections } = siteConfig;
  $('#cms-brand-name').value = brand.brandName || 'CRIMSON';
  $('#cms-page-title').value = brand.pageTitle || '';
  $('#cms-logo-color').value = brand.logoColor || '#ff1e38';
  $('#cms-logo-color-hex').value = brand.logoColor || '#ff1e38';
  $('#cms-search-placeholder').value = brand.searchPlaceholder || '';
  $('#cms-announcement').value = brand.announcement || '';
  $('#cms-login-gate').checked = Boolean(brand.requireLoginGate);

  // Navigation items list
  const navBox = $('#cms-nav-items-list');
  navBox.innerHTML = (navigation || [])
    .map(
      (n, idx) => `
      <div class="cms-row" data-nav-idx="${idx}" data-nav-key="${escapeHtml(n.key)}">
        <div class="cms-row__main">
          <span class="badge badge-quiet" style="min-width:78px;justify-content:center">${escapeHtml(n.key)}</span>
          <input type="text" class="form-input cms-nav-label-input" value="${escapeHtml(n.label)}" placeholder="Nav label" />
        </div>
        <label class="row" style="--gap:8px;font-size:12px;font-weight:600;cursor:pointer">
          <input type="checkbox" class="checkbox cms-nav-vis-input" ${n.visible !== false ? 'checked' : ''} />
          <span>Visible</span>
        </label>
      </div>`
    )
    .join('');

  // Section headings & visibility
  $('#cms-sec-continue-title').value = sections.continueTitle || 'Continue Watching';
  $('#cms-sec-popular-title').value = sections.popularTitle || 'Popular Movies';
  $('#cms-sec-movies-head').value = sections.moviesHeading || 'Popular Movies';
  $('#cms-sec-movies-sub').value = sections.moviesSub || '';
  $('#cms-sec-series-head').value = sections.seriesHeading || 'Anime Series';
  $('#cms-sec-series-sub').value = sections.seriesSub || '';
  $('#cms-sec-anime-head').value = sections.animeHeading || 'All Anime Catalog';
  $('#cms-sec-anime-sub').value = sections.animeSub || '';
  $('#cms-sec-order').value = (sections.homeOrder || ['hero', 'continue', 'popular']).join(',');

  $('#cms-show-hero').checked = sections.showHero !== false;
  $('#cms-show-continue').checked = sections.showContinueWatching !== false;
  $('#cms-show-popular').checked = sections.showPopularMovies !== false;
  $('#cms-show-notifs').checked = sections.showNotifications !== false;
  $('#cms-show-cast').checked = sections.showCastButton !== false;
}

async function saveBrandPane() {
  const brand = {
    brandName: $('#cms-brand-name').value.trim() || 'CRIMSON',
    pageTitle: $('#cms-page-title').value.trim() || 'CRIMSON — Anime Streaming Dashboard & Player',
    logoColor: $('#cms-logo-color-hex').value.trim() || '#ff1e38',
    searchPlaceholder: $('#cms-search-placeholder').value.trim() || 'Search movies, series...',
    announcement: $('#cms-announcement').value.trim(),
    requireLoginGate: $('#cms-login-gate').checked,
  };

  const navigation = $$('#cms-nav-items-list .cms-row').map((row) => ({
    key: row.dataset.navKey,
    label: row.querySelector('.cms-nav-label-input').value.trim() || row.dataset.navKey,
    visible: row.querySelector('.cms-nav-vis-input').checked,
  }));

  const sections = {
    ...siteConfig.sections,
    continueTitle: $('#cms-sec-continue-title').value.trim() || 'Continue Watching',
    popularTitle: $('#cms-sec-popular-title').value.trim() || 'Popular Movies',
    moviesHeading: $('#cms-sec-movies-head').value.trim() || 'Popular Movies',
    moviesSub: $('#cms-sec-movies-sub').value.trim(),
    seriesHeading: $('#cms-sec-series-head').value.trim() || 'Anime Series',
    seriesSub: $('#cms-sec-series-sub').value.trim(),
    animeHeading: $('#cms-sec-anime-head').value.trim() || 'All Anime Catalog',
    animeSub: $('#cms-sec-anime-sub').value.trim(),
    homeOrder: $('#cms-sec-order').value.split(',').map((s) => s.trim()).filter(Boolean),
    showHero: $('#cms-show-hero').checked,
    showContinueWatching: $('#cms-show-continue').checked,
    showPopularMovies: $('#cms-show-popular').checked,
    showNotifications: $('#cms-show-notifs').checked,
    showCastButton: $('#cms-show-cast').checked,
  };

  const res = await api.put('/api/cms/config', { brand, navigation, sections });
  setSiteConfig(res.siteConfig);
  refreshAllViews();
  showToast('Brand, Navigation & Layout saved to SQL!', 'success');
}

/* ============================================================================
   4. TAB 2: THEME & DESIGN TOKENS (Live Color Pickers & Sliders)
   ============================================================================ */

function populateThemePane() {
  const t = siteConfig.theme;
  const pairs = [
    ['crimson', t.crimson || '#e50914'],
    ['crimsonBright', t.crimsonBright || '#ff1e38'],
    ['darkBg', t.darkBg || '#0a0a0e'],
    ['darkCardBg', t.darkCardBg || '#121218'],
    ['lightBg', t.lightBg || '#f4f3f7'],
    ['lightCardBg', t.lightCardBg || '#ffffff'],
  ];
  pairs.forEach(([key, val]) => {
    const picker = $(`#cms-color-${key}`);
    const hex = $(`#cms-hex-${key}`);
    if (picker) picker.value = val;
    if (hex) hex.value = val;
  });

  const sliders = [
    ['radiusMd', t.radiusMd ?? 14, 'px'],
    ['radiusLg', t.radiusLg ?? 18, 'px'],
    ['blur', t.blur ?? 18, 'px'],
    ['heroMinHeight', t.heroMinHeight ?? 430, 'px'],
    ['cardMinWidth', t.cardMinWidth ?? 232, 'px'],
  ];
  sliders.forEach(([key, val, unit]) => {
    const sl = $(`#cms-slider-${key}`);
    const lbl = $(`#cms-val-${key}`);
    if (sl) sl.value = val;
    if (lbl) lbl.textContent = `${val}${unit}`;
  });
}

function readThemeFormValues() {
  return {
    crimson: $('#cms-hex-crimson').value.trim() || '#e50914',
    crimsonBright: $('#cms-hex-crimsonBright').value.trim() || '#ff1e38',
    darkBg: $('#cms-hex-darkBg').value.trim() || '#0a0a0e',
    darkCardBg: $('#cms-hex-darkCardBg').value.trim() || '#121218',
    lightBg: $('#cms-hex-lightBg').value.trim() || '#f4f3f7',
    lightCardBg: $('#cms-hex-lightCardBg').value.trim() || '#ffffff',
    radiusMd: Number($('#cms-slider-radiusMd').value),
    radiusLg: Number($('#cms-slider-radiusLg').value),
    blur: Number($('#cms-slider-blur').value),
    heroMinHeight: Number($('#cms-slider-heroMinHeight').value),
    cardMinWidth: Number($('#cms-slider-cardMinWidth').value),
  };
}

async function saveThemePane() {
  const theme = readThemeFormValues();
  const res = await api.put('/api/cms/config', { theme });
  setSiteConfig(res.siteConfig);
  applyCustomThemeTokens(siteConfig.theme);
  showToast('Custom Theme Tokens saved to SQL!', 'success');
}

async function resetThemeToDefault() {
  const theme = structuredClone(DEFAULT_SITE_CONFIG.theme);
  const res = await api.put('/api/cms/config', { theme });
  setSiteConfig(res.siteConfig);
  populateThemePane();
  applyCustomThemeTokens(siteConfig.theme);
  showToast('Theme reset to default Crimson palette');
}

/* ============================================================================
   5. TAB 3: CATALOG MANAGER (ANIME & MOVIES CRUD + IMAGE UPLOAD)
   ============================================================================ */

function populateCatalogPane(targetTitleId = null) {
  renderCatalogRows();
  if (targetTitleId) {
    const found = catalog.titles.find((t) => t.id === targetTitleId);
    if (found) loadTitleIntoForm(found);
  } else if (editingTitleId) {
    const found = catalog.titles.find((t) => t.id === editingTitleId);
    if (found) loadTitleIntoForm(found);
    else resetTitleForm();
  } else {
    resetTitleForm();
  }
}

function renderCatalogRows() {
  const list = $('#cms-catalog-list');
  const q = ($('#cms-catalog-filter')?.value || '').trim().toLowerCase();
  const items = catalog.titles.filter(
    (t) => !q || t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || t.type.includes(q)
  );

  list.innerHTML = items
    .map(
      (t, idx) => `
      <div class="cms-row" data-tid="${escapeHtml(t.id)}">
        <div class="cms-row__main">
          <div class="cms-row__thumb"><img src="${escapeHtml(getArtworkForTitle(t))}" alt="" /></div>
          <div style="min-width:0">
            <div class="row" style="--gap:6px;flex-wrap:wrap">
              <strong style="font-size:13px" class="truncate">${escapeHtml(t.title)}</strong>
              <span class="tag">${escapeHtml(t.type.toUpperCase())}</span>
              <span class="tag">★ ${escapeHtml(t.rating)}</span>
              <span class="tag">${t.year}</span>
            </div>
            <p style="font-size:11px;color:var(--text-muted)" class="truncate">
              ID: <code>${escapeHtml(t.id)}</code> • ${Object.keys(t.seasons || {}).length} season(s) • ${escapeHtml((t.genres || []).join(', '))}
            </p>
          </div>
        </div>
        <div class="cms-row__actions">
          <button class="btn btn-sm ${t.featured ? 'btn-crimson' : 'btn-glass'}" data-cat-act="toggle-featured" title="Toggle Hero Carousel Featured">
            ★ Hero
          </button>
          <button class="btn btn-sm ${t.popularMovie ? 'btn-crimson' : 'btn-glass'}" data-cat-act="toggle-popular" title="Toggle Popular Movies row">
            🔥 Popular
          </button>
          <button class="btn btn-glass btn-sm" data-cat-act="up" ${idx === 0 ? 'disabled' : ''} title="Move Up">↑</button>
          <button class="btn btn-glass btn-sm" data-cat-act="down" ${idx === items.length - 1 ? 'disabled' : ''} title="Move Down">↓</button>
          <button class="btn btn-glass btn-sm" data-cat-act="edit">Edit</button>
          <button class="btn btn-glass btn-sm" data-cat-act="episodes">Episodes</button>
          <button class="btn btn-glass btn-sm" data-cat-act="duplicate" title="Duplicate">Copy</button>
          <button class="btn btn-text is-danger" data-cat-act="delete" title="Delete">Delete</button>
        </div>
      </div>`
    )
    .join('');

  $$('#cms-catalog-list .cms-row').forEach((row) => {
    const tid = row.dataset.tid;
    row.querySelectorAll('[data-cat-act]').forEach((btn) => {
      btn.addEventListener('click', () => handleCatalogRowAction(tid, btn.dataset.catAct));
    });
  });
}

async function handleCatalogRowAction(tid, action) {
  const title = getTitleById(tid);
  if (!title) return;

  if (action === 'edit') {
    loadTitleIntoForm(title);
    $('#cms-title-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (action === 'episodes') {
    switchStudioTab('episodes', tid);
  } else if (action === 'toggle-featured') {
    const res = await api.put(`/api/cms/titles/${encodeURIComponent(tid)}`, {
      ...title,
      featured: !title.featured,
    });
    setCatalogData(res.catalog);
    renderCatalogRows();
    refreshAllViews();
    showToast(`${title.title} ${!title.featured ? 'added to' : 'removed from'} Hero Banner`, 'success');
  } else if (action === 'toggle-popular') {
    const res = await api.put(`/api/cms/titles/${encodeURIComponent(tid)}`, {
      ...title,
      popularMovie: !title.popularMovie,
    });
    setCatalogData(res.catalog);
    renderCatalogRows();
    refreshAllViews();
    showToast(`${title.title} ${!title.popularMovie ? 'pinned to' : 'unpinned from'} Popular row`, 'success');
  } else if (action === 'duplicate') {
    const copy = structuredClone(title);
    copy.id = `${title.id}-copy`;
    copy.title = `${title.title} (Copy)`;
    const res = await api.post('/api/cms/titles', copy);
    setCatalogData(res.catalog);
    renderCatalogRows();
    refreshAllViews();
    showToast(`Duplicated "${title.title}"`, 'success');
  } else if (action === 'delete') {
    const res = await api.del(`/api/cms/titles/${encodeURIComponent(tid)}`);
    setCatalogData(res.catalog);
    if (editingTitleId === tid) resetTitleForm();
    renderCatalogRows();
    refreshAllViews();
    showToast(`Deleted "${title.title}" from SQL catalog`);
  } else if (action === 'up' || action === 'down') {
    const ids = catalog.titles.map((t) => t.id);
    const i = ids.indexOf(tid);
    const swapIdx = action === 'up' ? i - 1 : i + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[i], ids[swapIdx]] = [ids[swapIdx], ids[i]];
    const res = await api.post('/api/cms/titles/reorder', { ids });
    setCatalogData(res.catalog);
    renderCatalogRows();
    refreshAllViews();
  }
}

function resetTitleForm() {
  editingTitleId = null;
  $('#cms-title-form-heading').textContent = 'Add New Anime / Movie to SQL';
  $('#cms-title-submit-btn').textContent = 'Create Title in SQL';
  $('#cms-t-id').value = '';
  $('#cms-t-id').disabled = false;
  $('#cms-t-title').value = '';
  $('#cms-t-white').value = '';
  $('#cms-t-crimson').value = '';
  $('#cms-t-type').value = 'anime';
  $('#cms-t-category').value = 'series';
  $('#cms-t-year').value = '2025';
  $('#cms-t-rating').value = '9.2';
  $('#cms-t-match').value = '98% Match';
  $('#cms-t-maturity').value = 'TV-14';
  $('#cms-t-duration').value = '24m';
  $('#cms-t-badge').value = 'Trending Now';
  $('#cms-t-tagline').value = '';
  $('#cms-t-genres').value = 'Action, Dark Fantasy';
  $('#cms-t-synopsis').value = '';
  $('#cms-t-artwork').value = '';
  $('#cms-t-featured').checked = false;
  $('#cms-t-popular').checked = false;
}

function loadTitleIntoForm(t) {
  editingTitleId = t.id;
  $('#cms-title-form-heading').textContent = `Editing: ${t.title} (${t.id})`;
  $('#cms-title-submit-btn').textContent = 'Save Title Changes to SQL';
  $('#cms-t-id').value = t.id;
  $('#cms-t-id').disabled = true;
  $('#cms-t-title').value = t.title || '';
  $('#cms-t-white').value = t.titleWhite || '';
  $('#cms-t-crimson').value = t.titleCrimson || '';
  $('#cms-t-type').value = t.type || 'anime';
  $('#cms-t-category').value = t.category || 'series';
  $('#cms-t-year').value = t.year ?? 2024;
  $('#cms-t-rating').value = t.rating || '9.0';
  $('#cms-t-match').value = t.match || '98% Match';
  $('#cms-t-maturity').value = t.maturity || 'TV-14';
  $('#cms-t-duration').value = t.durationLabel || '';
  $('#cms-t-badge').value = t.badge || 'Trending Now';
  $('#cms-t-tagline').value = t.tagline || '';
  $('#cms-t-genres').value = (t.genres || []).join(', ');
  $('#cms-t-synopsis').value = t.synopsis || '';
  $('#cms-t-artwork').value = t.artworkUrl || '';
  $('#cms-t-featured').checked = Boolean(t.featured);
  $('#cms-t-popular').checked = Boolean(t.popularMovie);
}

async function saveTitleForm(e) {
  e.preventDefault();
  const payload = {
    id: $('#cms-t-id').value.trim(),
    title: $('#cms-t-title').value.trim(),
    titleWhite: $('#cms-t-white').value.trim(),
    titleCrimson: $('#cms-t-crimson').value.trim(),
    type: $('#cms-t-type').value,
    category: $('#cms-t-category').value,
    year: Number($('#cms-t-year').value || 2024),
    rating: $('#cms-t-rating').value.trim() || '9.0',
    match: $('#cms-t-match').value.trim() || '98% Match',
    maturity: $('#cms-t-maturity').value.trim() || 'TV-14',
    durationLabel: $('#cms-t-duration').value.trim(),
    badge: $('#cms-t-badge').value.trim() || 'Trending Now',
    tagline: $('#cms-t-tagline').value.trim(),
    genres: $('#cms-t-genres').value.split(',').map((g) => g.trim()).filter(Boolean),
    synopsis: $('#cms-t-synopsis').value.trim(),
    artworkUrl: $('#cms-t-artwork').value.trim(),
    featured: $('#cms-t-featured').checked,
    popularMovie: $('#cms-t-popular').checked,
  };

  if (!payload.title) {
    showToast('Please enter a title name.');
    return;
  }

  if (editingTitleId) {
    const res = await api.put(`/api/cms/titles/${encodeURIComponent(editingTitleId)}`, payload);
    setCatalogData(res.catalog);
    showToast(`Updated "${payload.title}" in SQL!`, 'success');
  } else {
    const res = await api.post('/api/cms/titles', payload);
    setCatalogData(res.catalog);
    editingTitleId = res.titleId;
    loadTitleIntoForm(getTitleById(res.titleId));
    showToast(`Added "${payload.title}" to SQL catalog!`, 'success');
  }
  renderCatalogRows();
  refreshAllViews();
}

/* ============================================================================
   6. TAB 4: SEASONS & EPISODES MANAGER
   ============================================================================ */

function populateEpisodesPane(preferredTitleId = null) {
  const sel = $('#cms-ep-title-select');
  if (preferredTitleId) selectedEpTitleId = preferredTitleId;
  if (!selectedEpTitleId || !catalog.titles.some((t) => t.id === selectedEpTitleId)) {
    selectedEpTitleId = catalog.titles[0]?.id || '';
  }

  sel.innerHTML = catalog.titles
    .map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === selectedEpTitleId ? 'selected' : ''}>${escapeHtml(t.title)} (${escapeHtml(t.type)})</option>`)
    .join('');

  const titleObj = getTitleById(selectedEpTitleId);
  draftSeasons = structuredClone(titleObj?.seasons || { 1: [] });
  const sKeys = Object.keys(draftSeasons);
  if (!sKeys.includes(String(selectedEpSeason))) selectedEpSeason = sKeys[0] || '1';

  renderSeasonTabsAndEpisodes();
}

function renderSeasonTabsAndEpisodes() {
  const sBar = $('#cms-season-pills');
  const sKeys = Object.keys(draftSeasons).sort((a, b) => Number(a) - Number(b));
  sBar.innerHTML = sKeys
    .map(
      (s) => `
      <button type="button" class="btn btn-sm ${String(s) === String(selectedEpSeason) ? 'btn-crimson' : 'btn-glass'}" data-ep-season="${s}">
        Season ${s} (${(draftSeasons[s] || []).length})
      </button>`
    )
    .join('');

  $$('[data-ep-season]', sBar).forEach((b) => {
    b.addEventListener('click', () => {
      syncCurrentSeasonInputs();
      selectedEpSeason = b.dataset.epSeason;
      renderSeasonTabsAndEpisodes();
    });
  });

  const eps = draftSeasons[selectedEpSeason] || [];
  const tbody = $('#cms-episodes-tbody');
  tbody.innerHTML = eps
    .map(
      (ep, idx) => `
      <tr data-ep-idx="${idx}">
        <td style="width:65px"><input type="number" class="form-input ep-num-in" value="${ep.number ?? idx + 1}" min="1" /></td>
        <td style="width:105px"><input type="text" class="form-input ep-code-in" value="${escapeHtml(ep.code || `S${selectedEpSeason} E${idx + 1}`)}" /></td>
        <td><input type="text" class="form-input ep-title-in" value="${escapeHtml(ep.title || '')}" placeholder="Episode title" /></td>
        <td style="width:105px"><input type="number" class="form-input ep-dur-in" value="${ep.duration ?? 1440}" min="30" /></td>
        <td><input type="text" class="form-input ep-syn-in" value="${escapeHtml(ep.synopsis || '')}" placeholder="Episode synopsis" /></td>
        <td style="width:70px"><button type="button" class="btn btn-text is-danger ep-del-btn">Delete</button></td>
      </tr>`
    )
    .join('');

  $$('#cms-episodes-tbody .ep-del-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      syncCurrentSeasonInputs();
      const idx = Number(e.currentTarget.closest('tr').dataset.epIdx);
      draftSeasons[selectedEpSeason].splice(idx, 1);
      renderSeasonTabsAndEpisodes();
    });
  });
}

function syncCurrentSeasonInputs() {
  const rows = $$('#cms-episodes-tbody tr');
  if (!rows.length && !draftSeasons[selectedEpSeason]) return;
  draftSeasons[selectedEpSeason] = rows.map((tr, idx) => {
    const num = Number(tr.querySelector('.ep-num-in').value || idx + 1);
    return {
      id: `${selectedEpTitleId}-s${selectedEpSeason}-e${num}`,
      season: Number(selectedEpSeason),
      number: num,
      code: tr.querySelector('.ep-code-in').value.trim() || `S${selectedEpSeason} E${num}`,
      title: tr.querySelector('.ep-title-in').value.trim() || `Episode ${num}`,
      duration: Number(tr.querySelector('.ep-dur-in').value || 1440),
      synopsis: tr.querySelector('.ep-syn-in').value.trim(),
    };
  });
}

/* ============================================================================
   7. TAB 5: PLAYER & SUBTITLES TIMELINE EDITOR
   ============================================================================ */

function populatePlayerPane() {
  const p = siteConfig.player || DEFAULT_SITE_CONFIG.player;
  $('#cms-p-intro-start').value = p.introStartSec ?? 15;
  $('#cms-p-intro-end').value = p.introEndSec ?? 90;
  $('#cms-p-intro-skip').value = p.introSkipToSec ?? 92;

  renderSubtitlesTable(catalog.subtitles || []);
}

function renderSubtitlesTable(rows) {
  const tbody = $('#cms-subtitles-tbody');
  tbody.innerHTML = rows
    .map(
      (r, idx) => `
      <tr data-sub-idx="${idx}">
        <td style="width:90px"><input type="number" class="form-input sub-start-in" value="${r.start ?? 0}" min="0" /></td>
        <td style="width:90px"><input type="number" class="form-input sub-end-in" value="${r.end ?? 15}" min="1" /></td>
        <td><input type="text" class="form-input sub-jp-in" value="${escapeHtml(r.sub || '')}" placeholder="Japanese SUB line" /></td>
        <td><input type="text" class="form-input sub-en-in" value="${escapeHtml(r.dub || '')}" placeholder="English DUB line" /></td>
        <td style="width:70px"><button type="button" class="btn btn-text is-danger sub-del-btn">Delete</button></td>
      </tr>`
    )
    .join('');

  $$('#cms-subtitles-tbody .sub-del-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const current = readSubtitlesTable();
      current.splice(Number(e.currentTarget.closest('tr').dataset.subIdx), 1);
      renderSubtitlesTable(current);
    });
  });
}

function readSubtitlesTable() {
  return $$('#cms-subtitles-tbody tr').map((tr) => ({
    start: Number(tr.querySelector('.sub-start-in').value || 0),
    end: Number(tr.querySelector('.sub-end-in').value || 10),
    sub: tr.querySelector('.sub-jp-in').value.trim(),
    dub: tr.querySelector('.sub-en-in').value.trim(),
  }));
}

async function savePlayerAndSubtitles() {
  const playerCfg = {
    ...siteConfig.player,
    introStartSec: Number($('#cms-p-intro-start').value || 15),
    introEndSec: Number($('#cms-p-intro-end').value || 90),
    introSkipToSec: Number($('#cms-p-intro-skip').value || 92),
  };
  const cfgRes = await api.put('/api/cms/config', { player: playerCfg });
  setSiteConfig(cfgRes.siteConfig);

  const subRes = await api.put('/api/cms/subtitles', { subtitles: readSubtitlesTable() });
  setCatalogData(subRes.catalog);
  showToast('Player settings & Subtitle Timeline saved to SQL!', 'success');
}

/* ============================================================================
   8. TAB 6: NOTIFICATIONS EDITOR
   ============================================================================ */

function populateNotificationsPane() {
  renderNotificationsTable(catalog.notifications || []);
}

function renderNotificationsTable(rows) {
  const titleOpts = (selectedId) =>
    catalog.titles
      .map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.title)}</option>`)
      .join('');

  const tbody = $('#cms-notifs-tbody');
  tbody.innerHTML = rows
    .map(
      (n, idx) => `
      <tr data-n-idx="${idx}">
        <td><input type="text" class="form-input n-head-in" value="${escapeHtml(n.heading || '')}" placeholder="Heading (e.g. Demon Slayer S4 E1)" /></td>
        <td><input type="text" class="form-input n-text-in" value="${escapeHtml(n.text || '')}" placeholder="Notification message" /></td>
        <td style="width:110px"><input type="text" class="form-input n-time-in" value="${escapeHtml(n.time || 'Just now')}" placeholder="12m ago" /></td>
        <td style="width:170px"><select class="select n-tid-in" style="width:100%">${titleOpts(n.titleId)}</select></td>
        <td style="width:75px"><input type="number" class="form-input n-season-in" value="${n.season ?? 1}" min="1" /></td>
        <td style="width:70px"><button type="button" class="btn btn-text is-danger n-del-btn">Delete</button></td>
      </tr>`
    )
    .join('');

  $$('#cms-notifs-tbody .n-del-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const current = readNotificationsTable();
      current.splice(Number(e.currentTarget.closest('tr').dataset.nIdx), 1);
      renderNotificationsTable(current);
    });
  });
}

function readNotificationsTable() {
  return $$('#cms-notifs-tbody tr').map((tr, idx) => ({
    id: `n${idx + 1}`,
    heading: tr.querySelector('.n-head-in').value.trim() || 'New Episode',
    text: tr.querySelector('.n-text-in').value.trim(),
    time: tr.querySelector('.n-time-in').value.trim() || 'Just now',
    titleId: tr.querySelector('.n-tid-in').value,
    season: Number(tr.querySelector('.n-season-in').value || 1),
    epNum: 1,
  }));
}

async function saveNotificationsPane() {
  const res = await api.put('/api/cms/notifications', { notifications: readNotificationsTable() });
  setCatalogData(res.catalog);
  renderNotifications();
  showToast('Notifications saved to SQL!', 'success');
}

/* ============================================================================
   9. TAB 7: SQL USERS DIRECTORY & SNAPSHOT BACKUP / FACTORY RESET
   ============================================================================ */

async function populateUsersPane() {
  try {
    const res = await api.get('/api/users');
    sqlUsersList = res.users || [];
    renderUsersTable();
  } catch (err) {
    showToast(err.message || 'Could not load SQL users.');
  }
}

function renderUsersTable() {
  const tbody = $('#cms-users-tbody');
  tbody.innerHTML = sqlUsersList
    .map(
      (u) => `
      <tr data-uid="${u.id}">
        <td><code>#${u.id}</code></td>
        <td><input type="text" class="form-input u-uname-in" value="${escapeHtml(u.username)}" /></td>
        <td><input type="text" class="form-input u-dname-in" value="${escapeHtml(u.displayName)}" /></td>
        <td style="width:120px">
          <select class="select u-role-in" style="width:100%">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </td>
        <td><input type="text" class="form-input u-plan-in" value="${escapeHtml(u.planBadge || 'Premium 4K')}" /></td>
        <td><input type="password" class="form-input u-pass-in" placeholder="New password (optional)" /></td>
        <td>
          <div class="row" style="--gap:6px">
            <button type="button" class="btn btn-crimson btn-sm u-save-btn">Save</button>
            <button type="button" class="btn btn-text is-danger u-del-btn">Delete</button>
          </div>
        </td>
      </tr>`
    )
    .join('');

  $$('#cms-users-tbody tr').forEach((tr) => {
    const uid = Number(tr.dataset.uid);
    tr.querySelector('.u-save-btn').addEventListener('click', async () => {
      try {
        await api.put(`/api/users/${uid}`, {
          username: tr.querySelector('.u-uname-in').value.trim(),
          displayName: tr.querySelector('.u-dname-in').value.trim(),
          role: tr.querySelector('.u-role-in').value,
          planBadge: tr.querySelector('.u-plan-in').value.trim(),
          password: tr.querySelector('.u-pass-in').value,
        });
        showToast(`Updated SQL user #${uid}`, 'success');
        populateUsersPane();
      } catch (err) {
        showToast(err.message);
      }
    });

    tr.querySelector('.u-del-btn').addEventListener('click', async () => {
      try {
        await api.del(`/api/users/${uid}`);
        showToast(`Deleted SQL user #${uid}`);
        populateUsersPane();
      } catch (err) {
        showToast(err.message);
      }
    });
  });
}

/* ============================================================================
   9B. TAB 8: FOOTER & LOREM IPSUM CONTENT EDITOR
   ============================================================================ */

function populateFooterPane() {
  const f = { ...DEFAULT_SITE_CONFIG.footer, ...(siteConfig.footer || {}) };
  $('#cms-footer-visible').checked = f.visible !== false;
  $('#cms-footer-brand').value = f.brandName || '';
  $('#cms-footer-tagline').value = f.tagline || '';
  $('#cms-footer-content').value = f.content || '';
  $('#cms-footer-col1-title').value = f.col1Title || '';
  $('#cms-footer-col1-links').value = f.col1Links || '';
  $('#cms-footer-col2-title').value = f.col2Title || '';
  $('#cms-footer-col2-links').value = f.col2Links || '';
  $('#cms-footer-col3-title').value = f.col3Title || '';
  $('#cms-footer-col3-links').value = f.col3Links || '';
  $('#cms-footer-copy').value = f.copyright || '';
}

async function saveFooterPane() {
  const footer = {
    visible: $('#cms-footer-visible').checked,
    brandName: $('#cms-footer-brand').value.trim(),
    tagline: $('#cms-footer-tagline').value.trim(),
    content: $('#cms-footer-content').value.trim(),
    col1Title: $('#cms-footer-col1-title').value.trim(),
    col1Links: $('#cms-footer-col1-links').value,
    col2Title: $('#cms-footer-col2-title').value.trim(),
    col2Links: $('#cms-footer-col2-links').value,
    col3Title: $('#cms-footer-col3-title').value.trim(),
    col3Links: $('#cms-footer-col3-links').value,
    copyright: $('#cms-footer-copy').value.trim(),
  };
  const res = await api.put('/api/cms/config', { footer });
  setSiteConfig(res.siteConfig);
  applySiteConfigToDOM();
  showToast('Footer saved to SQL!', 'success');
}

/* ============================================================================
   10. LIVE ON-PAGE CLICK-TO-EDIT MODE
   ============================================================================ */

export function toggleLiveEditMode(force) {
  if (!isAdmin()) return;
  app.liveEditMode = typeof force === 'boolean' ? force : !app.liveEditMode;
  document.body.classList.toggle('live-edit-active', app.liveEditMode);
  const btn = $('#dock-live-edit-btn');
  if (btn) {
    btn.classList.toggle('is-active', app.liveEditMode);
    btn.querySelector('span').textContent = app.liveEditMode ? 'Live Edit: ON (Click Any Element)' : 'Live Edit Page';
  }
  if (app.liveEditMode) {
    showToast('Live Edit ON — Click any heading, nav item, hero banner, or anime card to edit!', 'success');
  }
}

/* ============================================================================
   11. INITIALIZE STUDIO & WIRE EVENTS
   ============================================================================ */

export function initCMS() {
  applySiteConfigToDOM();

  // Open / close Studio buttons
  $$('[data-open-studio]').forEach((btn) => {
    btn.addEventListener('click', () => openStudio(btn.dataset.openStudio || 'brand'));
  });
  $('#close-studio-btn')?.addEventListener('click', closeStudio);
  $('#studio-modal')?.addEventListener('click', (e) => {
    if (e.target === $('#studio-modal')) closeStudio();
  });

  // Studio left navigation tabs
  $$('[data-studio-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchStudioTab(btn.dataset.studioTab));
  });

  // Floating dock Live Edit toggle
  $('#dock-live-edit-btn')?.addEventListener('click', () => toggleLiveEditMode());

  // Tab 1: Brand & Layout save + logo color sync
  $('#cms-logo-color')?.addEventListener('input', (e) => { $('#cms-logo-color-hex').value = e.target.value; });
  $('#cms-logo-color-hex')?.addEventListener('input', (e) => { $('#cms-logo-color').value = e.target.value; });
  $('#cms-save-brand-btn')?.addEventListener('click', () => saveBrandPane().catch((err) => showToast(err.message)));

  // Tab 2: Theme color pickers & sliders live preview
  ['crimson', 'crimsonBright', 'darkBg', 'darkCardBg', 'lightBg', 'lightCardBg'].forEach((key) => {
    const picker = $(`#cms-color-${key}`);
    const hex = $(`#cms-hex-${key}`);
    picker?.addEventListener('input', () => {
      hex.value = picker.value;
      applyCustomThemeTokens(readThemeFormValues());
    });
    hex?.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) {
        picker.value = hex.value.trim();
        applyCustomThemeTokens(readThemeFormValues());
      }
    });
  });

  ['radiusMd', 'radiusLg', 'blur', 'heroMinHeight', 'cardMinWidth'].forEach((key) => {
    const sl = $(`#cms-slider-${key}`);
    const lbl = $(`#cms-val-${key}`);
    sl?.addEventListener('input', () => {
      lbl.textContent = `${sl.value}px`;
      applyCustomThemeTokens(readThemeFormValues());
    });
  });

  $('#cms-save-theme-btn')?.addEventListener('click', () => saveThemePane().catch((err) => showToast(err.message)));
  $('#cms-reset-theme-btn')?.addEventListener('click', () => resetThemeToDefault().catch((err) => showToast(err.message)));

  // Tab 3: Catalog manager
  $('#cms-catalog-filter')?.addEventListener('input', renderCatalogRows);
  $('#cms-new-title-btn')?.addEventListener('click', () => {
    resetTitleForm();
    $('#cms-t-title')?.focus();
  });
  $('#cms-title-reset-btn')?.addEventListener('click', resetTitleForm);
  $('#cms-title-form')?.addEventListener('submit', (e) => saveTitleForm(e).catch((err) => showToast(err.message)));

  // Local image file upload -> data URL for custom artwork
  $('#cms-t-artwork-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      $('#cms-t-artwork').value = String(reader.result || '');
      showToast(`Loaded image "${file.name}"`, 'success');
    };
    reader.readAsDataURL(file);
  });

  // Tab 4: Seasons & Episodes
  $('#cms-ep-title-select')?.addEventListener('change', (e) => populateEpisodesPane(e.target.value));
  $('#cms-add-season-btn')?.addEventListener('click', () => {
    syncCurrentSeasonInputs();
    const nums = Object.keys(draftSeasons).map(Number);
    const nextS = String((nums.length ? Math.max(...nums) : 0) + 1);
    draftSeasons[nextS] = [
      {
        id: `${selectedEpTitleId}-s${nextS}-e1`,
        season: Number(nextS),
        number: 1,
        code: `S${nextS} E1`,
        title: 'Episode 1: New Arc',
        duration: 1440,
        synopsis: '',
      },
    ];
    selectedEpSeason = nextS;
    renderSeasonTabsAndEpisodes();
  });
  $('#cms-del-season-btn')?.addEventListener('click', () => {
    const keys = Object.keys(draftSeasons);
    if (keys.length <= 1) {
      showToast('A title must keep at least 1 season.');
      return;
    }
    delete draftSeasons[selectedEpSeason];
    selectedEpSeason = Object.keys(draftSeasons)[0];
    renderSeasonTabsAndEpisodes();
  });
  $('#cms-add-episode-btn')?.addEventListener('click', () => {
    syncCurrentSeasonInputs();
    const list = draftSeasons[selectedEpSeason] || [];
    const nextNum = list.length + 1;
    list.push({
      id: `${selectedEpTitleId}-s${selectedEpSeason}-e${nextNum}`,
      season: Number(selectedEpSeason),
      number: nextNum,
      code: `S${selectedEpSeason} E${nextNum}`,
      title: `Episode ${nextNum}`,
      duration: 1440,
      synopsis: '',
    });
    draftSeasons[selectedEpSeason] = list;
    renderSeasonTabsAndEpisodes();
  });
  $('#cms-save-episodes-btn')?.addEventListener('click', async () => {
    syncCurrentSeasonInputs();
    try {
      const res = await api.put(`/api/cms/titles/${encodeURIComponent(selectedEpTitleId)}/episodes`, {
        seasons: draftSeasons,
      });
      setCatalogData(res.catalog);
      refreshAllViews();
      showToast('Seasons & Episodes saved to SQL!', 'success');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Tab 5: Player & Subtitles
  $('#cms-add-subtitle-btn')?.addEventListener('click', () => {
    const rows = readSubtitlesTable();
    const lastEnd = rows.length ? rows[rows.length - 1].end : 0;
    rows.push({ start: lastEnd + 1, end: lastEnd + 25, sub: '“New subtitle line...”', dub: '“New dubbed line...”' });
    renderSubtitlesTable(rows);
  });
  $('#cms-save-player-btn')?.addEventListener('click', () => savePlayerAndSubtitles().catch((err) => showToast(err.message)));

  // Tab 6: Notifications
  $('#cms-add-notif-btn')?.addEventListener('click', () => {
    const rows = readNotificationsTable();
    rows.unshift({
      id: `n${rows.length + 1}`,
      heading: 'New Simulcast Episode',
      text: 'Now streaming in 1080p HD.',
      time: 'Just now',
      titleId: catalog.titles[0]?.id || 'naruto-shippuden',
      season: 1,
      epNum: 1,
    });
    renderNotificationsTable(rows);
  });
  $('#cms-save-notifs-btn')?.addEventListener('click', () => saveNotificationsPane().catch((err) => showToast(err.message)));

  // Tab 7: SQL Users & Snapshot Backup
  $('#cms-create-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/users', {
        username: $('#cms-new-u-name').value.trim(),
        displayName: $('#cms-new-u-display').value.trim(),
        password: $('#cms-new-u-pass').value,
        role: $('#cms-new-u-role').value,
        planBadge: $('#cms-new-u-plan').value.trim() || 'Premium 4K',
      });
      $('#cms-new-u-name').value = '';
      $('#cms-new-u-display').value = '';
      $('#cms-new-u-pass').value = '';
      showToast('Created new SQL user account!', 'success');
      populateUsersPane();
    } catch (err) {
      showToast(err.message);
    }
  });

  $('#cms-export-btn')?.addEventListener('click', async () => {
    try {
      const data = await api.get('/api/cms/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'crimson-site-snapshot.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported full site snapshot JSON', 'success');
    } catch (err) {
      showToast(err.message);
    }
  });

  $('#cms-import-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const res = await api.post('/api/cms/import', parsed);
        setSiteConfig(res.siteConfig);
        setCatalogData(res.catalog);
        refreshAllViews();
        switchStudioTab(activeStudioTab);
        showToast('Imported site snapshot into SQL!', 'success');
      } catch (err) {
        showToast(err.message || 'Invalid snapshot JSON file');
      }
    };
    reader.readAsText(file);
  });

  $('#cms-factory-reset-btn')?.addEventListener('click', async () => {
    try {
      const res = await api.post('/api/cms/reset');
      setSiteConfig(res.siteConfig);
      setCatalogData(res.catalog);
      refreshAllViews();
      switchStudioTab(activeStudioTab);
      showToast('Factory reset complete — default catalog & theme restored!', 'success');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Tab 8: Footer & Lorem Ipsum editor
  $('#cms-reset-lorem-btn')?.addEventListener('click', () => {
    $('#cms-footer-content').value = DEFAULT_SITE_CONFIG.footer.content;
    showToast('Inserted default Lorem Ipsum text');
  });
  $('#cms-save-footer-btn')?.addEventListener('click', () => saveFooterPane().catch((err) => showToast(err.message)));

  // Global Live Edit click interceptor on the page
  document.addEventListener(
    'click',
    (e) => {
      if (!app.liveEditMode || !isAdmin()) return;
      // Ignore clicks inside modals, floating dock, or explicit Studio buttons
      if (e.target.closest('#studio-modal, #auth-modal, #settings-modal, #floating-studio-dock, [data-open-studio]')) return;

      const cardEl = e.target.closest('.media-card[data-title-id]');
      if (cardEl) {
        e.preventDefault();
        e.stopPropagation();
        openStudio('catalog', cardEl.dataset.titleId);
        return;
      }

      const editTarget = e.target.closest('[data-cms-edit]');
      if (editTarget) {
        e.preventDefault();
        e.stopPropagation();
        const key = editTarget.dataset.cmsEdit;
        if (key === 'hero') {
          const heroTid = editTarget.dataset.heroTitleId;
          openStudio('catalog', heroTid);
        } else if (key === 'theme') {
          openStudio('theme');
        } else if (key === 'footer') {
          openStudio('footer');
        } else {
          openStudio('brand');
        }
      }
    },
    true
  );
}
