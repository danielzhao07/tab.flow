/**
 * Bridges toggle-hud / hide-hud messages between the content script (which loads
 * first) and the React HudOverlay component (which mounts asynchronously later).
 *
 * Without this, Alt+Q pressed during the gap between content script injection and
 * React mount is silently dropped — the background thinks the HUD is open but
 * React never received the message.
 */

let reactReady = false;
let pendingShow = false;

/** Called by the early content-script listener. Buffers only while React isn't ready. */
export function handleEarlyToggle() {
  if (!reactReady) pendingShow = !pendingShow;
}

/** Called by the early content-script listener for hide-hud. */
export function handleEarlyHide() {
  if (!reactReady) pendingShow = false;
}

/**
 * Called once by HudOverlay's mount useEffect.
 * Returns true if a toggle arrived before React was ready (HUD should open).
 * After this call, subsequent messages go directly to React's own listener.
 */
export function markReactReady(): boolean {
  reactReady = true;
  const result = pendingShow;
  pendingShow = false;
  return result;
}
