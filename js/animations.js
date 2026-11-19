// Motion helpers: scroll-reveal, pause-when-hidden, off-screen pausing.
import { prefersReducedMotion } from './utils.js';

const root = document.documentElement;
let revealObserver = null;

function getObserver() {
  if (revealObserver || !('IntersectionObserver' in window)) return revealObserver;
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -4% 0px' }
  );
  return revealObserver;
}

/** Call after inserting cards: every `.reveal` inside `container` animates once when it scrolls into view. */
export function observeReveals(container) {
  const items = container.querySelectorAll('.reveal:not(.is-in)');
  const io = getObserver();
  items.forEach((el) => {
    if (!io || prefersReducedMotion()) el.classList.add('is-in');
    else io.observe(el);
  });
}

/** Pause CSS animations while the tab is in the background and tell listeners. */
const visibilityListeners = [];
export function onVisibilityChange(fn) { visibilityListeners.push(fn); }

export function initVisibilityPause() {
  const update = () => {
    root.classList.toggle('is-tab-hidden', document.hidden);
    visibilityListeners.forEach((fn) => fn(!document.hidden));
  };
  document.addEventListener('visibilitychange', update);
  update();
}

/** Toggle `.is-offscreen` so heavy infinite animations (Ken Burns) stop when scrolled away. */
export function watchOffscreen(el, onChange) {
  if (!el || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([entry]) => {
    el.classList.toggle('is-offscreen', !entry.isIntersecting);
    onChange?.(entry.isIntersecting);
  }, { threshold: 0.05 }).observe(el);
}
