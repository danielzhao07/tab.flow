import { useCallback } from 'react';
import type { TabBookmark } from '@/lib/bookmarks';
import type { UndoRecord, TabInfo } from '@/lib/types';
import type { HudState } from './useHudState';
import { getDomain, getGroupTitle, getSmartGroupName, findRelatedTabs } from '@/lib/group-utils';

export interface TabActions {
  switchToTab: (tabId: number) => void;
  closeTab: (tabId: number) => void;
  togglePin: (tabId: number, pinned: boolean) => void;
  toggleSelect: (tabId: number, shiftKey: boolean) => void;
  closeSelectedTabs: () => void;
  closeDuplicates: () => void;
  groupSelectedTabs: () => Promise<void>;
  ungroupSelectedTabs: () => Promise<void>;
  dissolveGroup: (groupId: number) => Promise<void>;
  toggleBookmark: (tabId: number) => Promise<void>;
  saveNote: (tabId: number, url: string, note: string) => Promise<void>;

  moveToWindow: (tabId: number, windowId: number) => Promise<void>;
  reorderTabs: (fromIndex: number, toIndex: number) => Promise<void>;
  toggleMute: (tabId: number) => Promise<void>;
  closeByDomain: (tabId: number, domain: string) => Promise<void>;
  groupSuggestionTabs: (tabIds: number[], domain: string) => Promise<void>;
  restoreSession: (sessionId: string) => Promise<void>;
  reopenLastClosed: () => Promise<void>;
  selectAll: () => void;
  duplicateTab: (tabId: number) => void;
  moveToNewWindow: (tabId: number) => Promise<void>;
  moveSelectedToNewWindow: () => Promise<void>;
  reloadTab: (tabId: number) => void;
  groupTab: (tabId: number) => Promise<void>;
  ungroupTab: (tabId: number) => Promise<void>;
  addToGroup: (tabIds: number[], groupId: number, groupTitle: string, groupColor: string) => Promise<void>;
  // Bulk actions for multi-select
  pinSelectedTabs: (pinned: boolean) => void;
  bookmarkSelectedTabs: () => Promise<void>;
  muteSelectedTabs: (muted: boolean) => Promise<void>;
  duplicateSelectedTabs: () => void;
  reloadSelectedTabs: () => void;
  // Undo
  undo: () => Promise<void>;
}

const MAX_UNDO_STACK = 20;

export function useTabActions(s: HudState): TabActions {
  const pushUndo = useCallback((record: UndoRecord) => {
    // Tag every undo record with the current window so Ctrl+Z only undoes
    // actions from the window the user is currently in.
    const tagged = { ...record, windowId: record.windowId ?? s.currentWindowId };
    s.setUndoStack((prev) => [tagged, ...prev].slice(0, MAX_UNDO_STACK));
    s.setUndoToast({ message: record.label });
  }, [s]);

  const switchToTab = useCallback((tabId: number) => {
    chrome.runtime.sendMessage({ type: 'switch-tab', payload: { tabId } });
    s.hide();
  }, [s]);

  const closeTab = useCallback((tabId: number) => {
    const closedTab = s.tabs.find((t) => t.tabId === tabId);
    // Mark as extension-initiated so the 'tab-removed' broadcast handler skips the toast
    s.pendingExtensionCloseIdsRef.current.add(tabId);
    chrome.runtime.sendMessage({ type: 'close-tab', payload: { tabId } });
    // Start exit animation — tab stays in list but renders as closing
    s.setClosingTabIds((prev) => new Set([...prev, tabId]));
    // After animation completes, actually remove from state
    setTimeout(() => {
      s.setTabs((prev) => {
        const next = prev.filter((t) => t.tabId !== tabId);
        s.setSelectedIndex((idx) => Math.min(idx, Math.max(0, next.length - 1)));
        return next;
      });
      s.setClosingTabIds((prev) => {
        const next = new Set(prev);
        next.delete(tabId);
        return next;
      });
    }, 300);
    // Remove from multi-selection immediately
    s.setSelectedTabs((prev) => {
      if (!prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
    if (closedTab) {
      const title = closedTab.title.length > 30 ? closedTab.title.slice(0, 30) + '...' : closedTab.title;
      pushUndo({ type: 'close', label: `Closed "${title}"`, timestamp: Date.now(), closeCount: 1 });
    }
  }, [s, pushUndo]);

  const togglePin = useCallback((tabId: number, pinned: boolean) => {
    pushUndo({ type: 'pin', label: pinned ? 'Pinned tab' : 'Unpinned tab', timestamp: Date.now(), tabIds: [tabId], wasPinned: !pinned });
    chrome.runtime.sendMessage({ type: 'pin-tab', payload: { tabId, pinned } });
    s.setTabs((prev) => prev.map((t) => t.tabId === tabId ? { ...t, isPinned: pinned } : t));
  }, [s, pushUndo]);

  const toggleSelect = useCallback((tabId: number, shiftKey: boolean) => {
    s.setSelectedTabs((prev) => {
      const next = new Set(prev);
      if (shiftKey && prev.size > 0) {
        const lastSelected = [...prev].pop()!;
        const lastIdx = s.displayTabs.findIndex((t) => t.tabId === lastSelected);
        const curIdx = s.displayTabs.findIndex((t) => t.tabId === tabId);
        if (lastIdx !== -1 && curIdx !== -1) {
          const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          for (let i = start; i <= end; i++) next.add(s.displayTabs[i].tabId);
        }
      } else {
        if (next.has(tabId)) next.delete(tabId);
        else next.add(tabId);
      }
      return next;
    });
  }, [s]);

  const closeSelectedTabs = useCallback(() => {
    const toClose = new Set(s.selectedTabs);
    if (toClose.size > 0) {
      pushUndo({ type: 'close', label: `Closed ${toClose.size} tabs`, timestamp: Date.now(), closeCount: toClose.size });
    }
    for (const tabId of toClose) {
      s.pendingExtensionCloseIdsRef.current.add(tabId);
      chrome.runtime.sendMessage({ type: 'close-tab', payload: { tabId } });
    }
    // Start exit animation for all selected
    s.setClosingTabIds((prev) => new Set([...prev, ...toClose]));
    s.setSelectedTabs(new Set());
    setTimeout(() => {
      s.setTabs((prev) => {
        const next = prev.filter((t) => !toClose.has(t.tabId));
        s.setSelectedIndex((idx) => Math.min(idx, Math.max(0, next.length - 1)));
        return next;
      });
      s.setClosingTabIds((prev) => {
        const next = new Set(prev);
        for (const tabId of toClose) next.delete(tabId);
        return next;
      });
    }, 300);
  }, [s, pushUndo]);

  const closeDuplicates = useCallback(() => {
    const toClose: number[] = [];
    for (const [, ids] of s.duplicateMap) {
      if (ids.length > 1) toClose.push(...ids.slice(1));
    }
    if (toClose.length > 0) {
      pushUndo({ type: 'close', label: `Closed ${toClose.length} duplicates`, timestamp: Date.now(), closeCount: toClose.length });
    }
    for (const tabId of toClose) {
      s.pendingExtensionCloseIdsRef.current.add(tabId);
      chrome.runtime.sendMessage({ type: 'close-tab', payload: { tabId } });
    }
    const closeSet = new Set(toClose);
    // Start exit animation
    s.setClosingTabIds((prev) => new Set([...prev, ...closeSet]));
    setTimeout(() => {
      s.setTabs((prev) => {
        const next = prev.filter((t) => !closeSet.has(t.tabId));
        s.setSelectedIndex((idx) => Math.min(idx, Math.max(0, next.length - 1)));
        return next;
      });
      s.setClosingTabIds((prev) => {
        const next = new Set(prev);
        for (const tabId of closeSet) next.delete(tabId);
        return next;
      });
    }, 300);
  }, [s, pushUndo]);

  const groupSelectedTabs = useCallback(async () => {
    if (s.selectedTabs.size === 0) return;
    const tabIds = [...s.selectedTabs];
    const selectedTabInfos = tabIds.map((id) => s.tabs.find((t) => t.tabId === id)).filter(Boolean) as TabInfo[];
    // Generate name from titles first (instant), don't block on description fetch
    const title = getSmartGroupName(selectedTabInfos);
    const topDomain = getDomain(selectedTabInfos[0]?.url ?? '');
    const usedColors = new Set(s.tabs.filter((t) => t.groupColor).map((t) => t.groupColor!));
    const color = pickGroupColor(topDomain, usedColors);
    pushUndo({ type: 'group', label: `Grouped ${tabIds.length} tabs`, timestamp: Date.now(), tabIds });
    await chrome.runtime.sendMessage({ type: 'group-tabs', payload: { tabIds, title, color } });
    s.setSelectedTabs(new Set());
    s.fetchTabs();
  }, [s, pushUndo]);

  const ungroupSelectedTabs = useCallback(async () => {
    const tabIds = s.selectedTabs.size > 0
      ? [...s.selectedTabs]
      : s.displayTabs[s.selectedIndex] ? [s.displayTabs[s.selectedIndex].tabId] : [];
    if (tabIds.length === 0) return;
    // Build per-original-group undo entries (skip tabs not in any group)
    const groupMap = new Map<number, { groupId: number; tabIds: number[]; groupTitle: string; groupColor: string }>();
    for (const id of tabIds) {
      const tab = s.tabs.find((t) => t.tabId === id);
      if (tab?.groupId != null) {
        if (!groupMap.has(tab.groupId)) {
          groupMap.set(tab.groupId, { groupId: tab.groupId, tabIds: [], groupTitle: tab.groupTitle || '', groupColor: tab.groupColor || 'blue' });
        }
        groupMap.get(tab.groupId)!.tabIds.push(id);
      }
    }
    const groups = [...groupMap.values()];
    if (groups.length === 0) return; // nothing to ungroup
    pushUndo({ type: 'ungroup', label: `Ungrouped ${tabIds.length} tabs`, timestamp: Date.now(), groups });
    // Only send tabs that are actually in a group — chrome.tabs.ungroup throws for ungrouped tabs
    const groupedTabIds = groups.flatMap((g) => g.tabIds);
    await chrome.runtime.sendMessage({ type: 'ungroup-tabs', payload: { tabIds: groupedTabIds } });
    s.setSelectedTabs(new Set());
    s.fetchTabs();
  }, [s, pushUndo]);

  const dissolveGroup = useCallback(async (groupId: number) => {
    const groupTabs = s.tabs.filter((t) => t.groupId === groupId);
    const tabIds = groupTabs.map((t) => t.tabId);
    if (tabIds.length === 0) return;
    const firstTab = groupTabs[0];
    pushUndo({ type: 'ungroup', label: `Dissolved group`, timestamp: Date.now(), groups: [{ groupId, tabIds, groupTitle: firstTab?.groupTitle || '', groupColor: firstTab?.groupColor || 'blue' }] });
    await chrome.runtime.sendMessage({ type: 'ungroup-tabs', payload: { tabIds } });
    s.setGroupFilter((prev) => { const next = new Set(prev); next.delete(groupId); return next; });
    s.fetchTabs();
  }, [s, pushUndo]);

  const toggleBookmark = useCallback(async (tabId: number) => {
    const tab = s.tabs.find((t) => t.tabId === tabId);
    if (!tab) return;
    const wasBookmarked = s.bookmarkedUrls.has(tab.url);
    pushUndo({ type: 'bookmark', label: wasBookmarked ? 'Removed bookmark' : 'Bookmarked tab', timestamp: Date.now(), url: tab.url, title: tab.title, faviconUrl: tab.faviconUrl, wasBookmarked });
    if (wasBookmarked) {
      const res = await chrome.runtime.sendMessage({ type: 'remove-bookmark', payload: { url: tab.url } });
      if (res?.bookmarks) s.setBookmarkedUrls(new Set(res.bookmarks.map((b: TabBookmark) => b.url)));
    } else {
      const res = await chrome.runtime.sendMessage({ type: 'add-bookmark', payload: { url: tab.url, title: tab.title, faviconUrl: tab.faviconUrl } });
      if (res?.bookmarks) s.setBookmarkedUrls(new Set(res.bookmarks.map((b: TabBookmark) => b.url)));
    }
  }, [s, pushUndo]);

  const saveNote = useCallback(async (_tabId: number, url: string, note: string) => {
    await chrome.runtime.sendMessage({ type: 'save-note', payload: { url, note } });
    s.setNotesMap((prev) => {
      const next = new Map(prev);
      if (note.trim()) next.set(url, note.trim());
      else next.delete(url);
      return next;
    });
  }, [s]);

  const moveToWindow = useCallback(async (tabId: number, windowId: number) => {
    await chrome.runtime.sendMessage({ type: 'move-to-window', payload: { tabId, windowId } });
    s.fetchTabs();
    const res = await chrome.runtime.sendMessage({ type: 'get-windows' });
    if (res?.windows) s.setOtherWindows(res.windows);
  }, [s]);

  const reorderTabs = useCallback(async (fromIndex: number, toIndex: number) => {
    const tab = s.displayTabs[fromIndex];
    if (!tab || !s.displayTabs[toIndex]) return;
    try {
      await chrome.tabs.move(tab.tabId, { index: toIndex });
      s.fetchTabs();
    } catch { /* tab may be gone */ }
  }, [s]);

  const toggleMute = useCallback(async (tabId: number) => {
    const tab = s.tabs.find((t) => t.tabId === tabId);
    if (!tab) return;
    const wasMuted = tab.isMuted;
    const newMuted = !wasMuted;
    pushUndo({ type: 'mute', label: newMuted ? 'Muted tab' : 'Unmuted tab', timestamp: Date.now(), tabIds: [tabId], wasMuted });
    // Optimistically update local state immediately
    s.setTabs((prev) => prev.map((t) => t.tabId === tabId ? { ...t, isMuted: newMuted } : t));
    // Concurrently update Chrome's native mute state
    await chrome.runtime.sendMessage({ type: 'mute-tab', payload: { tabId, muted: newMuted } });
  }, [s, pushUndo]);

  const closeByDomain = useCallback(async (tabId: number, domain: string) => {
    await chrome.runtime.sendMessage({ type: 'close-by-domain', payload: { domain, excludeTabId: tabId } });
    s.fetchTabs();
  }, [s]);

  const groupSuggestionTabs = useCallback(async (tabIds: number[], label: string) => {
    // Expand the suggestion to include related ungrouped tabs that belong in the
    // same group (same domain, brand, semantic category, or keyword overlap).
    // Only consider tabs in the current window — never pull from other windows.
    const windowTabs = s.currentWindowId
      ? s.tabs.filter((t) => t.windowId === s.currentWindowId)
      : s.tabs;
    const seedTabs = windowTabs.filter((t) => tabIds.includes(t.tabId));
    const extraIds = findRelatedTabs(seedTabs, windowTabs, label);
    const allIds = [...new Set([...tabIds, ...extraIds])];

    const firstTab = s.tabs.find((t) => t.tabId === allIds[0]);
    const topDomain = getDomain(firstTab?.url ?? '');
    const usedColors = new Set(s.tabs.filter((t) => t.groupColor).map((t) => t.groupColor!));
    const color = pickGroupColor(topDomain, usedColors);
    const tabIdSet = new Set(allIds);
    // Optimistic update: mark tabs as grouped immediately so the UI feels instant
    s.setTabs((prev) => prev.map((t) =>
      tabIdSet.has(t.tabId) ? { ...t, groupTitle: label, groupColor: color } : t
    ));
    await chrome.runtime.sendMessage({ type: 'group-tabs', payload: { tabIds: allIds, title: label, color } });
    s.fetchTabs();
  }, [s]);

  const restoreSession = useCallback(async (sessionId: string) => {
    await chrome.runtime.sendMessage({ type: 'restore-session', payload: { sessionId } });
    s.fetchTabs();
    s.fetchRecentTabs();
  }, [s]);

  const reopenLastClosed = useCallback(async () => {
    const res = await chrome.runtime.sendMessage({ type: 'reopen-last-closed' });
    if (res?.success) { s.fetchTabs(); s.fetchRecentTabs(); }
  }, [s]);

  const selectAll = useCallback(() => {
    const allIds = new Set(s.displayTabs.map((t) => t.tabId));
    s.setSelectedTabs((prev) => {
      if (s.displayTabs.every((t) => prev.has(t.tabId))) return new Set();
      return allIds;
    });
  }, [s]);

  const duplicateTab = useCallback((tabId: number) => {
    chrome.runtime.sendMessage({ type: 'duplicate-tab', payload: { tabId } });
  }, []);

  const moveToNewWindow = useCallback(async (tabId: number) => {
    await chrome.runtime.sendMessage({ type: 'move-to-window', payload: { tabId, windowId: -1 } });
    s.fetchTabs();
  }, [s]);

  const moveSelectedToNewWindow = useCallback(async () => {
    const tabIds = [...s.selectedTabs];
    if (tabIds.length === 0) return;
    await chrome.runtime.sendMessage({ type: 'move-tabs-to-new-window', payload: { tabIds } });
    s.setSelectedTabs(new Set());
    s.fetchTabs();
  }, [s]);

  const reloadTab = useCallback((tabId: number) => {
    chrome.runtime.sendMessage({ type: 'reload-tab', payload: { tabId } });
  }, []);

  const groupTab = useCallback(async (tabId: number) => {
    const tab = s.tabs.find((t) => t.tabId === tabId);
    if (!tab) return;
    pushUndo({ type: 'group', label: 'Grouped tab', timestamp: Date.now(), tabIds: [tabId] });
    const title = getSmartGroupName([tab]);
    const domain = getDomain(tab.url);
    const usedColors = new Set(s.tabs.filter((t) => t.groupColor).map((t) => t.groupColor!));
    const color = pickGroupColor(domain, usedColors);
    await chrome.runtime.sendMessage({ type: 'group-tabs', payload: { tabIds: [tabId], title, color } });
    s.fetchTabs();
  }, [s, pushUndo]);

  const ungroupTab = useCallback(async (tabId: number) => {
    const tab = s.tabs.find((t) => t.tabId === tabId);
    if (tab?.groupId != null) {
      pushUndo({ type: 'ungroup', label: 'Ungrouped tab', timestamp: Date.now(), groups: [{ groupId: tab.groupId, tabIds: [tabId], groupTitle: tab.groupTitle || '', groupColor: tab.groupColor || 'blue' }] });
    }
    await chrome.runtime.sendMessage({ type: 'ungroup-tabs', payload: { tabIds: [tabId] } });
    s.fetchTabs();
  }, [s, pushUndo]);

  const addToGroup = useCallback(async (tabIds: number[], groupId: number, groupTitle: string, groupColor: string) => {
    pushUndo({ type: 'group', label: `Added ${tabIds.length} tab${tabIds.length > 1 ? 's' : ''} to "${groupTitle}"`, timestamp: Date.now(), tabIds });
    await chrome.runtime.sendMessage({ type: 'group-tabs', payload: { tabIds, title: groupTitle, color: groupColor, groupId } });
    await new Promise<void>((r) => setTimeout(r, 150));
    s.fetchTabs();
  }, [s, pushUndo]);

  const pinSelectedTabs = useCallback((pinned: boolean) => {
    if (s.selectedTabs.size > 0) {
      pushUndo({ type: 'pin', label: pinned ? `Pinned ${s.selectedTabs.size} tabs` : `Unpinned ${s.selectedTabs.size} tabs`, timestamp: Date.now(), tabIds: [...s.selectedTabs], wasPinned: !pinned });
    }
    for (const tabId of s.selectedTabs) {
      chrome.runtime.sendMessage({ type: 'pin-tab', payload: { tabId, pinned } });
    }
    s.setTabs((prev) => prev.map((t) => s.selectedTabs.has(t.tabId) ? { ...t, isPinned: pinned } : t));
  }, [s, pushUndo]);

  const bookmarkSelectedTabs = useCallback(async () => {
    const toBookmark = s.tabs.filter((t) => s.selectedTabs.has(t.tabId) && !s.bookmarkedUrls.has(t.url));
    let lastRes: { bookmarks?: TabBookmark[] } | null = null;
    for (const tab of toBookmark) {
      lastRes = await chrome.runtime.sendMessage({ type: 'add-bookmark', payload: { url: tab.url, title: tab.title, faviconUrl: tab.faviconUrl } });
    }
    if (lastRes?.bookmarks) s.setBookmarkedUrls(new Set(lastRes.bookmarks.map((b: TabBookmark) => b.url)));
  }, [s]);

  const muteSelectedTabs = useCallback(async (muted: boolean) => {
    if (s.selectedTabs.size > 0) {
      pushUndo({ type: 'mute', label: muted ? `Muted ${s.selectedTabs.size} tabs` : `Unmuted ${s.selectedTabs.size} tabs`, timestamp: Date.now(), tabIds: [...s.selectedTabs], wasMuted: !muted });
    }
    for (const tabId of s.selectedTabs) {
      chrome.runtime.sendMessage({ type: 'mute-tab', payload: { tabId, muted } });
    }
    s.setTabs((prev) => prev.map((t) => s.selectedTabs.has(t.tabId) ? { ...t, isMuted: muted } : t));
  }, [s, pushUndo]);

  const duplicateSelectedTabs = useCallback(() => {
    for (const tabId of s.selectedTabs) {
      chrome.runtime.sendMessage({ type: 'duplicate-tab', payload: { tabId } });
    }
  }, [s]);

  const reloadSelectedTabs = useCallback(() => {
    for (const tabId of s.selectedTabs) {
      chrome.runtime.sendMessage({ type: 'reload-tab', payload: { tabId } });
    }
  }, [s]);

  const undo = useCallback(async () => {
    // Always read the undo stack fresh from chrome.storage — this guarantees
    // Ctrl+Z works regardless of how long ago the action occurred, which tab
    // the user is on, or whether the React state is stale.
    const stored = await chrome.storage.local.get('tabflow_undo_stack').catch(() => ({}));
    const stack: UndoRecord[] = Array.isArray((stored as Record<string, unknown>).tabflow_undo_stack)
      ? (stored as Record<string, unknown>).tabflow_undo_stack as UndoRecord[] : [];
    if (stack.length === 0) return;

    // Find the most recent undo record for the CURRENT window.
    // Records without a windowId (legacy) are always eligible.
    const wid = s.currentWindowId;
    const idx = stack.findIndex((r) => !r.windowId || !wid || r.windowId === wid);
    if (idx === -1) return;

    const record = stack[idx];
    const remaining = [...stack.slice(0, idx), ...stack.slice(idx + 1)];
    // Persist the popped stack immediately so subsequent Ctrl+Z presses see it
    await chrome.storage.local.set({ tabflow_undo_stack: remaining }).catch(() => {});
    s.setUndoStack(remaining);
    s.setUndoToast(null);

    switch (record.type) {
      case 'close':
        for (let i = 0; i < record.closeCount; i++) {
          await chrome.runtime.sendMessage({ type: 'reopen-last-closed', payload: { keepFocus: true } });
        }
        s.fetchTabs();
        s.fetchRecentTabs();
        break;
      case 'pin': {
        const { tabIds: pinTabIds, wasPinned } = record;
        for (const tabId of pinTabIds) {
          chrome.runtime.sendMessage({ type: 'pin-tab', payload: { tabId, pinned: wasPinned } });
        }
        s.setTabs((prev) => prev.map((t) => pinTabIds.includes(t.tabId) ? { ...t, isPinned: wasPinned } : t));
        break;
      }
      case 'bookmark':
        if (record.wasBookmarked) {
          const res = await chrome.runtime.sendMessage({ type: 'add-bookmark', payload: { url: record.url, title: record.title, faviconUrl: record.faviconUrl } });
          if (res?.bookmarks) s.setBookmarkedUrls(new Set(res.bookmarks.map((b: TabBookmark) => b.url)));
        } else {
          const res = await chrome.runtime.sendMessage({ type: 'remove-bookmark', payload: { url: record.url } });
          if (res?.bookmarks) s.setBookmarkedUrls(new Set(res.bookmarks.map((b: TabBookmark) => b.url)));
        }
        break;
      case 'mute': {
        const { tabIds: muteTabIds, wasMuted } = record;
        for (const tabId of muteTabIds) {
          chrome.runtime.sendMessage({ type: 'mute-tab', payload: { tabId, muted: wasMuted } });
        }
        s.setTabs((prev) => prev.map((t) => muteTabIds.includes(t.tabId) ? { ...t, isMuted: wasMuted } : t));
        break;
      }
      case 'group':
        await chrome.runtime.sendMessage({ type: 'ungroup-tabs', payload: { tabIds: record.tabIds } });
        s.fetchTabs();
        break;
      case 'ungroup':
        for (const g of record.groups) {
          await chrome.runtime.sendMessage({ type: 'group-tabs', payload: { tabIds: g.tabIds, title: g.groupTitle, color: g.groupColor, groupId: g.groupId } });
        }
        s.fetchTabs();
        break;
      case 'ai-batch': {
        // Undo everything the AI did in one shot
        // 1. Close tabs that were opened by the AI
        for (const tabId of record.openedTabIds) {
          await chrome.runtime.sendMessage({ type: 'close-tab', payload: { tabId } }).catch(() => {});
        }
        // 2. Reopen tabs that were closed by the AI (by URL — survives chrome.sessions purge)
        for (const url of (record.closedUrls ?? [])) {
          await chrome.runtime.sendMessage({ type: 'open-url', payload: { url } }).catch(() => {});
        }
        // 2b. Legacy fallback: if record only has closedCount (old format), use sessions
        const legacyRecord = record as unknown as { closedUrls?: string[]; closedCount?: number };
        if (!legacyRecord.closedUrls && legacyRecord.closedCount) {
          for (let i = 0; i < legacyRecord.closedCount; i++) {
            await chrome.runtime.sendMessage({ type: 'reopen-last-closed', payload: { keepFocus: true } }).catch(() => {});
          }
        }
        // 3. Ungroup tabs that were grouped by the AI
        if (record.grouped.length > 0) {
          await chrome.runtime.sendMessage({ type: 'ungroup-tabs', payload: { tabIds: record.grouped } }).catch(() => {});
        }
        // 4. Re-group tabs that were ungrouped by the AI
        for (const g of record.ungrouped) {
          await chrome.runtime.sendMessage({ type: 'group-tabs', payload: { tabIds: g.tabIds, title: g.groupTitle, color: g.groupColor, groupId: g.groupId } }).catch(() => {});
        }
        // 5. Restore pin states
        for (const { tabId, wasPinned } of record.pinChanges) {
          await chrome.runtime.sendMessage({ type: 'pin-tab', payload: { tabId, pinned: wasPinned } }).catch(() => {});
        }
        // 6. Restore mute states
        for (const { tabId, wasMuted } of record.muteChanges) {
          await chrome.runtime.sendMessage({ type: 'mute-tab', payload: { tabId, muted: wasMuted } }).catch(() => {});
        }
        // 7. Reload tabs that were discarded/suspended
        for (const tabId of record.discardedTabIds) {
          await chrome.runtime.sendMessage({ type: 'reload-tab', payload: { tabId } }).catch(() => {});
        }
        // 8. Move tabs back to original windows
        for (const { tabId, originalWindowId } of record.movedTabs) {
          await chrome.runtime.sendMessage({ type: 'move-to-window', payload: { tabId, windowId: originalWindowId } }).catch(() => {});
        }
        s.fetchTabs();
        s.fetchRecentTabs();
        break;
      }
    }
  }, [s]);

  return {
    switchToTab, closeTab, togglePin, toggleSelect, closeSelectedTabs, closeDuplicates,
    groupSelectedTabs, ungroupSelectedTabs, dissolveGroup, toggleBookmark, saveNote,
    moveToWindow, reorderTabs, toggleMute, closeByDomain, groupSuggestionTabs,
    restoreSession, reopenLastClosed, selectAll, duplicateTab, moveToNewWindow,
    moveSelectedToNewWindow, reloadTab, groupTab, ungroupTab, addToGroup,
    pinSelectedTabs, bookmarkSelectedTabs, muteSelectedTabs, duplicateSelectedTabs, reloadSelectedTabs,
    undo,
  };
}

const CHROME_COLORS = [
  'blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'pink', 'purple', 'grey',
] as const;
type ChromeColor = typeof CHROME_COLORS[number];

// Well-known domains mapped to their closest brand color
const DOMAIN_COLOR_HINTS: Record<string, ChromeColor> = {
  'youtube.com': 'red', 'youtu.be': 'red', 'netflix.com': 'red', 'twitch.tv': 'purple',
  'github.com': 'purple', 'gitlab.com': 'orange', 'stackoverflow.com': 'orange',
  'twitter.com': 'blue', 'x.com': 'blue', 'linkedin.com': 'blue', 'facebook.com': 'blue',
  'figma.com': 'purple', 'notion.so': 'grey', 'obsidian.md': 'purple',
  'spotify.com': 'green', 'google.com': 'blue', 'gmail.com': 'red',
  'reddit.com': 'orange', 'amazon.com': 'orange', 'amazon.ca': 'orange',
  'discord.com': 'purple', 'slack.com': 'pink', 'whatsapp.com': 'green',
  'openai.com': 'grey', 'anthropic.com': 'orange', 'claude.ai': 'orange',
};

/**
 * Pick a Chrome tab group color for a domain that:
 * 1. Matches the site's brand color if known
 * 2. Is derived from the domain name (same domain → same color, always)
 * 3. Avoids colors already used by other groups in the current window
 */
function pickGroupColor(domain: string, usedColors: Set<string>): ChromeColor {
  const hint = DOMAIN_COLOR_HINTS[domain];
  if (hint && !usedColors.has(hint)) return hint;

  // Hash domain string to a consistent starting index
  let hash = 0;
  const seed = domain || 'tab';
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  const startIdx = hash % CHROME_COLORS.length;

  // Cycle forward from the hash index, skipping already-used colors
  for (let i = 0; i < CHROME_COLORS.length; i++) {
    const color = CHROME_COLORS[(startIdx + i) % CHROME_COLORS.length];
    if (!usedColors.has(color)) return color;
  }

  // All 9 colors taken — use the brand hint or hashed index (best effort)
  return hint ?? CHROME_COLORS[startIdx];
}
