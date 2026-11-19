// Hero carousel: auto-advance, progress bars, swipe, pause on hover/touch/off-screen.
import { $, $$, icon, escapeHtml } from './utils.js';
import { catalog, state, app, getArtworkForTitle } from './store.js';
import { openPlayer } from './player.js';
import { toggleMyList } from './cards.js';
import { watchOffscreen } from './animations.js';

const HERO_INTERVAL = 7000;
let slides = [];
let heroIndex = 0;
let elapsed = 0;
let lastTs = 0;
let hoverPaused = false;
let touchPaused = false;
let inView = true;
let loopStarted = false;

const isHeroActive = () =>
  !hoverPaused && !touchPaused && inView && app.view === 'dashboard' && state.activeNav === 'home' && !document.hidden;

export function renderHero() {
  slides = catalog.titles.filter((t) => t.featured);
  if (!slides.length && catalog.titles.length) slides = [catalog.titles[0]];
  if (!slides.length) return;
  if (heroIndex >= slides.length) heroIndex = 0;

  const pager = $('#hero-pagination');
  pager.innerHTML = slides
    .map(
      (s, i) => `
      <button data-slide="${i}" class="carousel-pill ${i === heroIndex ? 'is-active' : ''}" role="tab" aria-label="Show ${escapeHtml(s.title)}">
        <div class="carousel-pill__fill" id="hero-bar-fill-${i}"></div>
      </button>`
    )
    .join('');
  $$('button', pager).forEach((b) => b.addEventListener('click', () => goToHeroSlide(Number(b.dataset.slide))));

  renderHeroSlide(heroIndex);
}

export function initHero() {
  const hero = $('#hero-banner');
  hero.addEventListener('mouseenter', () => (hoverPaused = true));
  hero.addEventListener('mouseleave', () => (hoverPaused = false));

  let sx = 0, sy = 0;
  hero.addEventListener('touchstart', (e) => {
    touchPaused = true;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  hero.addEventListener('touchend', (e) => {
    touchPaused = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) goToHeroSlide(heroIndex + (dx < 0 ? 1 : -1));
  }, { passive: true });
  hero.addEventListener('touchcancel', () => (touchPaused = false), { passive: true });

  $('#hero-prev-btn').addEventListener('click', () => goToHeroSlide(heroIndex - 1));
  $('#hero-next-btn').addEventListener('click', () => goToHeroSlide(heroIndex + 1));
  $('#hero-watch-btn').addEventListener('click', () => {
    if (slides[heroIndex]) openPlayer(slides[heroIndex].id);
  });
  $('#hero-mylist-btn').addEventListener('click', () => {
    if (slides[heroIndex]) toggleMyList(slides[heroIndex].id);
  });

  watchOffscreen(hero, (visible) => { inView = visible; });

  renderHero();
  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(tick);
  }
}

export function updateHeroMyListBtn() {
  if (!slides.length) return;
  const saved = state.myList.includes(slides[heroIndex].id);
  $('#hero-mylist-icon').innerHTML = saved
    ? icon('check', 'ico-sm pop-bounce', { stroke: 2.6 })
    : icon('plus', 'ico-sm', { stroke: 2.2 });
  $('#hero-mylist-label').textContent = saved ? 'In My List' : 'My List';
  $('#hero-mylist-btn').classList.toggle('is-on', saved);
}

function renderHeroSlide(idx) {
  const slide = slides[idx];
  if (!slide) return;
  const hero = $('#hero-banner');
  if (hero) hero.dataset.heroTitleId = slide.id;

  const bgImg = $('#hero-bg-img');
  if (bgImg) bgImg.src = getArtworkForTitle(slide);

  const badge = $('#hero-badge');
  const head = $('#hero-headline');
  const tag = $('#hero-tagline');
  const meta = $('#hero-meta');

  $('#hero-badge-text').textContent = slide.badge || 'Trending Now';
  head.innerHTML = `<span>${escapeHtml(slide.titleWhite || slide.title)}</span> <span class="accent">${escapeHtml(slide.titleCrimson || '')}</span>`;
  tag.textContent = slide.tagline || slide.synopsis || '';
  meta.innerHTML = `
    <span class="match">${escapeHtml(slide.match || '98% Match')}</span><span>•</span>
    <span>${slide.year}</span><span>•</span>
    <span class="tag">${escapeHtml(slide.maturity || 'TV-14')}</span><span>•</span>
    <span>${escapeHtml((slide.genres || []).slice(0, 2).join(', '))}</span>`;

  [badge, head, tag, meta].forEach((el, step) => {
    el.classList.remove('hero-in');
    el.style.animationDelay = `${step * 65}ms`;
    void el.offsetWidth;
    el.classList.add('hero-in');
  });

  slides.forEach((_, i) => {
    const btn = $(`#hero-pagination button[data-slide="${i}"]`);
    const fill = $(`#hero-bar-fill-${i}`);
    if (!btn || !fill) return;
    btn.classList.toggle('is-active', i === idx);
    btn.setAttribute('aria-selected', String(i === idx));
    fill.style.transform = `scaleX(${i < idx ? 1 : 0})`;
  });
  updateHeroMyListBtn();
}

export function goToHeroSlide(idx) {
  if (!slides.length) return;
  heroIndex = (idx + slides.length) % slides.length;
  elapsed = 0;
  renderHeroSlide(heroIndex);
}

function tick(now) {
  const dt = lastTs ? Math.min(100, now - lastTs) : 0;
  lastTs = now;
  if (isHeroActive() && slides.length > 0) {
    elapsed += dt;
    const fill = $(`#hero-bar-fill-${heroIndex}`);
    if (fill) fill.style.transform = `scaleX(${Math.min(1, elapsed / HERO_INTERVAL)})`;
    if (elapsed >= HERO_INTERVAL) goToHeroSlide(heroIndex + 1);
  }
  requestAnimationFrame(tick);
}
