import { useMemo, useState } from 'react';
import type { TabInfo } from '@/lib/types';
import type { TabActions } from '@/lib/hooks/useTabActions';
import { getDomain, getGroupTitle, getSmartSuggestions } from '@/lib/group-utils';

const GROUP_COLORS: Record<string, string> = {
  blue: '#8ab4f8', cyan: '#78d9ec', green: '#81c995', yellow: '#fdd663',
  orange: '#fcad70', red: '#f28b82', pink: '#ff8bcb', purple: '#c58af9',
  grey: '#9aa0a6',
};

interface GroupSuggestionsProps {
  tabs: TabInfo[];
  actions: TabActions;
  selectedTabs?: Set<number>;
  groupFilter?: Set<number>;
  onGroupFilterToggle?: (groupId: number) => void;
}

export function GroupSuggestions({
  tabs, actions, selectedTabs, groupFilter, onGroupFilterToggle,
}: GroupSuggestionsProps) {
  const [hoveredId, setHoveredId] = useState<number | string | null>(null);

  const suggestions = useMemo(() => {
    const existingTitles = new Set<string>();
    for (const tab of tabs) {
      if (tab.groupId && tab.groupTitle) existingTitles.add(tab.groupTitle.toLowerCase());
    }
    const ungrouped = tabs.filter((t) => !t.groupId);
    return getSmartSuggestions(ungrouped, existingTitles);
  }, [tabs]);

  const existingGroups = useMemo(() => {
    const groups = new Map<number, { groupId: number; title: string; color: string; count: number }>();
    for (const tab of tabs) {
      if (!tab.groupId || !tab.groupColor) continue;
      const existing = groups.get(tab.groupId);
      if (existing) existing.count++;
      else groups.set(tab.groupId, {
        groupId: tab.groupId,
        title: tab.groupTitle || getDomain(tab.url),
        color: GROUP_COLORS[tab.groupColor] ?? '#9aa0a6',
        count: 1,
      });
    }
    return [...groups.values()].slice(0, 6);
  }, [tabs]);

  // Use intersection with current tabs — avoids stale IDs from closed tabs inflating the count
  const effectiveSelectedCount = tabs.filter((t) => selectedTabs?.has(t.tabId)).length;
  const hasMultiSelect = effectiveSelectedCount > 1;
  const hasGroupedInSelection = hasMultiSelect && tabs.some((t) => selectedTabs!.has(t.tabId) && !!t.groupId);

  if (suggestions.length === 0 && existingGroups.length === 0 && !hasMultiSelect) return null;

  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 shrink-0 overflow-x-auto"
      style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.18)' }}
    >
      <span className="text-[9px] text-white/20 uppercase tracking-wider shrink-0 mr-1">Groups</span>

      {/* Existing groups */}
      {existingGroups.map((g) => {
        const isActive = groupFilter?.has(g.groupId) ?? false;
        const isHovered = hoveredId === g.groupId;

        return (
          <div
            key={g.groupId}
            className="flex items-stretch shrink-0 rounded-md overflow-hidden"
            style={{
              height: 26,
              background: isHovered || isActive ? g.color + '18' : g.color + '0c',
              border: `1px solid ${isActive ? g.color + '55' : isHovered ? g.color + '40' : g.color + '22'}`,
              boxShadow: isHovered ? `0 0 10px ${g.color}35` : 'none',
              transition: 'background 150ms, border-color 150ms, box-shadow 150ms',
            }}
            onMouseEnter={() => setHoveredId(g.groupId)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Colored left bar */}
            <div style={{ width: 3, background: g.color, opacity: isActive ? 1 : 0.7, flexShrink: 0 }} />

            {/* Filter button */}
            <button
              className="flex items-center gap-2 px-2.5"
              style={{ outline: 'none', cursor: 'pointer' }}
              onClick={() => onGroupFilterToggle?.(g.groupId)}
              title={isActive ? `Clear filter` : `Show only "${g.title}" tabs`}
            >
              <span className="text-[11px] font-medium" style={{ color: isActive ? g.color : 'rgba(255,255,255,0.65)' }}>
                {g.title}
              </span>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {g.count}
              </span>
            </button>

            {/* Dissolve button */}
            <button
              className="flex items-center justify-center px-2 transition-colors"
              style={{
                borderLeft: '1px solid rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.2)',
                outline: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#f28b82'; (e.currentTarget as HTMLElement).style.background = 'rgba(242,139,130,0.12)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              onClick={() => actions.dissolveGroup(g.groupId)}
              title={`Ungroup all "${g.title}" tabs`}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}

      {/* Divider */}
      {existingGroups.length > 0 && (suggestions.length > 0 || hasMultiSelect) && (
        <div className="w-px h-3.5 bg-white/10 shrink-0 mx-0.5" />
      )}

      {/* Multi-select actions */}
      {hasMultiSelect && (
        <>
          <button
            className="flex items-center gap-1.5 px-2.5 shrink-0 rounded-md transition-all"
            style={{
              height: 26,
              border: '1px solid rgba(255,255,255,0.10)',
              background: hoveredId === 'group-sel' ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
              boxShadow: hoveredId === 'group-sel' ? '0 0 8px rgba(255,255,255,0.08)' : 'none',
              transition: 'background 150ms, box-shadow 150ms',
              outline: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={() => setHoveredId('group-sel')}
            onMouseLeave={() => setHoveredId(null)}
            onClick={() => actions.groupSelectedTabs()}
            title={`Group ${effectiveSelectedCount} selected tabs`}
          >
            <span className="text-[11px] text-white/50">Group {effectiveSelectedCount}</span>
          </button>

          {hasGroupedInSelection && (
            <button
              className="flex items-center gap-1.5 px-2.5 shrink-0 rounded-md transition-all"
              style={{
                height: 26,
                border: '1px solid rgba(255,255,255,0.10)',
                background: hoveredId === 'ungroup-sel' ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
                boxShadow: hoveredId === 'ungroup-sel' ? '0 0 8px rgba(255,255,255,0.08)' : 'none',
                transition: 'background 150ms, box-shadow 150ms',
                outline: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredId('ungroup-sel')}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => actions.ungroupSelectedTabs()}
              title={`Ungroup ${effectiveSelectedCount} selected tabs`}
            >
              <span className="text-[11px] text-white/50">Ungroup</span>
            </button>
          )}
        </>
      )}

      {/* Smart suggestions */}
      {suggestions.map((sg) => (
        <button
          key={sg.label}
          className="flex items-center gap-2 px-2.5 shrink-0 rounded-md transition-all"
          style={{
            height: 26,
            border: '1px solid rgba(255,255,255,0.07)',
            background: hoveredId === sg.label ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
            boxShadow: hoveredId === sg.label ? '0 0 8px rgba(255,255,255,0.06)' : 'none',
            transition: 'background 150ms, box-shadow 150ms',
            outline: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={() => setHoveredId(sg.label)}
          onMouseLeave={() => setHoveredId(null)}
          onClick={() => actions.groupSuggestionTabs(sg.tabIds, sg.label)}
          title={`Group ${sg.tabIds.length} tabs → "${sg.label}"`}
        >
          <span className="text-[11px] text-white/35">{sg.label}</span>
          <span className="text-[10px] text-white/20">{sg.tabIds.length}</span>
        </button>
      ))}
    </div>
  );
}
