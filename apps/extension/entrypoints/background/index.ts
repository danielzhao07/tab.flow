import { initializeMRU, pushToFront, updateTab, removeTab } from '@/lib/mru';
import { getSettings } from '@/lib/settings';
import { getMRUList, setMRUList } from '@/lib/storage';
import { recordVisit } from '@/lib/frecency';
import { getBookmarks, addBookmark, removeBookmark } from '@/lib/bookmarks';
import { getNotesMap, saveNote, deleteNote } from '@/lib/notes';

import { getApiUrl, getDeviceId } from '@/lib/api-client';
import { saveWorkspace } from '@/lib/workspaces';
import { signOut, getStoredTokens, type TokenSet } from '@/lib/auth';

/** Opens the custom auth window and resolves when auth completes or is cancelled. */
function openAuthWindow(): Promise<{ success: boolean; tokenSet?: TokenSet; error?: string }> {
  return new Promise(async (resolve) => {
    const popup = await chrome.windows.create({
      url: chrome.runtime.getURL('auth.html'),
      type: 'popup',
      width: 440,
      height: 620,
      focused: true,
    });

    const onMessage = (msg: any) => {
      if (msg.type !== 'auth-complete') return;
      cleanup();
      chrome.windows.remove(popup.id!).catch(() => {});
      resolve(msg.success
        ? { success: true, tokenSet: msg.tokenSet }
        : { success: false, error: msg.error || 'Auth failed' });
    };

    const onWindowClosed = (windowId: number) => {
      if (windowId !== popup.id) return;
      cleanup();
      resolve({ success: false, error: 'Sign-in cancelled' });
    };

    function cleanup() {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.windows.onRemoved.removeListener(onWindowClosed);
    }

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.windows.onRemoved.addListener(onWindowClosed);
  });
}

// Thumbnail cache: tabId → JPEG dataUrl (max 40 entries, persisted to storage.local)
const tabThumbnails = new Map<number, string>();

async function loadCachedThumbnails() {
  try {
    const result = await chrome.storage.local.get('tabflow_thumbnails');
    if (result.tabflow_thumbnails) {
      for (const [k, v] of Object.entries(result.tabflow_thumbnails as Record<string, string>)) {
        tabThumbnails.set(Number(k), v);
      }
    }
  } catch { /* ignore */ }
}

function persistThumbnails() {
  chrome.storage.local.set({ tabflow_thumbnails: Object.fromEntries(tabThumbnails) }).catch(() => {});
}

// Track whether the HUD overlay is currently visible (skip captures while it's showing)
let hudVisible = false;
// Timestamp of the last HUD hide — captures are blocked for 500ms after hiding
// to generously cover the 180ms CSS fade-out animation and any async timing slack.
let hudHideTime = 0;
// Double-press (Alt+Q+Q) detection — tracked in background for zero-latency timing
let lastCommandTime = 0;
let pendingToggleId = 0;

// Analytics: track focus time per tab
let activeTabFocusStart = Date.now();
let activeTabMeta: { tabId: number; url: string; domain: string; title: string } | null = null;

function getDomainFromUrl(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

/** Send tab visit analytics to the API (fire and forget) */
async function reportVisit(url: string, domain: string, title: string, durationMs: number) {
  if (!url || !domain || durationMs < 1000) return; // ignore very short visits
  try {
    const [apiUrl, deviceId] = await Promise.all([getApiUrl(), getDeviceId()]);
    fetch(`${apiUrl}/api/analytics/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
      body: JSON.stringify({ url, domain, title, durationMs }),
    }).catch(() => {}); // silent fail if API down
  } catch { /* ignore */ }
}


/** Recursively collect all URL bookmarks from Chrome's bookmark tree */
function collectChromeBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]): { url: string; title: string }[] {
  const result: { url: string; title: string }[] = [];
  for (const node of nodes) {
    if (node.url) result.push({ url: node.url, title: node.title });
    if (node.children) result.push(...collectChromeBookmarks(node.children));
  }
  return result;
}

async function getChromeBookmarks(): Promise<{ url: string; title: string }[]> {
  const tree = await chrome.bookmarks.getTree();
  return collectChromeBookmarks(tree);
}

export default defineBackground(() => {
  // Initialize MRU list on install/startup
  initializeMRU();

  // Restore thumbnails from last session
  loadCachedThumbnails();

  // On startup, capture the active tab in every window so thumbnails are
  // available immediately if the user opens the HUD right away.
  captureAllWindowsActiveTabs();

  // First install: auto-trigger sign-in popup + set uninstall feedback URL
  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') {
      chrome.runtime.setUninstallURL('https://danielzhao07github.io/TabFlow/goodbye.html');
      const existing = await getStoredTokens();
      if (!existing) {
        openAuthWindow().catch(() => {}); // user may cancel — that's fine
      }
    }
  });

  // Track tab activation (MRU ordering + frecency + thumbnail capture + analytics)
  chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
    // Record duration for the tab we're leaving
    if (activeTabMeta) {
      const durationMs = Date.now() - activeTabFocusStart;
      reportVisit(activeTabMeta.url, activeTabMeta.domain, activeTabMeta.title, durationMs);
    }

    await pushToFront(tabId, windowId);
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url) {
        recordVisit(tab.url);
        // Start tracking new tab
        activeTabFocusStart = Date.now();
        activeTabMeta = {
          tabId,
          url: tab.url,
          domain: getDomainFromUrl(tab.url),
          title: tab.title || '',
        };
      }
    } catch { /* tab may not exist */ }
    broadcastUpdate();

    // Capture immediately — already-loaded tabs render instantly on activation
    captureThumbnail(tabId, windowId);

    // Retry after 1.5s in case the tab was still loading at activation time
    // (e.g. newly opened tabs that navigate to a URL after chrome://newtab)
    setTimeout(async () => {
      try {
        const activeTabs = await chrome.tabs.query({ active: true, windowId });
        if (activeTabs[0]?.id === tabId) captureThumbnail(tabId, windowId);
      } catch { /* tab may be gone */ }
    }, 1500);
  });

  // Track tab updates (title, URL, favicon changes)
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    const changes: Record<string, any> = {};
    if (changeInfo.title !== undefined) changes.title = changeInfo.title;
    if (changeInfo.url !== undefined) changes.url = changeInfo.url;
    if (changeInfo.favIconUrl !== undefined) changes.faviconUrl = changeInfo.favIconUrl;
    if (changeInfo.pinned !== undefined) changes.isPinned = changeInfo.pinned;
    if (changeInfo.audible !== undefined) changes.isAudible = changeInfo.audible;
    if (changeInfo.discarded !== undefined) changes.isDiscarded = changeInfo.discarded;
    if (changeInfo.groupId !== undefined) {
      changes.groupId = changeInfo.groupId !== -1 ? changeInfo.groupId : undefined;
      if (changeInfo.groupId !== -1) {
        try {
          const group = await chrome.tabGroups.get(changeInfo.groupId);
          changes.groupTitle = group.title || '';
          changes.groupColor = group.color;
        } catch {
          changes.groupTitle = undefined;
          changes.groupColor = undefined;
        }
      } else {
        changes.groupTitle = undefined;
        changes.groupColor = undefined;
      }
    }

    if (Object.keys(changes).length > 0) {
      await updateTab(tabId, changes);
      broadcastUpdate();
    }

    // Re-capture when a tab finishes loading (catches navigation in the active tab)
    if (changeInfo.status === 'complete') {
      try {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (tab?.active && canSendMessage(tab.url ?? '')) {
          // Small delay so the page has time to paint before we screenshot
          setTimeout(() => captureThumbnail(tabId, tab.windowId), 300);
        }
      } catch { /* tab may be gone */ }
    }
  });

  // Track tab removal — send targeted message for instant HUD update
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    // Grab the title BEFORE removing — for extension-initiated closes the MRU entry
    // is already removed eagerly by the close-tab handler, so title will be '' there.
    // For native Chrome closes it will be populated, letting the HUD show an UndoToast.
    const mruList = await getMRUList();
    const closedTitle = mruList.find((t) => t.tabId === tabId)?.title ?? '';
    await removeTab(tabId);
    if (tabThumbnails.delete(tabId)) persistThumbnails();
    broadcastSpecific({ type: 'tab-removed', tabId, title: closedTitle });
  });

  // Live group name/color changes — update all affected tabs in MRU and notify HUD
  chrome.tabGroups.onUpdated.addListener(async (group) => {
    const list = await getMRUList();
    let changed = false;
    for (const tab of list) {
      if (tab.groupId === group.id) {
        await updateTab(tab.tabId, {
          groupTitle: group.title || '',
          groupColor: group.color,
        });
        changed = true;
      }
    }
    if (changed) broadcastUpdate();
  });

  // Track new tabs — trigger full refetch in HUD
  chrome.tabs.onCreated.addListener(async (tab) => {
    if (tab.id) {
      await pushToFront(tab.id, tab.windowId);
      broadcastSpecific({ type: 'tab-created' });
    }
  });

  // Tab attached to a window (cross-window drag, move-to-window)
  // Fires in the NEW window — ensure tab is in MRU with correct windowId and notify all HUDs.
  // Use pushToFront so the tab is added if it was never tracked (e.g. from another window session),
  // and updateTab as a fallback to patch windowId without changing MRU order if it already exists.
  chrome.tabs.onAttached.addListener(async (tabId, { newWindowId }) => {
    const list = await getMRUList();
    const exists = list.some((t) => t.tabId === tabId);
    if (exists) {
      await updateTab(tabId, { windowId: newWindowId }).catch(() => {});
    } else {
      await pushToFront(tabId, newWindowId).catch(() => {});
    }
    broadcastUpdate();
  });

  // Tab detached from a window (first half of a cross-window drag)
  // The HUD will reconcile on the next broadcastUpdate / poll cycle
  chrome.tabs.onDetached.addListener(() => {
    broadcastUpdate();
  });

  // Tab reordered within a window — keeps HUD grid order in sync
  chrome.tabs.onMoved.addListener(() => {
    broadcastUpdate();
  });

  // Handle keyboard shortcut
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-hud') {
      const now = Date.now();
      const isDoublePress = now - lastCommandTime < 400;
      lastCommandTime = now;
      const myToggleId = ++pendingToggleId;

      if (isDoublePress) {
        // Double-press (Alt+Q+Q): quick-switch to the previous tab immediately.
        // Cancel any in-flight single-press toggle by bumping pendingToggleId.
        pendingToggleId++;
        const [mruList, activeTabs] = await Promise.all([
          getMRUList(),
          chrome.tabs.query({ active: true, currentWindow: true }),
        ]);
        const activeTabId = activeTabs[0]?.id;
        // Find the most recently used tab that isn't the current one
        const prev = mruList.find((t) => t.tabId !== activeTabId);
        if (prev) {
          chrome.tabs.update(prev.tabId, { active: true }).catch(() => {});
          chrome.windows.update(prev.windowId, { focused: true }).catch(() => {});
        }
        // Close the HUD on the current tab if it's open
        if (hudVisible && activeTabId) {
          hudVisible = false;
          hudHideTime = Date.now();
          chrome.tabs.sendMessage(activeTabId, { type: 'hide-hud' }).catch(() => {});
        }
        return;
      }

      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Abort if a double-press arrived while we were awaiting the tab query
      if (pendingToggleId !== myToggleId) return;

      // If the active tab is a restricted page (new tab, chrome://, etc.),
      // switch to the most-recently-used real tab first, then show the HUD there.
      if (!canSendMessage(activeTab?.url)) {
        const mruList = await getMRUList();
        if (pendingToggleId !== myToggleId) return;
        const realTab = mruList.find((t) => canSendMessage(t.url));
        if (!realTab) return;
        await chrome.tabs.update(realTab.tabId, { active: true }).catch(() => {});
        await chrome.windows.update(realTab.windowId, { focused: true }).catch(() => {});
        if (pendingToggleId !== myToggleId) return;
        // Brief pause so Chrome has time to activate the tab before we send the message
        setTimeout(() => {
          if (pendingToggleId !== myToggleId) return;
          hudVisible = true;
          chrome.tabs.sendMessage(realTab.tabId, { type: 'toggle-hud' }).catch(() => {
            hudVisible = false;
          });
        }, 120);
        return;
      }

      if (activeTab?.id) {
        // Capture ALL windows' active tabs BEFORE showing HUD so we always
        // have fresh screenshots (like Windows Alt+Tab) — never the overlay.
        if (!hudVisible) {
          await captureAllWindowsActiveTabs();
          if (pendingToggleId !== myToggleId) return; // double-press arrived during capture
        }
        const wasVisible = hudVisible;
        hudVisible = !hudVisible;
        if (wasVisible) hudHideTime = Date.now(); // stamp hide time for grace period
        chrome.tabs.sendMessage(activeTab.id, { type: 'toggle-hud' }).catch(() => {
          // Content script not loaded on this tab
          hudVisible = false;
          hudHideTime = Date.now();
        });
      }
    }
  });

  // Handle messages from content script / popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'get-tabs') {
      const senderWindowId = sender.tab?.windowId;
      (async () => {
        const [mruTabs, chromeTabs] = await Promise.all([getMRUList(), chrome.tabs.query({})]);
        // Build live map — this is the definitive set of open tabs
        const liveMap = new Map(chromeTabs.map((t) => [t.id!, t]));

        // Drop any MRU entries for tabs that Chrome no longer has open
        const staleMruIds = mruTabs.filter((t) => !liveMap.has(t.tabId)).map((t) => t.tabId);
        if (staleMruIds.length > 0) {
          // Clean up in background, don't await
          Promise.all(staleMruIds.map((id) => removeTab(id))).catch(() => {});
        }
        const aliveTabs = mruTabs.filter((t) => liveMap.has(t.tabId));

        // Merge live Chrome data: always trust Chrome for windowId and groupId.
        // windowId catches cross-window drags before MRU is updated.
        // groupId catches newly restored workspace tabs that haven't had their onUpdated fire yet.
        for (const tab of aliveTabs) {
          const live = liveMap.get(tab.tabId);
          if (live) {
            if (live.windowId) tab.windowId = live.windowId;
            if (live.groupId !== undefined) tab.groupId = live.groupId !== -1 ? live.groupId : undefined;
            if (live.title && live.title !== 'New Tab') tab.title = live.title;
            if (live.url) tab.url = live.url;
            if (live.favIconUrl) tab.faviconUrl = live.favIconUrl;
            tab.isMuted = live.mutedInfo?.muted ?? false;
            tab.isAudible = live.audible ?? tab.isAudible;
            tab.isPinned = live.pinned ?? tab.isPinned;
          }
        }

        // Tabs that exist in Chrome but are missing from MRU — add them at the end.
        // Include groupId from Chrome so the group info lookup below applies to them too.
        const mruIds = new Set(aliveTabs.map((t) => t.tabId));
        for (const chromeTab of chromeTabs) {
          if (chromeTab.id && !mruIds.has(chromeTab.id)) {
            aliveTabs.push({
              tabId: chromeTab.id,
              windowId: chromeTab.windowId,
              title: chromeTab.title || '',
              url: chromeTab.url || '',
              faviconUrl: chromeTab.favIconUrl || '',
              lastAccessed: chromeTab.lastAccessed ?? 0,
              isActive: chromeTab.active,
              isPinned: chromeTab.pinned,
              isAudible: chromeTab.audible ?? false,
              isMuted: chromeTab.mutedInfo?.muted ?? false,
              isDiscarded: chromeTab.discarded ?? false,
              groupId: chromeTab.groupId !== -1 ? chromeTab.groupId : undefined,
            });
          }
        }

        // Always refresh live group name/color so renames are instant without needing a reload
        const groupIds = [...new Set(aliveTabs.map((t) => t.groupId).filter(Boolean))] as number[];
        if (groupIds.length > 0) {
          const results = await Promise.allSettled(groupIds.map((gid) => chrome.tabGroups.get(gid)));
          const groupInfoMap = new Map<number, { title: string; color: string }>();
          results.forEach((r, i) => {
            if (r.status === 'fulfilled') {
              groupInfoMap.set(groupIds[i], { title: r.value.title || '', color: r.value.color });
            }
          });
          for (const tab of aliveTabs) {
            if (tab.groupId) {
              const info = groupInfoMap.get(tab.groupId);
              if (info) { tab.groupTitle = info.title; tab.groupColor = info.color; }
            }
          }
        }
        sendResponse({ tabs: aliveTabs, currentWindowId: senderWindowId });
      })();
      return true; // async response
    }

    if (message.type === 'switch-tab') {
      const { tabId } = message.payload;
      chrome.tabs.update(tabId, { active: true }).catch(() => {});
      chrome.tabs.get(tabId).then((tab) => {
        chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      }).catch(() => {});
    }

    if (message.type === 'open-url') {
      chrome.tabs.create({ url: message.payload.url }).catch(() => {});
    }

    if (message.type === 'close-tab') {
      const { tabId } = message.payload;
      // Eagerly remove from MRU NOW — before chrome.tabs.remove triggers onActivated
      // which broadcasts tabs-updated and causes fetchTabs to run. Without this, a
      // race condition means the closed tab reappears in the HUD after the refetch.
      removeTab(tabId).catch(() => {});
      chrome.tabs.remove(tabId).catch(() => {});
    }

    if (message.type === 'duplicate-tab') {
      const { tabId } = message.payload;
      chrome.tabs.duplicate(tabId).catch(() => {});
    }

    if (message.type === 'reload-tab') {
      const { tabId } = message.payload;
      chrome.tabs.reload(tabId).catch(() => {});
    }

    if (message.type === 'pin-tab') {
      const { tabId, pinned } = message.payload;
      chrome.tabs.update(tabId, { pinned });
      // onUpdated listener handles MRU update and broadcast
    }

    if (message.type === 'group-tabs') {
      const { tabIds, title, color } = message.payload;
      (async () => {
        try {
          const groupId = await chrome.tabs.group({ tabIds });
          if (title) await chrome.tabGroups.update(groupId, { title, color: color || 'cyan' });
          else await chrome.tabGroups.update(groupId, { color: color || 'cyan' });
          // Explicitly update MRU for each tab so groupId is visible immediately when fetchTabs runs
          try {
            const group = await chrome.tabGroups.get(groupId);
            for (const tabId of tabIds) {
              await updateTab(tabId, {
                groupId,
                groupTitle: group.title || '',
                groupColor: group.color,
              });
            }
          } catch { /* group info update best-effort */ }
          broadcastUpdate();
          sendResponse({ success: true, groupId });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    if (message.type === 'page-loaded') {
      // Content script fired on page ready — capture if this tab is still active
      const tabId = sender.tab?.id;
      const windowId = sender.tab?.windowId;
      if (tabId && windowId && !hudVisible) {
        chrome.tabs.query({ active: true, windowId }).then(([activeTab]) => {
          if (activeTab?.id === tabId) captureThumbnail(tabId, windowId);
        }).catch(() => {});
      }
    }

    if (message.type === 'ungroup-tabs') {
      const { tabIds } = message.payload;
      (async () => {
        try {
          await chrome.tabs.ungroup(tabIds);
          // Clear groupId from MRU so fetchTabs returns clean data
          for (const tabId of tabIds) {
            await updateTab(tabId, { groupId: undefined, groupTitle: undefined, groupColor: undefined });
          }
          broadcastUpdate();
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    if (message.type === 'get-bookmarks') {
      getChromeBookmarks().then((bookmarks) => sendResponse({ bookmarks })).catch(() => sendResponse({ bookmarks: [] }));
      return true;
    }

    if (message.type === 'add-bookmark') {
      const { url, title } = message.payload;
      (async () => {
        try {
          const existing = await chrome.bookmarks.search({ url });
          if (existing.length === 0) {
            await chrome.bookmarks.create({ parentId: '1', title, url });
          }
          sendResponse({ bookmarks: await getChromeBookmarks() });
        } catch { sendResponse({ bookmarks: [] }); }
      })();
      return true;
    }

    if (message.type === 'remove-bookmark') {
      const { url } = message.payload;
      (async () => {
        try {
          const existing = await chrome.bookmarks.search({ url });
          for (const b of existing) await chrome.bookmarks.remove(b.id).catch(() => {});
          sendResponse({ bookmarks: await getChromeBookmarks() });
        } catch { sendResponse({ bookmarks: [] }); }
      })();
      return true;
    }

    if (message.type === 'bookmark-tab') {
      const { url, title, folder } = message.payload as { url: string; title: string; folder?: string };
      (async () => {
        try {
          let parentId = '1'; // Bookmarks Bar by default
          if (folder) {
            // Search for an existing folder with this name
            const results = await chrome.bookmarks.search({ title: folder });
            const existing = results.find((b) => !b.url); // folders have no url
            if (existing) {
              parentId = existing.id;
            } else {
              // Create a new folder under the Bookmarks Bar
              const created = await chrome.bookmarks.create({ parentId: '1', title: folder });
              parentId = created.id;
            }
          }
          const already = await chrome.bookmarks.search({ url });
          if (already.length === 0) {
            await chrome.bookmarks.create({ parentId, title, url });
          }
          sendResponse({ success: true });
        } catch (err) { sendResponse({ error: String(err) }); }
      })();
      return true;
    }

    if (message.type === 'rename-group') {
      const { groupId, title, color } = message.payload as { groupId: number; title?: string; color?: string };
      (async () => {
        try {
          const update: chrome.tabGroups.UpdateProperties = {};
          if (title !== undefined) update.title = title;
          if (color !== undefined) update.color = color as chrome.tabGroups.UpdateProperties['color'];
          await chrome.tabGroups.update(groupId, update);
          // Sync MRU group info for affected tabs
          const list = await getMRUList();
          for (const t of list) {
            if (t.groupId === groupId) {
              if (title !== undefined) t.groupTitle = title;
              if (color !== undefined) t.groupColor = color;
            }
          }
          await setMRUList(list);
          broadcastUpdate();
          sendResponse({ success: true });
        } catch (err) { sendResponse({ error: String(err) }); }
      })();
      return true;
    }

    if (message.type === 'discard-tabs') {
      const { tabIds } = message.payload as { tabIds: number[] };
      (async () => {
        try {
          let discardedCount = 0;
          for (const tabId of tabIds) {
            const result = await chrome.tabs.discard(tabId).catch(() => null);
            if (result) discardedCount++;
          }
          sendResponse({ success: true, discardedCount });
        } catch (err) { sendResponse({ error: String(err) }); }
      })();
      return true;
    }

    if (message.type === 'get-notes') {
      getNotesMap().then((notesMap) => {
        sendResponse({ notes: Object.fromEntries(notesMap) });
      });
      return true;
    }

    if (message.type === 'save-note') {
      const { url, note } = message.payload;
      saveNote(url, note).then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.type === 'delete-note') {
      const { url } = message.payload;
      deleteNote(url).then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.type === 'get-recent') {
      chrome.sessions.getRecentlyClosed({ maxResults: 10 }).then((sessions) => {
        const recentTabs = sessions
          .filter((s) => s.tab)
          .map((s) => ({
            sessionId: s.tab!.sessionId!,
            title: s.tab!.title || 'Untitled',
            url: s.tab!.url || '',
            faviconUrl: s.tab!.favIconUrl || '',
          }));
        sendResponse({ recentTabs });
      });
      return true; // async response
    }

    if (message.type === 'restore-session') {
      const { sessionId } = message.payload;
      chrome.sessions.restore(sessionId).then(() => {
        sendResponse({ success: true });
      }).catch(() => {
        sendResponse({ success: false });
      });
      return true; // async response
    }

    if (message.type === 'reopen-last-closed') {
      chrome.sessions.getRecentlyClosed({ maxResults: 1 }).then((sessions) => {
        if (sessions.length > 0) {
          const session = sessions[0];
          const sessionId = session.tab?.sessionId ?? session.window?.sessionId;
          if (sessionId) {
            chrome.sessions.restore(sessionId).then(() => {
              sendResponse({ success: true });
            });
          } else {
            sendResponse({ success: false });
          }
        } else {
          sendResponse({ success: false });
        }
      });
      return true;
    }

    // Move multiple tabs to a new window
    if (message.type === 'move-tabs-to-new-window') {
      const { tabIds } = message.payload as { tabIds: number[] };
      (async () => {
        try {
          if (tabIds.length === 0) { sendResponse({ success: false }); return; }
          const [first, ...rest] = tabIds;
          const win = await chrome.windows.create({ tabId: first });
          if (win.id && rest.length > 0) {
            await chrome.tabs.move(rest, { windowId: win.id, index: -1 });
          }
          broadcastUpdate();
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    // Move tab to window
    if (message.type === 'move-to-window') {
      const { tabId, windowId } = message.payload;
      (async () => {
        try {
          if (windowId === -1) {
            // Move to new window
            await chrome.windows.create({ tabId });
          } else {
            await chrome.tabs.move(tabId, { windowId, index: -1 });
            await chrome.tabs.update(tabId, { active: true });
            await chrome.windows.update(windowId, { focused: true });
          }
          broadcastUpdate();
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    if (message.type === 'split-view') {
      const { tabId1, tabId2 } = message.payload;
      (async () => {
        try {
          const currentWin = await chrome.windows.getCurrent();
          const left = currentWin.left ?? 0;
          const top = currentWin.top ?? 0;
          const totalWidth = currentWin.width ?? 1920;
          const height = currentWin.height ?? 1080;
          const half = Math.floor(totalWidth / 2);
          await chrome.windows.create({ tabId: tabId1, left, top, width: half, height, state: 'normal' });
          await chrome.windows.create({ tabId: tabId2, left: left + half, top, width: half, height, state: 'normal' });
          broadcastUpdate();
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    if (message.type === 'create-workspace') {
      const { name } = message.payload;
      (async () => {
        try {
          const chromeTabs = await chrome.tabs.query({});
          // Fetch group info for all grouped tabs
          const groupIds = [...new Set(chromeTabs.map((t) => t.groupId).filter((id) => id !== -1))];
          const groupMap = new Map<number, { title: string; color: string }>();
          for (const gid of groupIds) {
            try {
              const group = await chrome.tabGroups.get(gid);
              groupMap.set(gid, { title: group.title ?? '', color: group.color });
            } catch { /* group may not exist */ }
          }
          const tabData = chromeTabs
            .filter((t) => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('about:'))
            .map((t) => {
              const group = t.groupId !== -1 ? groupMap.get(t.groupId) : undefined;
              return {
                title: t.title ?? '',
                url: t.url ?? '',
                faviconUrl: t.favIconUrl ?? '',
                ...(group ? { groupTitle: group.title, groupColor: group.color } : {}),
              };
            });
          await saveWorkspace(name, tabData);
          broadcastSpecific({ type: 'workspace-updated' });
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    if (message.type === 'open-urls-in-group') {
      const { urls, title, color } = message.payload;
      (async () => {
        try {
          const createdTabIds: number[] = [];
          for (const url of (urls as string[])) {
            const tab = await chrome.tabs.create({ url, active: false });
            if (tab.id) createdTabIds.push(tab.id);
          }
          if (createdTabIds.length > 0) {
            const groupId = await chrome.tabs.group({ tabIds: createdTabIds });
            await chrome.tabGroups.update(groupId, { title, color: (color || 'blue') as chrome.tabGroups.ColorEnum });
            try {
              const group = await chrome.tabGroups.get(groupId);
              for (const tabId of createdTabIds) {
                await updateTab(tabId, { groupId, groupTitle: group.title || '', groupColor: group.color });
              }
            } catch { /* best effort */ }
          }
          broadcastUpdate();
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    if (message.type === 'merge-windows') {
      (async () => {
        try {
          const currentWin = await chrome.windows.getCurrent();
          const allWins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
          for (const win of allWins) {
            if (win.id === currentWin.id) continue;
            const tabs = (win.tabs ?? []).filter((t) => t.id != null);

            // Snapshot group metadata before moving (groups are window-scoped and lost on move)
            const srcGroups = await chrome.tabGroups.query({ windowId: win.id });
            const groupInfoMap = new Map<number, { title: string; color: chrome.tabGroups.ColorEnum }>();
            for (const g of srcGroups) {
              groupInfoMap.set(g.id, { title: g.title ?? '', color: g.color });
            }

            // Snapshot which tabs belong to which group (groupId === -1 means ungrouped)
            const groupedTabIds = new Map<number, number[]>();
            for (const tab of tabs) {
              const gid = tab.groupId ?? -1;
              if (gid !== -1) {
                if (!groupedTabIds.has(gid)) groupedTabIds.set(gid, []);
                groupedTabIds.get(gid)!.push(tab.id!);
              }
            }

            // Move all tabs to current window (they lose group membership here)
            for (const tab of tabs) {
              await chrome.tabs.move(tab.id!, { windowId: currentWin.id!, index: -1 });
            }

            // Re-create each group in the current window with the same title + color
            for (const [oldGroupId, tabIds] of groupedTabIds) {
              const info = groupInfoMap.get(oldGroupId);
              const newGroupId = await chrome.tabs.group({
                tabIds,
                createProperties: { windowId: currentWin.id! },
              });
              if (info) {
                await chrome.tabGroups.update(newGroupId, {
                  title: info.title,
                  color: info.color,
                });
              }
            }
          }
          broadcastUpdate();
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    if (message.type === 'focus-window') {
      const { windowId } = message.payload;
      chrome.windows.update(windowId, { focused: true }).then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.type === 'get-windows') {
      chrome.windows.getAll({ windowTypes: ['normal'] }).then(async (windows) => {
        const result = await Promise.all(
          windows.map(async (w) => {
            const tabs = await chrome.tabs.query({ windowId: w.id });
            const activeTab = tabs.find((t) => t.active);
            return {
              windowId: w.id!,
              tabCount: tabs.length,
              title: activeTab?.title || `Window ${w.id}`,
              faviconUrl: activeTab?.favIconUrl || '',
            };
          })
        );
        sendResponse({ windows: result });
      });
      return true;
    }

    // Mute/unmute tab
    if (message.type === 'mute-tab') {
      const { tabId, muted } = message.payload;
      chrome.tabs.update(tabId, { muted }).then(() => {
        broadcastUpdate();
        sendResponse({ success: true });
      }).catch(() => sendResponse({ success: false }));
      return true;
    }

    // Close tabs by domain
    if (message.type === 'close-by-domain') {
      const { domain, excludeTabId } = message.payload;
      (async () => {
        const allTabs = await chrome.tabs.query({});
        const toClose = allTabs.filter((t) => {
          if (t.id === excludeTabId) return false;
          try {
            return new URL(t.url || '').hostname.replace('www.', '') === domain;
          } catch { return false; }
        });
        for (const t of toClose) {
          if (t.id) chrome.tabs.remove(t.id).catch(() => {});
        }
        sendResponse({ success: true, count: toClose.length });
      })();
      return true;
    }

    // Sign in/out — chrome.identity is only available in background, not content scripts
    if (message.type === 'sign-in') {
      openAuthWindow()
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === 'sign-out') {
      signOut()
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    // HUD visibility tracking — so we skip thumbnail captures while HUD is showing
    if (message.type === 'hud-closed') {
      hudVisible = false;
      hudHideTime = Date.now(); // start grace period so captures don't catch the fade-out
      sendResponse({ success: true });
      return true;
    }

    // Workspace restore — open all tabs in a new window and recreate groups
    if (message.type === 'restore-workspace') {
      (async () => {
        try {
          const tabDefs: { url: string; groupTitle?: string; groupColor?: string }[] =
            message.groups || message.urls.map((u: string) => ({ url: u }));
          const urls = tabDefs.map((t) => t.url).filter(Boolean);
          if (urls.length === 0) { sendResponse({ success: false }); return; }

          // Create new window with the first URL; remaining tabs added after
          const newWindow = await chrome.windows.create({ url: urls[0], focused: true });
          const windowId = newWindow.id!;
          const firstTabId = newWindow.tabs?.[0]?.id;

          // Create remaining tabs in the new window
          const createdTabIds: (number | undefined)[] = [firstTabId];
          for (let i = 1; i < urls.length; i++) {
            const t = await chrome.tabs.create({ url: urls[i], windowId, active: false });
            createdTabIds.push(t.id);
          }

          // Group tabs by groupTitle+groupColor
          const groupMap = new Map<string, { color: string; tabIds: number[] }>();
          for (let i = 0; i < tabDefs.length; i++) {
            const def = tabDefs[i];
            const tabId = createdTabIds[i];
            if (def.groupTitle && def.groupColor && tabId) {
              const key = `${def.groupTitle}::${def.groupColor}`;
              const existing = groupMap.get(key);
              if (existing) existing.tabIds.push(tabId);
              else groupMap.set(key, { color: def.groupColor, tabIds: [tabId] });
            }
          }

          // Recreate tab groups in the new window, then update MRU immediately so the
          // HUD shows group names on first open without waiting for onUpdated propagation.
          for (const [key, { color, tabIds }] of groupMap) {
            const title = key.split('::')[0];
            const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
            await chrome.tabGroups.update(groupId, {
              title,
              color: color as chrome.tabGroups.ColorEnum,
            }).catch(() => {});
            // Eagerly write group info to MRU so fetchTabs returns correct names immediately
            for (const tabId of tabIds) {
              if (tabId) {
                await updateTab(tabId, { groupId, groupTitle: title, groupColor: color }).catch(() => {});
              }
            }
          }
          // One final broadcast after everything is fully set up
          broadcastUpdate();
        } catch { /* ignore */ }
        sendResponse({ success: true });
      })();
      return true;
    }

    // Return all cached tab thumbnails. Captures happen BEFORE the HUD opens
    // (in the toggle handler) so the cache is already fresh here.
    if (message.type === 'get-all-thumbnails') {
      sendResponse({ thumbnails: Object.fromEntries(tabThumbnails) });
    }

    // Quick-switch: toggle between last two tabs
    if (message.type === 'quick-switch') {
      getMRUList().then((tabs) => {
        // Find the second tab in MRU (index 1 = previous tab)
        const prev = tabs[1];
        if (prev) {
          chrome.tabs.update(prev.tabId, { active: true }).catch(() => {});
          chrome.windows.update(prev.windowId, { focused: true }).catch(() => {});
        }
        sendResponse({ success: !!prev });
      });
      return true;
    }

    // AI tab agent — calls Groq API and returns structured actions
    if (message.type === 'ai-agent') {
      (async () => {
        try {
          const settings = await getSettings();
          const apiKey = settings.groqApiKey;
          if (!apiKey) {
            sendResponse({ error: 'no-key' });
            return;
          }

          const { query, tabs, windows } = message.payload as {
            query: string;
            tabs: Array<{ tabId: number; windowId: number; title: string; url: string; groupId?: number; groupTitle?: string; groupColor?: string; isPinned?: boolean; isMuted?: boolean; isAudible?: boolean; isActive?: boolean }>;
            windows?: Array<{ windowId: number; tabCount: number; activeTabTitle?: string }>;
          };

          // Build enriched tab list string
          const tabListString = tabs.map((t) => {
            const domain = (() => { try { return new URL(t.url).hostname.replace('www.', ''); } catch { return t.url; } })();
            const group  = t.groupId ? ` [group:${t.groupId}:"${t.groupTitle ?? ''}"]` : '';
            const flags  = [
              t.isActive  ? '[active]'  : '',
              t.isPinned  ? '[pinned]'  : '',
              t.isMuted   ? '[muted]'   : '',
              t.isAudible ? '[audible]' : '',
            ].filter(Boolean).join(' ');
            return `[${t.tabId}] "${t.title}" (${domain}) [win:${t.windowId}]${group}${flags ? ' ' + flags : ''}`;
          }).join('\n');

          // Build group list (for rename-group — AI needs groupIds)
          const groupMap = new Map<number, { title: string; color: string; count: number }>();
          for (const t of tabs) {
            if (t.groupId) {
              const g = groupMap.get(t.groupId);
              if (g) g.count++;
              else groupMap.set(t.groupId, { title: t.groupTitle ?? '', color: t.groupColor ?? '', count: 1 });
            }
          }
          const groupListString = groupMap.size > 0
            ? '\n\nTab groups: ' + [...groupMap.entries()].map(([id, g]) => `[groupId:${id}] "${g.title}" (${g.color}, ${g.count} tabs)`).join(', ')
            : '';

          // Build window list
          const windowListString = windows && windows.length > 0
            ? '\n\nWindows: ' + windows.map((w) => `[win:${w.windowId}] (${w.tabCount} tabs${w.activeTabTitle ? `, active: "${w.activeTabTitle}"` : ''})`).join(', ')
            : '';

          const systemPrompt = `You are a browser tab manager AI. The user has these open browser tabs:\n${tabListString}${groupListString}${windowListString}\n\nRespond ONLY with a JSON object with this exact structure: {"message": "short friendly confirmation max 15 words", "actions": [...]}\n\nAvailable action types:\n- {"type":"group-tabs","tabIds":[number],"title":"string","color":"blue|cyan|green|yellow|orange|red|pink|purple|grey"} // groups EXISTING tabs\n- {"type":"open-urls-in-group","urls":["string"],"title":"string","color":"blue|cyan|green|yellow|orange|red|pink|purple|grey"} // opens NEW URLs and groups them\n- {"type":"close-tab","tabId":number}\n- {"type":"close-tabs","tabIds":[number]}\n- {"type":"close-by-domain","domain":"string","keepTabId":number|null} // closes all tabs from a domain; set keepTabId to spare one\n- {"type":"open-url","url":"string"} // opens a single new tab\n- {"type":"pin-tab","tabId":number,"pinned":boolean}\n- {"type":"mute-tab","tabId":number,"muted":boolean}\n- {"type":"bookmark-tab","tabId":number,"folder":"string (optional)"}\n- {"type":"duplicate-tab","tabId":number}\n- {"type":"switch-tab","tabId":number}\n- {"type":"move-to-new-window","tabId":number}\n- {"type":"reload-tab","tabId":number}\n- {"type":"ungroup-tabs","tabIds":[number]}\n- {"type":"rename-group","groupId":number,"title":"string (optional)","color":"blue|cyan|green|yellow|orange|red|pink|purple|grey (optional)"} // use exact groupId from the group list above\n- {"type":"split-view","tabId1":number,"tabId2":number}\n- {"type":"merge-windows"}\n- {"type":"focus-window","windowId":number} // bring a window to front; use exact windowId from the window list above\n- {"type":"discard-tabs","tabIds":[number]} // suspend/hibernate tabs to free memory without closing them\n- {"type":"reopen-last-closed"}\n- {"type":"create-workspace","name":"string"}\n\nIMPORTANT RULES:\n1. When user asks to open NEW URLs and group them, use open-urls-in-group (NOT open-url + group-tabs).\n2. Use group-tabs only to group tabs that already exist in the tab list above.\n3. Use create-workspace (NOT group-tabs) when user wants to save a workspace.\n4. Use discard-tabs (NOT close-tabs) when user asks to free memory, suspend, or hibernate tabs.\n5. Use rename-group with the exact groupId from the group list. Include title and/or color as needed.\n6. Use focus-window with the exact windowId from the window list.\n7. Use close-by-domain for "close all [site] tabs" requests.\n8. Use exact tabIds from the tab list. Add https:// to URLs if missing.\n9. Return empty actions array ONLY if the request is about existing tabs and nothing to do. NEVER return empty actions if user asks to open, find, navigate to, or search for something.\n\nURL CONSTRUCTION RULES (critical — must follow exactly):\n10. ALWAYS open something when the user asks to find/open/navigate/search. Never refuse by returning empty actions. URL-encode all queries: spaces→+, apostrophe→%27, &→%26, #→%23. Never include raw spaces in URLs.\n\nVIDEO & STREAMING:\n- YouTube video/search: https://www.youtube.com/results?search_query=query+here\n- YouTube channel (known handle): https://www.youtube.com/@Handle — e.g. MrBeast→@MrBeast, Veritasium→@veritasium, Linus Tech Tips→@LinusTechTips\n- YouTube channel (unknown handle): https://www.youtube.com/results?search_query=Channel+Name+channel\n- YouTube playlist search: https://www.youtube.com/results?search_query=query&sp=EgIQAw%3D%3D\n- Twitch streamer: https://www.twitch.tv/streamername (lowercase, no spaces)\n- Netflix search: https://www.netflix.com/search?q=show+name\n- Prime Video search: https://www.amazon.com/s?k=query&i=instant-video\n- Disney+ search: https://www.disneyplus.com/search/query\n- Crunchyroll search: https://www.crunchyroll.com/search?q=query\n\nMUSIC:\n- Spotify search (songs/artists/albums): https://open.spotify.com/search/query+here\n- Spotify specific artist (known): https://open.spotify.com/search/Artist+Name/artists\n- SoundCloud search: https://soundcloud.com/search?q=query\n- Apple Music search: https://music.apple.com/search?term=query\n\nLOCAL & MAPS:\n- ANY local business, restaurant, place, or "near me" / "nearby" / "in [city]" query: ALWAYS use Google Maps with ?q= format (NEVER use path-style maps/search/... — it 404s)\n  Format: https://www.google.com/maps/search/?q=query+words+here\n  Examples: "sushi near me" → https://www.google.com/maps/search/?q=sushi+near+me\n           "fine dining near University of Waterloo" → https://www.google.com/maps/search/?q=fine+dining+near+University+of+Waterloo\n           "Starbucks in Toronto" → https://www.google.com/maps/search/?q=Starbucks+Toronto\n- Directions: https://www.google.com/maps/dir/?api=1&origin=From&destination=To\n- Yelp local search: https://www.yelp.com/search?find_desc=query&find_loc=city\n\nSHOPPING:\n- Amazon product search: https://www.amazon.com/s?k=product+name\n- eBay search: https://www.ebay.com/sch/i.html?_nkw=query\n- Etsy search: https://www.etsy.com/search?q=query\n- Best Buy search: https://www.bestbuy.com/site/searchpage.jsp?st=query\n\nSOCIAL MEDIA:\n- Twitter/X profile (known username): https://x.com/username | search: https://x.com/search?q=query\n- Instagram profile (known handle): https://www.instagram.com/handle/ | search: https://www.instagram.com/explore/tags/query/\n- TikTok profile (known handle): https://www.tiktok.com/@handle | search: https://www.tiktok.com/search?q=query\n- LinkedIn person/company: https://www.linkedin.com/search/results/all/?keywords=name\n- Reddit subreddit: https://www.reddit.com/r/subredditname/ | search: https://www.reddit.com/search/?q=query\n\nFINANCE & STOCKS:\n- Stock price (ticker known): https://finance.yahoo.com/quote/TICKER — e.g. Apple→AAPL, Tesla→TSLA, Google→GOOGL\n- Crypto price: https://www.coingecko.com/en/search?query=coin+name — e.g. Bitcoin, Ethereum, Solana\n- General finance search: https://finance.yahoo.com/lookup?s=query\n\nNEWS & MEDIA:\n- Google News topic: https://news.google.com/search?q=topic\n- BBC search: https://www.bbc.com/search?q=topic\n- CNN search: https://www.cnn.com/search?q=topic\n- Reuters search: https://www.reuters.com/search/news?blob=topic\n- NYT search: https://www.nytimes.com/search?query=topic\n\nWEATHER:\n- Weather for any city: https://www.google.com/search?q=weather+in+City+Name\n- e.g. "weather in Tokyo" → https://www.google.com/search?q=weather+in+Tokyo\n\nSPORTS:\n- Live scores / schedule: https://www.google.com/search?q=sport+or+team+name+scores\n- ESPN team/player: https://www.espn.com/search/results?q=query\n- NBA: https://www.nba.com/games | NFL: https://www.nfl.com/scores/ | Premier League: https://www.premierleague.com/\n\nENTERTAINMENT:\n- Movie/show info: https://www.imdb.com/find?q=title+name\n- Rotten Tomatoes: https://www.rottentomatoes.com/search?search=query\n- Game on Steam: https://store.steampowered.com/search/?term=game+name\n- Metacritic: https://www.metacritic.com/search/query/\n\nTRAVEL:\n- Flights: https://www.google.com/flights?q=flights+from+Origin+to+Destination\n- Hotels: https://www.booking.com/search.html?ss=city+name\n- Airbnb: https://www.airbnb.com/s/City--Country/homes\n\nJOBS:\n- LinkedIn jobs: https://www.linkedin.com/jobs/search/?keywords=job+title&location=city\n- Indeed: https://www.indeed.com/jobs?q=job+title&l=location\n\nEVENTS & TICKETS:\n- Ticketmaster: https://www.ticketmaster.com/search?q=event+name\n- StubHub: https://www.stubhub.com/find/s/?q=event\n- Eventbrite: https://www.eventbrite.com/d/online/event+name/\n\nDEVELOPER / TECH:\n- GitHub repo (known): https://github.com/owner/repo | search: https://github.com/search?q=query\n- npm package: https://www.npmjs.com/package/name\n- PyPI package: https://pypi.org/project/name/\n- MDN docs: https://developer.mozilla.org/en-US/search?q=query\n- Stack Overflow: https://stackoverflow.com/search?q=query\n- Docker Hub: https://hub.docker.com/search?q=query\n- Official docs: react.dev, docs.python.org, vuejs.org, angular.io, docs.rs, go.dev/doc\n\nACADEMIC:\n- Google Scholar: https://scholar.google.com/scholar?q=topic\n- arXiv: https://arxiv.org/search/?query=topic&searchtype=all\n- PubMed: https://pubmed.ncbi.nlm.nih.gov/?term=query\n\nFOOD & RECIPES:\n- Allrecipes: https://www.allrecipes.com/search?q=recipe+name\n- Google recipe search: https://www.google.com/search?q=recipe+name+recipe\n\nPODCASTS:\n- Spotify podcast search: https://open.spotify.com/search/podcast+name/podcasts\n- Apple Podcasts: https://podcasts.apple.com/search?term=podcast+name\n\nIMAGES:\n- Google Images: https://www.google.com/search?q=query&tbm=isch\n- Unsplash: https://unsplash.com/s/photos/query\n\nWIKIPEDIA: https://en.wikipedia.org/wiki/Topic_Name (capitalize words, spaces→_)\n\nFALLBACK (last resort only — prefer platform-native search above): https://www.google.com/search?q=query\nOnly use Google search when none of the above categories apply AND you cannot determine a platform-native URL. Always prefer opening the right platform over generic Google.`;

          const requestBody = {
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: query },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1,
            max_tokens: 1024,
          };

          const res = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: JSON.stringify(requestBody),
            }
          );

          if (!res.ok) {
            const errText = await res.text().catch(() => String(res.status));
            sendResponse({ error: errText });
            return;
          }

          const data = await res.json();
          const text = data?.choices?.[0]?.message?.content;
          if (!text) {
            sendResponse({ error: 'empty-response' });
            return;
          }

          const parsed = JSON.parse(text);
          sendResponse({ success: true, message: parsed.message, actions: parsed.actions ?? [] });
        } catch (err) {
          sendResponse({ error: String(err) });
        }
      })();
      return true;
    }
  });

  // Update badge with tab count
  updateBadge();
  chrome.tabs.onCreated.addListener(updateBadge);
  chrome.tabs.onRemoved.addListener(updateBadge);

  // Tab suspender - check every 5 minutes
  chrome.alarms.create('tab-suspender', { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'tab-suspender') return;
    const settings = await getSettings();
    if (!settings.autoSuspend) return;

    const mruList = await getMRUList();
    const now = Date.now();
    const threshold = settings.autoSuspendMinutes * 60 * 1000;

    for (const tabInfo of mruList) {
      if (tabInfo.isActive || tabInfo.isPinned || tabInfo.isAudible) continue;
      if (now - tabInfo.lastAccessed < threshold) continue;

      try {
        const tab = await chrome.tabs.get(tabInfo.tabId);
        if (!tab.discarded && !tab.active) {
          chrome.tabs.discard(tabInfo.tabId).catch(() => {});
        }
      } catch {
        // Tab no longer exists
      }
    }
  });
});

async function captureThumbnail(tabId: number, windowId: number) {
  // Block captures while the HUD is visible OR during its 180ms fade-out animation.
  // hudHideTime adds a 500ms grace period after any hide event so we never snapshot
  // the overlay while it's still transitioning out.
  if (hudVisible || Date.now() - hudHideTime < 500) return;
  try {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !canSendMessage(tab.url)) return;
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 45 });
    tabThumbnails.set(tabId, dataUrl);
    if (tabThumbnails.size > 40) tabThumbnails.delete(tabThumbnails.keys().next().value!);
    persistThumbnails();
  } catch { /* capture may fail on restricted pages */ }
}

// Capture the active tab in every open window. Used on startup and before
// the HUD opens so that thumbnails are available immediately for all windows.
async function captureAllWindowsActiveTabs() {
  try {
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    await Promise.all(windows.map(async (win) => {
      if (!win.id) return;
      const [active] = await chrome.tabs.query({ active: true, windowId: win.id });
      if (active?.id && canSendMessage(active.url)) {
        await captureThumbnail(active.id, win.id);
      }
    }));
  } catch { /* windows/tabs may be unavailable */ }
}

// Check if we can send messages to a tab (content scripts can't run on these URLs)
function canSendMessage(url: string | undefined): boolean {
  if (!url) return false;
  return !url.startsWith('chrome://') &&
    !url.startsWith('chrome-extension://') &&
    !url.startsWith('about:') &&
    !url.startsWith('edge://') &&
    !url.startsWith('brave://');
}

async function updateBadge() {
  const tabs = await chrome.tabs.query({});
  const count = tabs.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#06b6d4' });
  chrome.action.setBadgeTextColor({ color: '#ffffff' });
}

function broadcastUpdate() {
  broadcastSpecific({ type: 'tabs-updated' });
}

function broadcastSpecific(payload: object) {
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id && canSendMessage(tab.url)) {
        chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
      }
    }
  });
}
