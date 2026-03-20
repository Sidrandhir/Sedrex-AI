import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../constants';
import { User, UserStats } from '../types';
import { api } from '../services/apiService';

// ══════════════════════════════════════════════════════════════════
// SEDREX — SETTINGS MODAL
// Emerald Green (#10B981) theme · Verification-First Intelligence
// ══════════════════════════════════════════════════════════════════

interface SettingsModalProps {
  isOpen:          boolean;
  onClose:         () => void;
  userSettings:    any;
  onSave:          (settings: any) => void;
  onPurgeHistory:  () => Promise<void>;
  onUpgrade:       () => void;
  onLogout:        () => void;
  user:            User;
  stats:           UserStats | null;
  onThemeToggle:   () => void;
  theme:           'light' | 'dark';
}

type TabType = 'general' | 'personification' | 'usage' | 'data';

const TAB_LABELS: Record<TabType, string> = {
  general:         'General',
  personification: 'Custom AI',
  usage:           'Usage',
  data:            'Data',
};

// ── Inline SEDREX S logomark ───────────────────────────────────────
const SedrexMark = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 20 20" fill="none" style={{ width: size, height: size, flexShrink: 0 }}>
    <rect width="20" height="20" rx="5" fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.3)" strokeWidth="1"/>
    <path d="M5 10l3 3 7-7"
      stroke="#10B981" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ── Gold accent style ──────────────────────────────────────────────
const goldActive = {
  background: 'var(--accent, #10B981)',
  color:      '#020408',
  border:     'none',
  boxShadow:  '0 4px 20px rgba(16,185,129,0.25)',
} as React.CSSProperties;

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  userSettings,
  onSave,
  onPurgeHistory,
  onUpgrade,
  onLogout,
  user,
  stats,
  onThemeToggle,
  theme,
}) => {
  const [activeTab,         setActiveTab]         = useState<TabType>('general');
  const [personification,   setPersonification]   = useState(userSettings?.personification || '');
  const [responseStyle,     setResponseStyle]     = useState(userSettings?.responseStyle || 'balanced');
  const [language,          setLanguage]          = useState(userSettings?.language || 'en');
  const [isPurging,         setIsPurging]         = useState(false);
  const [showPurgeConfirm,  setShowPurgeConfirm]  = useState(false);
  const [isSaving,          setIsSaving]          = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // ── Effects ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    api.getPreferences().then(prefs => {
      if (prefs.custom_instructions) setPersonification(prefs.custom_instructions);
      if (prefs.response_format)     setResponseStyle(prefs.response_format);
      if (prefs.language)            setLanguage(prefs.language);
    });

    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);

    window.history.pushState({ modal: 'settings' }, '');
    const handlePop = () => onClose();
    window.addEventListener('popstate', handlePop);

    return () => {
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('popstate', handlePop);
    };
  }, [isOpen, onClose]);

  // Update progress bar widths
  useEffect(() => {
    document.querySelectorAll('.sx-progress-fill[data-progress]').forEach((el) => {
      const bar = el as HTMLElement;
      const pct = bar.getAttribute('data-progress');
      if (pct) setTimeout(() => { bar.style.width = `${pct}%`; }, 100);
    });
  }, [activeTab, stats]);

  if (!isOpen) return null;

  // ── Handlers ──────────────────────────────────────────────────
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    const updated = { personification, responseStyle, language, theme };
    try {
      await api.updatePreferences({ persona: personification, responseStyle, language, theme });
      onSave(updated);
      onClose();
    } catch (err) {
      console.error('Failed to sync preferences:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePurge = async () => {
    setIsPurging(true);
    try {
      await onPurgeHistory();
      setShowPurgeConfirm(false);
    } finally {
      setIsPurging(false);
    }
  };

  const switchTab = (id: TabType) => { setActiveTab(id); setShowPurgeConfirm(false); };

  // ── Tab button ─────────────────────────────────────────────────
  const TabBtn = ({ id, label, icon: Icon }: { id: TabType; label: string; icon: any }) => {
    const active = activeTab === id;
    return (
      <button
        onClick={() => switchTab(id)}
        style={active ? goldActive : undefined}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
          active
            ? 'font-black text-[12px] uppercase tracking-widest'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] text-[12px] font-black uppercase tracking-widest'
        }`}
      >
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        {label}
      </button>
    );
  };

  // ── GENERAL TAB ────────────────────────────────────────────────
  const GeneralTab = () => (
    <div className="space-y-5 animate-in slide-in-from-bottom-2 w-full max-w-2xl">

      {/* Appearance */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-tertiary)]/20">
        <div>
          <h4 className="font-black text-xs uppercase tracking-widest text-[var(--text-primary)] mb-1">Appearance</h4>
          <p className="text-[12px] text-[var(--text-secondary)]">Switch between light and dark mode.</p>
        </div>
        <button
          onClick={onThemeToggle}
          className="w-full sm:w-auto px-5 py-2.5 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl text-[12px] font-black uppercase tracking-widest transition-all text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] active:scale-95 flex-shrink-0"
        >
          {theme === 'dark' ? '☀️  Light' : '🌙  Dark'}
        </button>
      </div>

      {/* Language */}
      <div className="p-5 sm:p-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-tertiary)]/10">
        <label
          htmlFor="language-select"
          className="font-black text-xs uppercase tracking-widest text-[var(--text-primary)] block mb-3"
        >
          Language
        </label>
        <select
          id="language-select"
          value={language}
          onChange={e => setLanguage(e.target.value)}
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl p-3 text-sm font-bold outline-none text-[var(--text-primary)] transition-all cursor-pointer"
          style={{ '--tw-ring-color': 'var(--accent)' } as any}
          onFocus={e => (e.target.style.borderColor = 'rgba(16,185,129,0.4)')}
          onBlur={e  => (e.target.style.borderColor = '')}
        >
          <option value="en">English (Global)</option>
          <option value="hi">हिन्दी</option>
          <option value="es">Español</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="ja">日本語</option>
          <option value="zh">中文</option>
        </select>
      </div>

      {/* Account info */}
      <div className="p-5 sm:p-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-tertiary)]/10">
        <h4 className="font-black text-xs uppercase tracking-widest text-[var(--text-primary)] mb-4">Account</h4>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[14px] font-black text-[#020408] flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
          >
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[var(--text-primary)] truncate">{user.email}</p>
            <p
              className="text-[10px] font-black uppercase tracking-widest"
              style={{ color: 'var(--accent, #10B981)' }}
            >
              {user.tier} plan
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // ── CUSTOM AI TAB ──────────────────────────────────────────────
  const CustomAITab = () => (
    <div className="space-y-5 animate-in slide-in-from-bottom-2 w-full max-w-2xl">

      {/* Instructions */}
      <div className="space-y-2">
        <label className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] px-1 block">
          Custom Instructions
        </label>
        <textarea
          value={personification}
          onChange={e => setPersonification(e.target.value)}
          rows={5}
          placeholder="Tell SEDREX how you'd like it to respond. For example: 'Be concise and use bullet points' or 'I am a medical researcher — use technical terminology'..."
          className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 text-sm font-medium outline-none resize-none leading-relaxed text-[var(--text-primary)] transition-all placeholder:text-[var(--text-secondary)] placeholder:opacity-40"
          onFocus={e => (e.target.style.borderColor = 'rgba(16,185,129,0.4)')}
          onBlur={e  => (e.target.style.borderColor = '')}
        />
        <p className="text-[11px] text-[var(--text-secondary)] px-1">
          These instructions are sent with every message to personalize SEDREX's responses.
        </p>
      </div>

      {/* Response style */}
      <div className="space-y-3">
        <label className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] px-1 block">
          Response Style
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {(['balanced', 'concise', 'detailed', 'creative'] as const).map(style => {
            const active = responseStyle === style;
            return (
              <button
                key={style}
                onClick={() => setResponseStyle(style)}
                style={active ? goldActive : undefined}
                className={`p-3 sm:p-4 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                  active
                    ? ''
                    : 'bg-[var(--bg-tertiary)]/20 border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/30 hover:text-[var(--text-primary)]'
                }`}
              >
                {style}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] px-1">
          Controls the length and format of SEDREX's answers.
        </p>
      </div>
    </div>
  );

  // ── USAGE TAB ──────────────────────────────────────────────────
  const UsageTab = () => {
    const total    = stats?.totalMessagesSent   ?? 0;
    const monthly  = stats?.monthlyMessagesSent ?? 0;
    const limit    = stats?.monthlyMessagesLimit ?? 0;
    const tokens   = stats?.tokensEstimated     ?? 0;
    const pct      = limit > 0 ? Math.min(Math.round((monthly / limit) * 100), 100) : 0;

    return (
      <div className="space-y-5 animate-in slide-in-from-bottom-2 w-full max-w-2xl">

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Total Messages', value: total.toLocaleString() },
            { label: 'Est. Tokens Used', value: tokens.toLocaleString() },
          ].map(item => (
            <div key={item.label} className="p-5 sm:p-7 bg-[var(--bg-tertiary)]/30 rounded-2xl border border-[var(--border)]">
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2 opacity-70">
                {item.label}
              </p>
              <p className="text-3xl sm:text-4xl font-black text-[var(--text-primary)] tracking-tighter">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Monthly usage bar */}
        <div className="p-5 sm:p-8 bg-[var(--bg-tertiary)]/10 border border-[var(--border)] rounded-2xl">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
              Monthly Usage
            </h4>
            <span
              className="text-[11px] font-black"
              style={{ color: pct > 80 ? '#e84a6a' : 'var(--accent, #10B981)' }}
            >
              {monthly}/{limit > 0 ? limit : '∞'}
            </span>
          </div>
          <div className="w-full h-2.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
            <div
              className="sx-progress-fill h-full rounded-full transition-all duration-1000 ease-out"
              data-progress={pct}
              style={{
                width: 0,
                background: pct > 80
                  ? 'linear-gradient(90deg, #e84a6a, #ff6b8a)'
                  : 'linear-gradient(90deg, #10B981, #34d399)',
              }}
            />
          </div>
        </div>

        {/* Model distribution */}
        {stats?.modelUsage && Object.keys(stats.modelUsage).length > 0 && (
          <div className="p-5 sm:p-8 bg-[var(--bg-tertiary)]/10 border border-[var(--border)] rounded-2xl">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-5 opacity-70">
              Model Distribution
            </h4>
            <div className="space-y-4">
              {Object.entries(stats.modelUsage).map(([model, count]) => {
                const pctModel = total > 0 ? Math.round(((count as number) / total) * 100) : 0;
                return (
                  <div key={model}>
                    <div className="flex justify-between text-[11px] font-bold mb-1.5">
                      <span className="text-[var(--text-primary)] truncate">{model}</span>
                      <span className="text-[var(--text-secondary)] ml-2 flex-shrink-0">{pctModel}%</span>
                    </div>
                    <div className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                      <div
                        className="sx-progress-fill h-full rounded-full transition-all duration-1000 ease-out"
                        data-progress={pctModel}
                        style={{
                          width: 0,
                          background: 'linear-gradient(90deg, #10B981, #34d399)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── DATA TAB ───────────────────────────────────────────────────
  const DataTab = () => (
    <div className="space-y-4 animate-in slide-in-from-bottom-2 w-full max-w-2xl">

      {/* Export */}
      <button
        onClick={() => {}}
        className="w-full p-5 sm:p-7 bg-[var(--bg-tertiary)]/20 border border-[var(--border)] rounded-2xl flex items-center justify-between gap-3 group transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--bg-tertiary)]/30 active:scale-[0.99]"
      >
        <div className="text-left flex-1 min-w-0">
          <h4 className="font-black text-xs uppercase tracking-widest text-[var(--text-primary)] mb-1">
            Export Chat History
          </h4>
          <p className="text-[12px] text-[var(--text-secondary)] opacity-70">
            Download all your conversations as Markdown.
          </p>
        </div>
        <Icons.Download className="w-5 h-5 text-[var(--text-secondary)] opacity-40 group-hover:opacity-80 group-hover:text-[var(--accent)] transition-all flex-shrink-0" />
      </button>

      {/* Delete data */}
      <div
        className={`p-5 sm:p-7 border rounded-2xl transition-all ${
          showPurgeConfirm
            ? 'bg-red-500/8 border-red-500/30'
            : 'bg-[var(--bg-tertiary)]/10 border-[var(--border)]'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-0">
          <div className="flex-1 min-w-0">
            <h4 className={`font-black text-xs uppercase tracking-widest mb-1 ${showPurgeConfirm ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>
              Delete All Data
            </h4>
            <p className="text-[12px] text-[var(--text-secondary)] opacity-70">
              Permanently delete all your conversations. This cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setShowPurgeConfirm(p => !p)}
            className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap flex-shrink-0 ${
              showPurgeConfirm
                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
            }`}
          >
            {showPurgeConfirm ? 'Cancel' : 'Delete Data'}
          </button>
        </div>

        {showPurgeConfirm && (
          <div className="mt-5 flex gap-3 flex-col sm:flex-row animate-in slide-in-from-top-2">
            <p className="text-[12px] text-red-300 mb-2 sm:hidden">
              This will permanently delete all your conversations. Are you sure?
            </p>
            <button
              disabled={isPurging}
              onClick={handlePurge}
              className="flex-1 py-3 bg-red-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-red-600/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {isPurging ? 'Deleting...' : 'Yes, Delete Everything'}
            </button>
            <button
              onClick={() => setShowPurgeConfirm(false)}
              className="px-6 py-3 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-xl text-[11px] font-black uppercase border border-[var(--border)] active:scale-95 transition-all"
            >
              Keep Data
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ── RENDER ─────────────────────────────────────────────────────
  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-300"
    >
      <div
        ref={modalRef}
        className="bg-[var(--bg-secondary)] w-full max-w-4xl max-h-[90vh] rounded-2xl sm:rounded-[2.5rem] border border-[var(--border)] shadow-2xl flex flex-col sm:flex-row overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ boxShadow: '0 0 80px rgba(16,185,129,0.06), 0 25px 60px rgba(0,0,0,0.5)' }}
      >

        {/* ── Desktop sidebar ────────────────────────────────── */}
        <div className="hidden sm:flex w-64 bg-[var(--bg-tertiary)]/30 border-r border-[var(--border)] p-6 flex-col gap-1.5 flex-shrink-0">

          {/* Logo + title */}
          <div className="mb-5 px-2">
            <div className="flex items-center gap-2 mb-1">
              <SedrexMark size={18} />
              <span style={{
                fontFamily:    'IBM Plex Mono, monospace',
                fontSize:      10,
                fontWeight:    900,
                letterSpacing: 4,
                textTransform: 'uppercase',
                color:         'var(--accent, #10B981)',
              }}>
                SEDREX
              </span>
            </div>
            <h2 className="text-lg font-black tracking-tighter text-[var(--text-primary)]">Settings</h2>
          </div>

          <TabBtn id="general"         label="General"   icon={Icons.Robot}    />
          <TabBtn id="personification" label="Custom AI" icon={Icons.Sparkles} />
          <TabBtn id="usage"           label="Usage"     icon={Icons.BarChart} />
          <TabBtn id="data"            label="Data"      icon={Icons.Database} />

          {/* Logout */}
          <div className="mt-auto">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10 transition-all active:scale-95"
            >
              <Icons.LogOut className="w-3.5 h-3.5 flex-shrink-0" />
              Log Out
            </button>
          </div>
        </div>

        {/* ── Mobile tab bar ──────────────────────────────────── */}
        <div className="sm:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-tertiary)]/20 custom-scrollbar">
          <div className="flex gap-1 flex-1 overflow-x-auto">
            {(Object.keys(TAB_LABELS) as TabType[]).map(tab => (
              <button
                key={tab}
                onClick={() => switchTab(tab)}
                style={activeTab === tab ? { ...goldActive, borderRadius: 8 } : undefined}
                className={`whitespace-nowrap flex-shrink-0 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                  activeTab === tab ? '' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          <button
            onClick={onLogout}
            className="flex-shrink-0 p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-all border border-red-500/20 ml-1"
            title="Logout"
          >
            <Icons.LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Main content ────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-[var(--bg-primary)] overflow-hidden">

          {/* Header */}
          <header className="px-5 sm:px-10 py-4 sm:py-7 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-secondary)]/30 backdrop-blur-md flex-shrink-0">
            <div>
              <h3 className="text-lg sm:text-2xl font-black tracking-tighter text-[var(--text-primary)]">
                {TAB_LABELS[activeTab]}
              </h3>
              <p style={{
                fontFamily:    'IBM Plex Mono, monospace',
                fontSize:      9,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color:         'var(--accent, #10B981)',
                marginTop:     2,
              }}>
                SEDREX · Verification-First Intelligence
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="p-2.5 hover:bg-[var(--bg-tertiary)] rounded-xl transition-all active:scale-90 border border-[var(--border)] text-[var(--text-primary)] flex-shrink-0 ml-4"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          </header>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-10 custom-scrollbar">
            {activeTab === 'general'         && <GeneralTab  />}
            {activeTab === 'personification' && <CustomAITab />}
            {activeTab === 'usage'           && <UsageTab    />}
            {activeTab === 'data'            && <DataTab     />}
          </div>

          {/* Footer */}
          <footer className="px-5 sm:px-10 py-4 sm:py-6 bg-[var(--bg-secondary)]/30 border-t border-[var(--border)] flex justify-end gap-3 backdrop-blur-md flex-shrink-0">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-xl hover:bg-[var(--bg-tertiary)]/40"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              style={!isSaving ? goldActive : undefined}
              className={`px-8 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 ${
                isSaving ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]' : ''
              }`}
            >
              {isSaving ? 'Saving...' : 'Apply'}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;