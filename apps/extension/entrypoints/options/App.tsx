import { useState, useEffect, useRef } from 'react';
import { getSettings, saveSettings, type TabFlowSettings } from '@/lib/settings';
import { getWorkspaces, deleteWorkspace, type Workspace } from '@/lib/workspaces';
import { exportData, importData, downloadJson, type TabFlowExport } from '@/lib/export-import';

export function App() {
  const [settings, setSettings] = useState<TabFlowSettings | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [saved, setSaved] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    getWorkspaces().then(setWorkspaces);
  }, []);

  const update = async (changes: Partial<TabFlowSettings>) => {
    const updated = await saveSettings(changes);
    setSettings(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDeleteWorkspace = async (id: string) => {
    await deleteWorkspace(id);
    setWorkspaces(await getWorkspaces());
  };

  if (!settings) return null;

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white">
      <div className="max-w-xl mx-auto py-12 px-6">
        {/* Header */}
        <div className="mb-10 flex items-center gap-4">
          <div style={{ width: 64, height: 64, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={chrome.runtime.getURL('TabFlowV3.png')}
              alt="Tab.Flow"
              style={{ width: 90, height: 90, objectFit: 'contain', mixBlendMode: 'screen' }}
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-1">Tab.Flow Settings</h1>
            <p className="text-sm text-white/40">Customize your tab switching experience</p>
          </div>
        </div>

        {/* Keyboard Shortcut */}
        <Section title="Keyboard Shortcut">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">Toggle HUD</p>
              <p className="text-xs text-white/40 mt-0.5">Open or close the tab switcher overlay</p>
            </div>
            <kbd className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm font-mono text-white/70">
              Alt + Q
            </kbd>
          </div>
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <p className="text-xs text-white/50 font-medium mb-2">While HUD is open:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <ShortcutHint keys="1-9" label="Jump to tab" />
              <ShortcutHint keys="^X" label="Close tab" />
              <ShortcutHint keys="^F" label="Window filter" />
              <ShortcutHint keys="^⇧T" label="Reopen tab" />
              <ShortcutHint keys="^G" label="Group tabs" />
              <ShortcutHint keys="^B" label="Bookmark" />
              <ShortcutHint keys="^S" label="Cycle sort" />
              <ShortcutHint keys="^A" label="Select all" />
              <ShortcutHint keys="^⇧X" label="Close selected" />
              <ShortcutHint keys="^Click" label="Multi-select" />
              <ShortcutHint keys="↑↓" label="Navigate" />
              <ShortcutHint keys="↵" label="Switch" />
            </div>
          </div>
          <p className="text-xs text-white/30 mt-3">
            To change the shortcut, visit{' '}
            <button
              onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            >
              chrome://extensions/shortcuts
            </button>
          </p>
        </Section>

        {/* Search */}
        <Section title="Search">
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-white/80">Fuzzy match sensitivity</label>
                <span className="text-xs text-white/40 font-mono tabular-nums">
                  {settings.searchThreshold.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.8"
                step="0.05"
                value={settings.searchThreshold}
                onChange={(e) => update({ searchThreshold: parseFloat(e.target.value) })}
                className="w-full accent-cyan-500"
              />
              <div className="flex justify-between text-[10px] text-white/30 mt-1">
                <span>Strict</span>
                <span>Loose</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-white/80">Max results shown</label>
                <span className="text-xs text-white/40 font-mono">{settings.maxResults}</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="10"
                value={settings.maxResults}
                onChange={(e) => update({ maxResults: parseInt(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </div>
          </div>
        </Section>

        {/* Display */}
        <Section title="Display">
          <div className="space-y-4">
            <Toggle
              label="Show pinned tabs"
              description="Include pinned tabs in the switcher"
              checked={settings.showPinnedTabs}
              onChange={(v) => update({ showPinnedTabs: v })}
            />
            <Toggle
              label="Show URLs"
              description="Display the domain below each tab title"
              checked={settings.showUrls}
              onChange={(v) => update({ showUrls: v })}
            />
          </div>
        </Section>

        {/* Tab Suspender */}
        <Section title="Tab Suspender">
          <div className="space-y-4">
            <Toggle
              label="Auto-suspend inactive tabs"
              description="Automatically discard tabs that haven't been used recently to save memory"
              checked={settings.autoSuspend}
              onChange={(v) => update({ autoSuspend: v })}
            />
            {settings.autoSuspend && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-white/80">Suspend after</label>
                  <span className="text-xs text-white/40 font-mono">{settings.autoSuspendMinutes} min</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={settings.autoSuspendMinutes}
                  onChange={(e) => update({ autoSuspendMinutes: parseInt(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-white/30 mt-1">
                  <span>5 min</span>
                  <span>2 hours</span>
                </div>
                <p className="text-[11px] text-white/30 mt-2">
                  Pinned, active, and audible tabs are never suspended.
                </p>
              </div>
            )}
          </div>
        </Section>

        {/* Workspaces */}
        <Section title="Saved Workspaces">
          {workspaces.length === 0 ? (
            <p className="text-sm text-white/30">
              No saved workspaces. Use the popup menu to save your current tabs as a workspace.
            </p>
          ) : (
            <div className="space-y-2">
              {workspaces.map((ws) => (
                <div key={ws.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.03]">
                  <div>
                    <p className="text-sm text-white/80">{ws.name}</p>
                    <p className="text-[11px] text-white/30">
                      {ws.tabs.length} tabs · {new Date(ws.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteWorkspace(ws.id)}
                    className="px-2.5 py-1 rounded-md text-xs text-red-400/70 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Export / Import */}
        <Section title="Data">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-white/80 mb-1">Export</p>
              <p className="text-xs text-white/40 mb-3">Download all your settings, workspaces, bookmarks, and notes as a JSON file.</p>
              <button
                onClick={async () => {
                  const data = await exportData();
                  downloadJson(data, `tabflow-backup-${new Date().toISOString().slice(0, 10)}.json`);
                }}
                className="px-4 py-2 rounded-lg bg-cyan-400/15 border border-cyan-400/25 text-cyan-300 text-xs font-medium hover:bg-cyan-400/25 transition-colors"
              >
                Export data
              </button>
            </div>
            <div className="pt-4 border-t border-white/[0.06]">
              <p className="text-sm text-white/80 mb-1">Import</p>
              <p className="text-xs text-white/40 mb-3">Restore from a previously exported JSON file. This will overwrite your current data.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text) as TabFlowExport;
                    if (data.version !== 1) {
                      setImportStatus('Unsupported file format');
                      return;
                    }
                    const result = await importData(data);
                    setImportStatus(`Imported: ${result.imported.join(', ')}`);
                    // Refresh UI
                    getSettings().then(setSettings);
                    getWorkspaces().then(setWorkspaces);
                  } catch {
                    setImportStatus('Failed to import: invalid file');
                  }
                  setTimeout(() => setImportStatus(null), 4000);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg bg-white/[0.06] border border-white/[0.12] text-white/60 text-xs font-medium hover:bg-white/[0.1] transition-colors"
              >
                Import data
              </button>
              {importStatus && (
                <p className="mt-2 text-xs text-cyan-300/70">{importStatus}</p>
              )}
            </div>
          </div>
        </Section>

        {/* Save indicator */}
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-sm transition-all duration-300 ${
            saved ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          Settings saved
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 p-5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
      <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-white/80">{label}</p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full transition-colors relative ${
          checked ? 'bg-cyan-500' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'left-5' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}

function ShortcutHint({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-white/40">
      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-white/50">{keys}</kbd>
      <span>{label}</span>
    </div>
  );
}
