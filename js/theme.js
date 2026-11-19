// Dark / Light / System theme + Live CSS Token Injector from Visual Website Studio.
import { $$ } from './utils.js';
import { DEFAULT_SITE_CONFIG } from './store.js';

const KEY = 'crimson_theme';
const mq = window.matchMedia('(prefers-color-scheme: light)');
const root = document.documentElement;

let mode = 'system';
try { mode = localStorage.getItem(KEY) || 'system'; } catch { /* ignore */ }

let activeThemeTokens = structuredClone(DEFAULT_SITE_CONFIG.theme);

export const getMode = () => mode;
export const resolveTheme = (m = mode) => (m === 'system' ? (mq.matches ? 'light' : 'dark') : m);

export function applyTheme({ animate = true } = {}) {
  const resolved = resolveTheme();

  if (animate) {
    root.classList.add('theme-anim');
    clearTimeout(applyTheme._t);
    applyTheme._t = setTimeout(() => root.classList.remove('theme-anim'), 450);
  }

  root.setAttribute('data-theme', resolved);
  const metaColor = resolved === 'light'
    ? (activeThemeTokens.lightBg || '#f4f3f7')
    : (activeThemeTokens.darkBg || '#0a0a0e');
  document.getElementById('meta-theme-color')?.setAttribute('content', metaColor);

  $$('.theme-toggle').forEach((b) => b.setAttribute('aria-pressed', String(resolved === 'dark')));
  $$('.segmented__btn[data-theme-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeMode === mode)));
}

/** Inject custom CSS variables edited in the Visual Website Studio. */
export function applyCustomThemeTokens(tokens = {}) {
  activeThemeTokens = { ...DEFAULT_SITE_CONFIG.theme, ...tokens };
  let styleEl = document.getElementById('cms-theme-overrides');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'cms-theme-overrides';
    document.head.appendChild(styleEl);
  }

  const crimson = activeThemeTokens.crimson || '#e50914';
  const bright = activeThemeTokens.crimsonBright || '#ff1e38';
  const darkBg = activeThemeTokens.darkBg || '#0a0a0e';
  const darkCard = activeThemeTokens.darkCardBg || '#121218';
  const lightBg = activeThemeTokens.lightBg || '#f4f3f7';
  const lightCard = activeThemeTokens.lightCardBg || '#ffffff';
  const radMd = Number(activeThemeTokens.radiusMd ?? 14);
  const radLg = Number(activeThemeTokens.radiusLg ?? 18);
  const blur = Number(activeThemeTokens.blur ?? 18);
  const heroH = Number(activeThemeTokens.heroMinHeight ?? 430);
  const cardW = Number(activeThemeTokens.cardMinWidth ?? 232);

  styleEl.textContent = `
    :root {
      --crimson: ${crimson};
      --crimson-bright: ${bright};
      --radius-md: ${radMd}px;
      --radius-lg: ${radLg}px;
      --radius-xl: ${radLg + 2}px;
      --blur: ${blur}px;
    }
    :root, :root[data-theme='dark'] {
      --bg: ${darkBg};
      --card-bg: ${darkCard};
      --accent: ${bright};
    }
    :root[data-theme='light'] {
      --bg: ${lightBg};
      --card-bg: ${lightCard};
      --accent: ${crimson};
    }
    @media (min-width: 1024px) {
      .hero { min-height: ${heroH}px; }
      .grid-cards { grid-template-columns: repeat(auto-fill, minmax(min(100%, ${cardW}px), 1fr)); }
    }
  `;
  applyTheme({ animate: false });
}

export function setThemeMode(next) {
  mode = ['dark', 'light', 'system'].includes(next) ? next : 'system';
  try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  applyTheme();
}

export function toggleTheme() {
  setThemeMode(resolveTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  applyTheme({ animate: false });

  const onOsChange = () => { if (mode === 'system') applyTheme(); };
  mq.addEventListener ? mq.addEventListener('change', onOsChange) : mq.addListener(onOsChange);

  $$('.theme-toggle').forEach((b) => b.addEventListener('click', toggleTheme));
  $$('.segmented__btn[data-theme-mode]').forEach((b) => b.addEventListener('click', () => setThemeMode(b.dataset.themeMode)));
}
