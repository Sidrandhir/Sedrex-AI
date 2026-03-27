// src/App.tsx
// SESSION 8 CHANGES:
//   ✅ artifactCreated boolean flag — set from the first extraction result,
//      used in analytics.logQuery() instead of calling extractArtifactFromResponse()
//      a second time. Root cause: the old code ran extraction twice per response,
//      wasting CPU and causing a race condition where the second call could return
//      a different result (e.g. if _artifacts changed between the two calls due
//      to generateVersionedTitle scanning in-memory store).
//   ✅ All Session 7 logic preserved exactly (isDiff check, diagram extraction, etc.)

import React, { useState, useCallback, useEffect, useRef, lazy, Suspense, startTransition } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { startCheckout, openBillingPortal, detectCheckoutReturn } from './services/billingService';
import { preflightCheck } from './services/usageLimitService';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import MessageInput from './components/MessageInput';
import Toast, { ToastMessage } from './components/Toast';
import { ChatSession, Message, SedrexRoute, UserStats, User, AIModel, MessageImage, AttachedDocument } from './types';
import { getAIResponse, generateChatTitle, routePrompt, generateFollowUpSuggestions } from './services/aiService';
import { getStats } from './services/storageService';
import { getCurrentUser, logout } from './services/authService';
import { getAdminStats } from './services/analyticsService';
import { api } from './services/apiService';
import { persistenceService } from './services/persistenceService';
import { Icons } from './constants';
const SedrexLogo = '/sedrex-logo.svg';
import {
  loadArtifactsForSession,
  loadAllUserArtifacts,
  clearArtifacts,
  extractArtifactFromResponse,
  createArtifact,
  isPanelOpen,
  subscribeToArtifacts,
  storeDiagram,
  extractDiagramsFromResponse,
  storeImage,
  getArtifactsForSession,
  addImageFromMessage,
} from './services/artifactStore';
import { Routes, Route } from 'react-router-dom';
import Privacy from './components/Privacy';
import Terms from './components/Terms';
import Contact from './components/Contact';
import CommandPalette from './components/CommandPalette';
import { isSupabaseConfigured as initialConfigured, supabase } from './services/supabaseClient';
import { getProjectIndex } from './services/codebaseContext';
import { analytics } from './services/analyticsService';
import { storageService } from './services/storageService';

const Dashboard = lazy(() => import('./components/Dashboard'));
const Pricing = lazy(() => import('./components/Pricing'));
const Billing = lazy(() => import('./components/Billing'));
const AuthPage = lazy(() => import('./components/AuthPage'));
const LandingPage = lazy(() => import('./components/LandingPage'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const SettingsModal = lazy(() => import('./components/SettingsModal'));
const ArtifactPanel = lazy(() => import('./components/ArtifactPanel'));
const MobileOnboarding = lazy(() => import('./components/MobileOnboarding'));
const OnboardingSurvey = lazy(() => import('./components/OnboardingSurvey'));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage'));
const UpgradeModal      = lazy(() => import('./components/UpgradeModal'));
const LibraryView       = lazy(() => import('./components/LibraryView'));
const ArtifactsView     = lazy(() => import('./components/ArtifactsView'));
import { InstallBanner, UpdateBanner, usePWALaunchAction } from './components/InstallPrompt';
import { trackWebVitals, upgradeClicked, upgradeCompleted, pricingViewed } from './services/posthogService';

const LazyFallback = () => (
  <div className="flex items-center justify-center p-8">
    <div className="w-6 h-6 border-2 border-sedrex/20 border-t-sedrex rounded-full animate-spin" />
  </div>
);

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
  const [routingInfo, setRoutingInfo] = useState<SedrexRoute | null>(null);
  const [view, setView] = useState<'chat' | 'dashboard' | 'pricing' | 'billing' | 'admin' | 'library' | 'artifacts'>('chat');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [artifactPanelWidth, setArtifactPanelWidth] = useState(480);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeBlockReason, setUpgradeBlockReason] = useState('');

  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('sedrex_theme') as 'light' | 'dark') || 'dark'
  );

  const [userSettings, setUserSettings] = useState(() => {
    const saved = localStorage.getItem('sedrex_user_settings');
    return saved ? JSON.parse(saved) : {
      personification: 'Precise and verification-first',
      language: 'en',
    };
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Stripe checkout return detection ───────────────────────────
  useEffect(() => {
    const result = detectCheckoutReturn();
    if (result === 'success') {
      addToast('Upgrade successful! Welcome to Pro.', 'success');
      upgradeCompleted('pro');
      // Reload user stats so tier badge updates immediately
      if (user) getStats(user.id).then(s => s && setUserStats(s));
    } else if (result === 'cancelled') {
      addToast('Upgrade cancelled. You can upgrade anytime.', 'info');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = Math.random().toString(36).substr(2, 9);
      setToasts(prev => [...prev.filter(t => t.message !== message), { id, message, type }]);
    }, []
  );
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  useEffect(() => {
    const unsub = subscribeToArtifacts(() => {
      setArtifactPanelOpen(isPanelOpen());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = (e?.reason?.message || '').toLowerCase();
      if (msg.includes('load failed') || msg.includes('failed to fetch') || msg.includes('network'))
        e.preventDefault();
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sedrex_theme', theme);
  }, [theme]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setIsCommandPaletteOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setIsSidebarOpen(true); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleThemeToggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    analytics.themeToggle(next);
    setTheme(next);
  };

  const handleToggleSidebar = () => {
    analytics.sidebarToggle(isSidebarOpen ? 'close' : 'open');
    setIsSidebarOpen(prev => !prev);
  };

  const handleSetView = useCallback((v: 'chat' | 'dashboard' | 'pricing' | 'billing' | 'admin' | 'library' | 'artifacts') => {
    analytics.viewChange(v as string);
    setView(v);
  }, []);

  // ── PWA shortcut actions (launched from home screen shortcuts) ──
  usePWALaunchAction({
    'new-chat':  () => { handleSetView('chat'); handleNewChat(); },
    'dashboard': () => handleSetView('dashboard'),
  });

  // ── Stripe upgrade handler ──────────────────────────────────────
  const handleUpgrade = useCallback(async () => {
    if (!user) { setShowAuth(true); return; }
    setShowUpgradeModal(false);
    upgradeClicked('upgrade_handler', user.tier ?? 'free');
    try {
      await startCheckout(user.id, user.email, 'pro');
    } catch (err: any) {
      addToast(err.message ?? 'Could not open checkout. Please try again.', 'error');
    }
  }, [user]);

  // ── Open upgrade modal (e.g. when limit hit) ───────────────────
  const handleShowUpgrade = useCallback((reason = '') => {
    setUpgradeBlockReason(reason);
    setShowUpgradeModal(true);
  }, []);

  // ── Stripe portal handler (manage subscription / cancel) ───────
  const handleManageBilling = useCallback(async () => {
    if (!user) return;
    try {
      await openBillingPortal(user.id);
    } catch (err: any) {
      // If no Stripe customer yet, fall back to checkout
      handleUpgrade();
    }
  }, [user]);

  useEffect(() => {
    if (!configured) { setIsAuthChecking(false); return; }
    const hash = window.location.hash;
    const sp = new URLSearchParams(window.location.search);
    if (hash.includes('type=recovery') || sp.get('type') === 'recovery') {
      setShowResetPassword(true); setIsAuthChecking(false); return;
    }
    const { data: { subscription } } = supabase!.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setShowResetPassword(true);
    });
    getCurrentUser().then(u => {
      setUser(u);
      if (u) {
        analytics.startSession(u.id, { email: u.email, tier: u.tier, name: u.personification });
        if (!localStorage.getItem('sedrex_survey_done')) setShowSurvey(true);
        if (window.innerWidth < 1024 && !localStorage.getItem('sedrex_onboarding_done'))
          setShowOnboarding(true);
        trackWebVitals();
      }
    }).finally(() => setIsAuthChecking(false));
    return () => subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    if (!user) return;

    const controller = new AbortController();
    let isMounted = true;

    (async () => {
      try {
        const chatData = await api.loadInitialChatData(50);
        if (!isMounted || controller.signal.aborted) return;

        if (chatData.sessions.length > 0) {
          const lastVisitedId = persistenceService.getLastActiveSessionId();
          const sessionIds = new Set(chatData.sessions.map((s: any) => s.id));
          const restoreId = (lastVisitedId && sessionIds.has(lastVisitedId))
            ? lastVisitedId
            : chatData.sessions[0].id;

          const localMsgs = persistenceService.loadMessages(restoreId);

          startTransition(() => {
            setSessions(chatData.sessions);
            setActiveSessionId(restoreId);
            if (localMsgs.length > 0) {
              setSessions(prev =>
                prev.map(s => s.id === restoreId ? { ...s, messages: localMsgs } : s)
              );
            }
          });

          if (localMsgs.length === 0) setIsLoading(true);
          api.getMessages(restoreId, 100).then(dbMsgs => {
            if (isMounted) {
              if (dbMsgs.length > 0) {
                startTransition(() =>
                  setSessions(prev =>
                    prev.map(s => s.id === restoreId ? { ...s, messages: dbMsgs } : s)
                  )
                );
                // Scan loaded messages for generated images — zero DB calls
                dbMsgs.forEach(msg => {
                  if (msg.generatedImageUrl) {
                    const label = msg.content?.slice(0, 40) || 'Generated Image';
                    addImageFromMessage(msg.id, restoreId, user.id, label, msg.generatedImageUrl, msg.timestamp);
                  }
                });
              }
              setIsLoading(false);
            }
          }).catch(() => { setIsLoading(false); });
        }

        await new Promise(r => setTimeout(r, 1000));
        if (!isMounted) return;

        const [stats, cloudSessions] = await Promise.all([
          getStats(user.id),
          api.getConversations(50, 0),
        ]);

        if (!isMounted) return;
        if (stats) startTransition(() => setUserStats(stats));

        if (cloudSessions.length > 0) {
          const firstId = cloudSessions[0].id;
          const cloudMessages = await api.getMessages(firstId, 50, true);

          if (!isMounted) return;
          startTransition(() => {
            setSessions(prev => {
              const merged = cloudSessions.map(cs => {
                const existing = prev.find(p => p.id === cs.id);
                return (existing?.messages?.length)
                  ? { ...cs, messages: existing.messages }
                  : cs;
              });
              prev.forEach(local => {
                if (!merged.find(c => c.id === local.id)) {
                  merged.push(local);
                }
              });
              return merged.sort((a, b) => b.lastModified - a.lastModified);
            });

            if (!activeSessionId) {
              setActiveSessionId(firstId);
            }
          });

          api.loadSessionPreviews(cloudSessions.slice(0, 5).map(s => s.id));
        }

        setTimeout(() => {
          loadAllUserArtifacts(user.id, true).catch(() => { }); // metadata only — image content loaded on demand
        }, 500);
        if (cloudSessions[0]?.id) {
          loadArtifactsForSession(cloudSessions[0].id, false).catch(() => { });
        }

        // Populate Library images from already-loaded messages — zero DB calls
        setTimeout(() => {
          setSessions(prev => {
            prev.forEach(session => {
              session.messages.forEach(msg => {
                if (msg.generatedImageUrl) {
                  const label = msg.content?.slice(0, 40) || 'Generated Image';
                  addImageFromMessage(msg.id, session.id, user.id, label, msg.generatedImageUrl, msg.timestamp);
                }
              });
            });
            return prev; // no state change, just side-effect scan
          });
        }, 800);

      } catch (error) {
        if (!isMounted) return;
        console.error('[APP] Error in hyper-load initialization:', error);
      }
    })();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [user]);

  useEffect(() => {
    if (!activeSessionId) return;
    const timer = setTimeout(() => {
      loadArtifactsForSession(activeSessionId).catch(() => { });
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeSessionId]);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const handleExportChat = useCallback(() => {
    if (!activeSession || activeSession.messages.length === 0) return;

    let md = `# ${activeSession.title || 'Chat Export'}\n\n`;
    md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
    activeSession.messages.forEach(msg => {
      const role = msg.role === 'user' ? '**You**' : '**SEDREX**';
      md += `### ${role}\n\n${msg.content}\n\n---\n\n`;
    });
    const filename = `${(activeSession.title || 'chat').replace(/[^a-z0-9]/gi, '_')}_sedrex_export.md`;

    analytics.exportChat(activeSessionId);
    if (user) {
      storageService.uploadExport(md, filename, user.id, activeSessionId).catch(() => { });
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS && navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], filename)] })) {
      navigator.share({ files: [new File([blob], filename, { type: blob.type })] })
        .catch(() => window.open(URL.createObjectURL(blob), '_blank'));
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  }, [activeSession, activeSessionId, user]);

  const requestAIResponse = async (sessionId: string, currentHistory: Message[]) => {
    if (!user || isLoading) return;

    // ── Usage limit preflight — blocked only when limits are actually enforced ──
    const blockReason = preflightCheck(userStats);
    if (blockReason) {
      handleShowUpgrade(blockReason);
      return;
    }
    setIsLoading(true);
    abortControllerRef.current = new AbortController();
    const userMsg = currentHistory[currentHistory.length - 1];
    const previewRoute = routePrompt(userMsg.content, !!(userMsg.images?.length || userMsg.image), (userMsg.documents?.length || 0) > 0);
    const assistantId = 'assistant-' + Math.random().toString(36).substr(2, 9);
    const startTime = Date.now();

    setSessions(prev => prev.map(s => s.id === sessionId ? {
      ...s,
      messages: [...currentHistory, {
        id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), model: previewRoute.model,
      }],
    } : s));

    let accumulatedText = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let lastFlushedLength = 0;

    // Adaptive flush: fast at start (user is watching), slower on long responses
    const flushInterval = () => {
      const len = accumulatedText.length;
      if (len < 300)  return 16;   // first ~50 words — one animation frame
      if (len < 1500) return 40;   // medium response — 40ms
      return 80;                   // long response — 80ms to limit re-renders
    };

    const flushToUI = () => {
      if (accumulatedText.length === lastFlushedLength) { flushTimer = null; return; }
      lastFlushedLength = accumulatedText.length;
      const snapshot = accumulatedText;
      startTransition(() => {
        setSessions(prev => prev.map(s => s.id === sessionId ? {
          ...s,
          messages: s.messages.map(m => m.id === assistantId ? { ...m, content: snapshot } : m),
        } : s));
      });
      flushTimer = null;
    };

    try {
      const response = await getAIResponse(
        userMsg.content, currentHistory.slice(0, -1),
        activeSession?.preferredModel || 'auto',
        routing => setRoutingInfo(routing),
        userMsg.images || (userMsg.image ? [userMsg.image] : []),
        userMsg.documents || [],
        userSettings.personification,
        chunk => {
          accumulatedText += chunk;
          if (!flushTimer) flushTimer = setTimeout(flushToUI, flushInterval());
        },
        abortControllerRef.current.signal,
        getArtifactsForSession(sessionId).map(a => `[ARTIFACT: ${a.title}]`).join('\n')
      );
      if (flushTimer) clearTimeout(flushTimer);

      let finalContent = response.content;

      // ══════════════════════════════════════════════════════════════
      // SESSION 8: ARTIFACT EXTRACTION WITH BOOLEAN FLAG
      //
      // ROOT CAUSE OF OLD BUG (fixed here):
      // analytics.logQuery() called extractArtifactFromResponse() a
      // SECOND time after it was already called above. This caused:
      //   1. Double CPU cost on every response with code
      //   2. generateVersionedTitle() scanning _artifacts twice —
      //      the second call sees the artifact already inserted by
      //      the first call, so it returns "Title v2" instead of
      //      "Title", producing a wrong artifactCreated=false reading
      //      when the title mismatch causes the second result to differ
      //
      // FIX: Capture a boolean flag `artifactWasCreated` from the
      // first extraction. Pass this flag to logQuery() instead of
      // re-running extraction. Zero behavioral change in artifact
      // panel — artifact is still created exactly once.
      //
      // SESSION 7: DIFF RESPONSE HANDLING (preserved)
      // When response.isDiff is true, skip all extraction.
      // ══════════════════════════════════════════════════════════════

      // SESSION 8: Track whether an artifact was created in THIS response
      // so analytics can log it without running extraction a second time.
      let artifactWasCreated = false;

      if (!response.isDiff) {
        const extracted = extractArtifactFromResponse(response.content, userMsg.content);

        if (extracted && user) {
          // SESSION 8: Set the flag from the FIRST (and only) extraction result
          artifactWasCreated = true;

          createArtifact({
            sessionId,
            userId:   user.id,
            title:    extracted.title,
            language: extracted.language,
            content:  extracted.content,
            type:     extracted.type,
            filePath: extracted.filePath,
          }).catch(() => { });
          finalContent = extracted.reducedResponse;
        }

        // Extract & Store Diagrams for Sidebar
        const diagramCodes = extractDiagramsFromResponse(response.content);
        if (diagramCodes.length > 0 && user) {
          diagramCodes.forEach(dg => {
            storeDiagram({
              sessionId,
              userId:   user.id,
              title:    'Architecture Diagram',
              language: 'mermaid',
              content:  dg,
              type:     'diagram',
            }).catch(() => { });
          });
        }
      }

      // Store Generated Image (always, regardless of isDiff)
      if (response.generatedImageUrl && user) {
        const safePrompt = userMsg.content.replace(/[^a-zA-Z0-9\s]/g, '').trim();
        const shortName = safePrompt.length > 30 ? safePrompt.slice(0, 30) + '...' : safePrompt;
        const imgTitle = `${shortName || 'Generated Image'} - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.png`;

        storeImage(sessionId, user.id, imgTitle, response.generatedImageUrl).catch(() => { });
      }

      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        messages: s.messages.map(m => m.id === assistantId ? { ...m, content: finalContent, generatedImageUrl: response.generatedImageUrl } : m),
      } : s));

      const suggestionsPromise = generateFollowUpSuggestions(response.content, previewRoute.intent).catch(() => []);
      const savedMsg = await api.saveMessage(sessionId, {
        role: 'assistant', content: finalContent,
        model: response.model, tokensUsed: response.tokens,
        inputTokens: response.inputTokens, outputTokens: response.outputTokens,
        groundingChunks: response.groundingChunks,
        routingContext: response.routingContext as any, timestamp: Date.now(),
        generatedImageUrl: response.generatedImageUrl,
      });

      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        messages: s.messages.map(m => m.id === assistantId ? {
          ...savedMsg,
          generatedImageUrl: response.generatedImageUrl || savedMsg.generatedImageUrl,
          // Preserve verification + thinking data that isn't stored in the DB
          confidence: response.confidence,
          thinkingContent: response.thinkingContent,
        } : m),
      } : s));

      suggestionsPromise.then(suggestions => {
        if (suggestions.length > 0) {
          startTransition(() => {
            setSessions(prev => prev.map(s => s.id === sessionId ? {
              ...s,
              messages: s.messages.map(m => m.id === savedMsg.id ? { ...m, suggestions } : m),
            } : s));
          });
        }
      });

      getStats(user.id).then(s => startTransition(() => setUserStats(s)));

      const responseTimeMs = Date.now() - startTime;
      analytics.logQuery({
        userId: user.id,
        conversationId: sessionId,
        messageId: savedMsg.id,
        promptText: userMsg.content,
        responseText: finalContent.slice(0, 2000),
        intent: previewRoute.intent,
        modelUsed: response.routingContext?.engine || String(response.model),
        engine: response.routingContext?.engine,
        agentType: response.routingContext?.agentType,
        agentProvider: response.routingContext?.agentProvider,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.tokens,
        responseTimeMs,
        hasImage: !!userMsg.image,
        hasDocuments: (userMsg.documents?.length || 0) > 0,
        hasCodebaseRef: !!userMsg.codebaseRef,
        // SESSION 8: Use the flag captured during first extraction — NOT a second call
        artifactCreated: artifactWasCreated,
        slashCommand: userMsg.content.startsWith('/') ? userMsg.content.split(' ')[0].slice(1) : undefined,
        hadError: false,
      });

      const isUntitled = !activeSession?.title ||
        ['New Chat', 'New Session', ''].includes(activeSession.title.trim());
      if (currentHistory.length === 1 && isUntitled) {
        generateChatTitle(userMsg.content).then(t => handleRenameSession(sessionId, t)).catch(() => { });
      }

    } catch (error: any) {
      if (flushTimer) clearTimeout(flushTimer);
      if (error.name !== 'AbortError') {
        setSessions(prev => prev.map(s => s.id === sessionId ? {
          ...s,
          messages: s.messages.map(m => m.id === assistantId ? {
            ...m,
            content: 'SEDREX is handling high traffic right now. Your request is safe — please press Regenerate in a few seconds.',
          } : m),
        } : s));
        analytics.logQuery({
          userId: user.id,
          conversationId: sessionId,
          promptText: userMsg.content,
          intent: previewRoute.intent,
          hadError: true,
          errorType: error.message?.slice(0, 100),
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = async (content: string, images?: MessageImage[], docs?: AttachedDocument[]) => {
    if (!user || !activeSessionId || !activeSession || isLoading) return;
    try {
      setSessions(prev => prev.map(s => s.id === activeSessionId ? {
        ...s, messages: s.messages.map(m => ({ ...m, suggestions: undefined })),
      } : s));
      const savedUserMsg = await api.saveMessage(activeSessionId, {
        role: 'user',
        codebaseRef: getProjectIndex() ? { projectName: getProjectIndex()!.projectName, totalFiles: getProjectIndex()!.totalFiles } : undefined,
        content, timestamp: Date.now(), images, documents: docs,
      });
      const updatedMessages = [...activeSession.messages, savedUserMsg];
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: updatedMessages } : s));
      await requestAIResponse(activeSessionId, updatedMessages);
    } catch (err: any) { addToast(err.message, 'error'); }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeSession || isLoading) return;
    const idx = activeSession.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    try {
      analytics.editMessage(messageId, activeSessionId);
      const savedMsg = await api.saveMessage(activeSessionId, { role: 'user', content: newContent, timestamp: Date.now() });
      const updated = [...activeSession.messages.slice(0, idx), savedMsg];
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: updated } : s));
      await requestAIResponse(activeSessionId, updated);
    } catch (err: any) { addToast(err.message, 'error'); }
  };

  const handleRegenerate = async (messageId: string) => {
    if (!activeSession || isLoading) return;
    const idx = activeSession.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    analytics.regenerate(messageId, activeSessionId);
    const history = activeSession.messages.slice(0, idx);
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: history } : s));
    await requestAIResponse(activeSessionId, history);
  };

  const handleFeedback = (messageId: string, feedback: 'good' | 'bad' | null) => {
    if (feedback) analytics.feedback(messageId, feedback, activeSessionId);
    setSessions(prev => prev.map(s => s.id === activeSessionId ? {
      ...s, messages: s.messages.map(m => m.id === messageId ? { ...m, feedback } : m),
    } : s));
  };

  const handleNewChat = useCallback(async () => {
    if (!user) return;
    analytics.newChatCreated();
    const s = await api.createConversation('New Chat');
    setSessions(p => [s, ...p]);
    setActiveSessionId(s.id);
    analytics.viewChange('chat');
    setView('chat');
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }, [user]);

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id);
    try { localStorage.setItem('sedrex_cache_active_session', id); } catch { }
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
    api.getMessages(id, 100).then(m =>
      startTransition(() => setSessions(p => p.map(s => s.id === id ? { ...s, messages: m } : s)))
    );
  }, []);

  useEffect(() => {
    const handler = () => setIsSidebarOpen(false);
    window.addEventListener('sedrex:close-sidebar', handler);
    return () => window.removeEventListener('sedrex:close-sidebar', handler);
  }, []);

  const handleDeleteSession = useCallback((id: string) =>
    api.deleteConversation(id).then(() => {
      setSessions(p => p.filter(s => s.id !== id));
      if (activeSessionId === id) setActiveSessionId('');
    }), [activeSessionId]);

  const handleRenameSession = useCallback((id: string, t: string) =>
    api.updateConversation(id, { title: t }).then(() =>
      setSessions(p => p.map(s => s.id === id ? { ...s, title: t } : s))
    ), []);

  const handleToggleFavorite = useCallback((id: string) => {
    const sess = sessions.find(s => s.id === id);
    if (sess) api.updateConversation(id, { isFavorite: !sess.isFavorite }).then(() =>
      setSessions(p => p.map(x => x.id === id ? { ...x, isFavorite: !x.isFavorite } : x))
    );
  }, [sessions]);

  const handleModelChange = useCallback((m: AIModel | 'auto') => {
    if (activeSessionId) {
      const currentModel = sessions.find(s => s.id === activeSessionId)?.preferredModel ?? 'auto';
      analytics.modelChange(String(currentModel), String(m));
      api.updateConversation(activeSessionId, { preferredModel: m }).then(() =>
        setSessions(p => p.map(s => s.id === activeSessionId ? { ...s, preferredModel: m } : s))
      );
    }
  }, [activeSessionId, sessions]);

  const handleLogout = useCallback(() => {
    analytics.endSession('logout');
    api.clearUserCache();
    clearArtifacts();
    logout().then(() => { setUser(null); setSessions([]); setView('chat'); setIsSettingsOpen(false); });
  }, []);

  const completeOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem('sedrex_onboarding_done', 'true');
  };

  const handleSurveyComplete = (personification: string) => {
    const updated = { ...userSettings, personification };
    setUserSettings(updated);
    localStorage.setItem('sedrex_user_settings', JSON.stringify(updated));
    localStorage.setItem('sedrex_survey_done', 'true');
    setShowSurvey(false);
  };

  if (isAuthChecking)
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-[var(--bg-primary)]">
        <div className="w-12 h-12 border-4 border-sedrex/20 border-t-sedrex rounded-full animate-spin" />
        <span className="app-init-text">SEDREX · Initializing</span>
      </div>
    );

  if (showResetPassword) {
    return (
      <Suspense fallback={<LazyFallback />}>
        <ResetPasswordPage
          onResetSuccess={() => { setShowResetPassword(false); setShowAuth(true); window.history.replaceState(null, '', window.location.pathname); }}
          onBackToAuth={() => { setShowResetPassword(false); setShowAuth(true); window.history.replaceState(null, '', window.location.pathname); }}
        />
      </Suspense>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="*" element={
          <Suspense fallback={<LazyFallback />}>
            {showAuth
              ? <AuthPage onAuthSuccess={u => { setUser(u); setShowAuth(false); if (!localStorage.getItem('sedrex_survey_done')) setShowSurvey(true); }} />
              : <LandingPage onOpenAuth={() => setShowAuth(true)} />
            }
          </Suspense>
        } />
      </Routes>
    );
  }

  return (
    <ErrorBoundary>
      <div style={{
        display: 'flex', height: '100dvh', width: '100vw',
        overflow: 'hidden', background: 'var(--bg-primary)',
        color: 'var(--text-primary)', fontFamily: 'sans-serif', position: 'relative',
      }}>

        {showSurvey && (
          <Suspense fallback={<LazyFallback />}>
            <OnboardingSurvey onComplete={handleSurveyComplete} userName={user.personification || user.email} />
          </Suspense>
        )}

        <Sidebar
          id="app-sidebar"
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          view={view}
          onSetView={handleSetView}
          stats={userStats}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          onToggleFavorite={handleToggleFavorite}
          onOpenSettings={() => { analytics.settingsOpen(); setIsSettingsOpen(true); }}
          searchInputRef={searchInputRef}
          isOpen={isSidebarOpen}
          onToggle={handleToggleSidebar}
          onOpenCommandPalette={() => { analytics.commandPaletteOpen(); setIsCommandPaletteOpen(true); }}
          user={user}
          onRefreshArtifacts={() => loadAllUserArtifacts(user.id).catch(() => { })}
        />

        <main style={{
          flex: 1, minWidth: 0, width: 0,
          display: 'flex', flexDirection: 'row',
          height: '100dvh', overflow: 'hidden', position: 'relative',
        }}>

          <div style={{
            flex: 1, minWidth: 0,
            display: 'flex', flexDirection: 'column',
            height: '100dvh', overflow: 'hidden',
          }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Routes>
                <Route path="/" element={
                  view === 'chat' && activeSession ? (
                    <ChatArea
                      session={activeSession}
                      isLoading={isLoading}
                      routingInfo={routingInfo}
                      onExport={handleExportChat}
                      onShare={() => { }}
                      onModelChange={handleModelChange}
                      onToggleSidebar={handleToggleSidebar}
                      isSidebarOpen={isSidebarOpen}
                      onRegenerate={handleRegenerate}
                      onEditMessage={handleEditMessage}
                      onFeedback={handleFeedback}
                      theme={theme}
                      onThemeToggle={handleThemeToggle}
                      onSuggestionClick={txt => handleSendMessage(txt)}
                    />
                  ) : view === 'dashboard' ? (
                    <Suspense fallback={<LazyFallback />}>
                      <Dashboard stats={userStats!} onUpgrade={() => handleSetView('pricing')} />
                    </Suspense>
                  ) : view === 'pricing' ? (
                    <Suspense fallback={<LazyFallback />}>
                      <Pricing onUpgrade={handleUpgrade} onClose={() => handleSetView('chat')} currentTier={user?.tier} />
                    </Suspense>
                  ) : view === 'billing' ? (
                    <Suspense fallback={<LazyFallback />}>
                      <Billing stats={userStats!} userId={user?.id ?? ''} onCancel={handleManageBilling} onUpgrade={handleUpgrade} onClose={() => handleSetView('chat')} />
                    </Suspense>
                  ) : view === 'admin' ? (
                    <Suspense fallback={<LazyFallback />}>
                      <AdminDashboard />
                    </Suspense>
                  ) : view === 'library' ? (
                    <Suspense fallback={<LazyFallback />}>
                      <LibraryView onClose={() => handleSetView('chat')} userId={user?.id} />
                    </Suspense>
                  ) : view === 'artifacts' ? (
                    <Suspense fallback={<LazyFallback />}>
                      <ArtifactsView onClose={() => handleSetView('chat')} />
                    </Suspense>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                      <div className="empty-state-logo-container">
                        <img src={SedrexLogo} alt="SEDREX" className="empty-state-logo" />
                      </div>
                      <div className="empty-state-label">SEDREX · Ready</div>
                      <button onClick={handleNewChat} className="new-chat-button">New Chat</button>
                    </div>
                  )
                } />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/contact" element={<Contact />} />
              </Routes>
            </div>

            {view === 'chat' && activeSession && (
              <div style={{ flexShrink: 0, width: '100%', display: 'block', alignSelf: 'stretch' }}>
                <MessageInput
                  onSendMessage={handleSendMessage}
                  onStop={() => abortControllerRef.current?.abort()}
                  isDisabled={isLoading}
                  preferredModel={activeSession.preferredModel}
                  onModelChange={handleModelChange}
                  activeSessionId={activeSessionId}
                />
              </div>
            )}
          </div>

          {artifactPanelOpen && (
            <Suspense fallback={null}>
              <ArtifactPanel onWidthChange={setArtifactPanelWidth} />
            </Suspense>
          )}
        </main>

        {showOnboarding && (
          <Suspense fallback={<LazyFallback />}>
            <MobileOnboarding onComplete={completeOnboarding} />
          </Suspense>
        )}

        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            userSettings={userSettings}
            onSave={s => {
              setUserSettings(s);
              localStorage.setItem('sedrex_user_settings', JSON.stringify(s));
            }}
            onPurgeHistory={() =>
              api.purgeAllConversations().then(() => { setSessions([]); setActiveSessionId(''); })
            }
            onUpgrade={() => { setIsSettingsOpen(false); handleSetView('pricing'); }}
            onLogout={handleLogout}
            user={user}
            stats={userStats}
            onThemeToggle={handleThemeToggle}
            theme={theme}
          />
        </Suspense>

        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNewChat={handleNewChat}
          onOpenSettings={() => { analytics.settingsOpen(); setIsSettingsOpen(true); }}
          onGoChat={() => handleSetView('chat')}
          onGoDashboard={() => handleSetView('dashboard')}
          onGoPricing={() => handleSetView('pricing')}
          onGoBilling={() => handleSetView('billing')}
          onToggleTheme={handleThemeToggle}
        />

        {/* Upgrade Modal — shown when usage limit is hit */}
        {showUpgradeModal && user && (
          <Suspense fallback={null}>
            <UpgradeModal
              reason={upgradeBlockReason}
              currentTier={user.tier}
              onUpgrade={handleUpgrade}
              onClose={() => setShowUpgradeModal(false)}
              onViewPricing={() => { setShowUpgradeModal(false); handleSetView('pricing'); }}
            />
          </Suspense>
        )}

        <Toast toasts={toasts} onRemove={removeToast} />
        <UpdateBanner />
        <InstallBanner />
      </div>
    </ErrorBoundary>
  );
};

export default App;