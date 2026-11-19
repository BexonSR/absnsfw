// Shell UI: toasts, sidebar/drawer, tab bar, view switching, notifications, settings modal.
import { $, $$, UNIFIED_IMAGE, escapeHtml } from './utils.js';
import { state, saveState, app } from './store.js';
import { renderContinueWatching, renderPopularMovies, renderCategoryView } from './cards.js';
import { updateHeroMyListBtn } from './hero.js';
import { exitPlayerView, openPlayer } from './player.js';
import { handleSearch } from './search.js';

/* ------------------------------ Toasts ------------------------------ */
export function showToast(message, accent = 'crimson') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast glass-panel';
  toast.innerHTML = `<span class="dot ${accent === 'success' ? 'is-success' : ''}"></span><p>${message}</p>`;
  container.appendChild(toast);
  requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('is-in')));
  setTimeout(() => {
    toast.classList.remove('is-in');
    setTimeout(() => toast.remove(), 340);
  }, 2900);
}

export function applyUnifiedImages() {
  $$('img[data-unified-img]').forEach((img) => { img.src = UNIFIED_IMAGE; });
}

export function applyReducedMotion() {
  document.documentElement.classList.toggle('reduced-motion', !!state.settings.reducedMotion);
}

/* --------------------------- Sidebar & badges --------------------------- */
const navButtons = $$('#sidebar-nav .nav-item');
const activePill = $('#nav-active-pill');

export function positionSidebarPill(navKey = state.activeNav, instant = false) {
  const target = navButtons.find((b) => b.dataset.nav === navKey) || navButtons[0];
  if (!target || !activePill) return;
  navButtons.forEach((b) => b.classList.toggle('is-active', b === target));
  if (instant) activePill.style.transition = 'none';
  activePill.style.transform = `translate3d(0, ${target.offsetTop}px, 0)`;
  activePill.style.height = `${target.offsetHeight}px`;
  if (instant) {
    void activePill.offsetHeight; // flush
    activePill.style.transition = '';
  }
}

export function syncTabbar(navKey) {
  const tabNavs = ['home', 'movies', 'series', 'mylist'];
  $$('#tabbar .tab[data-nav]').forEach((t) => t.classList.toggle('is-active', t.dataset.nav === navKey));
  $('#tabbar-menu-btn')?.classList.toggle('is-active', !tabNavs.includes(navKey));
}

export function updateBadges() {
  const ml = $('#mylist-badge');
  const dl = $('#downloads-badge');
  if (ml) {
    ml.textContent = state.myList.length;
    ml.classList.remove('pop-bounce');
    void ml.offsetWidth;
    ml.classList.add('pop-bounce');
  }
  if (dl) dl.textContent = state.downloads.length;
}

const isDrawerMode = () => window.matchMedia('(max-width: 1023px)').matches;
const canHover = () => window.matchMedia('(hover: hover)').matches;
const TRIANGLE_PROXIMITY_PX = 95;

function getTriggerCenter() {
  const trigger = $('#menu-triangle-trigger');
  if (!trigger) return { x: 43, y: 43 };
  const r = trigger.getBoundingClientRect();
  return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 43, y: 43 };
}

export function openMobileSidebar() {
  const sb = $('#sidebar');
  sb.classList.add('is-open');
  $('#menu-triangle-trigger')?.classList.add('is-menu-open');
  if (isDrawerMode()) {
    $('#mobile-sidebar-backdrop').classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  positionSidebarPill(state.activeNav, true);
}

export function closeMobileSidebar() {
  $('#sidebar').classList.remove('is-open');
  $('#menu-triangle-trigger')?.classList.remove('is-menu-open');
  $('#mobile-sidebar-backdrop').classList.remove('is-open');
  document.body.style.overflow = '';
}

export function initProximitySidebar() {
  const sb = $('#sidebar');
  const trigger = $('#menu-triangle-trigger');
  if (!sb) return;

  trigger?.addEventListener('mouseenter', () => {
    if (canHover() && !isDrawerMode()) openMobileSidebar();
  });
  trigger?.addEventListener('click', () => {
    if (sb.classList.contains('is-open')) closeMobileSidebar();
    else openMobileSidebar();
  });

  sb.addEventListener('mouseleave', (e) => {
    if (isDrawerMode() || !canHover()) return;
    const { x, y } = getTriggerCenter();
    if (Math.hypot(e.clientX - x, e.clientY - y) > TRIANGLE_PROXIMITY_PX) {
      closeMobileSidebar();
    }
  });

  window.addEventListener(
    'mousemove',
    (e) => {
      if (isDrawerMode() || !canHover() || document.fullscreenElement) return;
      const { x, y } = getTriggerCenter();
      const inProx = Math.hypot(e.clientX - x, e.clientY - y) <= TRIANGLE_PROXIMITY_PX;

      if (sb.classList.contains('is-open')) {
        const r = sb.getBoundingClientRect();
        const overMenu = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!overMenu && !inProx) {
          closeMobileSidebar();
        }
      } else if (inProx) {
        openMobileSidebar();
      }
    },
    { passive: true }
  );

  document.addEventListener('fullscreenchange', () => {
    trigger?.classList.toggle('is-hidden', Boolean(document.fullscreenElement));
  });
}

export const isSidebarOpen = () => $('#sidebar').classList.contains('is-open');

/* ------------------------------ Views ------------------------------ */
let viewTimer = null;

/** Cross-fade between dashboard and player (exit animation, then swap). Resolves once the new view is visible. */
export function setView(name) {
  const dash = $('#dashboard-view');
  const player = $('#player-view');
  const show = name === 'player' ? player : dash;
  const hide = name === 'player' ? dash : player;

  document.body.classList.toggle('is-player', name === 'player');
  $('#tabbar')?.classList.toggle('is-away', name === 'player');

  clearTimeout(viewTimer);
  show.classList.remove('is-leaving');
  hide.classList.add('is-leaving');

  return new Promise((resolve) => {
    viewTimer = setTimeout(() => {
      hide.classList.add('is-hidden');
      hide.classList.remove('is-leaving');
      show.classList.remove('is-hidden');
      show.classList.add('is-entering');
      void show.offsetWidth;
      show.classList.remove('is-entering');
      resolve();
    }, 170);
  });
}

export function switchNavTab(navKey) {
  state.activeNav = navKey;
  saveState();
  if (app.view === 'player') exitPlayerView();

  const searchInput = $('#search-input');
  if (searchInput.value.trim()) {
    searchInput.value = '';
    handleSearch('');
  }

  positionSidebarPill(navKey);
  syncTabbar(navKey);
  closeMobileSidebar();

  const home = $('#home-view-section');
  const cat = $('#category-view-section');
  if (navKey === 'home') {
    cat.classList.add('is-hidden');
    home.classList.remove('is-hidden');
    renderContinueWatching();
    renderPopularMovies();
    updateHeroMyListBtn();
  } else {
    home.classList.add('is-hidden');
    cat.classList.remove('is-hidden');
    renderCategoryView(navKey);
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* --------------------------- Notifications --------------------------- */
export function renderNotifications() {
  const list = $('#notif-list');
  const unread = state.notifications.filter((n) => n.unread).length;
  $('#notif-dot').classList.toggle('is-hidden', unread === 0);
  $('#notif-count-pill').textContent = unread > 0 ? `${unread} NEW` : 'ALL READ';

  list.innerHTML = state.notifications
    .map(
      (n) => `
      <button data-notif-id="${n.id}" class="notif ${n.unread ? 'is-unread' : ''}">
        <span class="notif__thumb"><img src="${UNIFIED_IMAGE}" alt="" loading="lazy" />${n.unread ? '<span class="dot"></span>' : ''}</span>
        <span class="notif__body">
          <span class="notif__row"><span class="notif__title truncate">${escapeHtml(n.heading)}</span><span class="notif__time">${escapeHtml(n.time)}</span></span>
          <span class="notif__text clamp-1" style="display:block">${escapeHtml(n.text)}</span>
        </span>
      </button>`
    )
    .join('');

  $$('button[data-notif-id]', list).forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = state.notifications.find((x) => x.id === btn.dataset.notifId);
      if (!n) return;
      n.unread = false;
      saveState();
      renderNotifications();
      $('#notif-dropdown').classList.add('is-hidden');
      openPlayer(n.titleId, n.season);
    });
  });
}

/* --------------------------- Settings modal --------------------------- */
let lastFocus = null;

export function openSettingsModal() {
  $('#setting-ambient').checked = !!state.settings.ambientGlow;
  $('#setting-autonext').checked = !!state.settings.autoNext;
  $('#setting-audio').value = state.settings.audioMode;
  $('#setting-quality').value = state.settings.quality;
  $('#setting-reduced-motion').checked = !!state.settings.reducedMotion;
  lastFocus = document.activeElement;
  $('#settings-modal').classList.remove('is-hidden');
  $('#close-settings-btn').focus();
}

export function closeSettingsModal() {
  $('#settings-modal').classList.add('is-hidden');
  lastFocus?.focus?.();
}

export const isSettingsOpen = () => !$('#settings-modal').classList.contains('is-hidden');

export function closeAllPopovers() {
  $('#notif-dropdown').classList.add('is-hidden');
  $('#profile-dropdown').classList.add('is-hidden');
  $('#profile-chevron').classList.remove('is-open');
  $('#profile-menu-btn').setAttribute('aria-expanded', 'false');
  $('#speed-popover').classList.add('is-hidden');
  $('#quality-popover').classList.add('is-hidden');
}
