import type { TabFlowSettings } from '@/lib/settings';
import type { TokenSet } from '@/lib/auth';

interface SettingsPanelProps {
  authUser: TokenSet | null;
  authLoading: boolean;
  authError: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  settings: TabFlowSettings | null;
  onSettingChange: (patch: Partial<TabFlowSettings>) => void;
  onClose: () => void;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-white/75">{label}</div>
        {description && <div className="text-[11px] text-white/40 mt-0.5">{description}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="shrink-0 transition-colors duration-150 relative rounded-full"
        style={{
          backgroundColor: checked ? 'rgba(99,179,237,0.75)' : 'rgba(255,255,255,0.10)',
          width: 32,
          height: 18,
        }}
      >
        <span
          className="absolute top-0.5 rounded-full bg-white transition-transform duration-150"
          style={{
            width: 14,
            height: 14,
            left: 2,
            transform: checked ? 'translateX(14px)' : 'translateX(0)',
          }}
        />
      </button>
    </div>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <div className="text-[10px] text-white/35 uppercase tracking-widest mb-1 mt-1">
      {children}
    </div>
  );
}

const SUSPEND_MINUTES_OPTIONS = [
  { label: '5m',  value: 5 },
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h',  value: 60 },
  { label: '2h',  value: 120 },
  { label: '4h',  value: 240 },
];

const DIVIDER = { borderBottom: '1px solid rgba(255,255,255,0.06)' };

export function SettingsPanel({
  authUser,
  authLoading,
  authError,
  onSignIn,
  onSignOut,
  settings,
  onSettingChange,
  onClose,
}: SettingsPanelProps) {
  return (
    <>
      {/* Click-outside backdrop */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 2147483645 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed top-12 right-4 rounded-2xl flex flex-col"
        style={{
          zIndex: 2147483646,
          width: 284,
          maxHeight: 'calc(100vh - 80px)',
          background: 'rgba(16, 16, 28, 0.94)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
          backdropFilter: 'blur(28px)',
        }}
      >
        {/* Header — sticky, never scrolls away */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0 rounded-t-2xl"
          style={{ ...DIVIDER, background: 'rgba(16,16,28,0.98)' }}
        >
          <div className="flex items-center gap-2">
            <div style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={chrome.runtime.getURL('TabFlowV4.png')}
                alt=""
                style={{ width: 40, height: 40, objectFit: 'contain' }}
              />
            </div>
            <span className="text-[12px] font-medium text-white/60 tracking-wider uppercase">Settings</span>
          </div>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded flex items-center justify-center text-white/25 hover:text-white/55 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-1 overflow-y-auto" style={{ overflowY: 'auto' }}>
          {/* Account section */}
          {authUser ? (
            <div className="py-2.5" style={DIVIDER}>
              <SectionHeader>Account</SectionHeader>
              <div className="flex items-center justify-between gap-2 mt-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold"
                    style={{ background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.75)' }}
                  >
                    {authUser.email[0].toUpperCase()}
                  </div>
                  <span className="text-[12px] text-white/50 truncate">{authUser.email}</span>
                </div>
                <button
                  onClick={onSignOut}
                  className="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 text-white/35 hover:bg-white/[0.06] hover:text-white/55 transition-colors shrink-0"
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            /* Sign-in card */
            <div className="signin-glow-wrap my-3">
              <div className="signin-glow-spin" />
            <div
              className="rounded-xl overflow-hidden flex flex-col items-center"
              style={{
                background: 'rgba(16,16,28,0.97)',
                border: '1px solid rgba(255,255,255,0.06)',
                position: 'relative',
              }}
            >
              {/* Logo + name */}
              <div className="flex flex-col items-center pt-6 pb-4 px-5">
                <img
                  src={chrome.runtime.getURL('TabFlowV4.png')}
                  alt="Tab.Flow"
                  className="w-32 h-32 object-contain mb-3"
                />
                <span className="text-[15px] font-semibold text-white/90 tracking-tight">Tab.Flow</span>
                <span className="text-[11px] text-white/35 mt-0.5">Your intelligent tab manager</span>
              </div>

              {/* Feature list */}
              <div
                className="w-full px-5 py-3 flex flex-col gap-2"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                {[
                  { icon: '⟳', text: 'Sync workspaces across devices' },
                  { icon: '⊟', text: 'Save & restore tab sessions' },
                  { icon: '✦', text: 'AI-powered tab management' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5">
                    <span className="text-[11px] text-white/30 shrink-0 w-4 text-center">{icon}</span>
                    <span className="text-[11px] text-white/50">{text}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="w-full px-5 py-4 flex flex-col gap-2">
                {authError && (
                  <span className="text-[10px] text-red-400/70 text-center truncate" title={authError}>
                    {authError}
                  </span>
                )}
                <button
                  onClick={onSignIn}
                  disabled={authLoading}
                  className="w-full py-2 rounded-lg text-[12px] font-medium transition-all disabled:opacity-40"
                  style={{
                    background: authLoading ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.10)',
                    border: '1px solid rgba(255,255,255,0.14)',
                    color: 'rgba(255,255,255,0.80)',
                  }}
                  onMouseEnter={(e) => { if (!authLoading) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = authLoading ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.10)'; }}
                >
                  {authLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full border border-white/30"
                        style={{ borderTopColor: 'rgba(255,255,255,0.7)', animation: 'spin 0.8s linear infinite' }}
                      />
                      Signing in…
                    </span>
                  ) : 'Sign in / Sign up'}
                </button>
                <p className="text-[10px] text-white/22 text-center">Free · No credit card required</p>
              </div>
            </div>
            </div>
          )}

          {/* View section */}
          <div className="py-1" style={DIVIDER}>
            <SectionHeader>View</SectionHeader>
            {settings && (
              <>
                <Toggle
                  label="Hide today's activity"
                  description="Hides the top-visited domains bar"
                  checked={settings.hideTodayTabs}
                  onChange={(v) => onSettingChange({ hideTodayTabs: v })}
                />
                <Toggle
                  label="Show pinned tabs"
                  checked={settings.showPinnedTabs}
                  onChange={(v) => onSettingChange({ showPinnedTabs: v })}
                />
              </>
            )}
          </div>

          {/* Performance section */}
          <div className="py-1 pb-2" style={DIVIDER}>
            <SectionHeader>Performance</SectionHeader>
            {settings && (
              <>
                <Toggle
                  label="Auto-suspend inactive tabs"
                  description="Frees memory for tabs you haven't used"
                  checked={settings.autoSuspend}
                  onChange={(v) => onSettingChange({ autoSuspend: v })}
                />
                {settings.autoSuspend && (() => {
                  const idx = SUSPEND_MINUTES_OPTIONS.findIndex((o) => o.value === settings.autoSuspendMinutes);
                  const pct = idx / (SUSPEND_MINUTES_OPTIONS.length - 1);
                  // Single source of truth for thumb center — shared by label, fill, and dot
                  const thumbLeft = `calc(${pct * 100}% + ${(0.5 - pct) * 10}px)`;
                  const timeLabel = settings.autoSuspendMinutes < 60
                    ? `${settings.autoSuspendMinutes}m`
                    : `${settings.autoSuspendMinutes / 60}h`;
                  return (
                    <div className="pb-1">
                      <span className="text-[11px] text-white/65 block mb-3">Suspend after</span>
                      <div className="relative" style={{ paddingTop: 18 }}>
                        {/* Floating time label anchored to thumb center */}
                        <span
                          className="absolute top-0 text-[11px] text-white/90 pointer-events-none leading-none font-medium"
                          style={{ left: thumbLeft, transform: 'translateX(-50%)' }}
                        >
                          {timeLabel}
                        </span>
                        {/* Custom visual slider — all elements share thumbLeft */}
                        <div className="relative" style={{ height: 10 }}>
                          {/* Track background */}
                          <div className="absolute inset-x-0 rounded-full pointer-events-none"
                            style={{ top: '50%', height: 2, marginTop: -1, background: 'rgba(255,255,255,0.14)' }}
                          />
                          {/* Track fill */}
                          <div className="absolute left-0 rounded-full pointer-events-none"
                            style={{ top: '50%', height: 2, marginTop: -1, width: thumbLeft, background: 'rgba(255,255,255,0.50)' }}
                          />
                          {/* Thumb dot */}
                          <div className="absolute rounded-full pointer-events-none"
                            style={{ top: '50%', left: thumbLeft, width: 10, height: 10, marginTop: -5, marginLeft: -5, background: 'rgba(255,255,255,0.88)' }}
                          />
                          {/* Invisible input on top for drag interaction */}
                          <input
                            type="range"
                            min={0}
                            max={SUSPEND_MINUTES_OPTIONS.length - 1}
                            step={1}
                            value={idx}
                            onChange={(e) => {
                              const opt = SUSPEND_MINUTES_OPTIONS[Number(e.target.value)];
                              if (opt) onSettingChange({ autoSuspendMinutes: opt.value });
                            }}
                            className="slider-minimal absolute inset-0 w-full"
                            style={{ height: 10, opacity: 0 }}
                          />
                        </div>
                      </div>
                      <div className="relative mt-1.5" style={{ height: 12 }}>
                        {SUSPEND_MINUTES_OPTIONS.map((o, i) => {
                          const p = i / (SUSPEND_MINUTES_OPTIONS.length - 1);
                          const left = `calc(${p * 100}% + ${(0.5 - p) * 10}px)`;
                          return (
                            <span
                              key={o.value}
                              className="absolute text-[9px]"
                              style={{ left, transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.55)' }}
                            >
                              {o.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* AI Agent section */}
          <div className="py-2.5">
            <SectionHeader>AI Agent</SectionHeader>
            {settings !== null && (
              <div className="flex flex-col gap-1 mt-1.5">
                <input
                  type="password"
                  value={settings.groqApiKey ?? ''}
                  onChange={(e) => onSettingChange({ groqApiKey: e.target.value })}
                  placeholder="Groq API key…"
                  className="w-full rounded-lg px-2.5 py-1.5 text-[12px] text-white/65 placeholder-white/22 outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                  }}
                />
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Free at{' '}
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-80"
                    style={{ color: 'rgba(255,255,255,0.70)' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    console.groq.com/keys
                  </a>
                  {' '}· Type @ in search to use
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
