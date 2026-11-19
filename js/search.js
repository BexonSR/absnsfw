// Live search across the catalog.
import { $, escapeHtml } from './utils.js';
import { catalog, state } from './store.js';
import { createMovieOrCatalogCard } from './cards.js';
import { observeReveals } from './animations.js';

export function handleSearch(query) {
  const q = query.trim().toLowerCase();
  const searchSec = $('#search-results-section');
  const home = $('#home-view-section');
  const cat = $('#category-view-section');
  const clearBtn = $('#search-clear-btn');
  const kbd = $('#search-kbd');

  if (!q) {
    searchSec.classList.add('is-hidden');
    clearBtn.classList.add('is-hidden');
    kbd.classList.remove('is-hidden');
    (state.activeNav === 'home' ? home : cat).classList.remove('is-hidden');
    return;
  }

  clearBtn.classList.remove('is-hidden');
  kbd.classList.add('is-hidden');
  home.classList.add('is-hidden');
  cat.classList.add('is-hidden');
  searchSec.classList.remove('is-hidden');

  const matches = catalog.titles.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.genres.some((g) => g.toLowerCase().includes(q)) ||
      String(item.year).includes(q)
  );

  $('#search-count-badge').textContent = `${matches.length} found`;
  const grid = $('#search-results-grid');
  grid.innerHTML = '';

  if (matches.length === 0) {
    grid.innerHTML = `
      <div class="empty glass-panel">
        <strong>No titles matched "${escapeHtml(query)}"</strong>
        <p>Try searching for "Naruto", "One Piece", "Demon Slayer", "Cyberpunk", or "2016".</p>
      </div>`;
    return;
  }
  matches.forEach((item, idx) => grid.appendChild(createMovieOrCatalogCard(item, idx)));
  observeReveals(grid);
}
