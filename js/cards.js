// Card factories + list renderers (continue watching, popular, category views) and My List toggling.
import { $, icon, escapeHtml } from './utils.js';
import { catalog, state, siteConfig, saveState, getTitleById, getArtworkForTitle, isAdmin } from './store.js';
import { observeReveals } from './animations.js';
import { openPlayer, updatePlayerMyListBtn } from './player.js';
import { updateBadges, showToast, switchNavTab } from './ui.js';
import { updateHeroMyListBtn } from './hero.js';
import { openStudio } from './cms.js';

const PLAY_ORB = `<div class="media-card__center"><div class="play-orb">${icon('play', 'ico-sm', { fill: true })}</div></div>`;

function makeInteractive(card, label, onActivate) {
  card.tabIndex = 0;
  card.setAttribute('aria-label', label);
  card.addEventListener('click', onActivate);
  card.addEventListener('keydown', (e) => {
    if (e.target !== card) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  });
}

function bindCardEditChip(card, titleId) {
  const chip = card.querySelector('.card-edit-chip');
  chip?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isAdmin()) openStudio('catalog', titleId);
  });
}

export function toggleMyList(titleId) {
  const title = getTitleById(titleId);
  if (state.myList.includes(titleId)) {
    state.myList = state.myList.filter((id) => id !== titleId);
    showToast(`Removed "${escapeHtml(title.title)}" from My List`);
  } else {
    state.myList.unshift(titleId);
    showToast(`Added "${escapeHtml(title.title)}" to My List`, 'success');
  }
  saveState();
  updateBadges();
  updateHeroMyListBtn();
  updatePlayerMyListBtn();
  if (state.activeNav === 'mylist') renderCategoryView('mylist');
  if (state.activeNav === 'home') renderPopularMovies();
}

export function createContinueWatchingCard(item, index) {
  const prog = state.watchProgress[item.id];
  const pct = Math.max(5, Math.min(100, Math.round((prog?.progress || 0.25) * 100)));
  const epLabel = prog?.code || item.defaultEpisode?.code || 'S1 E1';
  const art = getArtworkForTitle(item);

  const card = document.createElement('article');
  card.className = 'media-card reveal';
  card.dataset.titleId = item.id;
  card.style.setProperty('--i', index);
  card.innerHTML = `
    <img class="media-card__img" src="${escapeHtml(art)}" alt="" loading="lazy" decoding="async" />
    <div class="media-card__shade"></div>
    <button type="button" class="card-edit-chip admin-only ${isAdmin() ? '' : 'is-hidden'}" title="Edit in Studio">✎ Edit</button>
    ${PLAY_ORB}
    <div class="media-card__foot">
      <div class="media-card__row">
        <h3 class="media-card__title truncate">${escapeHtml(item.title)}</h3>
        <span class="media-card__tag">${escapeHtml(epLabel)}</span>
      </div>
    </div>
    <div class="media-card__progress"><i style="width:${pct}%"></i></div>`;

  bindCardEditChip(card, item.id);
  makeInteractive(card, `Continue watching ${item.title}, ${epLabel}`, () => openPlayer(item.id, prog?.season, prog?.epId));
  return card;
}

export function createMovieOrCatalogCard(item, index, options = {}) {
  const saved = state.myList.includes(item.id);
  const art = getArtworkForTitle(item);
  const card = document.createElement('article');
  card.className = 'media-card reveal';
  card.dataset.titleId = item.id;
  card.style.setProperty('--i', index);
  card.innerHTML = `
    <img class="media-card__img" src="${escapeHtml(art)}" alt="" loading="lazy" decoding="async" />
    <div class="media-card__shade"></div>
    <div class="media-card__top">
      <span class="pill-dark">★ ${escapeHtml(item.rating)}</span>
      <button class="bookmark-btn card-bookmark-btn ${saved ? 'is-saved' : ''}" title="${saved ? 'Remove from My List' : 'Add to My List'}" aria-label="${saved ? 'Remove from My List' : 'Add to My List'}" aria-pressed="${saved}">
        ${saved ? icon('check', 'ico-xs', { stroke: 2.6 }) : icon('plus', 'ico-xs', { stroke: 2.4 })}
      </button>
    </div>
    <button type="button" class="card-edit-chip admin-only ${isAdmin() ? '' : 'is-hidden'}" title="Edit in Studio">✎ Edit</button>
    ${PLAY_ORB}
    <div class="media-card__foot">
      <div class="media-card__row">
        <h3 class="media-card__title truncate">${escapeHtml(item.title)}</h3>
        <span class="media-card__tag">${escapeHtml(options.rightBadge || item.durationLabel || `${Object.keys(item.seasons || {}).length}S`)}</span>
      </div>
      <div class="media-card__row media-card__sub">
        <span class="truncate">${escapeHtml((item.genres || []).slice(0, 2).join(' • '))}</span>
        <span>${item.year}</span>
      </div>
    </div>`;

  card.querySelector('.card-bookmark-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMyList(item.id);
  });
  bindCardEditChip(card, item.id);
  makeInteractive(card, `Play ${item.title}`, () => openPlayer(item.id));
  return card;
}

export function renderContinueWatching() {
  const grid = $('#continue-watching-grid');
  grid.innerHTML = '';
  const validSet = new Set(catalog.titles.map((t) => t.id));
  Object.entries(state.watchProgress || {})
    .filter(([id]) => validSet.has(id))
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    .map(([id]) => getTitleById(id))
    .filter(Boolean)
    .slice(0, 6)
    .forEach((item, idx) => grid.appendChild(createContinueWatchingCard(item, idx)));
  observeReveals(grid);
}

export function renderPopularMovies() {
  const grid = $('#popular-movies-grid');
  grid.innerHTML = '';
  catalog.titles.filter((t) => t.popularMovie).forEach((item, idx) => grid.appendChild(createMovieOrCatalogCard(item, idx)));
  observeReveals(grid);
}

function emptyState(title, text, withButton) {
  return `
    <div class="empty glass-panel">
      <strong>${title}</strong>
      <p>${text}</p>
      ${withButton ? '<button id="empty-browse-btn" class="btn btn-crimson btn-sm">Explore Home</button>' : ''}
    </div>`;
}

export function renderCategoryView(navKey) {
  const titleEl = $('#category-title');
  const subEl = $('#category-subtitle');
  const grid = $('#category-grid');
  const sec = siteConfig.sections || {};
  grid.innerHTML = '';
  $('#category-filter-pills').innerHTML = '';

  let items = [];
  if (navKey === 'movies') {
    titleEl.textContent = sec.moviesHeading || 'Popular Movies';
    subEl.textContent = sec.moviesSub || 'Acclaimed theatrical anime films in crystal-clear 4K HDR';
    items = catalog.titles.filter((c) => c.type === 'movie');
  } else if (navKey === 'series') {
    titleEl.textContent = sec.seriesHeading || 'Anime Series';
    subEl.textContent = sec.seriesSub || 'Long-running sagas and seasonal simulcasts';
    items = catalog.titles.filter((c) => c.category === 'series');
  } else if (navKey === 'anime') {
    titleEl.textContent = sec.animeHeading || 'All Anime Catalog';
    subEl.textContent = sec.animeSub || 'Browse every featured series and theatrical masterpiece';
    items = catalog.titles;
  } else if (navKey === 'mylist') {
    const validIds = state.myList.filter((id) => catalog.titles.some((t) => t.id === id));
    titleEl.textContent = sec.mylistHeading || 'My List';
    subEl.textContent = `${validIds.length} saved title${validIds.length === 1 ? '' : 's'} ready to stream`;
    items = validIds.map(getTitleById).filter(Boolean);
  } else if (navKey === 'downloads') {
    titleEl.textContent = sec.downloadsHeading || 'Offline Downloads';
    subEl.textContent = sec.downloadsSub || 'Watch downloaded episodes anywhere with zero buffering';
    if (state.downloads.length === 0) {
      grid.innerHTML = emptyState('No Offline Downloads Yet', 'Open any title in the player and click Save to keep episodes offline.');
      return;
    }
    state.downloads.forEach((dl, idx) => {
      grid.appendChild(createMovieOrCatalogCard(getTitleById(dl.titleId), idx, { rightBadge: `${dl.code} • ${dl.size}` }));
    });
    observeReveals(grid);
    return;
  }

  if (items.length === 0) {
    grid.innerHTML = emptyState('Your List is Currently Empty', 'Tap "+ My List" on any anime or movie to build your personal watchlist.', true);
    $('#empty-browse-btn')?.addEventListener('click', () => switchNavTab('home'));
    return;
  }
  items.forEach((item, idx) => grid.appendChild(createMovieOrCatalogCard(item, idx)));
  observeReveals(grid);
}
