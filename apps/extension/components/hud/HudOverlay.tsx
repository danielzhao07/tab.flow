import { useState, useEffect, useCallback, useRef } from 'react';
import { useHudState, loadHudData } from '@/lib/hooks/useHudState';
import { useTabActions } from '@/lib/hooks/useTabActions';
import { useKeyboardNav } from '@/lib/hooks/useKeyboardNav';
import { saveSettings } from '@/lib/settings';
import type { TabFlowSettings } from '@/lib/settings';
import { TabGrid } from './TabGrid';
import { BottomBar } from './BottomBar';
import { WindowStrip } from './WindowStrip';
import { WorkspaceSection } from './WorkspaceSection';
import { AnalyticsBar } from './AnalyticsBar';
import { UndoToast } from './UndoToast';
import { CommandPalette, useCommands } from './CommandPalette';
import { GroupSuggestions } from './GroupSuggestions';
import { SettingsPanel } from './SettingsPanel';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { checkHealth } from '@/lib/api-client';
import { getStoredTokens, type TokenSet } from '@/lib/auth';
import { AiAgentPanel, AiThinkingBar } from './AiAgentPanel';
import type { AgentResult, AgentAction } from '@/lib/agent';

export function HudOverlay() {
  const s = useHudState();
  const a = useTabActions(s);
  const [authUser, setAuthUser] = useState<TokenSet | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiPending, setAiPending] = useState(false);
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [wsRefreshKey, setWsRefreshKey] = useState(0);
  const promptHistoryRef = useRef<string[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  // TabGrid computes adaptive cols (depends on container size) and reports it back
  const [cols, setCols] = useState(1);
  const onColsComputed = useCallback((c: number) => setCols(c), []);

  const panelRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      requestAnimationFrame(() => requestAnimationFrame(() => s.setAnimatingIn(true)));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useKeyboardNav(s, a, cols);

  useEffect(() => {
    s.setSelectedIndex(0);
  }, [s.query]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll tab list every 750ms while HUD is visible — catches external closes/creates
  // that may not reach the content-script message listener (e.g. chrome:// tab constraints)
  useEffect(() => {
    if (!s.visible) return;
    const interval = setInterval(() => { s.fetchTabs(); }, 750);
    return () => clearInterval(interval);
  }, [s.visible]); // eslint-disable-line react-hooks/exhaustive-deps


  // Load prompt history from storage on mount (shared across tabs + sessions)
  useEffect(() => {
    chrome.storage.local.get('tabflow_prompt_history').then((result) => {
      if (Array.isArray(result.tabflow_prompt_history)) {
        promptHistoryRef.current = result.tabflow_prompt_history;
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for messages from background
  useEffect(() => {
    const listener = (message: { type: string; tabId?: number; title?: string }) => {
      if (message.type === 'hide-hud') {
        s.hide();
        return;
      }

      if (message.type === 'toggle-hud') {
        s.setVisible((prev) => {
          if (!prev) {
            s.fetchTabs();
            s.fetchRecentTabs();
            loadHudData(s);
            // Reload prompt history from storage in case another tab updated it
            chrome.storage.local.get('tabflow_prompt_history').then((result) => {
              if (Array.isArray(result.tabflow_prompt_history)) {
                promptHistoryRef.current = result.tabflow_prompt_history;
              }
            }).catch(() => {});
            chrome.runtime.sendMessage({ type: 'get-all-thumbnails' }).then((res) => {
              if (res?.thumbnails) {
                s.setThumbnails(new Map(
                  Object.entries(res.thumbnails).map(([k, v]) => [Number(k), v as string])
                ));
              }
            }).catch(() => {});
            checkHealth().catch(() => {});
            getStoredTokens().then(setAuthUser);
            return true;
          }
          s.hide();
          return prev;
        });
      }

      if (message.type === 'tab-removed' && s.visible && message.tabId) {
        const tid = message.tabId;
        if (s.pendingExtensionCloseIdsRef.current.has(tid)) {
          // Extension-initiated close — closeTab() already handling animation + removal
          s.pendingExtensionCloseIdsRef.current.delete(tid);
        } else {
          // Chrome-native close — show UndoToast and animate exit
          if (message.title) {
            const t = message.title;
            s.setUndoToast({ message: `Closed "${t.length > 30 ? t.slice(0, 30) + '…' : t}"` });
          }
          s.setClosingTabIds((prev) => new Set([...prev, tid]));
          setTimeout(() => {
            s.setTabs((prev) => {
              const next = prev.filter((t) => t.tabId !== tid);
              s.setSelectedIndex((idx) => Math.min(idx, Math.max(0, next.length - 1)));
              return next;
            });
            s.setClosingTabIds((prev) => {
              const next = new Set(prev);
              next.delete(tid);
              return next;
            });
          }, 300);
        }
        s.setSelectedTabs((prev) => {
          if (!prev.has(tid)) return prev;
          const next = new Set(prev);
          next.delete(tid);
          return next;
        });
      }
      if (message.type === 'tab-created' && s.visible) {
        s.fetchTabs();
      }
      if (message.type === 'tabs-updated' && s.visible) {
        s.fetchTabs();
      }
      if (message.type === 'workspace-updated' && s.visible) {
        setWsRefreshKey((k) => k + 1);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  const commands = useCommands({
    closeDuplicates: a.closeDuplicates,
    closeSelectedTabs: a.closeSelectedTabs,
    groupSelectedTabs: a.groupSelectedTabs,
    ungroupSelectedTabs: a.ungroupSelectedTabs,
    reopenLastClosed: a.reopenLastClosed,
    toggleWindowFilter: () => s.setWindowFilter((p) => p === 'all' ? 'current' : 'all'),
    cycleSortMode: () => s.setSortMode((p) => p === 'mru' ? 'title' : 'mru'),
    selectAll: a.selectAll,
  });

  const executeAction = useCallback(async (action: AgentAction) => {
    switch (action.type) {
      case 'group-tabs':
        await chrome.runtime.sendMessage({ type: 'group-tabs', payload: { tabIds: action.tabIds, title: action.title, color: action.color || 'blue' } });
        break;
      case 'open-urls-in-group':
        await chrome.runtime.sendMessage({ type: 'open-urls-in-group', payload: { urls: action.urls, title: action.title, color: action.color || 'blue' } });
        break;
      case 'close-tab':
        a.closeTab(action.tabId);
        break;
      case 'close-tabs':
        for (const tabId of action.tabIds) {
          a.closeTab(tabId);
        }
        s.setUndoToast({ message: `Closed ${action.tabIds.length} tabs` });
        break;
      case 'open-url':
        await chrome.runtime.sendMessage({ type: 'open-url', payload: { url: action.url } });
        break;
      case 'pin-tab':
        a.togglePin(action.tabId, action.pinned);
        break;
      case 'mute-tab':
        await chrome.runtime.sendMessage({ type: 'mute-tab', payload: { tabId: action.tabId, muted: action.muted } });
        break;
      case 'bookmark-tab': {
        const tab = s.tabs.find((t) => t.tabId === action.tabId);
        if (tab) {
          await chrome.runtime.sendMessage({ type: 'bookmark-tab', payload: { url: tab.url, title: tab.title, folder: action.folder } });
          // Refresh bookmarked URLs so the star badge updates immediately
          const bRes = await chrome.runtime.sendMessage({ type: 'get-bookmarks' }).catch(() => null);
          if (bRes?.bookmarks) s.setBookmarkedUrls(new Set(bRes.bookmarks.map((b: { url: string }) => b.url)));
        }
        break;
      }
      case 'reopen-last-closed':
        await a.reopenLastClosed();
        break;
      case 'switch-tab':
        await chrome.runtime.sendMessage({ type: 'switch-tab', payload: { tabId: action.tabId } });
        break;
      case 'move-to-new-window':
        await chrome.runtime.sendMessage({ type: 'move-to-window', payload: { tabId: action.tabId, windowId: -1 } });
        break;
      case 'reload-tab':
        await chrome.runtime.sendMessage({ type: 'reload-tab', payload: { tabId: action.tabId } });
        break;
      case 'ungroup-tabs':
        await chrome.runtime.sendMessage({ type: 'ungroup-tabs', payload: { tabIds: action.tabIds } });
        break;
      case 'split-view':
        await chrome.runtime.sendMessage({ type: 'split-view', payload: { tabId1: action.tabId1, tabId2: action.tabId2 } });
        break;
      case 'merge-windows':
        await chrome.runtime.sendMessage({ type: 'merge-windows' });
        break;
      case 'create-workspace':
        await chrome.runtime.sendMessage({ type: 'create-workspace', payload: { name: action.name } });
        break;
      case 'duplicate-tab':
        await chrome.runtime.sendMessage({ type: 'duplicate-tab', payload: { tabId: action.tabId } });
        break;
      case 'close-by-domain':
        await chrome.runtime.sendMessage({ type: 'close-by-domain', payload: { domain: action.domain, excludeTabId: action.keepTabId } });
        break;
      case 'rename-group':
        await chrome.runtime.sendMessage({ type: 'rename-group', payload: { groupId: action.groupId, title: action.title, color: action.color } });
        break;
      case 'focus-window':
        await chrome.runtime.sendMessage({ type: 'focus-window', payload: { windowId: action.windowId } });
        break;
      case 'discard-tabs': {
        const discardRes = await chrome.runtime.sendMessage({ type: 'discard-tabs', payload: { tabIds: action.tabIds } });
        if (discardRes?.discardedCount === 0) {
          setAgentResult((prev) => prev ? { ...prev, message: 'No inactive tabs to suspend — all tabs are currently active or pinned.' } : prev);
        }
        break;
      }
    }
  }, [a, s]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAiSubmit = useCallback(async (query: string) => {
    // Save to prompt history (newest first, max 50, deduped, persisted across tabs)
    promptHistoryRef.current = [query, ...promptHistoryRef.current.filter((q) => q !== query).slice(0, 49)];
    chrome.storage.local.set({ tabflow_prompt_history: promptHistoryRef.current }).catch(() => {});
    setAiPending(true);
    setAgentResult(null);
    setCompletedCount(0);
    setAiQuery('');
    try {
      // Only send current-window tabs to the agent — prevents it from touching other windows
      const agentTabs = s.currentWindowId
        ? s.tabs.filter((t) => t.windowId === s.currentWindowId)
        : s.tabs;
      const res = await chrome.runtime.sendMessage({
        type: 'ai-agent',
        payload: { query, tabs: agentTabs, windows: s.otherWindows },
      });
      if (res?.error === 'no-key') {
        setAgentResult({ message: 'Add your Groq API key in settings to use the AI agent.', actions: [] });
        setAiPending(false);
        return;
      }
      if (res?.error) {
        setAgentResult({ message: `Error: ${res.error}`, actions: [] });
        setAiPending(false);
        return;
      }
      const result: AgentResult = { message: res.message, actions: res.actions ?? [] };
      setAgentResult(result);
      setAiPending(false);
      for (let i = 0; i < result.actions.length; i++) {
        await executeAction(result.actions[i]);
        setCompletedCount(i + 1);
      }
      await s.fetchTabs();
      chrome.runtime.sendMessage({ type: 'get-windows' }).then((windowsRes) => {
        if (windowsRes?.windows) s.setOtherWindows(windowsRes.windows);
      }).catch(() => {});
      setTimeout(() => {
        setAgentResult(null);
        setAiMode(false);
      }, 2500);
    } catch {
      setAgentResult({ message: 'Something went wrong. Please try again.', actions: [] });
      setAiPending(false);
    }
  }, [s, executeAction]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSettingChange = useCallback(async (patch: Partial<TabFlowSettings>) => {
    const updated = await saveSettings(patch);
    s.setSettings(updated);
  }, [s]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!s.visible) return null;

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        zIndex: 2147483647,
        backgroundColor: s.animatingIn ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
        backdropFilter: s.animatingIn ? 'blur(28px) saturate(180%)' : 'blur(0px)',
        transition: 'background-color 180ms ease-out, backdrop-filter 180ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setShowSettings(false);
          setCtxMenu(null);
          s.hide();
        }
      }}
      onKeyDown={(e) => {
        // Prevent keystrokes from leaking to the underlying page while HUD is open
        e.stopPropagation();
      }}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
    >
      <div
        ref={panelRef}
        className="flex flex-col w-full h-full"
        style={{
          opacity: s.animatingIn ? 1 : 0,
          transform: s.animatingIn ? 'translateY(0)' : 'translateY(10px)',
          transition: 'opacity 180ms ease-out, transform 180ms ease-out',
        }}
      >
        {/* Top bar: logo + tab count + analytics (left) · gear (right) — in flow so grid doesn't overlap */}
        <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-1" style={{ zIndex: 2147483646 }}>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-white/40 tracking-wider uppercase">Tab.Flow</span>
            <span
              className="text-[10px] text-white/20 px-1.5 py-0.5 rounded-md"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              {s.displayTabs.length}
            </span>
            {!s.settings?.hideTodayTabs && <AnalyticsBar tabs={s.tabs} onSwitch={s.hide} />}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSettings((p) => !p); }}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{
              background: showSettings ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: showSettings ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
            }}
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <SettingsPanel
            authUser={authUser}
            authLoading={authLoading}
            authError={authError}
            onSignIn={async () => {
              setAuthLoading(true);
              setAuthError(null);
              try {
                const res = await chrome.runtime.sendMessage({ type: 'sign-in' });
                if (res?.success) {
                  setAuthUser(res.tokenSet);
                } else {
                  setAuthError(res?.error || 'Sign-in failed');
                }
              } catch (e: any) {
                setAuthError(e?.message || 'Sign-in failed');
              } finally {
                setAuthLoading(false);
              }
            }}
            onSignOut={async () => {
              await chrome.runtime.sendMessage({ type: 'sign-out' });
              setAuthUser(null);
            }}
            settings={s.settings}
            onSettingChange={handleSettingChange}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Tab grid — floats directly on backdrop */}
        <div className="flex-1 min-h-0 overflow-hidden px-6 pb-2">
          {s.isCommandMode ? (
            <CommandPalette
              query={s.commandQuery}
              commands={commands}
              onClose={() => s.setQuery('')}
            />
          ) : (
            <TabGrid
              tabs={s.displayTabs}
              selectedIndex={s.selectedIndex}
              selectedTabs={s.selectedTabs}
              bookmarkedUrls={s.bookmarkedUrls}
              duplicateUrls={s.duplicateUrls}
              notesMap={s.notesMap}
              actions={a}
              onColsComputed={onColsComputed}
              thumbnails={s.thumbnails}
              closingTabIds={s.closingTabIds}
              onContextMenuOpen={(x, y, items) => setCtxMenu({ x, y, items })}
            />
          )}
        </div>

        {/* Bottom section: workspaces + search — pinned to bottom */}
        <div className="shrink-0">
          <GroupSuggestions
            tabs={s.windowFilter === 'current' && s.currentWindowId
              ? s.tabs.filter((t) => t.windowId === s.currentWindowId)
              : s.tabs}
            actions={a}
            selectedTabs={s.selectedTabs}
            groupFilter={s.groupFilter}
            onGroupFilterToggle={(gid) => s.setGroupFilter((prev) => {
              const next = new Set(prev);
              if (next.has(gid)) next.delete(gid);
              else next.add(gid);
              return next;
            })}
          />
          <WorkspaceSection key={wsRefreshKey} tabs={s.displayTabs} onRestore={s.hide} authUser={authUser} onRequestSignIn={() => setShowSettings(true)} />

          {agentResult && (
            <AiAgentPanel
              message={agentResult.message}
              actions={agentResult.actions}
              completedCount={completedCount}
              onDismiss={() => { setAgentResult(null); setAiMode(false); }}
            />
          )}
          {aiPending && <AiThinkingBar />}

          <WindowStrip
            windows={s.otherWindows}
            currentWindowId={s.currentWindowId}
          />

          <BottomBar
            query={aiMode ? aiQuery : s.query}
            onQueryChange={aiMode ? setAiQuery : s.setQuery}
            isAiMode={aiMode}
            onAiClick={() => { setAiMode((p) => !p); setAiQuery(''); }}
            onAiSubmit={handleAiSubmit}
            promptHistory={promptHistoryRef.current}
          />
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {s.undoToast && (
        <UndoToast
          key={s.undoToast.message}
          message={s.undoToast.message}
          onUndo={() => { a.undo(); }}
          onDismiss={() => s.setUndoToast(null)}
        />
      )}
    </div>
  );
}
