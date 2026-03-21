import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import './ChatSidebar.css';
import { ChatSession, UserStats, User } from '../types';
import { Icons } from '../constants';
import {
  useArtifacts, setActiveArtifact, openPanel, Artifact,
} from '../services/artifactStore';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  view: 'chat' | 'dashboard' | 'admin' | 'pricing' | 'billing';
  onSetView: (view: 'chat' | 'dashboard' | 'admin' | 'pricing' | 'billing') => void;
  stats: UserStats | null;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenSettings: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  isOpen: boolean;
  onToggle: () => void;
  onOpenCommandPalette: () => void;
  user: User;
  onRefreshArtifacts?: () => void;
  id?: string;
}

// ── Language icon map ──────────────────────────────────────────────
const FILE_ICONS: Record<string, string> = {
  typescript: '⚡', ts: '⚡', tsx: '⚛', javascript: '⚡', js: '⚡', jsx: '⚛',
  python: '🐍', rust: '🦀', go: '🔹', java: '☕', kotlin: '🟣',
  css: '🎨', scss: '🎨', html: '🌐', sql: '🗄️', json: '{ }',
  yaml: '⚙️', bash: '💻', sh: '💻', markdown: '📝', text: '📄',
  mermaid: '🔷',
};
const langIcon  = (lang: string) => FILE_ICONS[lang.toLowerCase()] ?? '📄';

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TSX',
  javascript: 'JavaScript', js: 'JavaScript', jsx: 'JSX',
  python: 'Python', rust: 'Rust', go: 'Go', java: 'Java',
  css: 'CSS', scss: 'SCSS', html: 'HTML', sql: 'SQL',
  json: 'JSON', yaml: 'YAML', bash: 'Shell', sh: 'Shell',
  markdown: 'Markdown', mermaid: 'Diagram', text: 'Text',
};
const langLabel = (lang: string) => LANG_LABELS[lang.toLowerCase()] ?? lang.toUpperCase();

// ── Artifact row ───────────────────────────────────────────────────
const ArtifactRow = ({
  artifact,
  onOpen,
}: {
  artifact: Artifact;
  onOpen: (id: string) => void;
}) => (
  <button
    className="artifact-sidebar-row"
    onClick={() => onOpen(artifact.id)}
    title={`${artifact.title} — ${artifact.lineCount} lines`}
  >
    <span className="artifact-sidebar-icon">{langIcon(artifact.language)}</span>
    <div className="artifact-sidebar-info">
      <span className="artifact-sidebar-title">{artifact.title}</span>
      <span className="artifact-sidebar-meta">
        {langLabel(artifact.language)} · {artifact.lineCount} lines
      </span>
    </div>
    <svg
      className="artifact-sidebar-arrow"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      style={{ width: 10, height: 10, flexShrink: 0 }}
    >
      <path d="M2 6h8M6 2l4 4-4 4" />
    </svg>
  </button>
);

// ── Section header with optional refresh button ────────────────────
const SectionHeader = ({
  label,
  icon,
  count,
  countBadgeStyle,
  isOpen: expanded,
  onToggle,
  onRefresh,
}: {
  label:            string;
  icon:             React.ReactNode;
  count:            number;
  countBadgeStyle?: React.CSSProperties;
  isOpen:           boolean;
  onToggle:         () => void;
  onRefresh?:       () => void;
}) => (
  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
    <button
      onClick={onToggle}
      className="sidebar-section-header"
      aria-expanded={expanded}
      style={{ flex: 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        <span>{label}</span>
        {count > 0 && (
          <span style={countBadgeStyle ?? {
            background: 'var(--accent)', color: '#000',
            borderRadius: 10, fontSize: 9, fontWeight: 700,
            padding: '1px 5px', lineHeight: 1.6,
          }}>
            {count}
          </span>
        )}
      </div>
      <span style={{ fontSize: 9 }}>{expanded ? '▼' : '▶'}</span>
    </button>

    {onRefresh && (
      <button
        onClick={e => { e.stopPropagation(); onRefresh(); }}
        title={`Refresh ${label}`}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px 6px', color: 'var(--text-secondary)',
          borderRadius: 6, fontSize: 13, lineHeight: 1,
          transition: 'color 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
      >
        ↻
      </button>
    )}
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════

const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  view,
  onSetView,
  stats,
  onDeleteSession,
  onRenameSession,
  onToggleFavorite,
  onOpenSettings,
  searchInputRef,
  isOpen,
  onToggle,
  onOpenCommandPalette,
  user,
  onRefreshArtifacts,
  id,
}) => {
  const [searchTerm,        setSearchTerm]        = useState('');
  const [debouncedSearch,   setDebouncedSearch]   = useState('');
  const [editingId,         setEditingId]         = useState<string | null>(null);
  const [editValue,         setEditValue]         = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [showFavorites,     setShowFavorites]     = useState(true);
  const [showChats,         setShowChats]         = useState(true);
  const [showArtifacts,     setShowArtifacts]     = useState(true);
  const [showDiagrams,      setShowDiagrams]      = useState(true);
  const [showImages,        setShowImages]        = useState(true);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Artifact store
  const { artifacts, diagrams, images } = useArtifacts();

  const handleOpenArtifact = useCallback((id: string) => {
    setActiveArtifact(id);
    openPanel();
  }, []);

  // ── Debounced search ──────────────────────────────────────────
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 250);
  }, []);

  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, []);

  // Escape closes sidebar on mobile
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggle(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onToggle]);

  // ── Filtered sessions ─────────────────────────────────────────
  const filteredSessions = useMemo(() => {
    let list = sessions;
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.toLowerCase();
      list = sessions.filter(s => s.title.toLowerCase().includes(term));
    }
    return list.slice(0, 50);
  }, [sessions, debouncedSearch]);

  const favorites    = filteredSessions.filter(s =>  s.isFavorite);
  const regular      = filteredSessions.filter(s => !s.isFavorite);
  const hasSearch    = debouncedSearch.trim().length > 0;
  const hasNoResults = hasSearch && filteredSessions.length === 0;

  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 1024;

  // ── Session item handlers ─────────────────────────────────────
  const startEditing = (e: React.MouseEvent, s: ChatSession) => {
    e.stopPropagation();
    setEditingId(s.id); setEditValue(s.title); setConfirmingDeleteId(null);
  };

  const saveEdit = (sessionId: string) => {
    if (editValue.trim()) onRenameSession(sessionId, editValue.trim());
    setEditingId(null);
  };

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (confirmingDeleteId === sessionId) { onDeleteSession(sessionId); setConfirmingDeleteId(null); }
    else { setConfirmingDeleteId(sessionId); setEditingId(null); }
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); setConfirmingDeleteId(null);
  };

  const handleSessionClick = (sessionId: string) => {
    onSelectSession(sessionId); onSetView('chat');
    if (isMobile() && isOpen) onToggle();
  };

  // ── Render session item ───────────────────────────────────────
  const renderSessionItem = (session: ChatSession) => {
    const isActive     = activeSessionId === session.id && view === 'chat';
    const isConfirming = confirmingDeleteId === session.id;
    if (!isOpen && !isMobile()) return null;

    return (
      <div
        key={session.id}
        onClick={() => !isConfirming && handleSessionClick(session.id)}
        className={[
          'group relative flex items-center w-full p-2.5 rounded-xl text-[13px] transition-all cursor-pointer',
          isActive
            ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-sm border border-[var(--accent)]/20'
            : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/50',
          isConfirming ? 'border border-red-500/40 bg-red-500/5' : '',
        ].join(' ')}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && !isConfirming && handleSessionClick(session.id)}
      >
        {editingId === session.id ? (
          <input
            autoFocus
            aria-label="Rename chat"
            className="w-full bg-transparent border-none outline-none p-0 text-[var(--text-primary)] text-[13px] font-medium"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => saveEdit(session.id)}
            onKeyDown={e => {
              if (e.key === 'Enter')  saveEdit(session.id);
              if (e.key === 'Escape') setEditingId(null);
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <>
            <span className={`flex-1 truncate pr-24 text-[13px] font-medium ${isConfirming ? 'text-red-400 font-bold' : ''}`}>
              {isConfirming ? 'Delete this chat?' : (session.title || 'New Chat')}
            </span>

            <div className={`absolute right-2 flex items-center gap-0.5 transition-opacity ${
              isActive || isConfirming ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}>
              {isConfirming ? (
                <>
                  <button
                    onClick={e => handleDeleteClick(e, session.id)}
                    className="p-1.5 text-red-400 hover:text-red-300 rounded-lg"
                    aria-label="Confirm delete"
                  >
                    <Icons.Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={cancelDelete}
                    className="p-1.5 text-[var(--text-secondary)] rounded-lg"
                    aria-label="Cancel delete"
                  >
                    <Icons.X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); onToggleFavorite(session.id); }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      session.isFavorite
                        ? 'text-[var(--accent)]'
                        : 'hover:text-[var(--accent)] text-[var(--text-secondary)]'
                    }`}
                    aria-label={session.isFavorite ? 'Unfavourite' : 'Favourite'}
                  >
                    <Icons.Star fill={session.isFavorite ? 'currentColor' : 'none'} className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => startEditing(e, session)}
                    className="p-1.5 hover:text-[var(--accent)] text-[var(--text-secondary)] rounded-lg transition-colors"
                    aria-label="Rename chat"
                  >
                    <Icons.Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => handleDeleteClick(e, session.id)}
                    className="p-1.5 hover:text-red-400 text-[var(--text-secondary)] rounded-lg transition-colors"
                    aria-label="Delete chat"
                  >
                    <Icons.Trash className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Logo mark ─────────────────────────────────────────────────
  const SedrexMark = () => (
    <svg viewBox="0 0 28 28" fill="none" style={{ width: 28, height: 28, flexShrink: 0 }} aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />
      <path
        d="M19 8H11C9.3 8 8 9.3 8 11V12.5C8 14.2 9.3 15.5 11 15.5H17C18.7 15.5 20 16.8 20 18.5V20C20 21.7 18.7 23 17 23H8"
        stroke="#10B981" strokeWidth="1.8" strokeLinecap="round"
      />
    </svg>
  );

  const HamburgerIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );

  const CloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6"  x2="6"  y2="18" />
      <line x1="6"  y1="6"  x2="18" y2="18" />
    </svg>
  );

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  return (
    <>
      {/* ── Mobile toggle button ────────────────────────────── */}
      <button
        className="sidebar-mobile-toggle"
        onClick={onToggle}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
        aria-expanded={isOpen}
        aria-controls={id || 'app-sidebar'}
        type="button"
      >
        {isOpen ? <CloseIcon /> : <HamburgerIcon />}
      </button>

      {/* ── Mobile overlay ──────────────────────────────────── */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => { if (isMobile()) onToggle(); }}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar panel ───────────────────────────────────── */}
      <aside
        id={id || 'app-sidebar'}
        role="navigation"
        aria-label="Sidebar"
        className={`flex flex-col bg-[var(--bg-secondary)] text-[var(--text-primary)] border-r border-[var(--border)] ${isOpen ? 'translate-x-0' : ''}`}
      >

        {/* ── Header ────────────────────────────────────────── */}
        <div className="p-3 space-y-3 pt-4">
          <div className="flex items-center justify-between">
            {isOpen && (
              <div className="flex items-center gap-2.5">
                <SedrexMark />
                <div>
                  <h1 style={{
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    fontSize: 13, fontWeight: 900, letterSpacing: 4,
                    color: 'var(--text-primary)', textTransform: 'uppercase' as const,
                    lineHeight: 1, margin: 0,
                  }}>
                    SEDREX
                  </h1>
                  <span style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 9, letterSpacing: 2,
                    color: 'var(--accent, #10B981)',
                    textTransform: 'uppercase' as const, display: 'block',
                  }}>
                    Beta
                  </span>
                </div>
              </div>
            )}

            {/* Desktop collapse/expand */}
            <button
              onClick={onToggle}
              aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              className={`sidebar-desktop-toggle p-2 rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/40 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-all flex items-center justify-center ${!isOpen ? 'mx-auto w-9 h-9' : 'w-8 h-8'}`}
            >
              <Icons.PanelLeftOpen className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* New Chat button */}
          <button
            onClick={() => { onNewChat(); onSetView('chat'); if (isMobile()) onToggle(); }}
            className={`flex items-center gap-2.5 rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all text-[var(--text-primary)] ${isOpen ? 'w-full p-3' : 'w-9 h-9 p-0 justify-center mx-auto'}`}
            aria-label="New chat"
          >
            <Icons.Plus />
            {isOpen && (
              <span style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10, fontWeight: 700,
                letterSpacing: 3, textTransform: 'uppercase' as const,
              }}>
                New Chat
              </span>
            )}
          </button>

          {/* Collapsed: Ctrl+K hint */}
          {!isOpen && !isMobile() && (
            <button
              onClick={onOpenCommandPalette}
              aria-label="Command palette (Ctrl+K)"
              className="mt-2 w-9 mx-auto rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/6 p-1.5 text-center font-black uppercase leading-tight tracking-wide text-[var(--accent)] transition-all hover:bg-[var(--accent)]/10 flex flex-col items-center"
              style={{ fontSize: 9 }}
            >
              <span>Ctrl</span>
              <span style={{ fontSize: 10 }}>K</span>
            </button>
          )}
        </div>

        {/* ── Search ────────────────────────────────────────── */}
        {isOpen && (
          <div className="px-3 mb-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center text-[var(--text-secondary)]">
                <Icons.Search className="w-3.5 h-3.5" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search chats..."
                value={searchTerm}
                onChange={handleSearchChange}
                aria-label="Search chats"
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl py-2.5 pl-9 pr-8 text-[12px] font-medium outline-none focus:border-[var(--accent)]/40 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
              />
              {searchTerm.trim() && (
                <button
                  onClick={() => { setSearchTerm(''); setDebouncedSearch(''); searchInputRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="absolute inset-y-0 right-3 flex items-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Icons.X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Scrollable body ───────────────────────────────── */}
        <div className={`flex-1 overflow-y-auto px-3 custom-scrollbar ${!isOpen && !isMobile() ? 'hidden' : ''}`}>

          {/* No results banner */}
          {hasNoResults && (
            <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
              <p className="text-[12px] font-semibold text-[var(--text-primary)]">No chats found</p>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                No match for "{debouncedSearch}"
              </p>
              <button
                onClick={() => { setSearchTerm(''); setDebouncedSearch(''); }}
                className="mt-1.5 text-[11px] font-bold text-[var(--accent)] hover:opacity-80"
              >
                Clear search
              </button>
            </div>
          )}

          {/* ── Artifacts ─────────────────────────────────── */}
          <div className="mb-1">
            <SectionHeader
              label="Artifacts"
              icon={
                <svg viewBox="0 0 14 14" style={{ width: 11, height: 11, color: 'var(--accent)' }} fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 3L1 7l3 4M10 3l3 4-3 4M8 1L6 13" />
                </svg>
              }
              count={artifacts.length}
              isOpen={showArtifacts}
              onToggle={() => setShowArtifacts(v => !v)}
              onRefresh={onRefreshArtifacts}
            />

            {showArtifacts && (
              <div className="sidebar-artifact-list">
                {artifacts.length === 0 ? (
                  <div className="sidebar-artifact-empty">
                    Generated code files appear here.
                  </div>
                ) : (
                  artifacts.slice(0, 20).map(a => (
                    <ArtifactRow key={a.id} artifact={a} onOpen={handleOpenArtifact} />
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── Diagrams ──────────────────────────────────── */}
          <div className="mb-1">
            <SectionHeader
              label="Diagrams"
              icon={
                <svg viewBox="0 0 14 14" style={{ width: 11, height: 11, color: 'var(--accent)' }} fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="5" height="5" rx="1" />
                  <rect x="8" y="1" width="5" height="5" rx="1" />
                  <rect x="4" y="8" width="6" height="5" rx="1" />
                  <path d="M3.5 6v1.5M10.5 6v1.5M7 6v2" />
                </svg>
              }
              count={diagrams.length}
              countBadgeStyle={{
                background: 'rgba(16,185,129,0.2)', color: 'var(--accent)',
                borderRadius: 10, fontSize: 9, fontWeight: 700,
                padding: '1px 5px', lineHeight: 1.6,
                border: '1px solid rgba(16,185,129,0.3)',
              }}
              isOpen={showDiagrams}
              onToggle={() => setShowDiagrams(v => !v)}
            />

            {showDiagrams && (
              <div className="sidebar-artifact-list">
                {diagrams.length === 0 ? (
                  <div className="sidebar-artifact-empty">
                    Mermaid diagrams generated in chat appear here.
                  </div>
                ) : (
                  diagrams.slice(0, 20).map(d => (
                    <ArtifactRow key={d.id} artifact={d} onOpen={handleOpenArtifact} />
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── Images ────────────────────────────────────── */}
          <div className="mb-1">
            <SectionHeader
              label="Images"
              icon={
                <svg viewBox="0 0 16 16" style={{ width: 12, height: 12, color: 'var(--accent)' }} fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                  <circle cx="5" cy="6" r="1.5" />
                  <path d="M1 12l4-4 4 4" />
                  <path d="M7 10l3-3 5 5" />
                </svg>
              }
              count={images?.length || 0}
              countBadgeStyle={{
                background: 'rgba(16,185,129,0.2)', color: 'var(--accent)',
                borderRadius: 10, fontSize: 9, fontWeight: 700,
                padding: '1px 5px', lineHeight: 1.6,
                border: '1px solid rgba(16,185,129,0.3)',
              }}
              isOpen={showImages}
              onToggle={() => setShowImages(v => !v)}
            />

            {showImages && (
              <div className="sidebar-artifact-list">
                {!images || images.length === 0 ? (
                  <div className="sidebar-artifact-empty">
                    Generated images appear here.
                  </div>
                ) : (
                  images.slice(0, 20).map(img => (
                    <ArtifactRow key={img.id} artifact={img} onOpen={handleOpenArtifact} />
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── Favorites ─────────────────────────────────── */}
          <div className="mb-1">
            <button
              onClick={() => setShowFavorites(v => !v)}
              className="w-full flex items-center justify-between px-1 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              aria-expanded={showFavorites}
            >
              <span>Favorites</span>
              <span style={{ fontSize: 9 }}>{showFavorites ? '▼' : '▶'}</span>
            </button>

            {showFavorites && favorites.length > 0 && (
              <div className="space-y-0.5">
                {favorites.map(renderSessionItem)}
              </div>
            )}

            {showFavorites && favorites.length === 0 && !hasNoResults && (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                Pin chats to keep favorites here.
              </div>
            )}
          </div>

          {/* ── Recent Chats ──────────────────────────────── */}
          <div className="mb-1">
            <button
              onClick={() => setShowChats(v => !v)}
              className="w-full flex items-center justify-between px-1 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              aria-expanded={showChats}
            >
              <span>Recent Chats</span>
              <span style={{ fontSize: 9 }}>{showChats ? '▼' : '▶'}</span>
            </button>

            {showChats && (
              <div className="space-y-0.5">
                {regular.map(renderSessionItem)}
              </div>
            )}

            {showChats && regular.length === 0 && !hasNoResults && (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-3 py-3">
                <p className="text-[11px] font-semibold text-[var(--text-primary)]">No chats yet.</p>
                <button
                  onClick={() => { onNewChat(); onSetView('chat'); }}
                  className="mt-1 text-[11px] font-bold text-[var(--accent)] hover:opacity-80"
                >
                  Start your first chat →
                </button>
              </div>
            )}
          </div>

        </div>{/* end scrollable body */}

        {/* ── Footer / user ─────────────────────────────────── */}
        <div className="p-3 mt-auto border-t border-[var(--border)] pb-safe">
          <button
            onClick={() => { onOpenSettings(); if (isMobile()) onToggle(); }}
            aria-label="Open settings"
            className={`flex items-center gap-2.5 rounded-xl hover:bg-[var(--bg-tertiary)] transition-all ${isOpen ? 'w-full p-2.5' : 'w-9 h-9 p-0 justify-center mx-auto'}`}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--accent, #10B981), #059669)' }}
              aria-hidden="true"
            >
              {user.email.charAt(0).toUpperCase()}
            </div>
            {isOpen && (
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold truncate text-[12px] text-[var(--text-primary)]">
                  {user.email.split('@')[0]}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent, #10B981)' }}>
                  {user.tier}
                </p>
              </div>
            )}
          </button>
        </div>

      </aside>

      {/* ── Scoped styles ─────────────────────────────────────── */}
      <style>{`
        .sidebar-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-secondary);
          transition: color 0.15s;
          background: none;
          border: none;
          cursor: pointer;
        }
        .sidebar-section-header:hover { color: var(--text-primary); }

        .sidebar-artifact-list {
          display: flex;
          flex-direction: column;
          gap: 1px;
          margin-bottom: 4px;
        }

        .sidebar-artifact-empty {
          padding: 8px 12px;
          font-size: 11px;
          color: var(--text-secondary);
          border: 1px dashed var(--border);
          border-radius: 10px;
          line-height: 1.5;
        }

        .artifact-sidebar-row {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 7px 10px;
          border-radius: 10px;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background 0.12s;
          color: var(--text-primary);
        }
        .artifact-sidebar-row:hover { background: var(--bg-tertiary); }

        .artifact-sidebar-icon {
          font-size: 14px;
          flex-shrink: 0;
          width: 20px;
          text-align: center;
        }

        .artifact-sidebar-info {
          display: flex;
          flex-direction: column;
          gap: 1px;
          flex: 1;
          min-width: 0;
          overflow: hidden;
        }

        .artifact-sidebar-title {
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--text-primary);
        }

        .artifact-sidebar-meta {
          font-size: 10px;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .artifact-sidebar-arrow {
          color: var(--text-secondary);
          opacity: 0;
          transition: opacity 0.12s;
        }
        .artifact-sidebar-row:hover .artifact-sidebar-arrow {
          opacity: 1;
          color: var(--accent);
        }
      `}</style>
    </>
  );
};

export default Sidebar;