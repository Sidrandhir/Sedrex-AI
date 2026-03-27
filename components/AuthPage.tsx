import React, { useState } from 'react';
import { Icons } from '../constants';
import './AuthPage.css';
import { login, signup, loginWithGoogle, forgotPassword } from '../services/authService';
import { User } from '../types';

interface AuthPageProps {
  onAuthSuccess: (user: User) => void;
}

const LogoMark = () => (
  <svg viewBox="0 0 32 32" fill="none" width="32" height="32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.22)" strokeWidth="1"/>
    <path d="M21 9.5H13C11.07 9.5 9.5 11.07 9.5 13V14.2C9.5 16.13 11.07 17.7 13 17.7H19C20.93 17.7 22.5 19.27 22.5 21.2V22C22.5 23.93 20.93 25.5 19 25.5H9.5"
      stroke="#10B981" strokeWidth="2.1" strokeLinecap="round"/>
  </svg>
);

const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  /* ── state (unchanged) ── */
  const [isLogin, setIsLogin]                   = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [name, setName]                         = useState('');
  const [email, setEmail]                       = useState('');
  const [password, setPassword]                 = useState('');
  const [showPassword, setShowPassword]         = useState(false);
  const [isLoading, setIsLoading]               = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [infoMessage, setInfoMessage]           = useState<string | null>(null);

  /* ── handlers (unchanged) ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setInfoMessage(null); setIsLoading(true);
    try {
      const user = isLogin
        ? await login(email, password)
        : await signup(email, password, name);
      const hasSession =
        !!localStorage.getItem('sb-' + (process.env.SUPABASE_URL || '').split('.')[0].split('//')[1] + '-auth-token') ||
        !!document.cookie.includes('sb-access-token');
      if (!isLogin && !hasSession) {
        setInfoMessage('Account created! Check your email to confirm, then log in.');
        setIsLogin(true); setPassword('');
      } else {
        onAuthSuccess(user);
      }
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        setError('An account with this email already exists. Please log in.');
        setIsLogin(true);
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally { setIsLoading(false); }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    try { await loginWithGoogle(); } catch (err: any) { setError(err.message); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Please enter your email address'); return; }
    setError(null); setInfoMessage(null); setIsLoading(true);
    try {
      await forgotPassword(email);
      setInfoMessage('Reset link sent! Check your inbox and follow the link.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link. Please try again.');
    } finally { setIsLoading(false); }
  };

  const clearAlerts = () => { setError(null); setInfoMessage(null); };

  /* ── sub-components ── */
  const Spinner = () => (
    <svg className="ap-spinner" width="15" height="15" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
      <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.75"/>
    </svg>
  );

  const AlertError = () => error ? (
    <div className="ap-alert ap-alert--error" role="alert">
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>{error}</span>
    </div>
  ) : null;

  const AlertInfo = () => infoMessage ? (
    <div className="ap-alert ap-alert--info" role="status">
      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      <span>{infoMessage}</span>
    </div>
  ) : null;

  /* mode key drives re-mount animation */
  const modeKey = isForgotPassword ? 'forgot' : isLogin ? 'login' : 'signup';

  return (
    <div className="ap">
      <div className="ap-split">

        {/* ════════════════════════════════════════════════════
            LEFT — BRAND PANEL
            ════════════════════════════════════════════════════ */}
        <div className="ap-brand" aria-hidden="true">
          {/* Animated orbs */}
          <div className="ap-orb ap-orb-1" />
          <div className="ap-orb ap-orb-2" />
          <div className="ap-orb ap-orb-3" />
          {/* Dot grid */}
          <div className="ap-grid" />

          <div className="ap-brand-body">
            {/* Logo */}
            <div className="ap-logo">
              <LogoMark />
              <span className="ap-logo-name">Sedrex</span>
            </div>

            {/* Headline + tagline */}
            <div className="ap-headline-wrap">
              <h2 className="ap-headline">
                Say it.<br />
                Watch it<br />
                <em>get done.</em>
              </h2>
              <p className="ap-tagline">
                One workspace that reads what you need, picks the best AI for it, and turns your words into something you can actually ship.
              </p>
            </div>

            {/* Live output cards */}
            <div className="ap-cards">

              <div className="ap-card ap-card-1">
                <div className="ap-card-dot ap-card-dot--green" />
                <div className="ap-card-content">
                  <div className="ap-card-title">dashboard.tsx</div>
                  <div className="ap-card-sub">147 lines generated · live preview active</div>
                  <div className="ap-card-bar-wrap">
                    <div className="ap-card-bar" />
                  </div>
                </div>
                <span className="ap-card-badge ap-card-badge--green">▶ Running</span>
              </div>

              <div className="ap-card ap-card-2">
                <div className="ap-card-dot ap-card-dot--amber" />
                <div className="ap-card-content">
                  <div className="ap-card-title">Reasoning trace</div>
                  <div className="ap-card-sub">Cross-verifying before output</div>
                </div>
                <div className="ap-think">
                  <span /><span /><span />
                </div>
              </div>

              <div className="ap-card ap-card-3">
                <div className="ap-card-dot ap-card-dot--muted" />
                <div className="ap-card-content">
                  <div className="ap-card-title">system-arch.svg</div>
                  <div className="ap-card-sub">Architecture diagram · exported</div>
                </div>
                <span className="ap-card-badge ap-card-badge--done">Done</span>
              </div>

            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════
            RIGHT — FORM PANEL
            ════════════════════════════════════════════════════ */}
        <div className="ap-form-panel">

          {/* Back button */}
          {!isForgotPassword ? (
            <a href="/" className="ap-back" aria-label="Back to home">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </a>
          ) : (
            <button type="button" className="ap-back" aria-label="Back to login"
              onClick={() => { setIsForgotPassword(false); clearAlerts(); }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
          )}

          <div className="ap-form-inner">

            {/* Mobile-only logo */}
            <div className="ap-form-logo">
              <LogoMark />
              <span className="ap-form-logo-name">Sedrex</span>
            </div>

            {/* Header — always visible, transitions on mode change */}
            <div className="ap-form-head">
              <h1 className="ap-form-title">
                {isForgotPassword ? 'Reset password' : isLogin ? 'Welcome back' : 'Create account'}
              </h1>
              <p className="ap-form-sub">
                {isForgotPassword
                  ? "Enter your email and we'll send a reset link"
                  : isLogin
                    ? 'Log in to continue building with Sedrex'
                    : "Start building — it's free to get started"}
              </p>
            </div>

            {/* Form body re-mounts on mode switch → triggers entrance animation */}
            <div key={modeKey} className="ap-form-body">

              {isForgotPassword ? (
                /* ── Forgot password ── */
                <form onSubmit={handleForgotPassword} noValidate>
                  <div className="ap-field">
                    <label className="ap-label" htmlFor="ap-fp-email">Email address</label>
                    <input
                      id="ap-fp-email"
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="ap-input"
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>

                  <AlertError />
                  <AlertInfo />

                  <button type="submit" disabled={isLoading} className="ap-submit">
                    {isLoading ? <><Spinner />Sending…</> : 'Send reset link'}
                  </button>

                  <button type="button" disabled={isLoading} className="ap-back-link"
                    onClick={() => { setIsForgotPassword(false); clearAlerts(); }}>
                    ← Back to log in
                  </button>
                </form>

              ) : (
                /* ── Login / Signup ── */
                <>
                  <button type="button" onClick={handleGoogleAuth} disabled={isLoading} className="ap-google-btn">
                    <Icons.Google className="w-[18px] h-[18px]" />
                    Continue with Google
                  </button>

                  <div className="ap-divider">
                    <div className="ap-divider-line" />
                    <span className="ap-divider-text">or</span>
                    <div className="ap-divider-line" />
                  </div>

                  <form onSubmit={handleSubmit} noValidate>
                    {!isLogin && (
                      <div className="ap-field">
                        <label className="ap-label" htmlFor="ap-name">Your name</label>
                        <input
                          id="ap-name"
                          type="text"
                          required
                          value={name}
                          onChange={e => setName(e.target.value)}
                          autoComplete="name"
                          className="ap-input"
                          placeholder="Ada Lovelace"
                        />
                      </div>
                    )}

                    <div className="ap-field">
                      <label className="ap-label" htmlFor="ap-email">Email address</label>
                      <input
                        id="ap-email"
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        autoComplete="email"
                        className="ap-input"
                        placeholder="you@example.com"
                      />
                    </div>

                    <div className="ap-field">
                      <div className="ap-field-row">
                        <label className="ap-label" htmlFor="ap-password">Password</label>
                        {isLogin && (
                          <button type="button" className="ap-forgot"
                            onClick={() => { setIsForgotPassword(true); clearAlerts(); }}>
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="ap-input-wrap">
                        <input
                          id="ap-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          autoComplete={isLogin ? 'current-password' : 'new-password'}
                          className="ap-input ap-input-pw"
                          placeholder="••••••••"
                        />
                        <button type="button" className="ap-pw-toggle"
                          onClick={() => setShowPassword(v => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}>
                          {showPassword
                            ? <Icons.EyeOff className="w-4 h-4" />
                            : <Icons.Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <AlertError />
                    <AlertInfo />

                    <button type="submit" disabled={isLoading} className="ap-submit">
                      {isLoading
                        ? <><Spinner />{isLogin ? 'Logging in…' : 'Creating account…'}</>
                        : isLogin ? 'Continue' : 'Create account'}
                    </button>
                  </form>

                  <div className="ap-toggle">
                    {isLogin ? "Don't have an account?" : 'Already have an account?'}
                    <button type="button" disabled={isLoading} className="ap-toggle-btn"
                      onClick={() => { setIsLogin(v => !v); clearAlerts(); }}>
                      {isLogin ? 'Sign up' : 'Log in'}
                    </button>
                  </div>
                </>
              )}

              <p className="ap-legal">
                By continuing, you agree to our{' '}
                <a href="/terms">Terms of Service</a> and{' '}
                <a href="/privacy">Privacy Policy</a>.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AuthPage;
