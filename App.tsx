import React, { useState, useCallback, useEffect, useRef, lazy, Suspense, startTransition } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import MessageInput from './components/MessageInput';
import Toast, { ToastMessage } from './components/Toast';
import { ChatSession, Message, RouterResult, UserStats, User, AIModel, MessageImage, AttachedDocument } from './types';
import { getAIResponse, generateChatTitle, routePrompt, generateFollowUpSuggestions } from './services/aiService';
import { getStats } from './services/storageService';
import { getCurrentUser, logout } from './services/authService';
import { getAdminStats } from './services/analyticsService';
import { api } from './services/apiService';
import { Icons } from './constants';
import NexusLogo from './public/nexus-logo-modern.svg';
import { Routes, Route, Link } from 'react-router-dom';
import Privacy from './components/Privacy';
import Terms from './components/Terms';
import Contact from './components/Contact';
import { isSupabaseConfigured as initialConfigured, supabase } from './services/supabaseClient';

// Lazy-load heavy components that aren't needed on initial render
const Dashboard = lazy(() => import('./components/Dashboard'));
const Pricing = lazy(() => import('./components/Pricing'));
const Billing = lazy(() => import('./components/Billing'));
const AuthPage = lazy(() => import('./components/AuthPage'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const MobileOnboarding = lazy(() => import('./components/MobileOnboarding'));
const OnboardingSurvey = lazy(() => import('./components/OnboardingSurvey'));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage'));

// Minimal fallback for lazy components
const LazyFallback = () => <div className="flex items-center justify-center p-8"><div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" /></div>;

const App: React.FC = () => {
  const [configured] = useState(initialConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const [isLoading, setIsLoading] = useState(false);
  const [routingInfo, setRoutingInfo] = useState<RouterResult | null>(null);
  const [view, setView] = useState<'chat' | 'dashboard' | 'pricing' | 'billing' | 'admin'>('chat');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('nexus_theme') as 'light' | 'dark') || 'dark');
  const [userSettings, setUserSettings] = useState(() => {
    const saved = localStorage.getItem('nexus_user_settings');
    return saved ? JSON.parse(saved) : { personification: 'Concise and professional', language: 'en' };
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev.filter(t => t.message !== message), { id, message, type }]);
  }, []);

  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // Global handler for iOS WebKit "TypeError: Load failed" and unhandled rejections
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = (e?.reason?.message || '').toLowerCase();
      if (msg.includes('load failed') || msg.includes('failed to fetch') || msg.includes('network')) {
        e.preventDefault(); // Suppress console error for transient network issues
        console.warn('Transient network error caught globally — retrying silently');
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nexus_theme', theme);
  }, [theme]);

  const handleThemeToggle = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    if (!configured) {
      console.warn("Nexus AI: Supabase keys not detected in environment. Ensure .env is configured.");
      setIsAuthChecking(false);
      return;
    }

    // Detect password recovery from URL hash (Supabase redirects with #type=recovery&access_token=...)
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    if (hash.includes('type=recovery') || searchParams.get('type') === 'recovery') {
      setShowResetPassword(true);
      setIsAuthChecking(false);
      return;
    }

    // Listen for Supabase PASSWORD_RECOVERY auth event
    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
      }
    });

    getCurrentUser().then(u => {
      setUser(u);
      if (u) {
        // Show survey for first-time users
        if (!localStorage.getItem('nexus_survey_done')) {
          setShowSurvey(true);
        }
        if (window.innerWidth < 1024 && !localStorage.getItem('nexus_onboarding_done')) {
          setShowOnboarding(true);
        }
      }
    }).finally(() => setIsAuthChecking(false));

    return () => {
      subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (user) {
      // Load stats in background — don't block UI
      getStats(user.id).then(s => startTransition(() => setUserStats(s)));
      // Load conversations with limit, then select first one
      api.getConversations(50).then(async (convs) => {
        startTransition(() => setSessions(convs));
        if (convs.length > 0) {
          setActiveSessionId(convs[0].id);
          // Load messages for first conversation separately
          api.getMessages(convs[0].id, 100).then(m => {
            startTransition(() => setSessions(p => p.map(s => s.id === convs[0].id ? { ...s, messages: m } : s)));
          });
        }
      });
    }
  }, [user]);

  // Removed sidebar swipe gesture logic. Sidebar can now only be toggled by button.

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const handleExportChat = useCallback(() => {
    if (!activeSession || activeSession.messages.length === 0) return;
    let md = `# ${activeSession.title || 'Chat Export'}\n\n`;
    md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
    activeSession.messages.forEach(msg => {
      const role = msg.role === 'user' ? '**You**' : '**Nexus AI**';
      md += `### ${role}\n\n${msg.content}\n\n---\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const filename = `${(activeSession.title || 'chat').replace(/[^a-z0-9]/gi, '_')}_export.md`;
    // iOS-safe download: use navigator.share on iOS where <a download> is ignored
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS && navigator.share && navigator.canShare?.({ files: [new File([blob], filename)] })) {
      navigator.share({ files: [new File([blob], filename, { type: blob.type })] }).catch(() => {
        window.open(URL.createObjectURL(blob), '_blank');
      });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [activeSession]);

  const requestAIResponse = async (sessionId: string, currentHistory: Message[]) => {
    if (!user || isLoading) return;
    setIsLoading(true);
    abortControllerRef.current = new AbortController();
    
    const userMsg = currentHistory[currentHistory.length - 1];
    const previewRouting = routePrompt(userMsg.content, !!userMsg.image, (userMsg.documents?.length || 0) > 0);
    const assistantId = "assistant-" + Math.random().toString(36).substr(2, 9);
    
    setSessions(prev => prev.map(s => s.id === sessionId ? {
      ...s,
      messages: [...currentHistory, { 
        id: assistantId, role: 'assistant', content: "", timestamp: Date.now(), model: previewRouting.model 
      }]
    } : s));

    let accumulatedText = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFlushedLength = 0;

    const flushToUI = () => {
      // Skip flush if text hasn't grown since last flush (avoids redundant renders)
      if (accumulatedText.length === lastFlushedLength) { flushTimer = null; return; }
      lastFlushedLength = accumulatedText.length;
      const snapshot = accumulatedText;
      // Use startTransition to mark streaming updates as non-urgent
      // This keeps the UI responsive to user input during streaming
      startTransition(() => {
        setSessions(prev => prev.map(s => s.id === sessionId ? {
          ...s,
          messages: s.messages.map(m => m.id === assistantId ? { ...m, content: snapshot } : m)
        } : s));
      });
      flushTimer = null;
    };

    try {
      const response = await getAIResponse(
        userMsg.content,
        currentHistory.slice(0, -1),
        activeSession?.preferredModel || 'auto',
        (routing) => setRoutingInfo(routing),
        userMsg.image,
        userMsg.documents || [],
        userSettings.personification,
        (chunk) => {
          accumulatedText += chunk;
          // Throttle UI updates to ~3/sec — prevents markdown re-parse jank
          if (!flushTimer) {
            flushTimer = setTimeout(flushToUI, 300);
          }
        },
        abortControllerRef.current.signal
      );

      // Final flush — use POST-PROCESSED content, not raw streamed text
      // This ensures filler removal, trailing question stripping, etc. are visible
      if (flushTimer) clearTimeout(flushTimer);
      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        messages: s.messages.map(m => m.id === assistantId ? { ...m, content: response.content } : m)
      } : s));

      // Fire suggestions in background — don't block the main response
      const suggestionsPromise = generateFollowUpSuggestions(response.content, previewRouting.intent).catch(() => []);

      const savedAssistantMsg = await api.saveMessage(sessionId, {
        role: 'assistant',
        content: response.content,
        model: response.model,
        tokensUsed: response.tokens,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        groundingChunks: response.groundingChunks,
        routingContext: response.routingContext,
        timestamp: Date.now(),
      });
      
      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        messages: s.messages.map(m => m.id === assistantId ? savedAssistantMsg : m)
      } : s));

      // Apply suggestions when they arrive (non-blocking)
      suggestionsPromise.then(suggestions => {
        if (suggestions.length > 0) {
          startTransition(() => {
            setSessions(prev => prev.map(s => s.id === sessionId ? {
              ...s,
              messages: s.messages.map(m => m.id === savedAssistantMsg.id ? { ...m, suggestions } : m)
            } : s));
          });
        }
      });

      getStats(user.id).then(s => startTransition(() => setUserStats(s)));

      // Generate title in background — don't block UI
      if (currentHistory.length === 1 && (activeSession?.title === "New Chat" || !activeSession?.title)) {
        generateChatTitle(userMsg.content).then(newTitle => handleRenameSession(sessionId, newTitle)).catch(() => {});
      }
    } catch (error: any) {
      if (flushTimer) clearTimeout(flushTimer);
      if (error.name !== 'AbortError') {
        addToast(error.message, "error");
        setSessions(prev => prev.map(s => s.id === sessionId ? { 
          ...s, 
          messages: s.messages.filter(m => m.id !== assistantId) 
        } : s));
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = async (content: string, image?: MessageImage, docs?: AttachedDocument[]) => {
    if (!user || !activeSessionId || !activeSession || isLoading) return;
    try {
      setSessions(prev => prev.map(s => s.id === activeSessionId ? {
        ...s,
        messages: s.messages.map(m => ({ ...m, suggestions: undefined }))
      } : s));

      const savedUserMsg = await api.saveMessage(activeSessionId, { role: 'user', content, timestamp: Date.now(), image, documents: docs });
      const updatedMessages = [...activeSession.messages, savedUserMsg];
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: updatedMessages } : s));
      await requestAIResponse(activeSessionId, updatedMessages);
    } catch (error: any) { addToast(error.message, "error"); }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeSession || isLoading) return;
    const msgIndex = activeSession.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    try {
      const savedUserMsg = await api.saveMessage(activeSessionId, { role: 'user', content: newContent, timestamp: Date.now() });
      const updatedHistory = [...activeSession.messages.slice(0, msgIndex), savedUserMsg];
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: updatedHistory } : s));
      await requestAIResponse(activeSessionId, updatedHistory);
    } catch (error: any) { addToast(error.message, "error"); }
  };

  const handleRegenerate = async (messageId: string) => {
    if (!activeSession || isLoading) return;
    const msgIndex = activeSession.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;
    const history = activeSession.messages.slice(0, msgIndex);
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: history } : s));
    await requestAIResponse(activeSessionId, history);
  };

  const handleFeedback = (messageId: string, feedback: 'good' | 'bad' | null) => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? {
      ...s,
      messages: s.messages.map(m => m.id === messageId ? { ...m, feedback } : m)
    } : s));
  };

  const handleNewChat = useCallback(async () => { if (!user) return; const s = await api.createConversation("New Chat"); setSessions(p => [s, ...p]); setActiveSessionId(s.id); setView('chat'); if (window.innerWidth < 1024) setIsSidebarOpen(false); }, [user]);
  const handleSelectSession = useCallback((id: string) => { setActiveSessionId(id); api.getMessages(id, 100).then(m => startTransition(() => setSessions(p => p.map(s => s.id === id ? { ...s, messages: m } : s)))); }, []);
  const handleDeleteSession = useCallback((id: string) => api.deleteConversation(id).then(() => { setSessions(p => p.filter(s => s.id !== id)); if (activeSessionId === id) setActiveSessionId(''); }), [activeSessionId]);
  const handleRenameSession = useCallback((id: string, t: string) => api.updateConversation(id, { title: t }).then(() => setSessions(p => p.map(s => s.id === id ? { ...s, title: t } : s))), []);
  const handleToggleFavorite = useCallback((id: string) => { const sess = sessions.find(s => s.id === id); if (sess) api.updateConversation(id, { isFavorite: !sess.isFavorite }).then(() => setSessions(p => p.map(x => x.id === id ? { ...x, isFavorite: !x.isFavorite } : x))); }, [sessions]);
  const handleModelChange = useCallback((m: AIModel | 'auto') => { if (activeSessionId) api.updateConversation(activeSessionId, { preferredModel: m }).then(() => setSessions(p => p.map(s => s.id === activeSessionId ? { ...s, preferredModel: m } : s))); }, [activeSessionId]);
  const handleLogout = useCallback(() => { api.clearUserCache(); logout().then(() => { setUser(null); setSessions([]); setView('chat'); setIsSettingsOpen(false); }); }, []);

  const completeOnboarding = () => { setShowOnboarding(false); localStorage.setItem('nexus_onboarding_done', 'true'); };

  const handleSurveyComplete = (personification: string) => {
    const updatedSettings = { ...userSettings, personification };
    setUserSettings(updatedSettings);
    localStorage.setItem('nexus_user_settings', JSON.stringify(updatedSettings));
    localStorage.setItem('nexus_survey_done', 'true');
    setShowSurvey(false);
  };

  if (isAuthChecking) return <div className="h-screen w-full flex items-center justify-center bg-[var(--bg-primary)]"><div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" /></div>;
  
  if (showResetPassword) {
    return (
      <Suspense fallback={<LazyFallback />}>
      <ResetPasswordPage 
        onResetSuccess={() => {
          setShowResetPassword(false);
          setShowAuth(true);
          window.history.replaceState(null, '', window.location.pathname);
        }}
        onBackToAuth={() => {
          setShowResetPassword(false);
          setShowAuth(true);
          window.history.replaceState(null, '', window.location.pathname);
        }}
      />
      </Suspense>
    );
  }

  // Always render router so /privacy, /terms, /contact are accessible
  if (!user) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="*" element={
          <Suspense fallback={<LazyFallback />}>{showAuth ? <AuthPage onAuthSuccess={(u) => { setUser(u); setShowAuth(false); if (!localStorage.getItem('nexus_survey_done')) setShowSurvey(true); }} /> : <LandingPage onOpenAuth={() => setShowAuth(true)} />}</Suspense>
        } />
      </Routes>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden font-sans relative">
      {showSurvey && <Suspense fallback={<LazyFallback />}><OnboardingSurvey onComplete={handleSurveyComplete} userName={user.personification || user.email} /></Suspense>}
      <Sidebar sessions={sessions} activeSessionId={activeSessionId} onNewChat={handleNewChat} onSelectSession={handleSelectSession} view={view} onSetView={setView} stats={userStats} onDeleteSession={handleDeleteSession} onRenameSession={handleRenameSession} onToggleFavorite={handleToggleFavorite} onOpenSettings={() => setIsSettingsOpen(true)} searchInputRef={null as any} isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} user={user} />
      <main className="flex-1 flex flex-col min-w-0 relative">
        <Routes>
          <Route path="/" element={
            view === 'chat' && activeSession ? (
              <>
                <ChatArea session={activeSession} isLoading={isLoading} routingInfo={routingInfo} onExport={handleExportChat} onShare={() => {}} onModelChange={handleModelChange} onToggleSidebar={() => setIsSidebarOpen(true)} isSidebarOpen={isSidebarOpen} onRegenerate={handleRegenerate} onEditMessage={handleEditMessage} onFeedback={handleFeedback} theme={theme} onThemeToggle={handleThemeToggle} onSuggestionClick={(txt) => handleSendMessage(txt)} />
                {activeSession.messages.length === 0 ? (
                  <div className="message-input-center-container">
                    <div className="message-input-center-content">
                      <h2 className="message-input-center-heading">Hello! How Can I help you?</h2>
                      <MessageInput 
                        onSendMessage={handleSendMessage}
                        onStop={() => abortControllerRef.current?.abort()}
                        isDisabled={isLoading}
                        preferredModel={activeSession.preferredModel}
                        onModelChange={handleModelChange}
                        activeSessionId={activeSessionId}
                      />
                    </div>
                  </div>
                ) : (
                  <MessageInput 
                    onSendMessage={handleSendMessage}
                    onStop={() => abortControllerRef.current?.abort()}
                    isDisabled={isLoading}
                    preferredModel={activeSession.preferredModel}
                    onModelChange={handleModelChange}
                    activeSessionId={activeSessionId}
                  />
                )}
              </>
            ) : view === 'dashboard' ? (
              <Suspense fallback={<LazyFallback />}><Dashboard stats={userStats!} onUpgrade={() => setView('pricing')} /></Suspense>
            ) : view === 'pricing' ? (
              <Suspense fallback={<LazyFallback />}><Pricing onUpgrade={() => setView('billing')} onClose={() => setView('chat')} /></Suspense>
            ) : view === 'billing' ? (
              <Suspense fallback={<LazyFallback />}><Billing stats={userStats!} onCancel={() => {}} onUpgrade={() => setView('pricing')} onClose={() => setView('chat')} /></Suspense>
            ) : view === 'admin' ? (
              <Suspense fallback={<LazyFallback />}><AdminDashboard stats={getAdminStats()} /></Suspense>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                <div className="w-20 h-20 bg-emerald-500/5 rounded-3xl flex items-center justify-center mb-8 border border-white/5 shadow-2xl">
                  <img src={NexusLogo} alt="Nexus Logo" className="w-14 h-14 object-contain" />
                </div>
                <button onClick={handleNewChat} className="px-10 py-4 bg-emerald-500 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all">New Chat</button>
              </div>
            )
          } />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>
      </main>
      
      {showOnboarding && <Suspense fallback={<LazyFallback />}><MobileOnboarding onComplete={completeOnboarding} /></Suspense>}
      <Suspense fallback={null}><SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} userSettings={userSettings} onSave={(s) => { setUserSettings(s); localStorage.setItem('nexus_user_settings', JSON.stringify(s)); }} onPurgeHistory={() => api.purgeAllConversations().then(() => { setSessions([]); setActiveSessionId(''); })} onUpgrade={() => { setIsSettingsOpen(false); setView('pricing'); }} onLogout={handleLogout} user={user} stats={userStats} onThemeToggle={handleThemeToggle} theme={theme} /></Suspense>
      <Toast toasts={toasts} onRemove={removeToast} />
      </div>
    </ErrorBoundary>
  );
};

export default App;