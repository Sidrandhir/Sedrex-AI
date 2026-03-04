import React, { useState, useEffect, useRef } from 'react';
import { Icons } from '../constants';
import NexusLogo from '../public/nexus-logo-modern.svg';
import { User, UserStats, AIModel } from '../types';
import { api } from '../services/apiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userSettings: any;
  onSave: (settings: any) => void;
  onPurgeHistory: () => Promise<void>;
  onUpgrade: () => void;
  onLogout: () => void;
  user: User;
  stats: UserStats | null;
  onThemeToggle: () => void;
  theme: 'light' | 'dark';
}

type TabType = 'general' | 'personification' | 'usage' | 'data';

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
  theme
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [personification, setPersonification] = useState(userSettings?.personification || '');
  const [responseStyle, setResponseStyle] = useState(userSettings?.responseStyle || 'balanced');
  const [language, setLanguage] = useState(userSettings?.language || 'en');
  const [isPurging, setIsPurging] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      api.getPreferences().then(prefs => {
        if (prefs.custom_instructions) setPersonification(prefs.custom_instructions);
        if (prefs.response_format) setResponseStyle(prefs.response_format);
        if (prefs.language) setLanguage(prefs.language);
      });

      // Escape key to close
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleKeyDown);

      // Android back button — push a history entry so popstate fires
      window.history.pushState({ modal: 'settings' }, '');
      const handlePopState = () => onClose();
      window.addEventListener('popstate', handlePopState);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('popstate', handlePopState);
      };
    }
    
    // Update progress bar widths from data attributes
    const progressBars = document.querySelectorAll('.progress-bar-fill[data-progress]');
    progressBars.forEach((bar: Element) => {
      const element = bar as HTMLElement;
      const progress = element.getAttribute('data-progress');
      if (progress) {
        element.style.width = `${progress}%`;
      }
    });
  }, [isOpen, stats]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  const handleSaveAll = async () => {
    setIsSaving(true);
    const updated = { personification, responseStyle, language, theme };
    try {
      await api.updatePreferences({
        persona: personification,
        responseStyle,
        language,
        theme
      });
      onSave(updated);
      onClose();
    } catch (err) {
      console.error("Failed to sync preferences:", err);
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

  const TabButton = ({ id, label, icon: Icon }: { id: TabType, label: string, icon: any, tooltip?: string }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        setShowPurgeConfirm(false);
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all ${
        activeTab === id 
          ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/20' 
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );

  return (
    <div 
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-300"
    >
      <div 
        ref={modalRef}
        className="bg-[var(--bg-secondary)] w-full max-w-4xl max-h-[90vh] rounded-2xl sm:rounded-[2.5rem] border border-[var(--border)] shadow-2xl flex flex-col sm:flex-row overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Sidebar - Hidden on mobile, visible on sm+ */}
        <div className="hidden sm:flex w-72 bg-[var(--bg-tertiary)]/40 border-r border-[var(--border)] p-6 sm:p-8 flex-col gap-2 transition-colors flex-shrink-0">
          <div className="mb-4 sm:mb-6 px-2 sm:px-4">
            <h2 className="text-lg sm:text-xl font-black tracking-tighter text-[var(--text-primary)]">Settings</h2>
          </div>
          
          <TabButton id="general" label="General" icon={Icons.Robot} tooltip="Theme and Language" />
          <TabButton id="personification" label="Custom AI" icon={Icons.Sparkles} tooltip="Custom Instructions" />
          {/* <TabButton id="subscription" label="Plan" icon={Icons.CreditCard} tooltip="Your Plan" /> */}
          <TabButton id="usage" label="Usage" icon={Icons.BarChart} tooltip="Usage Stats" />
          <TabButton id="data" label="Data" icon={Icons.Database} tooltip="Your Data" />
          
          <div className="mt-auto">
             <button 
               onClick={onLogout} 
               className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-4 rounded-xl sm:rounded-2xl text-[12px] sm:text-[13px] font-black uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-all active:scale-95"
             >
                <Icons.LogOut className="w-3.5 sm:w-4 h-3.5 sm:h-4 flex-shrink-0" /> Log Out
             </button>
          </div>
        </div>

        {/* Mobile Tab Selector */}
        <div className="sm:hidden flex items-center gap-1 overflow-x-auto px-3 py-2 bg-[var(--bg-tertiary)]/20 border-b border-[var(--border)] custom-scrollbar">
          <div className="flex gap-1 overflow-x-auto flex-1">
            {(['general', 'personification', 'usage', 'data'] as TabType[]).map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setShowPurgeConfirm(false);
                }}
                className={`whitespace-nowrap flex-shrink-0 px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                  activeTab === tab 
                    ? 'bg-[var(--accent)] text-white shadow-lg' 
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {tab === 'general' ? 'General' : tab === 'personification' ? 'Custom AI' : tab === 'subscription' ? 'Plan' : tab === 'usage' ? 'Usage' : 'Data'}
              </button>
            ))}
          </div>
          <button
            onClick={onLogout}
            data-nexus-tooltip="Logout"
            className="flex-shrink-0 p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-all active:scale-95 border border-red-500/20"
            title="Logout"
          >
            <Icons.LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col bg-[var(--bg-primary)] transition-colors overflow-hidden">
          <header className="px-4 sm:px-10 py-4 sm:py-8 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg-secondary)]/30 backdrop-blur-md flex-shrink-0">
            <div className="space-y-0.5 sm:space-y-1 min-w-0">
              <h3 className="text-lg sm:text-2xl font-black tracking-tighter capitalize text-[var(--text-primary)] truncate">{activeTab}</h3>
            </div>
            <button 
              onClick={onClose} 
              aria-label="Close settings"
              title="Close settings"
              className="p-2 sm:p-2.5 hover:bg-[var(--bg-tertiary)] rounded-lg sm:rounded-2xl transition-all active:scale-90 border border-[var(--border)] text-[var(--text-primary)] flex-shrink-0 ml-2"
            >
              <Icons.X className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 sm:p-10 custom-scrollbar">
            {activeTab === 'general' && (
              <div className="space-y-4 sm:space-y-8 animate-in slide-in-from-bottom-2 w-full max-w-2xl">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-8 bg-[var(--bg-tertiary)]/20 border border-[var(--border)] rounded-lg sm:rounded-[2rem] transition-colors">
                   <div className="space-y-1 flex-1">
                     <h4 className="font-black text-xs sm:text-sm uppercase tracking-tight text-[var(--text-primary)]">Appearance</h4>
                     <p className="text-[12px] sm:text-[13px] text-[var(--text-secondary)] font-medium">Switch between light and dark mode.</p>
                   </div>
                   <button 
                    onClick={onThemeToggle} 
                    className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg sm:rounded-xl text-[12px] sm:text-[13px] font-black uppercase tracking-widest transition-all text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] shadow-sm active:scale-95 flex-shrink-0"
                   >
                      {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
                   </button>
                </div>
                <div className="p-4 sm:p-8 bg-indigo-500/5 border border-indigo-500/10 rounded-lg sm:rounded-[2rem] transition-colors">
                   <label htmlFor="language-select" className="font-black text-xs sm:text-sm uppercase tracking-tight mb-2 text-[var(--text-primary)] block">Language</label>
                   <select 
                    id="language-select"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    aria-label="Select interface language"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg sm:rounded-2xl p-3 sm:p-4 text-xs sm:text-sm font-bold outline-none text-[var(--text-primary)] focus:border-[var(--accent)] transition-all cursor-pointer"
                  >
                    <option value="en">English (Global)</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'personification' && (
              <div className="space-y-4 sm:space-y-8 animate-in slide-in-from-bottom-2 w-full max-w-2xl">
                <div className="space-y-2 sm:space-y-3">
                  <label className="text-[11px] sm:text-[13px] font-black uppercase tracking-widest text-[var(--text-secondary)] px-1">Custom Instructions</label>
                  <textarea 
                    value={personification}
                    onChange={(e) => setPersonification(e.target.value)}
                    className="w-full h-32 sm:h-40 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg sm:rounded-2xl p-3 sm:p-6 text-xs sm:text-sm font-medium focus:border-[var(--accent)] outline-none resize-none leading-relaxed text-[var(--text-primary)] caret-[var(--accent)] transition-all placeholder:text-[var(--text-secondary)] placeholder:opacity-40"
                    placeholder="Tell the AI how you'd like it to respond. For example: 'Be concise and use bullet points' or 'Explain things simply like I'm a beginner'..."
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[11px] sm:text-[13px] font-black uppercase tracking-widest text-[var(--text-secondary)] px-1">Response Style</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                    {['balanced', 'concise', 'detailed', 'creative'].map(style => (
                      <button 
                        key={style}
                        onClick={() => setResponseStyle(style)}
                        className={`p-3 sm:p-5 rounded-lg sm:rounded-2xl border text-[11px] sm:text-[13px] font-black uppercase tracking-widest transition-all active:scale-[0.98] ${
                          responseStyle === style 
                          ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-lg shadow-[var(--accent)]/20' 
                          : 'bg-[var(--bg-tertiary)]/20 border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]/30'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* {activeTab === 'subscription' && (
              ...subscription tab content...
            )} */}

            {activeTab === 'usage' && (
              <div className="space-y-4 sm:space-y-8 animate-in slide-in-from-bottom-2 w-full max-w-2xl">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
                    <div className="p-4 sm:p-8 bg-[var(--bg-tertiary)]/30 rounded-lg sm:rounded-[2rem] border border-[var(--border)] flex flex-col justify-center transition-colors">
                       <p className="text-[11px] sm:text-[13px] font-black uppercase text-[var(--text-secondary)] tracking-widest mb-2 opacity-60">Total Tokens</p>
                       <p className="text-2xl sm:text-4xl font-black text-[var(--text-primary)] tracking-tighter">{stats?.tokensEstimated.toLocaleString() || 0}</p>
                    </div>
                    <div className="p-4 sm:p-8 bg-[var(--bg-tertiary)]/30 rounded-lg sm:rounded-[2rem] border border-[var(--border)] flex flex-col justify-center transition-colors">
                       <p className="text-[11px] sm:text-[13px] font-black uppercase text-[var(--text-secondary)] tracking-widest mb-2 opacity-60">Total Messages</p>
                       <p className="text-2xl sm:text-4xl font-black text-[var(--text-primary)] tracking-tighter">{stats?.totalMessagesSent || 0}</p>
                    </div>
                 </div>
                 <div className="p-4 sm:p-10 bg-[var(--bg-tertiary)]/10 border border-[var(--border)] rounded-lg sm:rounded-[2.5rem] transition-colors">
                    <h4 className="text-[11px] sm:text-[13px] font-black uppercase text-[var(--text-secondary)] tracking-widest mb-4 sm:mb-8 opacity-60">Model Usage</h4>
                    <div className="space-y-4 sm:space-y-6">
                       {Object.entries(stats?.modelUsage || {}).map(([model, count]) => {
                         const percent = stats?.totalMessagesSent ? Math.round(((count as number) / stats.totalMessagesSent) * 100) : 0;
                         return (
                           <div key={model} className="space-y-2 sm:space-y-3">
                              <div className="flex justify-between text-[11px] sm:text-[13px] font-black uppercase tracking-tight">
                                 <span className="text-[var(--text-primary)] truncate">{model}</span>
                                 <span className="text-[var(--text-secondary)] whitespace-nowrap ml-2">{percent}%</span>
                              </div>
                              <div className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden shadow-inner">
                                 <div className="progress-bar-fill bg-[var(--accent)] h-full transition-all duration-1000 ease-out" data-progress={percent} />
                              </div>
                           </div>
                         );
                       })}
                    </div>
                 </div>
              </div>
            )}

            {activeTab === 'data' && (
              <div className="space-y-3 sm:space-y-6 animate-in slide-in-from-bottom-2 w-full max-w-2xl">
                <button 
                  onClick={() => {}} 
                  className="w-full p-4 sm:p-8 bg-[var(--bg-tertiary)]/20 border border-[var(--border)] rounded-lg sm:rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group transition-all hover:bg-[var(--bg-tertiary)]/40 active:scale-[0.99]"
                >
                   <div className="text-left flex-1 min-w-0">
                      <h4 className="font-black text-xs sm:text-sm uppercase tracking-tight text-[var(--text-primary)]">Export Chat History</h4>
                      <p className="text-[12px] sm:text-[13px] text-[var(--text-secondary)] font-medium opacity-60 line-clamp-2">Download your conversations as JSON or CSV.</p>
                   </div>
                   <Icons.Download className="w-5 sm:w-6 h-5 sm:h-6 text-[var(--text-secondary)] opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
                <div className={`p-4 sm:p-8 border rounded-lg sm:rounded-[2rem] transition-all ${showPurgeConfirm ? 'bg-red-500/10 border-red-500/30 shadow-2xl shadow-red-500/10' : 'bg-[var(--bg-tertiary)]/20 border-[var(--border)]'}`}>
                   <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <h4 className={`font-black text-xs sm:text-sm uppercase tracking-tight ${showPurgeConfirm ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>Delete All Data</h4>
                        <p className="text-[12px] sm:text-[13px] text-[var(--text-secondary)] font-medium opacity-60">Permanently delete all your conversations.</p>
                      </div>
                      <button 
                        onClick={() => setShowPurgeConfirm(!showPurgeConfirm)} 
                        className={`px-4 sm:px-8 py-2 sm:py-3 rounded-lg sm:rounded-xl text-[11px] sm:text-[13px] font-black uppercase transition-all active:scale-95 whitespace-nowrap flex-shrink-0 ${showPurgeConfirm ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'}`}
                      >
                        {showPurgeConfirm ? 'Cancel' : 'Delete Data'}
                      </button>
                   </div>
                   {showPurgeConfirm && (
                     <div className="mt-4 sm:mt-8 flex gap-2 sm:gap-4 flex-col sm:flex-row animate-in slide-in-from-top-4">
                        <button 
                          disabled={isPurging} 
                          onClick={handlePurge} 
                          className="flex-1 py-3 sm:py-4 bg-red-600 text-white rounded-lg sm:rounded-xl text-[11px] sm:text-[13px] font-black uppercase tracking-widest shadow-lg shadow-red-600/20 active:scale-95 transition-transform disabled:opacity-50"
                        >
                          {isPurging ? 'Deleting...' : 'Yes, Delete Everything'}
                        </button>
                        <button 
                          onClick={() => setShowPurgeConfirm(false)} 
                          className="px-4 sm:px-8 py-3 sm:py-4 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg sm:rounded-xl text-[11px] sm:text-[13px] font-black uppercase border border-[var(--border)] active:scale-95 transition-transform"
                        >
                          Keep Data
                        </button>
                     </div>
                   )}
                </div>
              </div>
            )}
          </div>

          <footer className="px-3 sm:px-10 py-3 sm:py-8 bg-[var(--bg-secondary)]/30 border-t border-[var(--border)] flex justify-end gap-2 sm:gap-4 transition-colors backdrop-blur-md flex-shrink-0 flex-wrap">
                      {/* Download logo button removed as requested */}
             <button 
               onClick={onClose} 
               className="px-4 sm:px-8 py-2 sm:py-3 text-[11px] sm:text-[13px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-lg sm:rounded-xl hover:bg-[var(--bg-tertiary)]/30"
             >
               Cancel
             </button>
             <button 
               onClick={handleSaveAll}
               disabled={isSaving}
               className="px-4 sm:px-10 py-2 sm:py-3 bg-[var(--accent)] rounded-lg sm:rounded-2xl text-[11px] sm:text-[13px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] text-white shadow-xl shadow-[var(--accent)]/20 active:scale-95 transition-all hover:brightness-110 disabled:opacity-50"
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