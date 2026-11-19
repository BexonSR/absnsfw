// Authentication, Registration, Live SQL Username Check & Profile Management UI.
import { $, $$, UNIFIED_IMAGE, escapeHtml } from './utils.js';
import { api, setAuthToken } from './api.js';
import { auth, state, siteConfig, isAdmin, applyUserStateFromSQL } from './store.js';
import { showToast, updateBadges, renderNotifications, switchNavTab } from './ui.js';
import { renderContinueWatching, renderPopularMovies, renderCategoryView } from './cards.js';
import { updateHeroMyListBtn } from './hero.js';
import { setThemeMode } from './theme.js';

let authMode = 'login'; // 'login' | 'register' | 'profile'
let usernameCheckTimer = null;

/**
 * Strictly enforce admin-only visibility for all Website Studio & Live Edit controls,
 * and update profile/sign-in UI across the sidebar and topbar.
 */
export function syncAuthUI() {
  const user = auth.user;
  const admin = isAdmin();

  document.body.classList.toggle('is-admin', admin);
  document.body.classList.toggle('is-authenticated', Boolean(user));

  // Strictly hide all Studio buttons & Live Edit dock unless logged in as admin
  $$('.admin-only').forEach((el) => el.classList.toggle('is-hidden', !admin));
  if (!admin && document.body.classList.contains('live-edit-active')) {
    document.body.classList.remove('live-edit-active');
  }

  // Optional Login Gate (if an admin enabled requireLoginGate in Studio)
  const gated = Boolean(siteConfig.brand?.requireLoginGate && !user);
  document.body.classList.toggle('login-gated', gated);
  if (gated) openAuthModal('login');

  // Topbar Sign-In button vs user chip
  const signInBtn = $('#topbar-signin-btn');
  const userChip = $('#topbar-user-btn');
  if (signInBtn) signInBtn.classList.toggle('is-hidden', Boolean(user));
  if (userChip) {
    userChip.classList.toggle('is-hidden', !user);
    if (user) {
      $('#topbar-user-name').textContent = `@${user.username}`;
      const rBadge = $('#topbar-user-role');
      if (rBadge) {
        rBadge.textContent = user.role === 'admin' ? 'ADMIN' : 'USER';
        rBadge.classList.toggle('is-user', user.role !== 'admin');
      }
    }
  }

  // Sidebar profile button
  const nameEl = $('#profile-display-name');
  const planEl = $('#profile-plan-badge');
  const avatarImg = $('#profile-avatar-img');
  if (user) {
    if (nameEl) nameEl.innerHTML = `<span class="truncate">${escapeHtml(user.displayName)}</span><span class="role-pill ${user.role === 'admin' ? '' : 'is-user'}" style="flex-shrink:0">${escapeHtml(user.role)}</span>`;
    if (planEl) planEl.textContent = `@${user.username} • ${user.planBadge || 'Premium 4K'}`;
    if (avatarImg) avatarImg.src = (user.avatarUrl && user.avatarUrl.trim()) || UNIFIED_IMAGE;
  } else {
    if (nameEl) nameEl.textContent = 'Guest Viewer';
    if (planEl) planEl.textContent = 'Tap to Sign In / Register';
    if (avatarImg) avatarImg.src = UNIFIED_IMAGE;
  }

  // Profile dropdown items
  $('#profile-edit-account-btn')?.classList.toggle('is-hidden', !user);
  $('#profile-signin-menu-btn')?.classList.toggle('is-hidden', Boolean(user));
  $('#profile-signout-menu-btn')?.classList.toggle('is-hidden', !user);
}

export function openAuthModal(mode = 'login') {
  authMode = mode;
  const modal = $('#auth-modal');
  if (!modal) return;
  renderAuthModalMode();
  modal.classList.remove('is-hidden');
  setTimeout(() => {
    if (authMode === 'profile') $('#auth-display-name')?.focus();
    else $('#auth-username')?.focus();
  }, 40);
}

export function closeAuthModal() {
  if (siteConfig.brand?.requireLoginGate && !auth.user) {
    showToast('Please sign in to access the dashboard.');
    return;
  }
  $('#auth-modal')?.classList.add('is-hidden');
}

export const isAuthModalOpen = () => !$('#auth-modal')?.classList.contains('is-hidden');

function setAuthError(msg = '') {
  const errEl = $('#auth-error-box');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.classList.toggle('is-hidden', !msg);
}

function setUsernameStatus(text = '', ok = true) {
  const st = $('#auth-username-status');
  if (!st) return;
  st.textContent = text;
  st.classList.toggle('is-hidden', !text);
  st.classList.toggle('is-ok', ok);
  st.classList.toggle('is-err', !ok);
}

function renderAuthModalMode() {
  setAuthError('');
  setUsernameStatus('');

  const isProf = authMode === 'profile' && auth.user;
  const isReg = authMode === 'register';

  $('#auth-tabs-bar')?.classList.toggle('is-hidden', Boolean(isProf));
  $$('[data-auth-tab]').forEach((b) => b.classList.toggle('is-active', b.dataset.authTab === authMode));

  $('#auth-modal-heading').textContent = isProf
    ? 'Edit SQL Account & Profile'
    : isReg
      ? 'Create SQL Account'
      : 'Sign In to CRIMSON';

  $('#auth-display-field')?.classList.toggle('is-hidden', !isReg && !isProf);
  $('#auth-plan-field')?.classList.toggle('is-hidden', !isReg && !isProf);
  $('#auth-avatar-field')?.classList.toggle('is-hidden', !isProf);
  $('#auth-signout-btn')?.classList.toggle('is-hidden', !isProf);
  $('#auth-demo-box')?.classList.toggle('is-hidden', Boolean(isProf));
  $('#auth-password-label').textContent = isProf ? 'New Password (leave blank to keep current)' : 'Password';
  $('#auth-submit-btn').textContent = isProf
    ? 'Save Profile to SQL'
    : isReg
      ? 'Create Account & Sign In'
      : 'Sign In';

  if (isProf && auth.user) {
    $('#auth-username').value = auth.user.username || '';
    $('#auth-display-name').value = auth.user.displayName || '';
    $('#auth-plan-badge').value = auth.user.planBadge || 'Premium 4K';
    $('#auth-avatar-url').value = auth.user.avatarUrl || '';
    $('#auth-password').value = '';
  } else {
    $('#auth-password').value = '';
    if (!isReg) setUsernameStatus('');
  }
}

async function checkUsernameLive(rawValue) {
  if (authMode === 'login') {
    setUsernameStatus('');
    return;
  }
  const u = (rawValue || '').trim();
  if (!u) {
    setUsernameStatus('');
    return;
  }
  const exclude = authMode === 'profile' && auth.user ? `&excludeId=${auth.user.id}` : '';
  try {
    const res = await api.get(`/api/auth/check-username?u=${encodeURIComponent(u)}${exclude}`);
    setUsernameStatus(res.message, Boolean(res.available));
  } catch {
    setUsernameStatus('');
  }
}

function applyPostLoginState(payload) {
  if (payload.token) setAuthToken(payload.token);
  auth.user = payload.user || null;
  if (payload.userState) {
    applyUserStateFromSQL(payload.userState);
    if (payload.userState.themePref) setThemeMode(payload.userState.themePref);
  }
  syncAuthUI();
  updateBadges();
  renderContinueWatching();
  renderPopularMovies();
  renderNotifications();
  updateHeroMyListBtn();
  if (state.activeNav !== 'home') renderCategoryView(state.activeNav);
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  setAuthError('');

  const username = $('#auth-username').value.trim();
  const password = $('#auth-password').value;
  const displayName = $('#auth-display-name').value.trim();
  const planBadge = $('#auth-plan-badge').value.trim();
  const avatarUrl = $('#auth-avatar-url')?.value.trim() || '';

  try {
    if (authMode === 'login') {
      const res = await api.post('/api/auth/login', { username, password });
      applyPostLoginState(res);
      closeAuthModal();
      showToast(
        res.user.role === 'admin'
          ? `Signed in as @${res.user.username} (Admin — Website Studio unlocked)`
          : `Welcome back, ${res.user.displayName} (@${res.user.username})`,
        'success'
      );
    } else if (authMode === 'register') {
      const res = await api.post('/api/auth/register', { username, displayName, password, planBadge });
      applyPostLoginState(res);
      closeAuthModal();
      showToast(`Account @${res.user.username} created in SQL database`, 'success');
    } else if (authMode === 'profile') {
      const res = await api.put('/api/auth/profile', {
        username,
        displayName,
        planBadge,
        avatarUrl,
        newPassword: password,
      });
      auth.user = res.user;
      syncAuthUI();
      closeAuthModal();
      showToast(`Updated profile for @${res.user.username}`, 'success');
    }
  } catch (err) {
    setAuthError(err.message || 'Authentication failed.');
  }
}

export async function signOutUser() {
  try {
    await api.post('/api/auth/logout');
  } catch { /* ignore */ }
  setAuthToken('');
  auth.user = null;
  syncAuthUI();
  showToast('Signed out of SQL account');
  if (siteConfig.brand?.requireLoginGate) {
    switchNavTab('home');
    openAuthModal('login');
  }
}

export function initAuth() {
  syncAuthUI();

  $('#topbar-signin-btn')?.addEventListener('click', () => openAuthModal('login'));
  $('#topbar-user-btn')?.addEventListener('click', () => openAuthModal('profile'));
  $('#close-auth-btn')?.addEventListener('click', closeAuthModal);
  $('#auth-modal')?.addEventListener('click', (e) => {
    if (e.target === $('#auth-modal')) closeAuthModal();
  });

  $$('[data-auth-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      authMode = btn.dataset.authTab;
      renderAuthModalMode();
    });
  });

  $('#auth-username')?.addEventListener('input', (e) => {
    clearTimeout(usernameCheckTimer);
    usernameCheckTimer = setTimeout(() => checkUsernameLive(e.target.value), 180);
  });

  $('#auth-form')?.addEventListener('submit', handleAuthSubmit);
  $('#auth-signout-btn')?.addEventListener('click', () => {
    closeAuthModal();
    signOutUser();
  });

  // Quick 1-click Demo Login Pills (Admin vs Standard User)
  $$('[data-demo-login]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const u = btn.dataset.demoUser;
      const p = btn.dataset.demoPass;
      authMode = 'login';
      renderAuthModalMode();
      $('#auth-username').value = u;
      $('#auth-password').value = p;
      try {
        const res = await api.post('/api/auth/login', { username: u, password: p });
        applyPostLoginState(res);
        closeAuthModal();
        showToast(
          res.user.role === 'admin'
            ? `Signed in as @${res.user.username} (Admin — Website Studio unlocked!)`
            : `Signed in as @${res.user.username} (Standard Viewer)`,
          'success'
        );
      } catch (err) {
        setAuthError(err.message);
      }
    });
  });
}
