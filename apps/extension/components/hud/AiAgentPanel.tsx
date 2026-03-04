import { useMemo } from 'react';
import type { AgentAction } from '@/lib/agent';
import { describeAction } from '@/lib/agent';

interface AiAgentPanelProps {
  message: string;
  actions: AgentAction[];
  completedCount: number;
  onDismiss: () => void;
}

/** Collapse actions of the same type into a single summary line. */
function summariseActions(actions: AgentAction[]): string[] {
  if (actions.length <= 4) return actions.map(describeAction);

  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const a of actions) {
    const t = a.type;
    counts.set(t, (counts.get(t) ?? 0) + 1);
    if (!labels.has(t)) labels.set(t, describeAction(a));
  }

  const lines: string[] = [];
  for (const [type, count] of counts) {
    if (count === 1) {
      lines.push(labels.get(type)!);
    } else {
      const base = labels.get(type)!;
      lines.push(`${base} (+${count - 1} more)`);
    }
  }
  return lines;
}

export function AiAgentPanel({ message, actions, completedCount, onDismiss }: AiAgentPanelProps) {
  const allDone = completedCount >= actions.length;
  const progress = actions.length > 0 ? Math.round((completedCount / actions.length) * 100) : 100;
  const summaryLines = useMemo(() => summariseActions(actions), [actions]);

  return (
    <div
      className="shrink-0"
      style={{
        animation: 'agentPanelIn 250ms cubic-bezier(0.16,1,0.3,1)',
        background: 'rgba(0,0,0,0.25)',
        borderTop: '1px solid rgba(160,140,255,0.12)',
        padding: '8px 14px',
      }}
    >
      {/* Progress bar */}
      {!allDone && (
        <div style={{ height: 1.5, background: 'rgba(255,255,255,0.04)', borderRadius: 1, marginBottom: 7 }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'rgba(160,140,255,0.5)',
              borderRadius: 1,
              transition: 'width 300ms ease',
            }}
          />
        </div>
      )}

      {/* Header: message + dismiss */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg className="shrink-0" width="10" height="10" viewBox="0 0 16 16" fill="none"
            style={allDone ? undefined : { animation: 'spin 3s linear infinite' }}
          >
            <path d="M8 1l1.5 4.5L14 8l-4.5 1.5L8 15l-1.5-4.5L2 8l4.5-1.5L8 1z"
              fill={allDone ? 'rgba(180,165,255,0.8)' : 'rgba(160,140,255,0.6)'}
            />
          </svg>
          <span className="text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {message}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 transition-colors"
          style={{ color: 'rgba(255,255,255,0.15)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.15)'; }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Action summary — compact pills */}
      {summaryLines.length > 0 && (
        <div
          className="flex flex-wrap gap-1 mt-1.5"
          style={{ maxHeight: 56, overflow: 'hidden' }}
        >
          {summaryLines.map((label, i) => {
            const done = allDone || (actions.length <= 4 && i < completedCount);
            return (
              <span
                key={i}
                className="text-[10px] leading-none shrink-0"
                style={{
                  padding: '3px 7px',
                  borderRadius: 5,
                  background: done ? 'rgba(160,140,255,0.1)' : 'rgba(255,255,255,0.04)',
                  color: done ? 'rgba(180,165,255,0.7)' : 'rgba(255,255,255,0.3)',
                  border: `1px solid ${done ? 'rgba(160,140,255,0.18)' : 'rgba(255,255,255,0.06)'}`,
                  animation: `actionFadeIn 200ms ease ${i * 40}ms both`,
                }}
              >
                {done && '✓ '}{label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AiThinkingBar() {
  return (
    <div
      className="shrink-0 flex items-center gap-2"
      style={{
        animation: 'agentPanelIn 250ms cubic-bezier(0.16,1,0.3,1)',
        background: 'rgba(0,0,0,0.2)',
        borderTop: '1px solid rgba(160,140,255,0.1)',
        padding: '7px 14px',
      }}
    >
      <svg
        width="10" height="10" viewBox="0 0 16 16" fill="none"
        style={{ animation: 'spin 2.5s linear infinite' }}
      >
        <path d="M8 1l1.5 4.5L14 8l-4.5 1.5L8 15l-1.5-4.5L2 8l4.5-1.5L8 1z" fill="rgba(160,140,255,0.5)" />
      </svg>
      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)', animation: 'shimmer 1.8s ease infinite' }}>
        Thinking…
      </span>
    </div>
  );
}
