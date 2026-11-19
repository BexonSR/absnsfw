// Simulated canvas video player: playback clock, canvas scene, controls, gestures, episodes.
import { $, $$, formatTime, icon, setIcon, UNIFIED_IMAGE, escapeHtml } from './utils.js';
import { catalog, state, siteConfig, saveState, getTitleById, getArtworkForTitle, app } from './store.js';
import { showToast, setView, updateBadges } from './ui.js';
import { renderContinueWatching } from './cards.js';
import { updateHeroMyListBtn } from './hero.js';

export const player = {
  title: null,
  season: 1,
  episode: null,
  isPlaying: false,
  currentTime: 0,
  duration: 1440,
  speed: 1,
  volume: 0.85,
  muted: false,
  quality: '1080p',
  audioMode: 'SUB',
  lastFrameTs: 0,
  controlsHideTimer: null,
  autoNextTimer: null,
  autoNextRemaining: 5,
  lastSavedAt: 0,
  canvas: null,
  ctx: null,
  artworkImg: new Image(),
  artworkLoaded: false,
  petals: [],
  rafId: null,
};

player.artworkImg.onload = () => { player.artworkLoaded = true; };
player.artworkImg.src = UNIFIED_IMAGE;

for (let i = 0; i < 38; i++) {
  player.petals.push({
    x: Math.random(), y: Math.random(),
    r: 2 + Math.random() * 4.5,
    vx: -0.015 - Math.random() * 0.032,
    vy: 0.01 + Math.random() * 0.028,
    rot: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 2.2,
    alpha: 0.35 + Math.random() * 0.6,
    isEmber: i % 3 === 0,
  });
}

/* ----------------------------- Canvas ----------------------------- */
export function resizePlayerCanvas() {
  const canvas = $('#player-canvas');
  const stage = $('#player-stage');
  if (!canvas || !stage) return;
  const rect = stage.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  // Cap DPR (and use less on small screens) to keep mobile GPUs happy.
  const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  player.canvas = canvas;
  player.ctx = canvas.getContext('2d');
}

function getSubtitleLine(timeSec) {
  const looped = timeSec % 270;
  const found = catalog.subtitles.find((l) => looped >= l.start && looped <= l.end);
  if (!found) return '';
  return player.audioMode === 'SUB' ? found.sub : found.dub;
}

function drawPlayerFrame(dt) {
  const { ctx, canvas } = player;
  if (!ctx || !canvas || canvas.width === 0) return;
  const w = canvas.width;
  const h = canvas.height;
  const t = player.currentTime;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#07070c';
  ctx.fillRect(0, 0, w, h);

  if (player.artworkLoaded) {
    const zoom = 1.04 + Math.sin(t * 0.14) * 0.04;
    const panX = Math.cos(t * 0.11) * (w * 0.018);
    const panY = Math.sin(t * 0.09) * (h * 0.014);
    const drawW = w * zoom;
    const drawH = h * zoom;
    ctx.save();
    ctx.globalAlpha = 0.94 + Math.sin(t * 0.35) * 0.06;
    ctx.drawImage(player.artworkImg, (w - drawW) / 2 + panX, (h - drawH) / 2 + panY, drawW, drawH);
    ctx.restore();
  }

  const lightX = w * (0.68 + Math.sin(t * 0.25) * 0.04);
  const lightY = h * (0.3 + Math.cos(t * 0.2) * 0.03);
  const grad = ctx.createRadialGradient(lightX, lightY, w * 0.02, lightX, lightY, w * 0.52);
  grad.addColorStop(0, 'rgba(255, 52, 78, 0.22)');
  grad.addColorStop(0.5, 'rgba(229, 9, 20, 0.07)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Petals & embers (fewer on small screens)
  const petalCount = w < 700 ? 18 : player.petals.length;
  for (let i = 0; i < petalCount; i++) {
    const p = player.petals[i];
    if (player.isPlaying) {
      const mult = player.speed * dt;
      p.x += p.vx * mult;
      p.y += (p.isEmber ? -p.vy * 1.15 : p.vy) * mult;
      p.rot += p.vrot * mult;
      if (p.x < -0.05) p.x = 1.05;
      if (p.y > 1.05) p.y = -0.05;
      if (p.y < -0.05) p.y = 1.05;
    }
    ctx.save();
    ctx.translate(p.x * w, p.y * h);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    if (p.isEmber) {
      ctx.fillStyle = '#ff546b';
      ctx.arc(0, 0, p.r * 0.55, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = '#ff1e38';
      ctx.ellipse(0, 0, p.r * 1.5, p.r * 0.65, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }

  const vig = ctx.createLinearGradient(0, 0, 0, h);
  vig.addColorStop(0, 'rgba(0,0,0,0.35)');
  vig.addColorStop(0.2, 'rgba(0,0,0,0)');
  vig.addColorStop(0.75, 'rgba(0,0,0,0.08)');
  vig.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const line = getSubtitleLine(t);
  if (line) {
    const fontSize = Math.max(13, Math.round(w * 0.022));
    ctx.save();
    ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const textY = h * 0.84;
    const metrics = ctx.measureText(line);
    const padX = fontSize * 0.8;
    const padY = fontSize * 0.42;
    const boxW = Math.min(w * 0.94, metrics.width + padX * 2);
    const boxH = fontSize + padY * 1.5;
    ctx.fillStyle = 'rgba(8, 8, 12, 0.68)';
    ctx.beginPath();
    ctx.roundRect((w - boxW) / 2, textY - boxH + padY * 0.4, boxW, boxH, 10);
    ctx.fill();
    ctx.lineWidth = Math.max(2, fontSize * 0.14);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeText(line, w / 2, textY, w * 0.92);
    ctx.fillStyle = player.audioMode === 'SUB' ? '#ffffff' : '#ffd5db';
    ctx.fillText(line, w / 2, textY, w * 0.92);
    ctx.restore();
  }

  if (!player.isPlaying) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.fillRect(0, 0, w, h);
  }
}

/* ----------------------------- UI sync ----------------------------- */
const cache = { playing: null, cur: '', total: '', skip: null };

export function updatePlayerUI() {
  const pct = player.duration > 0 ? Math.min(1, player.currentTime / player.duration) : 0;
  $('#scrubber-fill').style.transform = `scaleX(${pct})`;
  $('#scrubber-thumb').style.left = `${pct * 100}%`;
  $('#scrubber-buffered').style.transform = `scaleX(${Math.min(1, pct + 0.18)})`;
  $('#scrubber-container').setAttribute('aria-valuenow', String(Math.round(pct * 100)));

  const cur = formatTime(player.currentTime);
  const total = formatTime(player.duration);
  if (cur !== cache.cur) { $('#ctrl-time-current').textContent = cur; cache.cur = cur; }
  if (total !== cache.total) { $('#ctrl-time-total').textContent = total; cache.total = total; }

  if (cache.playing !== player.isPlaying) {
    cache.playing = player.isPlaying;
    setIcon($('#ctrl-play-icon'), player.isPlaying ? 'pause' : 'play');
    $$('.eq').forEach((eq) => eq.classList.toggle('is-paused', !player.isPlaying));
  }

  const pCfg = siteConfig.player || {};
  const introStart = Number(pCfg.introStartSec ?? 15);
  const introEnd = Number(pCfg.introEndSec ?? 90);
  const inIntro = player.currentTime >= introStart && player.currentTime <= introEnd;
  if (cache.skip !== inIntro) {
    cache.skip = inIntro;
    const btn = $('#skip-intro-btn');
    btn.classList.toggle('is-in', inIntro);
    btn.tabIndex = inIntro ? 0 : -1;
  }
}

function persistWatchProgress() {
  if (!player.title || !player.episode) return;
  state.watchProgress[player.title.id] = {
    season: player.season,
    epId: player.episode.id,
    code: player.episode.code,
    time: Math.floor(player.currentTime),
    duration: player.duration,
    progress: Math.max(0.03, Math.min(1, player.currentTime / player.duration)),
    updatedAt: Date.now(),
  };
  saveState();
}
export { persistWatchProgress };

/* ----------------------------- Loop (only runs while the player is open) ----------------------------- */
function playerLoop(now) {
  if (app.view !== 'player') { player.rafId = null; return; }
  const dt = player.lastFrameTs ? Math.min(0.1, (now - player.lastFrameTs) / 1000) : 0.016;
  player.lastFrameTs = now;

  if (player.isPlaying) {
    player.currentTime += dt * player.speed;
    if (player.currentTime >= player.duration) {
      player.currentTime = player.duration;
      player.isPlaying = false;
      persistWatchProgress();
      handleEpisodeEnded();
    } else if (now - player.lastSavedAt > 3000) {
      player.lastSavedAt = now;
      persistWatchProgress();
    }
  }
  drawPlayerFrame(dt);
  updatePlayerUI();
  player.rafId = requestAnimationFrame(playerLoop);
}

function startPlayerLoop() {
  if (player.rafId) return;
  player.lastFrameTs = 0;
  player.rafId = requestAnimationFrame(playerLoop);
}

/* ----------------------------- Controls ----------------------------- */
function flashCenterFeedback(isPlay) {
  const box = $('#center-play-feedback');
  setIcon($('#center-feedback-icon'), isPlay ? 'play' : 'pause');
  box.classList.add('is-on');
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.remove('is-on'), 420);
}

export function togglePlayPause() {
  cancelAutoNext();
  if (player.currentTime >= player.duration) player.currentTime = 0;
  player.isPlaying = !player.isPlaying;
  flashCenterFeedback(player.isPlaying);
  persistWatchProgress();
  updatePlayerUI();
  showControlsTemporarily();
}

export function seekRelative(deltaSec) {
  cancelAutoNext();
  player.currentTime = Math.max(0, Math.min(player.duration, player.currentTime + deltaSec));
  persistWatchProgress();
  updatePlayerUI();
  showControlsTemporarily();

  const rippleEl = deltaSec < 0 ? $('#seek-left-ripple') : $('#seek-right-ripple');
  rippleEl.classList.remove('is-hidden');
  const inner = rippleEl.firstElementChild;
  inner.classList.remove('is-anim');
  void inner.offsetWidth;
  inner.classList.add('is-anim');
  clearTimeout(rippleEl._t);
  rippleEl._t = setTimeout(() => rippleEl.classList.add('is-hidden'), 520);
}

export function toggleMute() {
  player.muted = !player.muted;
  const slider = $('#ctrl-vol-slider');
  slider.value = player.muted ? 0 : Math.round(player.volume * 100);
  setIcon($('#ctrl-vol-icon'), player.muted ? 'mute' : 'volume');
}

export function showControlsTemporarily() {
  const ctrls = $('#player-controls');
  ctrls.classList.remove('is-idle');
  clearTimeout(player.controlsHideTimer);
  if (player.isPlaying) {
    player.controlsHideTimer = setTimeout(() => {
      if (player.isPlaying && app.view === 'player') ctrls.classList.add('is-idle');
    }, 3200);
  }
}

/** Tap on the video: mouse = play/pause; touch = tap toggles controls, double-tap seeks ±10s. */
let lastTap = 0;
let tapTimer = null;
export function onVideoSurfaceClick(e) {
  const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen' || (!e.pointerType && window.matchMedia('(pointer: coarse)').matches);
  if (!isTouch) { togglePlayPause(); return; }

  const rect = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const now = performance.now();

  if (now - lastTap < 300) {
    clearTimeout(tapTimer);
    lastTap = 0;
    if (x < 0.38) seekRelative(-10);
    else if (x > 0.62) seekRelative(10);
    else togglePlayPause();
    return;
  }
  lastTap = now;
  tapTimer = setTimeout(() => {
    const ctrls = $('#player-controls');
    if (ctrls.classList.contains('is-idle')) showControlsTemporarily();
    else if (player.isPlaying) { clearTimeout(player.controlsHideTimer); ctrls.classList.add('is-idle'); }
    else togglePlayPause();
  }, 300);
}

/* ----------------------------- Episodes / auto-next ----------------------------- */
export function getNextEpisode() {
  if (!player.title || !player.episode) return null;
  const eps = player.title.seasons[player.season] || [];
  const idx = eps.findIndex((e) => e.id === player.episode.id);
  return idx >= 0 && idx + 1 < eps.length ? { season: player.season, episode: eps[idx + 1] } : null;
}

export function cancelAutoNext() {
  clearInterval(player.autoNextTimer);
  player.autoNextTimer = null;
  $('#autonext-overlay').classList.add('is-hidden');
}

function handleEpisodeEnded() {
  const next = getNextEpisode();
  if (!next || !state.settings.autoNext) return;
  player.autoNextRemaining = 5;
  $('#autonext-sec').textContent = player.autoNextRemaining;
  $('#autonext-title').textContent = `${next.episode.code}: ${next.episode.title}`;
  $('#autonext-overlay').classList.remove('is-hidden');
  clearInterval(player.autoNextTimer);
  player.autoNextTimer = setInterval(() => {
    player.autoNextRemaining -= 1;
    $('#autonext-sec').textContent = player.autoNextRemaining;
    if (player.autoNextRemaining <= 0) {
      cancelAutoNext();
      loadEpisodeIntoPlayer(next.season, next.episode.id, true);
    }
  }, 1000);
}

export function updateAmbientGlowUI() {
  const on = !!state.settings.ambientGlow;
  $('#ambient-glow-halo').classList.toggle('is-off', !on);
  $('#ambient-indicator-dot').classList.toggle('dot-quiet', !on);
}

export function updateAutoNextSwitchUI() {
  $('#autonext-toggle').setAttribute('aria-checked', String(!!state.settings.autoNext));
}

export function updatePlayerMyListBtn() {
  if (!player.title) return;
  const saved = state.myList.includes(player.title.id);
  $('#player-mylist-icon').innerHTML = saved
    ? icon('check', 'ico-xs pop-bounce', { stroke: 2.6 })
    : icon('plus', 'ico-xs', { stroke: 2.4 });
  $('#player-mylist-label').textContent = saved ? 'In My List' : 'My List';
  $('#player-mylist-btn').classList.toggle('is-on', saved);
}

function renderEpisodePanel() {
  if (!player.title) return;
  const seasonSelect = $('#season-select');
  const seasonKeys = Object.keys(player.title.seasons);
  seasonSelect.innerHTML = seasonKeys
    .map((s) => `<option value="${s}" ${Number(s) === Number(player.season) ? 'selected' : ''}>Season ${s}</option>`)
    .join('');
  seasonSelect.classList.toggle('is-hidden', seasonKeys.length <= 1 && player.title.type === 'movie');

  const eps = player.title.seasons[player.season] || [];
  $('#ep-panel-count').textContent = `${eps.length} ${eps.length === 1 ? 'feature' : 'episodes'} available`;

  const list = $('#episode-list');
  list.innerHTML = '';
  const art = getArtworkForTitle(player.title);
  eps.forEach((ep) => {
    const isCurrent = player.episode && ep.id === player.episode.id;
    const saved = state.watchProgress[player.title.id];
    const pct = isCurrent
      ? Math.round((player.currentTime / player.duration) * 100)
      : saved && saved.epId === ep.id ? Math.round(saved.progress * 100) : 0;

    const row = document.createElement('button');
    row.className = `ep-row ${isCurrent ? 'is-current' : ''}`;
    row.innerHTML = `
      <span class="ep-row__thumb">
        <img src="${escapeHtml(art)}" alt="" loading="lazy" decoding="async" />
        <span class="ep-row__overlay">
          ${isCurrent
            ? `<span class="eq ${player.isPlaying ? '' : 'is-paused'}"><i></i><i></i><i></i></span>`
            : `<span class="ep-row__play">${icon('play', 'ico-xs', { fill: true })}</span>`}
        </span>
        ${pct > 0 ? `<span class="ep-row__bar"><i style="width:${pct}%"></i></span>` : ''}
      </span>
      <span class="ep-row__body">
        <span class="ep-row__meta"><span class="code">${escapeHtml(ep.code)}</span><span class="dur">${formatTime(ep.duration)}</span></span>
        <span class="ep-row__title clamp-2">${escapeHtml(ep.title)}</span>
      </span>`;
    row.addEventListener('click', () => { if (!isCurrent) loadEpisodeIntoPlayer(player.season, ep.id, true); });
    list.appendChild(row);
  });
}

export function loadEpisodeIntoPlayer(seasonNum, epId, resetTime = false) {
  cancelAutoNext();
  const seasonKey = player.title.seasons[seasonNum] ? seasonNum : Number(Object.keys(player.title.seasons)[0]);
  player.season = seasonKey;
  const eps = player.title.seasons[seasonKey] || [];
  const chosen = eps.find((e) => e.id === epId) || eps[0];
  player.episode = chosen;
  player.duration = chosen.duration || 1440;

  const saved = state.watchProgress[player.title.id];
  if (!resetTime && saved && saved.epId === chosen.id && saved.time < player.duration - 15) player.currentTime = saved.time;
  else player.currentTime = 16; // inside the intro window so "Skip Intro" is visible in the demo

  player.isPlaying = true;
  cache.playing = null;
  cache.skip = null;
  player.lastFrameTs = 0;

  $('#player-header-title').textContent = player.title.title;
  $('#player-header-ep-badge').textContent = chosen.code;
  $('#info-ep-label').textContent = player.title.type === 'movie' ? 'Feature Film' : `Season ${seasonKey} • Episode ${chosen.number}`;
  $('#info-match').textContent = player.title.match;
  $('#info-year').textContent = player.title.year;
  $('#info-ep-title').textContent = chosen.title;
  $('#info-synopsis').textContent = chosen.synopsis || player.title.synopsis;
  $('#info-genres').innerHTML = player.title.genres.map((g) => `<span class="chip">${escapeHtml(g)}</span>`).join('');
  $('#ctrl-next-ep-btn').classList.toggle('is-hidden', !getNextEpisode());

  // Intro marker on the scrubber scales with the real duration
  const pCfg = siteConfig.player || {};
  const introStart = Number(pCfg.introStartSec ?? 15);
  const introEnd = Number(pCfg.introEndSec ?? 90);
  const intro = $('#scrubber-intro');
  intro.style.left = `${(introStart / player.duration) * 100}%`;
  intro.style.width = `${(Math.max(1, introEnd - introStart) / player.duration) * 100}%`;

  const art = getArtworkForTitle(player.title);
  if (player.artworkImg.src !== art) {
    player.artworkImg.src = art;
  }

  updatePlayerMyListBtn();
  renderEpisodePanel();
  persistWatchProgress();
  updatePlayerUI();
  showControlsTemporarily();
}

export async function openPlayer(titleId, preferredSeason = null, preferredEpId = null) {
  const title = getTitleById(titleId);
  player.title = title;
  player.audioMode = state.settings.audioMode || 'SUB';
  player.quality = state.settings.quality || '1080p';
  $('#ctrl-subdub-btn').textContent = player.audioMode;
  $('#ctrl-quality-btn').textContent = player.quality;
  renderQualityPopover();

  const saved = state.watchProgress[titleId];
  const seasonToLoad = preferredSeason || saved?.season || title.defaultEpisode?.season || Number(Object.keys(title.seasons)[0]);
  const epToLoad = preferredEpId || saved?.epId || null;

  app.view = 'player';
  window.scrollTo({ top: 0, behavior: 'auto' });
  await setView('player');
  if (app.view !== 'player') return; // user left before the transition ended

  resizePlayerCanvas();
  updateAmbientGlowUI();
  updateAutoNextSwitchUI();
  loadEpisodeIntoPlayer(seasonToLoad, epToLoad, false);
  startPlayerLoop();
}

export function exitPlayerView() {
  cancelAutoNext();
  player.isPlaying = false;
  persistWatchProgress();
  app.view = 'dashboard';
  if (document.fullscreenElement) document.exitFullscreen?.();
  setView('dashboard');
  renderContinueWatching();
  updateHeroMyListBtn();
  updateBadges();
}

/* ----------------------------- Popovers ----------------------------- */
function triggerBufferFlash(label) {
  const buf = $('#player-buffer-overlay');
  buf.classList.remove('is-hidden');
  setTimeout(() => {
    buf.classList.add('is-hidden');
    showToast(label, 'success');
  }, 420);
}

function renderQualityPopover() {
  const pop = $('#quality-popover');
  pop.innerHTML = ['1080p', '720p', '480p']
    .map((q) => `<button data-quality="${q}" class="${q === player.quality ? 'is-active' : ''}">${q}${q === '1080p' ? ' HD' : ''}</button>`)
    .join('');
  $$('button', pop).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      player.quality = btn.dataset.quality;
      state.settings.quality = player.quality;
      saveState();
      $('#ctrl-quality-btn').textContent = player.quality;
      $$('button', pop).forEach((b) => b.classList.toggle('is-active', b === btn));
      pop.classList.add('is-hidden');
      triggerBufferFlash(`Stream quality switched to ${player.quality}`);
    });
  });
}

export function initPlayerPopovers() {
  const speedPop = $('#speed-popover');
  speedPop.innerHTML = [0.5, 0.75, 1, 1.25, 1.5, 2]
    .map((sp) => `<button data-speed="${sp}" class="${sp === 1 ? 'is-active' : ''}">${sp}x</button>`)
    .join('');
  $$('button', speedPop).forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      player.speed = Number(btn.dataset.speed);
      $('#ctrl-speed-btn').textContent = `${player.speed}x`;
      $$('button', speedPop).forEach((b) => b.classList.toggle('is-active', b === btn));
      speedPop.classList.add('is-hidden');
      showToast(`Playback speed set to ${player.speed}x`);
    });
  });
  renderQualityPopover();

  // Keep the canvas crisp whenever the stage changes size (rotate, resize, fullscreen, layout shift)
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { if (app.view === 'player') resizePlayerCanvas(); }).observe($('#player-stage'));
  }
}
