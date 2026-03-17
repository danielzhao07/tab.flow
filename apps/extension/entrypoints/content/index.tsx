import './style.css';
import { HudOverlay } from '@/components/hud/HudOverlay';
import { handleEarlyToggle, handleEarlyHide } from '@/lib/hud-bridge';
import ReactDOM from 'react-dom/client';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Register toggle listener IMMEDIATELY — before async shadow root creation.
    // This catches Alt+Q presses that arrive before React mounts.
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'toggle-hud') handleEarlyToggle();
      else if (message.type === 'hide-hud') handleEarlyHide();
    });

    // Tell background to capture a thumbnail once the page is fully painted
    const notifyLoaded = () => {
      chrome.runtime.sendMessage({ type: 'page-loaded' }).catch(() => {});
    };
    if (document.readyState === 'complete') {
      setTimeout(notifyLoaded, 300); // brief delay for paint
    } else {
      window.addEventListener('load', () => setTimeout(notifyLoaded, 300), { once: true });
    }

    const ui = await createShadowRootUi(ctx, {
      name: 'tabflow-hud',
      position: 'overlay',
      anchor: 'body',
      onMount: (container) => {
        const wrapper = document.createElement('div');
        wrapper.id = 'tabflow-root';
        container.append(wrapper);
        const root = ReactDOM.createRoot(wrapper);
        root.render(<HudOverlay />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
