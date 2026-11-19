// Small shared helpers (no app state in here).

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Single artwork used for banner, cards, avatar, episode thumbnails and the player canvas. */
export const UNIFIED_IMAGE = 'assets/hero-art.svg';

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(rem)}` : `${pad(mins)}:${pad(rem)}`;
}

/** Inline <svg> that references a symbol from the sprite in index.html. */
export function icon(name, cls = 'ico-sm', { stroke = 2, fill = false } = {}) {
  const mode = fill ? 'ico-fill' : 'ico-stroke';
  return `<svg class="${cls} ${mode}" stroke-width="${stroke}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/** Point an existing <svg> at another sprite symbol. */
export function setIcon(svgEl, name) {
  if (svgEl) svgEl.innerHTML = `<use href="#i-${name}"/>`;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  document.documentElement.classList.contains('reduced-motion');
