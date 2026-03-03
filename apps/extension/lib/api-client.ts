/**
 * Tab.Flow API client — talks to the Express.js backend at apps/api.
 * Sends Cognito Bearer token when signed in, falls back to x-device-id for local dev.
 */
import { getValidToken } from './auth';

// TODO: Replace with your production Railway URL once deployed
// e.g. 'https://tabflow-api-production.up.railway.app'
// Users can also override via chrome.storage 'tabflow_api_url'
const DEFAULT_API_URL = 'http://localhost:3001';

export async function getApiUrl(): Promise<string> {
  const result = await chrome.storage.local.get('tabflow_api_url');
  return (result['tabflow_api_url'] as string) ?? DEFAULT_API_URL;
}

export async function getDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get('tabflow_device_id');
  if (result['tabflow_device_id']) return result['tabflow_device_id'] as string;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ tabflow_device_id: id });
  return id;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const [base, deviceId, token] = await Promise.all([getApiUrl(), getDeviceId(), getValidToken()]);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-device-id': deviceId,
    ...(options?.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, { ...options, headers });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ---- Health check ----
export async function checkHealth(): Promise<boolean> {
  try {
    await fetch(`${await getApiUrl()}/health`);
    return true;
  } catch {
    return false;
  }
}

// ---- Analytics: record a tab visit ----
export async function recordVisit(url: string, domain: string, durationMs: number, title?: string): Promise<void> {
  await request('/api/analytics/visit', {
    method: 'POST',
    body: JSON.stringify({ url, domain, durationMs, title }),
  });
}

// ---- Analytics: top domains ----
export interface DomainStat {
  domain: string;
  total_visits: number;
  total_duration_ms: number;
  unique_pages: number;
}

export async function getTopDomains(limit = 5): Promise<DomainStat[]> {
  const data = await request<{ domains: DomainStat[] }>(`/api/analytics/top-domains?limit=${limit}`);
  return data.domains;
}

// ---- Sync: workspaces ----
export interface Workspace {
  id: string;
  name: string;
  tabs: Array<{ url: string; title: string; faviconUrl?: string }>;
  createdAt: string;
}

export async function getWorkspaces(): Promise<Workspace[]> {
  const data = await request<{ workspaces: Workspace[] }>('/api/sync/workspaces');
  return data.workspaces;
}

export async function saveWorkspace(name: string, tabs: Workspace['tabs']): Promise<Workspace> {
  const data = await request<{ workspace: Workspace }>('/api/sync/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name, tabs }),
  });
  return data.workspace;
}

export async function deleteWorkspace(id: string): Promise<void> {
  await request(`/api/sync/workspaces/${id}`, { method: 'DELETE' });
}

export async function updateWorkspace(id: string, tabs: Workspace['tabs']): Promise<Workspace> {
  const data = await request<{ workspace: Workspace }>(`/api/sync/workspaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ tabs }),
  });
  return data.workspace;
}

// ---- Sync: bookmarks (fire-and-forget to cloud) ----
export async function syncBookmarkToCloud(url: string, title: string, faviconUrl?: string): Promise<void> {
  await request('/api/sync/bookmarks', {
    method: 'POST',
    body: JSON.stringify({ url, title, faviconUrl: faviconUrl || '' }),
  });
}

// ---- Sync: notes (fire-and-forget to cloud) ----
export async function syncNoteToCloud(url: string, content: string): Promise<void> {
  await request('/api/sync/notes', {
    method: 'POST',
    body: JSON.stringify({ url, content }),
  });
}

// ---- Sync: settings (fire-and-forget to cloud) ----
export async function syncSettingsToCloud(settings: Record<string, unknown>): Promise<void> {
  await request('/api/sync/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
