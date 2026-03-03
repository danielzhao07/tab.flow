import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Tab.Flow',
    description: 'Stop losing your tabs. Tab.Flow gives you a stunning visual grid, an AI tab assistant, and instant control. Just press Alt+Q.',
    version: '1.0.0',
    icons: {
      '16': 'icon-16.png',
      '32': 'icon-32.png',
      '48': 'icon-48.png',
      '128': 'icon-128.png',
    },
    permissions: ['tabs', 'activeTab', 'storage', 'favicon', 'sessions', 'tabGroups', 'alarms', 'identity', 'bookmarks'],
    host_permissions: ['<all_urls>'],
    web_accessible_resources: [
      { resources: ['TabFlowV4.png', 'icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'], matches: ['<all_urls>'] },
    ],
    commands: {
      'toggle-hud': {
        suggested_key: {
          default: 'Alt+Q',
          windows: 'Alt+Q',
          mac: 'Alt+Q',
        },
        description: 'Toggle Tab.Flow HUD overlay',
      },
    },
  },
});
