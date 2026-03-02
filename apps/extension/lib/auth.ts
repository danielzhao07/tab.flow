/**
 * Cognito PKCE authentication for the TabFlow Chrome extension.
 * Opens a popup window for the Cognito hosted UI and intercepts the
 * callback redirect via chrome.tabs.onUpdated.
 *
 * One-time setup: add the redirect URL printed by getRedirectUrl() to your
 * Cognito app client's "Allowed callback URLs" in the AWS Console.
 */

const COGNITO_DOMAIN = 'https://us-east-2sqruemfbz.auth.us-east-2.amazoncognito.com';
const CLIENT_ID = '5evmh6a2rhvkodetfn9skelhv';
const SCOPES = 'openid email';

export interface TokenSet {
  idToken: string;
  accessToken: string;
  email: string;
  expiresAt: number; // unix ms
}

// ---- PKCE helpers ----

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function parseJwtPayload(token: string): Record<string, any> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return {};
  }
}

// ---- Token storage ----

export async function getStoredTokens(): Promise<TokenSet | null> {
  const result = await chrome.storage.local.get('tabflow_tokens');
  return (result['tabflow_tokens'] as TokenSet) ?? null;
}

export async function getValidToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens) return null;
  if (Date.now() > tokens.expiresAt - 60_000) return null; // expired or about to expire
  return tokens.idToken;
}

export async function clearTokens(): Promise<void> {
  await chrome.storage.local.remove('tabflow_tokens');
}

/** Returns the redirect URL that must be registered in Cognito's allowed callback URLs. */
export function getRedirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

// ---- Sign in (popup window approach — works reliably in MV3) ----

export async function signIn(identityProvider?: string): Promise<TokenSet> {
  const redirectUri = chrome.identity.getRedirectURL();
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  if (identityProvider) params.set('identity_provider', identityProvider);

  const authUrl = `${COGNITO_DOMAIN}/oauth2/authorize?${params}`;

  // Open a popup window for the Cognito login page
  const popup = await chrome.windows.create({
    url: authUrl,
    type: 'popup',
    width: 500,
    height: 700,
  });

  if (!popup.id) throw new Error('Failed to open sign-in window');

  // Wait for the popup to redirect to our callback URL
  const resultUrl = await new Promise<string>((resolve, reject) => {
    const onTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (!changeInfo.url?.startsWith(redirectUri)) return;
      cleanup();
      chrome.windows.remove(popup.id!).catch(() => {});
      resolve(changeInfo.url);
    };

    const onWindowClosed = (windowId: number) => {
      if (windowId !== popup.id) return;
      cleanup();
      reject(new Error('Sign-in cancelled'));
    };

    function cleanup() {
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      chrome.windows.onRemoved.removeListener(onWindowClosed);
    }

    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.windows.onRemoved.addListener(onWindowClosed);
  });

  const url = new URL(resultUrl);
  const code = url.searchParams.get('code');
  const errorParam = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');
  if (!code) {
    throw new Error(errorParam
      ? `Cognito error: ${errorParam} — ${errorDesc ?? resultUrl}`
      : `No code in redirect. Full URL: ${resultUrl}`);
  }

  // Exchange code via backend (backend holds the client secret)
  // TODO: Replace 'http://localhost:3001' with your production Railway URL once deployed
  const stored = await chrome.storage.local.get('tabflow_api_url');
  const apiUrl = (stored['tabflow_api_url'] as string) ?? 'http://localhost:3001';
  const tokenRes = await fetch(`${apiUrl}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri, codeVerifier: verifier }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const { idToken: id_token, accessToken: access_token, expiresIn: expires_in } = await tokenRes.json();
  const payload = parseJwtPayload(id_token);

  const tokenSet: TokenSet = {
    idToken: id_token,
    accessToken: access_token,
    email: payload.email ?? payload['cognito:username'] ?? 'user',
    expiresAt: Date.now() + expires_in * 1000,
  };

  await chrome.storage.local.set({ tabflow_tokens: tokenSet });
  return tokenSet;
}

// ---- Direct password-based auth (proxied through backend) ----

async function getApiBaseUrl(): Promise<string> {
  // TODO: Replace 'http://localhost:3001' with your production Railway URL once deployed
  const result = await chrome.storage.local.get('tabflow_api_url');
  return (result['tabflow_api_url'] as string) ?? 'http://localhost:3001';
}

async function apiPost(path: string, body: object): Promise<any> {
  const apiUrl = await getApiBaseUrl();
  const res = await fetch(`${apiUrl}/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function loginWithPassword(email: string, password: string): Promise<TokenSet> {
  const data = await apiPost('login', { email, password });
  const { idToken, accessToken, expiresIn } = data;
  const payload = parseJwtPayload(idToken);
  const tokenSet: TokenSet = {
    idToken,
    accessToken,
    email: payload.email ?? email,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  await chrome.storage.local.set({ tabflow_tokens: tokenSet });
  return tokenSet;
}

export async function signUpUser(email: string, password: string): Promise<void> {
  await apiPost('signup', { email, password });
}

export async function confirmUserSignUp(email: string, code: string): Promise<void> {
  await apiPost('confirm', { email, code });
}

export async function resendConfirmationCode(email: string): Promise<void> {
  await apiPost('resend', { email });
}

// ---- Sign out ----

export async function signOut(): Promise<void> {
  await clearTokens();
  // Clear the Cognito session cookie by opening logout URL in a hidden tab
  const redirectUri = chrome.identity.getRedirectURL();
  const params = new URLSearchParams({ client_id: CLIENT_ID, logout_uri: redirectUri });
  const logoutUrl = `${COGNITO_DOMAIN}/logout?${params}`;
  const tab = await chrome.tabs.create({ url: logoutUrl, active: false });
  // Close after a short delay to let the request complete
  setTimeout(() => { if (tab.id) chrome.tabs.remove(tab.id).catch(() => {}); }, 2000);
}
