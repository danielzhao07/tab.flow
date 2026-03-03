import { useState, useRef } from 'react';
import {
  loginWithPassword,
  signUpUser,
  confirmUserSignUp,
  resendConfirmationCode,
  signIn,
  type TokenSet,
} from '@/lib/auth';

type View = 'signin' | 'signup' | 'confirm';

function formatError(msg: string): string {
  if (msg.includes('Incorrect username or password') || msg.includes('NotAuthorizedException'))
    return 'Incorrect email or password.';
  if (msg.includes('User does not exist') || msg.includes('UserNotFoundException'))
    return 'No account found with this email.';
  if (msg.includes('User already exists') || msg.includes('UsernameExistsException'))
    return 'An account with this email already exists. Try signing in.';
  if (msg.includes('Password does not conform') || msg.includes('InvalidPasswordException'))
    return 'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
  if (msg.includes('CodeMismatchException') || msg.includes('Invalid verification code'))
    return 'Invalid verification code. Please try again.';
  if (msg.includes('ExpiredCodeException') || msg.includes('has expired'))
    return 'Code expired. Request a new one below.';
  if (msg.includes('UserNotConfirmedException') || msg.includes('not confirmed'))
    return '__NOT_CONFIRMED__';
  if (msg.includes('USER_PASSWORD_AUTH') || msg.includes('not enabled'))
    return 'Password sign-in is not enabled. Contact support or enable ALLOW_USER_PASSWORD_AUTH in your Cognito app client.';
  return msg;
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 16, height: 16, flexShrink: 0,
      border: `2px solid ${dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.25)'}`,
      borderTopColor: dark ? 'rgba(0,0,0,0.55)' : 'white',
      borderRadius: '50%', animation: 'tf-spin 0.7s linear infinite',
    }} />
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22" />
    </svg>
  );
}


function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="tf-arrow">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #07070f;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  @keyframes tf-spin    { to { transform: rotate(360deg); } }
  @keyframes tf-glow-cw { to { transform: rotate(360deg); } }
  @keyframes tf-card-in {
    from { opacity: 0; transform: translateY(22px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1);    }
  }
  @keyframes tf-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes tf-shimmer {
    0%   { transform: translateX(-120%) skewX(-20deg); }
    100% { transform: translateX(220%)  skewX(-20deg); }
  }
  @keyframes tf-btn-breathe {
    0%, 100% { box-shadow: 0 2px 20px rgba(43,125,233,0.30); }
    50%       { box-shadow: 0 4px 28px rgba(43,125,233,0.55); }
  }

  /* Card glow border — clockwise */
  .tf-glow-wrap {
    position: relative; border-radius: 16px; padding: 1.5px; overflow: hidden;
  }
  .tf-glow-spin {
    position: absolute; width: 200%; height: 200%; top: -50%; left: -50%;
    background: conic-gradient(
      rgba(99,179,237,0) 0deg,
      rgba(147,210,255,0.65) 40deg,
      rgba(99,179,237,0) 80deg,
      rgba(99,179,237,0) 360deg
    );
    animation: tf-glow-cw 5s linear infinite;
  }
  .tf-card {
    position: relative; border-radius: 15px; overflow: hidden;
    background: rgba(9,9,18,0.99);
    animation: tf-card-in 380ms cubic-bezier(0.16,1,0.3,1) both;
  }

  /* Tab switcher */
  .tf-tabs {
    display: flex; border-bottom: 1px solid rgba(255,255,255,0.07); margin-bottom: 24px;
  }
  .tf-tab-btn {
    flex: 1; padding: 11px 0; font-size: 13.5px; font-weight: 500;
    font-family: inherit; border: none; background: transparent; cursor: pointer;
    color: rgba(255,255,255,0.30); position: relative; transition: color 180ms;
    letter-spacing: 0.01em;
  }
  .tf-tab-btn::after {
    content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%; height: 2px;
    border-radius: 2px 2px 0 0; background: rgba(99,179,237,0.9);
    opacity: 0; transform: scaleX(0.3);
    transition: opacity 220ms, transform 250ms cubic-bezier(0.34,1.56,0.64,1);
  }
  .tf-tab-btn.active { color: rgba(255,255,255,0.90); font-weight: 600; }
  .tf-tab-btn.active::after { opacity: 1; transform: scaleX(1); }

  /* Inputs */
  .tf-input-wrap { position: relative; display: flex; align-items: center; }
  .tf-input-icon {
    position: absolute; left: 13px; color: rgba(255,255,255,0.25); pointer-events: none;
    display: flex; align-items: center;
  }
  .tf-input {
    width: 100%; height: 48px; padding: 0 14px 0 40px;
    border-radius: 8px; font-size: 14px; font-family: inherit; color: white; outline: none;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
    transition: border-color 150ms, box-shadow 150ms;
    letter-spacing: 0.01em;
  }
  .tf-input-code {
    width: 100%; height: 56px; padding: 0 14px;
    border-radius: 8px; font-family: inherit; color: white; outline: none;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
    transition: border-color 150ms, box-shadow 150ms;
    text-align: center; font-size: 24px; font-weight: 700; letter-spacing: 0.28em;
  }
  .tf-input::placeholder, .tf-input-code::placeholder { color: rgba(255,255,255,0.16); }
  .tf-input:focus, .tf-input-code:focus {
    border-color: rgba(99,179,237,0.5);
    box-shadow: 0 0 0 3px rgba(99,179,237,0.09);
  }
  .tf-input:-webkit-autofill,
  .tf-input:-webkit-autofill:hover,
  .tf-input:-webkit-autofill:focus {
    -webkit-text-fill-color: white;
    -webkit-box-shadow: 0 0 0px 1000px rgb(9,9,18) inset;
    transition: background-color 5000s ease-in-out 0s;
  }

  /* Primary button — solid color, shimmer + breathe */
  .tf-btn {
    width: 100%; height: 50px; border-radius: 8px;
    font-size: 14.5px; font-weight: 600; font-family: inherit; color: white;
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    position: relative; overflow: hidden;
    background: #2b7de9;
    animation: tf-btn-breathe 3s ease-in-out infinite;
    transition: opacity 140ms, transform 80ms, filter 140ms;
    letter-spacing: 0.02em;
  }
  .tf-btn::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%);
    transform: translateX(-120%) skewX(-20deg);
  }
  .tf-btn:hover:not(:disabled)::before { animation: tf-shimmer 0.55s ease forwards; }
  .tf-btn:hover:not(:disabled) { filter: brightness(1.08); }
  .tf-btn:active:not(:disabled) { transform: scale(0.985); }
  .tf-btn:disabled { opacity: 0.36; cursor: not-allowed; animation: none; }
  .tf-btn span { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; }
  .tf-arrow {
    transition: transform 220ms cubic-bezier(0.34,1.56,0.64,1);
    flex-shrink: 0;
  }
  .tf-btn:hover:not(:disabled) .tf-arrow { transform: translateX(4px); }

  /* Google button */
  .tf-google-btn {
    width: 100%; height: 48px; border-radius: 8px;
    font-size: 14px; font-weight: 500; font-family: inherit; color: rgba(255,255,255,0.82);
    border: 1px solid rgba(255,255,255,0.11);
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
    background: rgba(255,255,255,0.055);
    transition: background 140ms, border-color 140ms, transform 80ms;
    letter-spacing: 0.01em;
  }
  .tf-google-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.09);
    border-color: rgba(255,255,255,0.20);
  }
  .tf-google-btn:active:not(:disabled) { transform: scale(0.985); }
  .tf-google-btn:disabled { opacity: 0.38; cursor: not-allowed; }

  /* OR divider */
  .tf-divider {
    display: flex; align-items: center; gap: 12px; margin: 18px 0 20px;
  }
  .tf-divider::before, .tf-divider::after {
    content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.07);
  }
  .tf-divider span {
    font-size: 11px; color: rgba(255,255,255,0.20); font-weight: 500;
    letter-spacing: 0.07em; text-transform: uppercase;
  }

  .tf-label {
    display: block; font-size: 11.5px; font-weight: 500;
    color: rgba(255,255,255,0.35); margin-bottom: 8px; letter-spacing: 0.04em; text-transform: uppercase;
  }
  .tf-error {
    font-size: 13px; color: rgba(252,120,120,0.95); padding: 10px 13px;
    background: rgba(252,80,80,0.07); border-radius: 8px;
    border: 1px solid rgba(252,80,80,0.17); line-height: 1.55;
    animation: tf-fade 180ms ease both;
  }
  .tf-link-btn {
    background: none; border: none; cursor: pointer; padding: 0; font-family: inherit;
    color: rgba(99,179,237,0.72); font-weight: 600; font-size: inherit;
    transition: color 130ms;
  }
  .tf-link-btn:hover { color: rgba(147,210,255,0.9); }
`;

export function App() {
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const pendingEmail = useRef('');
  const pendingPassword = useRef('');

  const logoUrl = typeof chrome !== 'undefined'
    ? chrome.runtime.getURL('TabFlowV4.png')
    : '';

  const completeAuth = async (tokenSet: TokenSet) => {
    await chrome.runtime.sendMessage({ type: 'auth-complete', success: true, tokenSet });
    window.close();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokenSet = await loginWithPassword(email.trim(), password);
      await completeAuth(tokenSet);
    } catch (err: any) {
      const fmt = formatError(err.message);
      if (fmt === '__NOT_CONFIRMED__') {
        pendingEmail.current = email.trim();
        pendingPassword.current = password;
        setError('Your account isn\'t verified yet. Enter the code sent to your email.');
        setView('confirm');
      } else {
        setError(fmt);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      await signUpUser(email.trim(), password);
      pendingEmail.current = email.trim();
      pendingPassword.current = password;
      setView('confirm');
    } catch (err: any) {
      setError(formatError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmUserSignUp(pendingEmail.current, code.trim());
      const tokenSet = await loginWithPassword(pendingEmail.current, pendingPassword.current);
      await completeAuth(tokenSet);
    } catch (err: any) {
      setError(formatError(err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendMsg(null);
    setError(null);
    try {
      await resendConfirmationCode(pendingEmail.current);
      setResendMsg('A new code was sent to your email.');
      setTimeout(() => setResendMsg(null), 4000);
    } catch (err: any) {
      setError(formatError(err.message));
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const tokenSet = await signIn('Google');
      await completeAuth(tokenSet);
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const switchView = (v: View) => {
    setError(null);
    setView(v);
  };

  const anyLoading = loading || googleLoading;

  return (
    <>
      <style>{STYLES}</style>

      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24,
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          <div className="tf-glow-wrap">
            <div className="tf-glow-spin" />
            <div className="tf-card">

              {/* ── Header: logo + tabs ── */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '36px 32px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                {/* Logo — oversized inside clipping container to crop outer padding */}
                {logoUrl && (
                  <div style={{
                    width: 148, height: 148, overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 10, flexShrink: 0,
                  }}>
                    <img
                      src={logoUrl}
                      alt="Tab.Flow"
                      style={{
                        width: 210, height: 210, objectFit: 'contain',
                        mixBlendMode: 'screen', flexShrink: 0,
                      }}
                    />
                  </div>
                )}

                <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
                  Tab.Flow
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.28)', marginTop: 5, marginBottom: 24, letterSpacing: '0.01em' }}>
                  {view === 'confirm' ? 'Check your email for a code' : 'Your intelligent tab manager'}
                </div>

                {/* Tab switcher — only show on sign in/up views */}
                {view !== 'confirm' && (
                  <div className="tf-tabs" style={{ width: '100%' }}>
                    <button
                      className={`tf-tab-btn${view === 'signin' ? ' active' : ''}`}
                      onClick={() => switchView('signin')}
                    >
                      Sign in
                    </button>
                    <button
                      className={`tf-tab-btn${view === 'signup' ? ' active' : ''}`}
                      onClick={() => switchView('signup')}
                    >
                      Sign up
                    </button>
                  </div>
                )}
              </div>

              {/* ── Body ── */}
              <div style={{ padding: '28px 32px 32px' }}>

                {/* ─ Confirm view ─ */}
                {view === 'confirm' ? (
                  <form onSubmit={handleConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ textAlign: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.65 }}>
                        We sent a code to{' '}
                        <span style={{ color: 'rgba(147,210,255,0.82)', fontWeight: 600 }}>
                          {pendingEmail.current}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="tf-label">Verification code</label>
                      <input
                        className="tf-input-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        autoFocus
                        required
                      />
                    </div>

                    {error && <div className="tf-error">{error}</div>}
                    {resendMsg && (
                      <div style={{ fontSize: 12.5, color: 'rgba(99,210,160,0.85)', textAlign: 'center', animation: 'tf-fade 200ms ease both' }}>
                        {resendMsg}
                      </div>
                    )}

                    <div>
                      <button className="tf-btn" type="submit" disabled={loading || code.length < 6}>
                        {loading ? <Spinner /> : <span>Verify email <ArrowIcon /></span>}
                      </button>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: 4 }}>
                      <button type="button" onClick={handleResend} className="tf-link-btn" style={{ fontSize: 13 }}>
                        Didn't receive it? Resend code
                      </button>
                    </div>
                  </form>

                ) : (
                  /* ─ Sign in / Sign up view ─ */
                  <>
                    {/* Google */}
                    <button
                      className="tf-google-btn"
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={anyLoading}
                    >
                      {googleLoading ? <Spinner /> : <GoogleIcon />}
                      Continue with Google
                    </button>

                    <div className="tf-divider"><span>or</span></div>

                    {/* Form */}
                    <form
                      key={view}
                      onSubmit={view === 'signin' ? handleSignIn : handleSignUp}
                      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
                    >
                      <div>
                        <label className="tf-label">Email address</label>
                        <div className="tf-input-wrap">
                          <span className="tf-input-icon"><EmailIcon /></span>
                          <input
                            className="tf-input"
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoFocus
                          />
                        </div>
                      </div>

                      <div>
                        <label className="tf-label">Password</label>
                        <div className="tf-input-wrap">
                          <span className="tf-input-icon"><LockIcon /></span>
                          <input
                            className="tf-input"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete={view === 'signin' ? 'current-password' : 'new-password'}
                            placeholder={view === 'signin' ? '••••••••' : 'Min. 8 characters'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ paddingRight: 42 }}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                              position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'rgba(255,255,255,0.24)', padding: 4, display: 'flex',
                            }}
                          >
                            <EyeIcon open={showPassword} />
                          </button>
                        </div>
                      </div>

                      {view === 'signup' && (
                        <div>
                          <label className="tf-label">Confirm password</label>
                          <div className="tf-input-wrap">
                            <span className="tf-input-icon"><LockIcon /></span>
                            <input
                              className="tf-input"
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              placeholder="••••••••"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                      )}

                      {error && <div className="tf-error">{error}</div>}

                      <div style={{ marginTop: 6 }}>
                        <button className="tf-btn" type="submit" disabled={anyLoading}>
                          {loading
                            ? <Spinner />
                            : <span>{view === 'signin' ? 'Sign in' : 'Create account'} <ArrowIcon /></span>
                          }
                        </button>
                      </div>
                    </form>

                    {/* Switch view */}
                    <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.26)' }}>
                      {view === 'signin' ? (
                        <>Don't have an account?{' '}
                          <button className="tf-link-btn" onClick={() => switchView('signup')}>Sign up free</button>
                        </>
                      ) : (
                        <>Already have an account?{' '}
                          <button className="tf-link-btn" onClick={() => switchView('signin')}>Sign in</button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.13)', fontFamily: 'Inter, sans-serif' }}>
            Free · No credit card required
          </div>
        </div>
      </div>
    </>
  );
}
