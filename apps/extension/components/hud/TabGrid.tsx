import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import type { TabInfo } from '@/lib/types';
import { GridCard } from './GridCard';
import type { TabActions } from '@/lib/hooks/useTabActions';
import type { ContextMenuItem } from './ContextMenu';

// Chrome's actual muted/pastel group colors
const GROUP_COLORS: Record<string, string> = {
  blue: '#8ab4f8', cyan: '#78d9ec', green: '#81c995', yellow: '#fdd663',
  orange: '#fcad70', red: '#f28b82', pink: '#ff8bcb', purple: '#c58af9',
  grey: '#9aa0a6',
};

interface TabGridProps {
  tabs: TabInfo[];
  selectedIndex: number;
  selectedTabs: Set<number>;
  bookmarkedUrls: Set<string>;
  duplicateUrls: Set<string>;
  notesMap: Map<string, string>;
  actions: TabActions;
  onColsComputed?: (cols: number) => void;
  thumbnails?: Map<number, string>;
  closingTabIds?: Set<number>;
  onContextMenuOpen?: (x: number, y: number, items: ContextMenuItem[]) => void;
}

const FOLDER_TAB_H_DEFAULT = 26;
const FOLDER_TAB_H_COMPACT  = 18;

export function TabGrid({
  tabs, selectedIndex, selectedTabs, bookmarkedUrls, duplicateUrls,
  notesMap, actions, onColsComputed, thumbnails, closingTabIds, onContextMenuOpen,
}: TabGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragFromRef = useRef<number | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Measure immediately on mount (before paint) to avoid layout flash.
  // Falls back to rAF in case the flex parent hasn't been sized yet on the first commit.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) {
      setContainerSize({ w: rect.width, h: rect.height });
      return;
    }
    const id = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0) setContainerSize({ w: r.width, h: r.height });
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sort: grouped tabs first (by group order), ungrouped last
  const grouped = tabs.filter((t) => t.groupId);
  const ungrouped = tabs.filter((t) => !t.groupId);
  const groupOrder: number[] = [];
  for (const t of grouped) {
    if (t.groupId && !groupOrder.includes(t.groupId)) groupOrder.push(t.groupId);
  }
  const sortedTabs: TabInfo[] = [
    ...groupOrder.flatMap((gid) => grouped.filter((t) => t.groupId === gid)),
    ...ungrouped,
  ];

  const N = sortedTabs.length;
  const isCompact = N > 20;
  const pad = isCompact ? 8 : 16;
  const gap = isCompact ? 4 : 8;
  const FOLDER_TAB_H = isCompact ? FOLDER_TAB_H_COMPACT : FOLDER_TAB_H_DEFAULT;
  const MIN_CARD_H = isCompact ? 36 : 52;
  const MIN_CARD_W = 120;
  const GROUP_PAD = 8; // 4px padding top + bottom inside each group segment container

  // Balanced cols lookup for small tab counts
  const COLS_LOOKUP = [0, 1, 2, 3, 2, 3, 3, 4, 4, 3, 5, 4, 4];

  // Max cols that still give each card at least MIN_CARD_W
  const maxColsByWidth = Math.max(1, Math.floor((containerSize.w - pad * 2 + gap) / (MIN_CARD_W + gap)));

  // Aesthetic starting point
  const baseCols = N <= 12
    ? (COLS_LOOKUP[N] ?? Math.ceil(Math.sqrt(N)))
    : Math.ceil(Math.sqrt(N));

  // Compute group-row overhead for a given column count
  const computeOverhead = (c: number) => {
    const r = Math.ceil(N / c);
    const seen = new Set<number>();
    let firstRows = 0;
    let anyRows = 0;
    for (let row = 0; row < r; row++) {
      const start = row * c;
      const end = Math.min(start + c, N);
      let hasFirst = false;
      let hasAny = false;
      for (let i = start; i < end; i++) {
        const gid = sortedTabs[i].groupId;
        if (gid) {
          hasAny = true;
          if (!seen.has(gid)) { seen.add(gid); hasFirst = true; }
        }
      }
      if (hasFirst) firstRows++;
      if (hasAny) anyRows++;
    }
    return { r, firstRows, anyRows };
  };

  // Find smallest cols >= baseCols that makes every card fit vertically
  let cols = Math.max(1, Math.min(N, Math.min(maxColsByWidth, baseCols)));
  let { r: rows, firstRows: groupFirstRowCount, anyRows: groupAnyRowCount } = computeOverhead(cols);

  while (cols < Math.min(N, maxColsByWidth)) {
    const avail = containerSize.h - pad * 2
      - groupFirstRowCount * FOLDER_TAB_H
      - groupAnyRowCount * GROUP_PAD
      - Math.max(0, rows - 1) * gap;
    if (rows > 0 && Math.floor(avail / rows) >= MIN_CARD_H) break;
    cols++;
    ({ r: rows, firstRows: groupFirstRowCount, anyRows: groupAnyRowCount } = computeOverhead(cols));
  }

  // Report computed cols to parent for keyboard navigation sync
  useEffect(() => { onColsComputed?.(cols); }, [cols, onColsComputed]);

  // Don't render grid until container is measured — prevents layout flash on first open
  if (containerSize.w === 0) {
    return <div ref={containerRef} className="w-full h-full" />;
  }

  if (tabs.length === 0) {
    return (
      <div ref={containerRef} className="w-full h-full flex-1 flex flex-col items-center justify-center text-white/25">
        <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p className="text-sm">No tabs found</p>
      </div>
    );
  }

  const cardW = Math.min(300, Math.max(MIN_CARD_W, Math.floor(
    (containerSize.w - pad * 2 - gap * (cols - 1)) / cols
  )));

  const availH = containerSize.h - pad * 2
    - groupFirstRowCount * FOLDER_TAB_H
    - groupAnyRowCount * GROUP_PAD
    - Math.max(0, rows - 1) * gap;
  const maxCardH = rows > 0 ? Math.floor(availH / rows) : 120;
  const cardH = Math.max(MIN_CARD_H, Math.min(maxCardH, Math.floor(cardW * 9 / 16)));

  // If the grid is taller than the container, align to top so the first row isn't cut off.
  // When there's enough room, keep vertical centering for aesthetics.
  const totalGridH = rows * cardH + (rows - 1) * gap
    + groupFirstRowCount * FOLDER_TAB_H
    + groupAnyRowCount * GROUP_PAD
    + pad * 2;
  const alignItems = totalGridH >= containerSize.h - 4 ? 'flex-start' : 'center';

  // Segment each row into runs of same-group / ungrouped cards
  interface Segment {
    cards: Array<{ tab: TabInfo; flatIndex: number }>;
    groupId?: number;
    color?: string;
    title?: string;
    isFirstRow: boolean; // first time this group appears in the grid
  }

  const seenGroups = new Set<number>();

  interface RowData {
    segments: Segment[];
    hasGroupFirst: boolean;
  }

  const rowData: RowData[] = [];

  for (let r = 0; r < rows; r++) {
    const start = r * cols;
    const rowCards = sortedTabs.slice(start, start + cols).map((tab, j) => ({
      tab,
      flatIndex: start + j,
    }));

    const segments: Segment[] = [];
    let i = 0;
    while (i < rowCards.length) {
      const card = rowCards[i];
      const gid = card.tab.groupId;
      if (gid) {
        let j = i;
        while (j < rowCards.length && rowCards[j].tab.groupId === gid) j++;
        const isFirstRow = !seenGroups.has(gid);
        if (isFirstRow) seenGroups.add(gid);
        segments.push({
          cards: rowCards.slice(i, j),
          groupId: gid,
          color: card.tab.groupColor ? (GROUP_COLORS[card.tab.groupColor] ?? '#6b7280') : '#6b7280',
          title: card.tab.groupTitle || '',
          isFirstRow,
        });
        i = j;
      } else {
        segments.push({ cards: [card], isFirstRow: false });
        i++;
      }
    }

    rowData.push({
      segments,
      hasGroupFirst: segments.some((s) => s.isFirstRow),
    });
  }

  // Use the intersection with current tabs — avoids stale IDs from closed tabs inflating the count
  const effectiveSelectedCount = tabs.filter((t) => selectedTabs.has(t.tabId)).length;
  const hasGroupedInSelection = tabs.some((t) => selectedTabs.has(t.tabId) && !!t.groupId);

  // Reusable card renderer; groupColor applies a per-card colored outline
  const renderCard = ({ tab, flatIndex: fi }: { tab: TabInfo; flatIndex: number }, groupColor?: string) => {
    const isClosing = closingTabIds?.has(tab.tabId) ?? false;
    const isCardSelected = fi === selectedIndex;

    const dragHandlers = isClosing ? {} : {
      draggable: true as const,
      onDragStart: () => { dragFromRef.current = fi; },
      onDragEnd: () => { dragFromRef.current = null; },
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragFromRef.current !== null && dragFromRef.current !== fi) {
          actions.reorderTabs(dragFromRef.current, fi);
        }
        dragFromRef.current = null;
      },
    };

    const card = (
      <GridCard
        tab={tab}
        index={fi}
        isSelected={isCardSelected && !isClosing}
        isMultiSelected={selectedTabs.has(tab.tabId)}
        isBookmarked={bookmarkedUrls.has(tab.url)}
        isDuplicate={duplicateUrls.has(tab.url)}
        note={notesMap.get(tab.url)}
        thumbnail={thumbnails?.get(tab.tabId)}
        selectedTabsCount={effectiveSelectedCount}
        onSwitch={actions.switchToTab}
        onClose={actions.closeTab}
        onTogglePin={actions.togglePin}
        onToggleSelect={actions.toggleSelect}
        onDuplicate={actions.duplicateTab}
        onMoveToNewWindow={actions.moveToNewWindow}
        onReload={actions.reloadTab}
        onToggleBookmark={actions.toggleBookmark}
        onToggleMute={actions.toggleMute}
        onGroupTab={actions.groupTab}
        onUngroupTab={actions.ungroupTab}
        onCloseSelected={actions.closeSelectedTabs}
        onGroupSelected={actions.groupSelectedTabs}
        onUngroupSelected={actions.ungroupSelectedTabs}
        onMoveSelectedToNewWindow={actions.moveSelectedToNewWindow}
        onPinSelected={actions.pinSelectedTabs}
        onBookmarkSelected={actions.bookmarkSelectedTabs}
        onMuteSelected={actions.muteSelectedTabs}
        onDuplicateSelected={actions.duplicateSelectedTabs}
        onReloadSelected={actions.reloadSelectedTabs}
        hasGroupedInSelection={hasGroupedInSelection}
        animDelay={Math.min(fi * 12, 120)}
        onContextMenuOpen={onContextMenuOpen}
      />
    );

    // Shared closing styles — card fades out and scales down in place
    // (keeps its layout slot so surrounding cards don't move during the animation)
    const closingStyle = isClosing ? {
      opacity: 0,
      transform: 'scale(0.78)',
      pointerEvents: 'none' as const,
    } : {};

    if (tab.isActive) {
      return (
        <div
          key={tab.tabId}
          className="group"
          style={{
            width: cardW, height: cardH, flexShrink: 0,
            transition: isClosing
              ? 'opacity 300ms ease-out, transform 300ms cubic-bezier(0.4,0,0.2,1)'
              : 'transform 150ms ease-out',
            position: 'relative', borderRadius: 11, overflow: 'hidden',
            padding: 2,
            zIndex: isCardSelected ? 10 : 1,
            transform: isCardSelected && !isClosing ? 'scale(1.04)' : undefined,
            ...closingStyle,
          }}
          {...dragHandlers}
        >
          {!isClosing && <div className="tab-glow-spin" />}
          <div style={{
            width: cardW - 4, height: cardH - 4,
            position: 'relative', zIndex: 1,
            borderRadius: 9, overflow: 'hidden',
            background: 'rgba(15,15,28,0.95)',
          }}>
            {card}
          </div>
        </div>
      );
    }

    return (
      <div
        key={tab.tabId}
        className="group"
        style={{
          width: cardW, height: cardH, flexShrink: 0,
          transition: isClosing
            ? 'opacity 300ms ease-out, transform 300ms cubic-bezier(0.4,0,0.2,1)'
            : 'transform 150ms ease-out',
          borderRadius: 10,
          position: 'relative',
          zIndex: isCardSelected ? 10 : 1,
          transform: isCardSelected && !isClosing ? 'scale(1.04)' : undefined,
          // pulsing blue glow for keyboard-selected card (not needed for active tab which has the spin border)
          animation: isCardSelected && !isClosing ? 'selectedGlow 1.5s ease-in-out infinite' : undefined,
          boxShadow: isCardSelected ? undefined : groupColor ? `0 0 0 1.5px ${groupColor}99` : undefined,
          ...closingStyle,
        }}
        {...dragHandlers}
      >
        {card}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex justify-center"
      style={{ padding: pad, overflow: 'visible', alignItems }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap, alignItems: 'center' }}>
        {rowData.map(({ segments }, rowIdx) => (
          <div
            key={rowIdx}
            style={{
              display: 'flex',
              gap,
              alignItems: 'flex-end',
            }}
          >
            {segments.map((seg, sIdx) => {
              if (!seg.groupId) {
                // Ungrouped cards — render directly
                return seg.cards.map((c) => renderCard(c));
              }

              const color = seg.color!;
              return (
                <div
                  key={`${seg.groupId}-${rowIdx}-${sIdx}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: `linear-gradient(135deg, ${color}30 0%, ${color}1a 100%)`,
                    backgroundColor: color + '26',
                  }}
                >
                  {/* Colored header bar — full width, solid group color */}
                  {seg.isFirstRow && (
                    <div style={{
                      background: color,
                      height: FOLDER_TAB_H,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#000000bb',
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      paddingLeft: 12,
                      paddingRight: 12,
                    }}>
                      {seg.title || 'Group'}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap, padding: 4 }}>
                    {seg.cards.map((c) => renderCard(c, color))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
