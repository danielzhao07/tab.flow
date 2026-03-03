import { useState, useEffect, useMemo, useRef } from 'react';

interface Command {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  query: string; // everything after ">"
  commands: Command[];
  onClose: () => void;
}

export function useCommands(actions: {
  closeDuplicates: () => void;
  closeSelectedTabs: () => void;
  groupSelectedTabs: () => void;
  ungroupSelectedTabs: () => void;
  reopenLastClosed: () => void;
  toggleWindowFilter: () => void;
  cycleSortMode: () => void;
  selectAll: () => void;
}): Command[] {
  return useMemo(() => [
    { id: 'close-dupes', label: 'Close duplicate tabs', description: 'Close all duplicate tabs keeping one of each', action: actions.closeDuplicates },
    { id: 'close-selected', label: 'Close selected tabs', description: 'Close all multi-selected tabs', shortcut: 'Ctrl+Shift+X', action: actions.closeSelectedTabs },
    { id: 'group', label: 'Group selected tabs', description: 'Create a tab group from selected tabs', shortcut: 'Ctrl+G', action: actions.groupSelectedTabs },
    { id: 'ungroup', label: 'Ungroup selected tabs', description: 'Remove tabs from their group', shortcut: 'Ctrl+Shift+G', action: actions.ungroupSelectedTabs },
    { id: 'reopen', label: 'Reopen last closed tab', description: 'Restore the most recently closed tab', shortcut: 'Ctrl+Shift+T', action: actions.reopenLastClosed },
    { id: 'window-filter', label: 'Toggle window filter', description: 'Switch between all windows and current window', shortcut: 'Ctrl+F', action: actions.toggleWindowFilter },
    { id: 'sort', label: 'Sort by name', description: 'Toggle between MRU order and alphabetical A–Z', shortcut: 'Ctrl+S', action: actions.cycleSortMode },
    { id: 'select-all', label: 'Select all tabs', description: 'Select or deselect all visible tabs', shortcut: 'Ctrl+A', action: actions.selectAll },
  ], [actions]);
}

export function CommandPalette({ query, commands, onClose }: CommandPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-scroll the selected command into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const items = container.children;
    if (items[selectedIndex]) {
      (items[selectedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].action();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [filtered, selectedIndex, onClose]);

  if (filtered.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-12 text-white/30">
        <p className="text-sm">No matching commands</p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="h-full overflow-y-auto py-1" style={{ maxHeight: '100%' }}>
      {filtered.map((cmd, index) => (
        <div
          key={cmd.id}
          className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-all duration-100 ${
            index === selectedIndex
              ? 'bg-white/[0.12] border-l-2 border-l-purple-400'
              : 'hover:bg-white/[0.06] border-l-2 border-l-transparent'
          }`}
          onClick={() => { cmd.action(); onClose(); }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div className="w-6 h-6 rounded-md bg-purple-400/15 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[13px] text-white/90">{cmd.label}</span>
            <p className="text-[11px] text-white/30 truncate">{cmd.description}</p>
          </div>
          {cmd.shortcut && (
            <kbd className="shrink-0 px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.1] text-[10px] font-mono text-white/40">
              {cmd.shortcut}
            </kbd>
          )}
        </div>
      ))}
    </div>
  );
}
