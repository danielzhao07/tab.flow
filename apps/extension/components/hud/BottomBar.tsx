import { useRef, useEffect, useState } from 'react';

const FLOW_HINTS = [
  'search your tabs',
  'ask flow to group your work tabs together',
  'search your tabs',
  'ask flow to close all duplicate tabs',
  'search your tabs',
  'ask flow to mute everything making noise',
  'ask flow to open YouTube and search for lo-fi',
  'search your tabs',
  'ask flow to free up memory',
  'ask flow to close all social media tabs',
  'search your tabs',
  'ask flow to bookmark all research tabs',
  'ask flow to merge all windows into one',
  'search your tabs',
  'ask flow to move GitHub tabs to a new window',
  'ask flow to pin your most-visited tab',
];

interface BottomBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  isAiMode?: boolean;
  onAiClick?: () => void;
  onAiSubmit?: (query: string) => void;
  promptHistory?: string[];
}

export function BottomBar({ query, onQueryChange, isAiMode, onAiClick, onAiSubmit, promptHistory }: BottomBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const historyIdxRef = useRef(-1);
  const savedInputRef = useRef('');
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hintIdx, setHintIdx] = useState(() => Math.floor(Math.random() * FLOW_HINTS.length));
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    requestAnimationFrame(() => { inputRef.current?.focus(); });
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => { inputRef.current?.focus(); });
  }, [isAiMode]);

  useEffect(() => {
    historyIdxRef.current = -1;
    savedInputRef.current = '';
  }, [isAiMode]);

  // Cycle hints every 4s when the search bar is idle
  useEffect(() => {
    if (isAiMode || query.length > 0) {
      if (hintTimeoutRef.current) { clearTimeout(hintTimeoutRef.current); hintTimeoutRef.current = null; }
      return;
    }
    setHintVisible(true);
    const interval = setInterval(() => {
      setHintVisible(false);
      hintTimeoutRef.current = setTimeout(() => {
        setHintIdx((i) => (i + 1) % FLOW_HINTS.length);
        setHintVisible(true);
        hintTimeoutRef.current = null;
      }, 300);
    }, 10000);
    return () => {
      clearInterval(interval);
      if (hintTimeoutRef.current) { clearTimeout(hintTimeoutRef.current); hintTimeoutRef.current = null; }
    };
  }, [isAiMode, query]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    historyIdxRef.current = -1;
    const val = e.target.value;
    if (!isAiMode && val === '@' && onAiClick) {
      onAiClick();
      onQueryChange('');
      return;
    }
    onQueryChange(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isAiMode && e.key === 'Enter' && query.trim() && onAiSubmit) {
      e.preventDefault();
      e.stopPropagation();
      historyIdxRef.current = -1;
      onAiSubmit(query.trim());
      return;
    }

    if (isAiMode && promptHistory && promptHistory.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIdxRef.current === -1) {
          savedInputRef.current = query;
          historyIdxRef.current = 0;
        } else if (historyIdxRef.current < promptHistory.length - 1) {
          historyIdxRef.current++;
        }
        onQueryChange(promptHistory[historyIdxRef.current]);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIdxRef.current > 0) {
          historyIdxRef.current--;
          onQueryChange(promptHistory[historyIdxRef.current]);
        } else if (historyIdxRef.current === 0) {
          historyIdxRef.current = -1;
          onQueryChange(savedInputRef.current);
        }
        return;
      }
    }
  };

  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 shrink-0"
      style={{ background: 'rgba(0,0,0,0.2)' }}
    >
      <div
        className="flex-1 flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-colors"
        style={{
          background: 'rgba(255,255,255,0.05)',
          borderColor: isAiMode ? 'rgba(160,140,255,0.4)' : 'rgba(255,255,255,0.1)',
          boxShadow: isAiMode ? '0 0 10px rgba(160,140,255,0.12)' : 'none',
        }}
      >
        {isAiMode ? (
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
            <path d="M8 1l1.5 4.5L14 8l-4.5 1.5L8 15l-1.5-4.5L2 8l4.5-1.5L8 1z" fill="rgba(160,140,255,0.7)" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white/20 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}

        {/* Input + animated hint overlay */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={isAiMode ? 'Ask flow anything…' : ''}
            className="bg-transparent text-[13px] leading-none placeholder-white/20 outline-none"
            style={{ color: isAiMode ? 'rgba(200,190,255,0.85)' : 'rgba(255,255,255,0.7)', width: '100%', height: 20, display: 'flex', alignItems: 'center' }}
            {...(!isAiMode ? { 'data-hud-search': 'true' } : {})}
          />
          {/* Rotating hint — only shown when idle in normal search mode */}
          {!isAiMode && query.length === 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
                opacity: hintVisible ? 1 : 0,
                transition: 'opacity 300ms ease',
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.28)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                  display: 'block',
                }}
              >
                {FLOW_HINTS[hintIdx] === 'search your tabs' ? 'search your tabs' : `type @ to ${FLOW_HINTS[hintIdx]}`}
              </span>
            </div>
          )}
        </div>

        {query && (
          <button
            onClick={() => onQueryChange('')}
            className="text-white/20 hover:text-white/50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* flow sparkle button */}
      <div className="ai-glow-btn shrink-0" style={{ width: 30, height: 30 }}>
        <div className="ai-glow-spinner" />
        <button
          onClick={onAiClick}
          title="Ask flow (@)"
          className="flex items-center justify-center transition-all"
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            zIndex: 1,
            borderRadius: 8,
            background: isAiMode ? 'rgba(40,30,80,0.97)' : 'rgba(40,35,65,0.88)',
            color: isAiMode ? 'rgba(180,160,255,0.9)' : 'rgba(160,130,255,0.70)',
          }}
          onMouseEnter={(e) => {
            if (!isAiMode) {
              (e.currentTarget as HTMLElement).style.color = 'rgba(200,180,255,0.95)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isAiMode) {
              (e.currentTarget as HTMLElement).style.color = 'rgba(160,130,255,0.70)';
            }
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 1l1.5 4.5L14 8l-4.5 1.5L8 15l-1.5-4.5L2 8l4.5-1.5L8 1z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
