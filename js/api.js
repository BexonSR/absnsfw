// REST API client for the Python Flask + SQLite backend (/api/*),
// with automatic static-demo localStorage fallback for GitHub Pages.
import { handleDemoApi } from './demoBackend.js';

const TOKEN_KEY = 'crimson_session_token';
let demoMode = false;

export function setApiDemoMode(enabled) {
  demoMode = Boolean(enabled);
}

export function getAuthToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

async function request(method, url, body = undefined) {
  if (demoMode) {
    return handleDemoApi(method, url, body);
  }

  const headers = { Accept: 'application/json' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: res.ok };
  }

  if (!res.ok || data?.ok === false) {
    const err = new Error(data?.error || `Request failed (HTTP ${res.status})`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};
