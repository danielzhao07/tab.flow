import { useState, useCallback, useMemo, useRef, useEffect, type Dispatch, type SetStateAction } from 'react';
import type { TabInfo, RecentTab } from '@/lib/types';
import type { TabFlowSettings } from '@/lib/settings';
import { searchTabs } from '@/lib/fuse-search';
import { getSettings } from '@/lib/settings';
import { getFrecencyMap, computeScore } from '@/lib/frecency';
import type { TabBookmark } from '@/lib/bookmarks';
// api-client imported in HudOverlay for AI history search

export interface OtherWindow {
  windowId: number;
  tabCount: number;
  title: string;
  faviconUrl: string;
}

export interface HudState {
  // Visibility
  visible: boolean;
  setVisible: Dispatch<SetStateAction<boolean>>;
  animatingIn: boolean;
  setAnimatingIn: Dispatch<SetStateAction<boolean>>;
  hide: () => void;

  // Tabs
  tabs: TabInfo[];
  setTabs: Dispatch<SetStateAction<TabInfo[]>>;
  recentTabs: RecentTab[];
  setRecentTabs: Dispatch<SetStateAction<RecentTab[]>>;

  // Search + nav
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;

  // Settings
  settings: TabFlowSettings | null;
  setSettings: Dispatch<SetStateAction<TabFlowSettings | null>>;

  // Window
  currentWindowId: number | undefined;
  setCurrentWindowId: Dispatch<SetStateAction<number | undefined>>;
  windowFilter: 'all' | 'current';
  setWindowFilter: Dispatch<SetStateAction<'all' | 'current'>>;
  otherWindows: OtherWindow[];
  setOtherWindows: Dispatch<SetStateAction<OtherWindow[]>>;

  // Multi-select
  selectedTabs: Set<number>;
  setSelectedTabs: Dispatch<SetStateAction<Set<number>>>;

  // Sort
  sortMode: 'mru' | 'domain' | 'title' | 'frecency';
  setSortMode: Dispatch<SetStateAction<'mru' | 'domain' | 'title' | 'frecency'>>;
  frecencyScores: Map<string, number>;
  setFrecencyScores: Dispatch<SetStateAction<Map<string, number>>>;

  // Bookmarks + notes
  bookmarkedUrls: Set<string>;
  setBookmarkedUrls: Dispatch<SetStateAction<Set<string>>>;
  notesMap: Map<string, string>;
  setNotesMap: Dispatch<SetStateAction<Map<string, string>>>;

  // UI state
  showCheatSheet: boolean;
  setShowCheatSheet: Dispatch<SetStateAction<boolean>>;
  undoToast: { message: string } | null;
  setUndoToast: Dispatch<SetStateAction<{ message: string } | null>>;

  // Group filter (click a group pill to show only that group)
  groupFilter: Set<number>;
  setGroupFilter: Dispatch<SetStateAction<Set<number>>>;

  // Context menu
  contextMenu: { x: number; y: number; tabId: number } | null;
  setContextMenu: Dispatch<SetStateAction<{ x: number; y: number; tabId: number } | null>>;

  // Computed
  displayTabs: TabInfo[];
  duplicateMap: Map<string, number[]>;
  duplicateUrls: Set<string>;
  duplicateCount: number;
  isCommandMode: boolean;
  commandQuery: string;

  // Thumbnails
  thumbnails: Map<number, string>;
  setThumbnails: Dispatch<SetStateAction<Map<number, string>>>;

  // Fetch
  fetchTabs: () => Promise<void>;
  fetchRecentTabs: () => Promise<void>;
  // Deduplication ref: tracks tab IDs closed by the extension (so 'tab-removed' handler skips them)
  pendingExtensionCloseIdsRef: React.MutableRefObject<Set<number>>;
}

export function useHudState(): HudState {
  const [visible, setVisible] = useState(false);
  const [animatingIn, setAnimatingIn] = useState(false);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [settings, setSettings] = useState<TabFlowSettings | null>(null);
  const [recentTabs, setRecentTabs] = useState<RecentTab[]>([]);
  const [currentWindowId, setCurrentWindowId] = useState<number | undefined>();
  const [windowFilter, setWindowFilter] = useState<'all' | 'current'>('current');
  const [selectedTabs, setSelectedTabs] = useState<Set<number>>(new Set());
  const [sortMode, setSortMode] = useState<'mru' | 'domain' | 'title' | 'frecency'>('mru');
  const [frecencyScores, setFrecencyScores] = useState<Map<string, number>>(new Map());
  const [bookmarkedUrls, setBookmarkedUrls] = useState<Set<string>>(new Set());
  const [notesMap, setNotesMap] = useState<Map<string, string>>(new Map());
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [undoToast, setUndoToast] = useState<{ message: string } | null>(null);
  const [otherWindows, setOtherWindows] = useState<OtherWindow[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: number } | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());
  const [groupFilter, setGroupFilter] = useState<Set<number>>(new Set());
  const pendingExtensionCloseIdsRef = useRef<Set<number>>(new Set());

  const hide = useCallback(() => {
    setAnimatingIn(false);
    setShowCheatSheet(false);
    setContextMenu(null);
    setUndoToast(null);
    // Wait for the 150ms CSS fade-out to finish before hiding the DOM and notifying
    // the background. This ensures the background's capture grace period starts only
    // after the overlay is fully gone, preventing thumbnails from showing the HUD.
    setTimeout(() => {
      setVisible(false);
      setQuery('');
      setSelectedIndex(0);
      setSelectedTabs(new Set());
      setGroupFilter(new Set());
      chrome.runtime.sendMessage({ type: 'hud-closed' }).catch(() => {});
    }, 150);
  }, []);

  const fetchTabs = useCallback(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'get-tabs' });
    if (response?.tabs) setTabs(response.tabs);
    if (response?.currentWindowId) setCurrentWindowId(response.currentWindowId);
  }, []);

  const fetchRecentTabs = useCallback(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'get-recent' });
    if (response?.recentTabs) setRecentTabs(response.recentTabs);
  }, []);

  // Computed: window-filtered + sorted tabs
  const windowFilteredTabs = windowFilter === 'current' && currentWindowId
    ? tabs.filter((t) => t.windowId === currentWindowId)
    : tabs;

  const sortedTabs = useMemo(() => {
    const list = [...windowFilteredTabs];
    if (sortMode === 'domain') {
      list.sort((a, b) => {
        const da = domain(a.url);
        const db = domain(b.url);
        return da.localeCompare(db) || a.title.localeCompare(b.title);
      });
    } else if (sortMode === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortMode === 'frecency') {
      list.sort((a, b) => (frecencyScores.get(b.url) ?? 0) - (frecencyScores.get(a.url) ?? 0));
    }
    return list;
  }, [windowFilteredTabs, sortMode, frecencyScores]);

  // Duplicate detection
  const duplicateMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const tab of tabs) {
      if (!tab.url || tab.url === 'chrome://newtab/') continue;
      const existing = map.get(tab.url);
      if (existing) existing.push(tab.tabId);
      else map.set(tab.url, [tab.tabId]);
    }
    return map;
  }, [tabs]);

  const duplicateUrls = useMemo(() => {
    const set = new Set<string>();
    for (const [url, ids] of duplicateMap) {
      if (ids.length > 1) set.add(url);
    }
    return set;
  }, [duplicateMap]);

  const duplicateCount = useMemo(() => {
    let count = 0;
    for (const [, ids] of duplicateMap) {
      if (ids.length > 1) count += ids.length - 1;
    }
    return count;
  }, [duplicateMap]);

  const isCommandMode = query.startsWith('>');
  const commandQuery = isCommandMode ? query.slice(1).trim() : '';

  const filteredTabs = !query || isCommandMode
    ? sortedTabs
    : searchTabs(sortedTabs, query, settings?.searchThreshold, notesMap.size > 0 ? notesMap : undefined, duplicateUrls);

  const groupFilteredTabs = groupFilter.size > 0
    ? filteredTabs.filter((t) => t.groupId != null && groupFilter.has(t.groupId))
    : filteredTabs;

  const displayTabs = settings?.maxResults
    ? groupFilteredTabs.slice(0, settings.maxResults)
    : groupFilteredTabs;

  return {
    visible, setVisible, animatingIn, setAnimatingIn, hide,
    tabs, setTabs, recentTabs, setRecentTabs,
    query, setQuery, selectedIndex, setSelectedIndex,
    settings, setSettings,
    currentWindowId, setCurrentWindowId,
    windowFilter, setWindowFilter,
    otherWindows, setOtherWindows,
    selectedTabs, setSelectedTabs,
    sortMode, setSortMode, frecencyScores, setFrecencyScores,
    bookmarkedUrls, setBookmarkedUrls,
    notesMap, setNotesMap,
    showCheatSheet, setShowCheatSheet,
    undoToast, setUndoToast,
    groupFilter, setGroupFilter,
    contextMenu, setContextMenu,
    thumbnails, setThumbnails,
    displayTabs, duplicateMap, duplicateUrls, duplicateCount,
    isCommandMode, commandQuery,
    fetchTabs, fetchRecentTabs,
    pendingExtensionCloseIdsRef,
  };
}

function domain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

// Called once on open to load all async data
export async function loadHudData(state: HudState) {
  const [settings, frecencyMap] = await Promise.all([
    getSettings(),
    getFrecencyMap(),
  ]);
  state.setSettings(settings);
  const scores = new Map<string, number>();
  for (const [url, entry] of frecencyMap) scores.set(url, computeScore(entry));
  state.setFrecencyScores(scores);

  const [bookmarksRes, notesRes, windowsRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'get-bookmarks' }),
    chrome.runtime.sendMessage({ type: 'get-notes' }),
    chrome.runtime.sendMessage({ type: 'get-windows' }),
  ]);
  if (bookmarksRes?.bookmarks) {
    state.setBookmarkedUrls(new Set(bookmarksRes.bookmarks.map((b: TabBookmark) => b.url)));
  }
  if (notesRes?.notes) {
    state.setNotesMap(new Map(Object.entries(notesRes.notes)));
  }
  if (windowsRes?.windows) {
    state.setOtherWindows(windowsRes.windows);
  }
}
