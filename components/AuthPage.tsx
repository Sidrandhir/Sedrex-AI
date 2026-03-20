
import React, { useState } from 'react';
import { Icons } from '../constants';
const SedrexLogo = '/sedrex-logo.svg';
import { login, signup, loginWithGoogle, forgotPassword } from '../services/authService';
import { User } from '../types';

interface AuthPageProps {
  onAuthSuccess: (user: User) => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  // Back arrow for login/signup (not for forgot password)
  const BackArrow = () => (
    !isForgotPassword && (
      <div className="fixed left-4 top-4 z-30">
        <a
          href="/"
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] shadow hover:bg-[var(--accent)]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          aria-label="Back to Home"
        >
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
      </div>
    )
  );
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setIsLoading(true);
    try {
      const user = isLogin 
        ? await login(email, password)
        : await signup(email, password, name);
      
      // Detection for email confirmation requirement
      // Supabase returns the user object even if confirmation is needed.
      // We check if a session was created.
      const hasSession = !!localStorage.getItem('sb-' + (process.env.SUPABASE_URL || '').split('.')[0].split('//')[1] + '-auth-token') || 
                         !!document.cookie.includes('sb-access-token');

      if (!isLogin && !hasSession) {
        setInfoMessage("Account created! Please check your email to confirm your account, then log in.");
        setIsLogin(true);
        setPassword('');
      } else {
        onAuthSuccess(user);
      }
    } catch (err: any) {
      if (err.message?.includes('already registered')) {
        setError("An account with this email already exists. Please log in.");
        setIsLogin(true);
      } else {
        setError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    try { await loginWithGoogle(); } catch (err: any) { setError(err.message); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    setError(null);
    setInfoMessage(null);
    setIsLoading(true);
    try {
      await forgotPassword(email);
      setInfoMessage('Password reset link sent! Check your email inbox and follow the link to reset your password.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <BackArrow />
      <div className="min-h-[100dvh] bg-[var(--bg-primary)] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">

      {/* Full-page content */}
      <div className="w-full max-w-[400px] z-10 flex flex-col items-center">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-5 flex items-center justify-center">
            <img src={SedrexLogo} alt="SEDREX" className="sedrex-logo" />
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {isForgotPassword ? 'Reset your password' : isLogin ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5">
            {isForgotPassword 
              ? 'Enter your email to receive a reset link' 
              : isLogin 
                ? 'Log in to continue to SEDREX' 
                : 'Sign up to get started with SEDREX'}
          </p>
        </div>

        {/* Card */}
        <div className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-xl">

          {isForgotPassword ? (
            /* ─── Forgot Password Form ─── */
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 rounded-lg py-2.5 px-3.5 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)]/50"
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2.5 bg-red-500/8 border border-red-500/20 text-red-400 text-sm py-3 px-3.5 rounded-lg">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span>{error}</span>
                </div>
              )}

              {infoMessage && (
                <div className="flex items-start gap-2.5 bg-emerald-500/8 border border-emerald-500/20 text-emerald-400 text-sm py-3 px-3.5 rounded-lg">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span>{infoMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-lg font-medium text-sm transition-all bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Sending...
                  </span>
                ) : 'Send reset link'}
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setIsForgotPassword(false);
                  setError(null);
                  setInfoMessage(null);
                }}
                className="w-full text-center text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              >
                ← Back to log in
              </button>
            </form>
          ) : (
            /* ─── Login / Signup Form ─── */
            <>
              {/* Google Button — top, like ChatGPT/Claude */}
              <button 
                onClick={handleGoogleAuth}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 py-3 bg-white text-gray-800 font-semibold border-2 border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 hover:shadow-lg hover:shadow-emerald-500/10 transition-all active:scale-[0.98] disabled:opacity-50 touch-manipulation shadow-md"
              >
                <Icons.Google className="w-[18px] h-[18px]" />
                <span className="text-sm font-semibold text-gray-800">Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="relative flex items-center my-6">
                <div className="flex-1 border-t border-[var(--border)]" />
                <span className="px-4 text-xs text-[var(--text-secondary)]">or</span>
                <div className="flex-1 border-t border-[var(--border)]" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 rounded-lg py-2.5 px-3.5 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)]/50"
                      placeholder="Your name"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 rounded-lg py-2.5 px-3.5 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)]/50"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-[var(--text-primary)]">Password</label>
                    {isLogin && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPassword(true);
                          setError(null);
                          setInfoMessage(null);
                        }}
                        className="text-xs font-medium text-emerald-500 hover:text-emerald-400 transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 rounded-lg py-2.5 px-3.5 pr-11 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)]/50"
                      placeholder="••••••••"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded"
                    >
                      {showPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-red-500/8 border border-red-500/20 text-red-400 text-sm py-3 px-3.5 rounded-lg">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>{error}</span>
                  </div>
                )}

                {infoMessage && (
                  <div className="flex items-start gap-2.5 bg-emerald-500/8 border border-emerald-500/20 text-emerald-400 text-sm py-3 px-3.5 rounded-lg">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    <span>{infoMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-lg font-medium text-sm transition-all bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      {isLogin ? 'Logging in...' : 'Creating account...'}
                    </span>
                  ) : (isLogin ? 'Continue' : 'Create account')}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Bottom toggle — outside card, like ChatGPT */}
        {!isForgotPassword && (
          <p className="mt-5 text-sm text-[var(--text-secondary)]">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              disabled={isLoading}
              onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                  setInfoMessage(null);
              }}
              className="font-medium text-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </p>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-[var(--text-secondary)]/50">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
    </>
  );
};

// Back arrow for login/signup (not for forgot password)
const BackArrow: React.FC<{isLogin: boolean, setIsLogin: (v: boolean) => void}> = ({ isLogin, setIsLogin }) => (
  <div className="fixed left-4 top-4 z-30">
    {isLogin ? (
      <a
        href="/"
        className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] shadow hover:bg-[var(--accent)]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        aria-label="Back to Home"
      >
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </a>
    ) : (
      <button
        type="button"
        onClick={() => setIsLogin(true)}
        className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] shadow hover:bg-[var(--accent)]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        aria-label="Back to Login"
      >
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    )}
  </div>
);

const AuthPageWithBack: React.FC<AuthPageProps> = (props) => {
  const [isLogin, setIsLogin] = React.useState(true);
  // ...existing code...
  // Use the original AuthPage but inject the BackArrow at the top
  return (
    <>
      <BackArrow isLogin={isLogin} setIsLogin={setIsLogin} />
      {/* ...existing AuthPage JSX, but pass isLogin/setIsLogin as props or context if needed... */}
    </>
  );
};

export default AuthPage;
