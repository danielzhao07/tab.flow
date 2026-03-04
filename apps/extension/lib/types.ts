export interface TabInfo {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  faviconUrl: string;
  lastAccessed: number;
  isActive: boolean;
  isPinned: boolean;
  isAudible: boolean;
  isMuted: boolean;
  isDiscarded: boolean;
  groupId?: number;
  groupTitle?: string;
  groupColor?: string;
}

export interface RecentTab {
  sessionId: string;
  title: string;
  url: string;
  faviconUrl: string;
}

export interface MRUMessage {
  type: 'toggle-hud' | 'get-tabs' | 'get-recent' | 'switch-tab' | 'close-tab' | 'pin-tab' | 'group-tabs' | 'ungroup-tabs' | 'get-bookmarks' | 'add-bookmark' | 'remove-bookmark' | 'restore-session' | 'reopen-last-closed' | 'tabs-updated';
  payload?: any;
}

export type UndoRecord = {
  label: string;
  timestamp: number;
} & (
  | { type: 'close'; closeCount: number }
  | { type: 'pin'; tabIds: number[]; wasPinned: boolean }
  | { type: 'bookmark'; url: string; title: string; faviconUrl: string; wasBookmarked: boolean }
  | { type: 'mute'; tabIds: number[]; wasMuted: boolean }
  | { type: 'group'; tabIds: number[] }
  | { type: 'ungroup'; groups: Array<{ groupId: number; tabIds: number[]; groupTitle: string; groupColor: string }> }
  | { type: 'ai-batch';
      closedUrls: string[];
      openedTabIds: number[];
      grouped: number[];
      ungrouped: Array<{ groupId: number; tabIds: number[]; groupTitle: string; groupColor: string }>;
      pinChanges: Array<{ tabId: number; wasPinned: boolean }>;
      muteChanges: Array<{ tabId: number; wasMuted: boolean }>;
      discardedTabIds: number[];
      movedTabs: Array<{ tabId: number; originalWindowId: number }>;
    }
);
