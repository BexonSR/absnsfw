import { $, $$, formatTime } from './utils.js';
import { loadCatalog, state, siteConfig, saveState, app, resetWatchProgress } from './store.js';
import { initTheme } from './theme.js';
import { initVisibilityPause } from './animations.js';
import {
  showToast, applyUnifiedImages, applyReducedMotion, updateBadges, positionSidebarPill, syncTabbar,
  openMobileSidebar, closeMobileSidebar, isSidebarOpen, initProximitySidebar, switchNavTab, renderNotifications,
  openSettingsModal, closeSettingsModal, isSettingsOpen, closeAllPopovers,
} from './ui.js';
import { initHero } from './hero.js';
import { renderContinueWatching, renderPopularMovies, toggleMyList } from './cards.js';
import { handleSearch } from './search.js';
import {
  player, initPlayerPopovers, togglePlayPause, seekRelative, toggleMute, showControlsTemporarily,
  onVideoSurfaceClick, updatePlayerUI, persistWatchProgress, getNextEpisode, cancelAutoNext,
  loadEpisodeIntoPlayer, updateAmbientGlowUI, updateAutoNextSwitchUI, exitPlayerView,
} from './player.js';
import { initAuth, openAuthModal, closeAuthModal, isAuthModalOpen, signOutUser } from './auth.js';
import { initCMS, openStudio, closeStudio, isStudioOpen, toggleLiveEditMode } from './cms.js';

function bindEvents() {
  /* ---- Navigation ---- */
  $$('#sidebar-nav .nav-item').forEach((b) => b.addEventListener('click', () => switchNavTab(b.dataset.nav)));
  $$('#tabbar .tab[data-nav]').forEach((b) => b.addEventListener('click', () => switchNavTab(b.dataset.nav)));
  $('#tabbar-menu-btn').addEventListener('click', openMobileSidebar);
  $('#brand-logo-btn').addEventListener('click', () => switchNavTab('home'));
  $('#mobile-menu-btn').addEventListener('click', openMobileSidebar);
  $('#mobile-close-sidebar').addEventListener('click', closeMobileSidebar);
  $('#mobile-sidebar-backdrop').addEventListener('click', closeMobileSidebar);
  $$('[data-see-all]').forEach((b) => b.addEventListener('click', () => switchNavTab(b.dataset.seeAll)));

  // Swipe the drawer left to close it
  let dsx = 0;
  const sidebar = $('#sidebar');
  sidebar.addEventListener('touchstart', (e) => { dsx = e.touches[0].clientX; }, { passive: true });
  sidebar.addEventListener('touchend', (e) => {
    if (e.changedTouches[0].clientX - dsx < -60) closeMobileSidebar();
  }, { passive: true });

  window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => {
    if (e.matches) closeMobileSidebar();
    positionSidebarPill(state.activeNav, true);
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => positionSidebarPill(state.activeNav, true)).observe($('#sidebar-nav'));
  }

  /* ---- Search ---- */
  const searchInput = $('#search-input');
  searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
  $('#search-clear-btn').addEventListener('click', () => { searchInput.value = ''; handleSearch(''); searchInput.focus(); });
  $('#exit-search-btn').addEventListener('click', () => { searchInput.value = ''; handleSearch(''); });

  /* ---- Header: notifications, cast ---- */
  $('#notif-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = $('#notif-dropdown');
    const willOpen = dd.classList.contains('is-hidden');
    closeAllPopovers();
    dd.classList.toggle('is-hidden', !willOpen);
  });
  $('#notif-dropdown').addEventListener('click', (e) => e.stopPropagation());
  $('#mark-read-btn').addEventListener('click', () => {
    state.notifications.forEach((n) => (n.unread = false));
    saveState();
    renderNotifications();
    showToast('All notifications marked as read');
  });
  $('#cast-btn').addEventListener('click', () => showToast('Searching for nearby Chromecast &amp; AirPlay TVs...'));

  /* ---- Profile menu ---- */
  $('#profile-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = $('#profile-dropdown');
    const willOpen = dd.classList.contains('is-hidden');
    closeAllPopovers();
    dd.classList.toggle('is-hidden', !willOpen);
    $('#profile-chevron').classList.toggle('is-open', willOpen);
    $('#profile-menu-btn').setAttribute('aria-expanded', String(willOpen));
  });
  $$('[data-profile-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAllPopovers();
      closeMobileSidebar();
      const act = btn.dataset.profileAction;
      if (act === 'mylist') switchNavTab('mylist');
      else if (act === 'settings') openSettingsModal();
      else if (act === 'studio') openStudio('brand');
      else if (act === 'account') openAuthModal('profile');
      else if (act === 'signin') openAuthModal('login');
      else if (act === 'signout') signOutUser();
    });
  });

  /* ---- Settings modal ---- */
  $('#open-settings-btn').addEventListener('click', () => { closeMobileSidebar(); openSettingsModal(); });
  $('#close-settings-btn').addEventListener('click', closeSettingsModal);
  $('#settings-modal').addEventListener('click', (e) => { if (e.target === $('#settings-modal')) closeSettingsModal(); });
  $('#save-settings-btn').addEventListener('click', () => {
    state.settings.ambientGlow = $('#setting-ambient').checked;
    state.settings.autoNext = $('#setting-autonext').checked;
    state.settings.audioMode = $('#setting-audio').value;
    state.settings.quality = $('#setting-quality').value;
    state.settings.reducedMotion = $('#setting-reduced-motion').checked;
    saveState();
    applyReducedMotion();
    updateAmbientGlowUI();
    updateAutoNextSwitchUI();
    closeSettingsModal();
    showToast('Preferences saved', 'success');
  });
  $('#reset-progress-btn').addEventListener('click', () => {
    resetWatchProgress();
    renderContinueWatching();
    showToast('Watch history reset to defaults');
  });

  /* ---- Player: header actions ---- */
  $('#back-to-dashboard-btn').addEventListener('click', exitPlayerView);
  $('#ambient-toggle-btn').addEventListener('click', () => {
    state.settings.ambientGlow = !state.settings.ambientGlow;
    saveState();
    updateAmbientGlowUI();
    showToast(`Ambient Glow ${state.settings.ambientGlow ? 'enabled' : 'disabled'}`);
  });
  $('#player-mylist-btn').addEventListener('click', () => {
    if (player.title) toggleMyList(player.title.id);
  });
  $('#player-download-btn').addEventListener('click', () => {
    if (!player.title || !player.episode) return;
    if (state.downloads.some((d) => d.epId === player.episode.id)) {
      showToast(`${player.title.title} ${player.episode.code} is already saved offline`);
      return;
    }
    state.downloads.unshift({
      titleId: player.title.id,
      epId: player.episode.id,
      code: player.episode.code,
      size: player.title.type === 'movie' ? '1.6 GB' : '420 MB',
    });
    saveState();
    updateBadges();
    showToast(`Saved ${player.title.title} ${player.episode.code} for offline viewing`, 'success');
  });

  /* ---- Player: controls ---- */
  const stage = $('#player-stage');
  $('#player-click-surface').addEventListener('click', onVideoSurfaceClick);
  stage.addEventListener('mousemove', showControlsTemporarily);
  $('#ctrl-play-btn').addEventListener('click', togglePlayPause);
  $('#ctrl-rw-btn').addEventListener('click', () => seekRelative(-10));
  $('#ctrl-fw-btn').addEventListener('click', () => seekRelative(10));
  $('#ctrl-mute-btn').addEventListener('click', toggleMute);
  $('#ctrl-vol-slider').addEventListener('input', (e) => {
    player.volume = Number(e.target.value) / 100;
    player.muted = player.volume === 0;
  });
  $('#player-controls').addEventListener('pointerdown', showControlsTemporarily);

  $('#skip-intro-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const skipTo = Number(siteConfig.player?.introSkipToSec ?? 92);
    player.currentTime = skipTo;
    persistWatchProgress();
    updatePlayerUI();
    showToast(`Skipped Intro → ${formatTime(skipTo)}`);
  });

  $('#ctrl-next-ep-btn').addEventListener('click', () => {
    const next = getNextEpisode();
    if (next) loadEpisodeIntoPlayer(next.season, next.episode.id, true);
  });
  $('#play-next-now-btn').addEventListener('click', () => {
    const next = getNextEpisode();
    cancelAutoNext();
    if (next) loadEpisodeIntoPlayer(next.season, next.episode.id, true);
  });
  $('#cancel-autonext-btn').addEventListener('click', cancelAutoNext);
  $('#autonext-toggle').addEventListener('click', () => {
    state.settings.autoNext = !state.settings.autoNext;
    saveState();
    updateAutoNextSwitchUI();
  });

  $('#ctrl-subdub-btn').addEventListener('click', () => {
    player.audioMode = player.audioMode === 'SUB' ? 'DUB' : 'SUB';
    state.settings.audioMode = player.audioMode;
    saveState();
    $('#ctrl-subdub-btn').textContent = player.audioMode;
    showToast(`Audio track switched to ${player.audioMode === 'SUB' ? 'Japanese (SUB)' : 'English (DUB)'}`);
  });

  $('#ctrl-speed-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = $('#speed-popover');
    const open = pop.classList.contains('is-hidden');
    closeAllPopovers();
    pop.classList.toggle('is-hidden', !open);
  });
  $('#ctrl-quality-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = $('#quality-popover');
    const open = pop.classList.contains('is-hidden');
    closeAllPopovers();
    pop.classList.toggle('is-hidden', !open);
  });

  $('#ctrl-fs-btn').addEventListener('click', () => {
    try {
      if (!document.fullscreenElement) stage.requestFullscreen?.().catch(() => showToast('Fullscreen restricted by this browser'));
      else document.exitFullscreen?.();
    } catch {
      showToast('Fullscreen unavailable in this preview');
    }
  });

  /* ---- Scrubber (mouse, touch, keyboard via pointer events) ---- */
  const scrub = $('#scrubber-container');
  const tip = $('#scrubber-tooltip');
  let scrubbing = false;
  const ratioFromX = (x) => {
    const r = scrub.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width));
  };
  const scrubTo = (x) => {
    player.currentTime = ratioFromX(x) * player.duration;
    updatePlayerUI();
  };
  scrub.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    scrub.setPointerCapture?.(e.pointerId);
    scrubTo(e.clientX);
  });
  scrub.addEventListener('pointermove', (e) => {
    const ratio = ratioFromX(e.clientX);
    tip.textContent = formatTime(ratio * player.duration);
    tip.style.left = `${ratio * 100}%`;
    if (e.pointerType === 'mouse') tip.classList.remove('is-hidden');
    if (scrubbing) scrubTo(e.clientX);
  });
  const endScrub = () => {
    if (scrubbing) { scrubbing = false; persistWatchProgress(); }
    tip.classList.add('is-hidden');
  };
  scrub.addEventListener('pointerup', endScrub);
  scrub.addEventListener('pointercancel', endScrub);
  scrub.addEventListener('pointerleave', () => { if (!scrubbing) tip.classList.add('is-hidden'); });

  $('#season-select').addEventListener('change', (e) => loadEpisodeIntoPlayer(Number(e.target.value), null, true));

  /* ---- Global ---- */
  document.addEventListener('click', closeAllPopovers);

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === '/' && !typing && app.view === 'dashboard' && !isStudioOpen() && !isAuthModalOpen()) {
      e.preventDefault();
      $('#search-input').focus();
      return;
    }
    if (e.key === 'Escape') {
      if (isStudioOpen()) return closeStudio();
      if (isAuthModalOpen()) return closeAuthModal();
      if (isSettingsOpen()) return closeSettingsModal();
      if (app.liveEditMode) return toggleLiveEditMode(false);
      if (isSidebarOpen()) return closeMobileSidebar();
      closeAllPopovers();
      if (app.view === 'player' && !document.fullscreenElement) return exitPlayerView();
      if (typing) document.activeElement.blur();
      return;
    }
    if (typing || app.view !== 'player' || isSettingsOpen() || isStudioOpen() || isAuthModalOpen()) return;

    if (e.code === 'Space' && tag !== 'BUTTON') { e.preventDefault(); togglePlayPause(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seekRelative(-10); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seekRelative(10); }
    else if (e.key.toLowerCase() === 'm') toggleMute();
    else if (e.key.toLowerCase() === 'f') $('#ctrl-fs-btn').click();
  });
}

async function init() {
  initTheme();
  initVisibilityPause();

  const ok = await loadCatalog();
  if (!ok) return;

  applyUnifiedImages();
  applyReducedMotion();
  initAuth();
  initCMS();
  updateBadges();
  initHero();
  renderContinueWatching();
  renderPopularMovies();
  renderNotifications();
  initPlayerPopovers();
  initProximitySidebar();
  bindEvents();

  requestAnimationFrame(() => {
    positionSidebarPill(state.activeNav, true);
    syncTabbar(state.activeNav);
    if (state.activeNav !== 'home') switchNavTab(state.activeNav);
  });
  document.fonts?.ready.then(() => positionSidebarPill(state.activeNav, true));
}

init();
