# Undo Stack Design

## Goal
Add Ctrl+Z undo for all reversible actions in Tab.Flow's HUD overlay.

## Approach: Undo Stack with Action Records
A stack of max 20 `UndoRecord` entries, each storing the action type, label, affected tab IDs, previous state, and timestamp. Ctrl+Z pops the stack and executes the inverse operation.

## Supported Actions

| Action | Inverse |
|--------|---------|
| Close tab(s) | `chrome.sessions.restore()` × N |
| Pin/Unpin | `chrome.tabs.update(id, { pinned: prev })` |
| Bookmark/Unbookmark | Re-add or remove bookmark |
| Mute/Unmute | `chrome.tabs.update(id, { muted: prev })` |
| Group tabs | Ungroup the tabs |
| Ungroup tabs | Re-group with saved title/color |

## Type

```typescript
export type UndoRecord = {
  label: string;
  timestamp: number;
} & (
  | { type: 'close'; closeCount: number }
  | { type: 'pin'; tabIds: number[]; wasPinned: boolean }
  | { type: 'bookmark'; url: string; title: string; faviconUrl: string; wasBookmarked: boolean }
  | { type: 'mute'; tabIds: number[]; wasMuted: boolean }
  | { type: 'group'; tabIds: number[] }
  | { type: 'ungroup'; tabIds: number[]; groupTitle: string; groupColor: string }
);
```

## Architecture
- `UndoRecord` type in `lib/types.ts`
- `undoStack` state + `setUndoStack` in `useHudState`
- `pushUndo()` and `undo()` in `useTabActions`
- Ctrl+Z binding in `useKeyboardNav`
- `UndoToast.onUndo` wired to `undo()` instead of `reopenLastClosed()`

## Keyboard
- `Ctrl+Z` → undo last action (pops stack)
- Toast "Undo" button → same as Ctrl+Z
