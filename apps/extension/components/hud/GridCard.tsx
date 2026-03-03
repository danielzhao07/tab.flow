import { useState } from 'react';
import type { TabInfo } from '@/lib/types';
import { MenuIcons, type ContextMenuItem } from './ContextMenu';

const GROUP_COLORS: Record<string, string> = {
  blue: '#8ab4f8', cyan: '#78d9ec', green: '#81c995', yellow: '#fdd663',
  orange: '#fcad70', red: '#f28b82', pink: '#ff8bcb', purple: '#c58af9',
  grey: '#9aa0a6',
};

interface GridCardProps {
  tab: TabInfo;
  index: number;
  isSelected: boolean;
  isMultiSelected: boolean;
  isBookmarked: boolean;
  isDuplicate: boolean;
  note?: string;
  thumbnail?: string;
  selectedTabsCount: number;
  onSwitch: (tabId: number) => void;
  onClose: (tabId: number) => void;
  onTogglePin: (tabId: number, pinned: boolean) => void;
  onToggleSelect: (tabId: number, shiftKey: boolean) => void;
  onDuplicate: (tabId: number) => void;
  onMoveToNewWindow: (tabId: number) => void;
  onReload: (tabId: number) => void;
  onToggleBookmark: (tabId: number) => void;
  onToggleMute: (tabId: number) => void;
  onGroupTab: (tabId: number) => Promise<void>;
  onUngroupTab: (tabId: number) => Promise<void>;
  onCloseSelected: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onMoveSelectedToNewWindow: () => void;
  onPinSelected: (pinned: boolean) => void;
  onBookmarkSelected: () => void;
  onMuteSelected: (muted: boolean) => void;
  onDuplicateSelected: () => void;
  onReloadSelected: () => void;
  hasGroupedInSelection: boolean;
  animDelay?: number;
  onContextMenuOpen?: (x: number, y: number, items: ContextMenuItem[]) => void;
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function domainColor(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 50%, 55%)`;
}

// Re-use icon set from ContextMenu so they match exactly
const { Pin: IcoPin, Copy: IcoDuplicate, Window: IcoWindow, Reload: IcoReload, X: IcoClose, Grid: IcoGroup, Bookmark: IcoBookmark, Volume: IcoVolume } = MenuIcons;

export function GridCard({
  tab, index, isSelected, isMultiSelected, isBookmarked, isDuplicate, note, thumbnail,
  selectedTabsCount, onSwitch, onClose, onTogglePin, onToggleSelect,
  onDuplicate, onMoveToNewWindow, onReload, onToggleBookmark, onToggleMute,
  onGroupTab, onUngroupTab, onCloseSelected, onGroupSelected, onUngroupSelected, onMoveSelectedToNewWindow,
  onPinSelected, onBookmarkSelected, onMuteSelected, onDuplicateSelected, onReloadSelected,
  hasGroupedInSelection, animDelay = 0, onContextMenuOpen,
}: GridCardProps) {
  const [faviconError, setFaviconError] = useState(false);

  const domain = getDomain(tab.url);
  const color = domainColor(domain);
  const groupColor = tab.groupColor ? (GROUP_COLORS[tab.groupColor] ?? '#6b7280') : null;

  // Whether this card is part of an active multi-selection
  const isInMultiSelect = selectedTabsCount > 1;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenuOpen?.(e.clientX, e.clientY, contextItems);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onToggleSelect(tab.tabId, false);
    } else if (e.shiftKey) {
      onToggleSelect(tab.tabId, true);
    } else {
      onSwitch(tab.tabId);
    }
  };

  const n = selectedTabsCount;

  // Multi-select context menu — primary actions at top so they're always visible even if menu is tall
  const multiContextItems: ContextMenuItem[] = [
    {
      label: `Group ${n} tabs`,
      icon: <IcoGroup />,
      action: onGroupSelected,
    },
    ...(hasGroupedInSelection ? [{
      label: `Ungroup ${n} tabs`,
      icon: <IcoGroup />,
      action: onUngroupSelected,
    }] : []),
    {
      label: `Move ${n} tabs to new window`,
      icon: <IcoWindow />,
      action: onMoveSelectedToNewWindow,
    },
    {
      label: `Close ${n} tabs`,
      icon: <IcoClose />,
      action: onCloseSelected,
      danger: true,
      divider: true,
    },
    {
      label: tab.isPinned ? `Unpin ${n} tabs` : `Pin ${n} tabs`,
      icon: <IcoPin />,
      action: () => onPinSelected(!tab.isPinned),
      divider: true,
    },
    {
      label: `Bookmark ${n} tabs`,
      icon: <IcoBookmark />,
      action: onBookmarkSelected,
    },
    {
      label: tab.isMuted ? `Unmute ${n} tabs` : `Mute ${n} tabs`,
      icon: <IcoVolume muted={tab.isMuted} />,
      action: () => onMuteSelected(!tab.isMuted),
    },
    {
      label: `Duplicate ${n} tabs`,
      icon: <IcoDuplicate />,
      action: onDuplicateSelected,
    },
    {
      label: `Reload ${n} tabs`,
      icon: <IcoReload />,
      action: onReloadSelected,
    },
  ];

  // Single-tab context menu
  const singleContextItems: ContextMenuItem[] = [
    {
      label: tab.isPinned ? 'Unpin tab' : 'Pin tab',
      icon: <IcoPin />,
      action: () => onTogglePin(tab.tabId, !tab.isPinned),
    },
    {
      label: isBookmarked ? 'Remove bookmark' : 'Bookmark tab',
      icon: <IcoBookmark filled={isBookmarked} />,
      action: () => onToggleBookmark(tab.tabId),
    },
    {
      label: tab.isMuted ? 'Unmute tab' : 'Mute tab',
      icon: <IcoVolume muted={tab.isMuted} />,
      action: () => onToggleMute(tab.tabId),
    },
    {
      label: 'Duplicate tab',
      icon: <IcoDuplicate />,
      action: () => onDuplicate(tab.tabId),
    },
    {
      label: 'Move to new window',
      icon: <IcoWindow />,
      action: () => onMoveToNewWindow(tab.tabId),
    },
    {
      label: 'Reload tab',
      icon: <IcoReload />,
      action: () => onReload(tab.tabId),
    },
    {
      label: 'Group tab',
      icon: <IcoGroup />,
      action: () => { onGroupTab(tab.tabId); },
      divider: true,
    },
    // Only show ungroup if this tab is actually in a group
    ...(tab.groupId ? [{
      label: 'Ungroup tab',
      icon: <IcoGroup />,
      action: () => { onUngroupTab(tab.tabId); },
    }] : []),
    {
      label: 'Close tab',
      icon: <IcoClose />,
      action: () => onClose(tab.tabId),
      danger: true,
      divider: true,
    },
  ];

  const contextItems = isInMultiSelect ? multiContextItems : singleContextItems;
  const isActive = tab.isActive;

  const borderColor = isSelected
    ? 'rgba(100,180,255,0.92)'
    : isMultiSelected
    ? 'rgba(99,179,237,0.75)'
    : 'rgba(255,255,255,0.05)';

  return (
    <>
      <div
        className="h-full flex flex-col rounded-xl overflow-hidden cursor-pointer select-none"
        style={{
          animationName: 'cardIn',
          animationDuration: '200ms',
          animationDelay: `${animDelay}ms`,
          animationFillMode: 'both',
          animationTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
          background: isSelected
            ? 'rgba(16,24,46,0.97)'
            : isMultiSelected ? 'rgba(28,28,42,0.96)' : 'rgba(15,15,28,0.92)',
          border: `${isSelected || isMultiSelected ? 2 : 1}px solid ${borderColor}`,
          boxShadow: isSelected
            ? `inset 0 0 0 1px rgba(100,180,255,0.12), 0 4px 20px rgba(0,0,0,0.45)`
            : isMultiSelected
            ? `0 0 0 1px rgba(99,179,237,0.3), 0 0 12px rgba(99,179,237,0.2), 0 4px 24px rgba(0,0,0,0.5)`
            : '0 2px 12px rgba(0,0,0,0.3)',
          transition: 'border-color 120ms, box-shadow 120ms, transform 120ms, background 120ms',
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)';
          if (!isSelected && !isMultiSelected) {
            (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.18)';
          }
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLDivElement).style.borderColor = borderColor;
        }}
      >
        {/* Active tab top accent stripe */}
        {isActive && (
          <div className="h-[3px] w-full shrink-0" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.55) 40%, rgba(180,160,255,0.6) 70%, rgba(255,255,255,0.0) 100%)' }} />
        )}

        {/* Title bar at top */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 shrink-0"
          style={{ background: 'rgba(0,0,0,0.45)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Favicon */}
          {tab.faviconUrl && !faviconError ? (
            <img
              src={tab.faviconUrl}
              alt=""
              className="w-4 h-4 rounded-sm shrink-0"
              onError={() => setFaviconError(true)}
            />
          ) : (
            <div
              className="w-4 h-4 rounded-sm shrink-0 flex items-center justify-center text-[9px] font-bold"
              style={{ backgroundColor: color + '35', color }}
            >
              {(tab.title || domain).charAt(0).toUpperCase()}
            </div>
          )}

          {/* Title */}
          <span className={`flex-1 text-[12px] truncate font-medium leading-none ${isActive ? 'text-white' : 'text-white/80'}`}>
            {tab.title || domain}
          </span>

          {/* Status icons */}
          {tab.isPinned && <span className="text-[10px] text-amber-400/60 shrink-0">📌</span>}
          {tab.isAudible && !tab.isMuted && <span className="text-[10px] text-green-400/70 shrink-0">♪</span>}
          {tab.isMuted && <span className="text-[10px] text-red-400/70 shrink-0">🔇</span>}
          {isBookmarked && <span className="text-[10px] text-amber-400/60 shrink-0">★</span>}

          {/* Close button */}
          <button
            className="w-4 h-4 rounded flex items-center justify-center text-white/25 hover:text-white hover:bg-red-500/80 transition-colors shrink-0"
            onClick={(e) => { e.stopPropagation(); onClose(tab.tabId); }}
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Screenshot / Fallback */}
        <div className="flex-1 relative overflow-hidden min-h-0">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={{
                background: `radial-gradient(ellipse at 50% 40%, ${color}22 0%, transparent 70%)`,
                backgroundColor: 'rgba(0,0,0,0.15)',
              }}
            >
              {tab.faviconUrl && !faviconError ? (
                <img
                  src={tab.faviconUrl}
                  alt=""
                  className="w-12 h-12 rounded-xl opacity-55"
                  onError={() => setFaviconError(true)}
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold"
                  style={{ backgroundColor: color + '28', color }}
                >
                  {(tab.title || domain).charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-[11px] text-white/25 truncate px-3 max-w-full">{domain}</span>
            </div>
          )}

          {/* Multi-select checkmark */}
          {isMultiSelected && (
            <div
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(99,179,237,0.95)',
                boxShadow: '0 0 8px rgba(99,179,237,0.6)',
                animationName: 'checkPop',
                animationDuration: '200ms',
                animationTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
                animationFillMode: 'both',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}

          {/* Duplicate badge */}
          {isDuplicate && (
            <div className="absolute top-1.5 left-1.5">
              <span className="px-1.5 py-0.5 rounded-md bg-amber-400/20 text-[9px] text-amber-400">DUP</span>
            </div>
          )}

          {/* Note indicator */}
          {note && (
            <div className="absolute bottom-1.5 left-1.5 right-1.5">
              <div className="text-[10px] text-cyan-400/50 truncate italic">{note}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
