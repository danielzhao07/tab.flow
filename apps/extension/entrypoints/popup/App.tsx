import { useState, useEffect } from 'react';
import type { TabInfo } from '@/lib/types';
import { getWorkspaces, saveWorkspace, deleteWorkspace, type Workspace } from '@/lib/workspaces';

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

function domainColor(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 60%, 65%)`;
}

export function App() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [allTabs, setAllTabs] = useState<TabInfo[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [view, setView] = useState<'tabs' | 'workspaces'>('tabs');
  const [saving, setSaving] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'get-tabs' }).then((response) => {
      if (response?.tabs) {
        setAllTabs(response.tabs);
        setTabs(response.tabs.slice(0, 7));
      }
    });
    getWorkspaces().then(setWorkspaces);
  }, []);

  const totalTabs = allTabs.length;
  const suspendedTabs = allTabs.filter((t) => t.isDiscarded).length;
  const pinnedTabs = allTabs.filter((t) => t.isPinned).length;
  const windowIds = new Set(allTabs.map((t) => t.windowId));
  const windowCount = windowIds.size;
  // Rough estimate: ~50MB per active tab, ~5MB per suspended tab
  const memorySaved = suspendedTabs * 45; // MB saved by suspending

  const switchToTab = (tabId: number) => {
    chrome.runtime.sendMessage({ type: 'switch-tab', payload: { tabId } });
    window.close();
  };

  const handleSaveWorkspace = async () => {
    if (!workspaceName.trim()) return;
    const chromeTabs = await chrome.tabs.query({ currentWindow: true });
    const tabData = chromeTabs.map((t) => ({ title: t.title || 'Untitled', url: t.url || '', faviconUrl: t.favIconUrl || '' }));
    await saveWorkspace(workspaceName.trim(), tabData);
    setWorkspaceName('');
    setSaving(false);
    setWorkspaces(await getWorkspaces());
  };

  const handleRestoreWorkspace = async (id: string) => {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    const urls = ws.tabs.map((t) => t.url).filter(Boolean);
    if (urls.length > 0) {
      chrome.runtime.sendMessage({ type: 'restore-workspace', urls, groups: ws.tabs });
    }
    window.close();
  };

  const handleDeleteWorkspace = async (id: string) => {
    await deleteWorkspace(id);
    setWorkspaces(await getWorkspaces());
  };

  return (
    <div className="w-[340px] bg-[#0c0c18] text-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">T</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Tab.Flow</h1>
            <p className="text-[10px] text-white/35 leading-tight">
              {view === 'tabs' ? 'Recent tabs' : 'Workspaces'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView(view === 'tabs' ? 'workspaces' : 'tabs')}
            className={`p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors ${
              view === 'workspaces' ? 'text-cyan-400' : 'text-white/40 hover:text-white/60'
            }`}
            title={view === 'tabs' ? 'Workspaces' : 'Recent tabs'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </button>
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            className="p-1.5 rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white/60 transition-colors"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {view === 'tabs' ? (
        <>
          {/* Stats bar */}
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-3">
            <Stat value={totalTabs} label="tabs" color="text-cyan-400" />
            <Stat value={windowCount} label={windowCount === 1 ? 'window' : 'windows'} color="text-blue-400" />
            {pinnedTabs > 0 && <Stat value={pinnedTabs} label="pinned" color="text-white/50" />}
            {suspendedTabs > 0 && (
              <Stat value={suspendedTabs} label="suspended" color="text-green-400" />
            )}
            {memorySaved > 0 && (
              <span className="ml-auto text-[10px] text-green-400/60">
                ~{memorySaved >= 1000 ? `${(memorySaved / 1000).toFixed(1)}GB` : `${memorySaved}MB`} saved
              </span>
            )}
          </div>

          {/* Tab list */}
          <div className="py-1">
            {tabs.length === 0 ? (
              <div className="py-8 text-center text-white/30 text-xs">No tabs</div>
            ) : (
              tabs.map((tab) => {
                const domain = getDomain(tab.url);
                const color = domainColor(domain);
                return (
                  <button
                    key={tab.tabId}
                    onClick={() => switchToTab(tab.tabId)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/[0.06] text-left transition-colors"
                  >
                    <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                      {tab.faviconUrl ? (
                        <img src={tab.faviconUrl} alt="" className="w-4 h-4 rounded-sm" />
                      ) : (
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold"
                          style={{ backgroundColor: color + '25', color }}
                        >
                          {domain.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-white/90 truncate leading-tight">{tab.title || 'Untitled'}</div>
                      <div className="text-[10px] text-white/25 truncate leading-tight">{domain}</div>
                    </div>
                    {tab.isActive && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-white/[0.08]">
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-white/25">
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] font-mono text-white/40">Alt+Q</kbd>
              <span>for full switcher</span>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Workspaces view */}
          <div className="py-1">
            {/* Save current workspace */}
            {saving ? (
              <div className="px-4 py-2 flex items-center gap-2">
                <input
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveWorkspace()}
                  placeholder="Workspace name..."
                  className="flex-1 bg-white/[0.06] rounded-md px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none border border-white/10 focus:border-cyan-400/50"
                  autoFocus
                />
                <button
                  onClick={handleSaveWorkspace}
                  className="px-2.5 py-1.5 rounded-md bg-cyan-400/20 text-cyan-300 text-xs font-medium hover:bg-cyan-400/30 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => { setSaving(false); setWorkspaceName(''); }}
                  className="p-1 text-white/40 hover:text-white/60"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSaving(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-cyan-400/80 hover:bg-white/[0.04] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                Save current window as workspace
              </button>
            )}

            {/* Workspace list */}
            {workspaces.length === 0 ? (
              <div className="py-6 text-center text-white/25 text-[11px]">No saved workspaces</div>
            ) : (
              workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="group flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleRestoreWorkspace(ws.id)}>
                    <div className="text-xs text-white/80 truncate">{ws.name}</div>
                    <div className="text-[10px] text-white/25">
                      {ws.tabs.length} tabs · {new Date(ws.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreWorkspace(ws.id)}
                    className="shrink-0 p-1 rounded text-white/30 hover:text-cyan-400 hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 transition-all"
                    title="Restore workspace"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDeleteWorkspace(ws.id)}
                    className="shrink-0 p-1 rounded text-white/30 hover:text-red-400 hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete workspace"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-white/[0.08]">
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-white/25">
              <span>Click a workspace to restore its tabs</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px]">
      <span className={`font-semibold ${color}`}>{value}</span>
      <span className="text-white/30">{label}</span>
    </span>
  );
}
