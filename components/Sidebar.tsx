import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import './ChatSidebar.css';
import { ChatSession, UserStats, User } from '../types';
import { Icons } from '../constants';
import {
  useArtifacts, setActiveArtifact, openPanel, Artifact,
} from '../services/artifactStore';
import { UsageBar } from './UsageBar';
import { runIndexing, useUploadState, resetUploadState } from './ProjectUploader';
import { useCodebaseIndex } from '../services/codebaseContext';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  view: 'chat' | 'dashboard' | 'admin' | 'pricing' | 'billing' | 'library' | 'artifacts';
  onSetView: (view: 'chat' | 'dashboard' | 'admin' | 'pricing' | 'billing' | 'library' | 'artifacts') => void;
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

// ── Smart title: trim to ≤5 words, strip filler ───────────────────
const FILLER = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'i', 'me', 'my', 'please', 'can', 'you', 'how', 'do', 'what', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'help']);

function smartTitle(raw: string): string {
  if (!raw || raw === 'New Chat') return 'New Chat';
  // Already short enough
  const words = raw.trim().split(/\s+/);
  if (words.length <= 5) return raw.trim();
  // Try to pick 4-5 meaningful words
  const meaningful = words.filter(w => !FILLER.has(w.toLowerCase()));
  const picked = meaningful.slice(0, 4);
  if (picked.length >= 3) return picked.join(' ');
  return words.slice(0, 5).join(' ');
}

// ── Date grouping ─────────────────────────────────────────────────
type DateGroup = 'Favorites' | 'Today' | 'Yesterday' | 'This week' | 'This month' | 'Older';

function getDateGroup(ts: number): DateGroup {
  const now = Date.now();
  const diff = now - ts;
  const day = 86400000;
  if (diff < day)           return 'Today';
  if (diff < 2 * day)       return 'Yesterday';
  if (diff < 7 * day)       return 'This week';
  if (diff < 30 * day)      return 'This month';
  return 'Older';
}

// ── Codebase Panel ─────────────────────────────────────────────────
const SidebarCodebasePanel = React.memo(({ isOpen }: { isOpen: boolean }) => {
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const { state, progress, error } = useUploadState();
  const { hasIndex, projectName, totalFiles, totalChunks, clear } = useCodebaseIndex();

  const handleFolderChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) runIndexing(e.target.files);
    if (folderInputRef.current) folderInputRef.current.value = '';
  }, []);

  return (
    <div className={isOpen ? 'sb-codebase-row' : 'sb-codebase-icon'}>
      <input ref={folderInputRef} type="file" className="hidden" aria-label="Upload project folder"
        // @ts-ignore
        webkitdirectory="" multiple onChange={handleFolderChange} />

      {isOpen ? (
        /* ── Expanded row ── */
        <button
          type="button"
          onClick={() => !hasIndex && state !== 'indexing' && folderInputRef.current?.click()}
          className={`sb-codebase-btn${hasIndex ? ' sb-codebase-btn--done' : ''}`}
          title={hasIndex ? `${projectName} — ${totalFiles} files` : 'Index your codebase for context'}
        >
          {/* Icon */}
          <span className="sb-codebase-btn-icon">
            {state === 'indexing' ? (
              <svg className="sb-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 1.5A6.5 6.5 0 118 14.5" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
              </svg>
            )}
            {hasIndex && <span className="sb-codebase-dot" />}
          </span>

          {/* Label */}
          <div className="sb-codebase-btn-text">
            {state === 'indexing' ? (
              <>
                <span className="sb-codebase-name">Indexing {progress.pct}%</span>
                <span className="sb-codebase-sub">{progress.file}</span>
              </>
            ) : hasIndex ? (
              <>
                <span className="sb-codebase-name">{projectName}</span>
                <span className="sb-codebase-sub">{totalFiles} files · {totalChunks.toLocaleString()} chunks</span>
              </>
            ) : state === 'error' ? (
              <>
                <span className="sb-codebase-name sb-codebase-err">Index failed</span>
                <span className="sb-codebase-sub">{error || 'Click to retry'}</span>
              </>
            ) : (
              <>
                <span className="sb-codebase-name">Index Codebase</span>
                <span className="sb-codebase-sub">Upload a project folder</span>
              </>
            )}
          </div>

          {/* Clear button when done */}
          {hasIndex && state !== 'indexing' && (
            <button
              type="button"
              aria-label="Remove codebase context"
              className="sb-codebase-clear"
              onClick={e => { e.stopPropagation(); clear(); resetUploadState(); }}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 2l12 12M14 2L2 14"/>
              </svg>
            </button>
          )}
        </button>
      ) : (
        /* ── Icon-only mode ── */
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          title={hasIndex ? `${projectName} — ${totalFiles} files indexed` : 'Index codebase'}
          className="sb-icon-btn"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          </svg>
          {hasIndex && <span className="sb-icon-dot" />}
        </button>
      )}
    </div>
  );
});
SidebarCodebasePanel.displayName = 'SidebarCodebasePanel';

// ── Library panel (lazy — only rendered when active) ───────────────
type LibraryTab = 'all' | 'images' | 'diagrams';

const LibraryPanel = React.memo(({
  images,
  diagrams,
  onOpenArtifact,
}: {
  images: Artifact[];
  diagrams: Artifact[];
  onOpenArtifact: (id: string) => void;
}) => {
  const [tab, setTab] = useState<LibraryTab>('all');
  const items = tab === 'all' ? [...images, ...diagrams] : tab === 'images' ? images : diagrams;

  return (
    <div className="sb-panel">
      {/* Tabs */}
      <div className="sb-lib-tabs">
        {(['all', 'images', 'diagrams'] as LibraryTab[]).map(t => (
          <button
            key={t}
            type="button"
            className={`sb-lib-tab${tab === t ? ' sb-lib-tab--active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'all' ? `All (${images.length + diagrams.length})` : t === 'images' ? `Images (${images.length})` : `Diagrams (${diagrams.length})`}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="sb-panel-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M3 15l5-5 4 4 3-3 6 6"/>
          </svg>
          <p>
            {tab === 'diagrams' ? 'No diagrams yet' : tab === 'images' ? 'No images yet' : 'Nothing in your library yet'}
          </p>
          <span>Generated images and diagrams appear here</span>
        </div>
      ) : (
        <div className="sb-gallery">
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              className="sb-gallery-cell"
              onClick={() => onOpenArtifact(item.id)}
              title={item.title}
            >
              {item.type === 'image' ? (
                <img
                  src={item.content}
                  alt={item.title}
                  loading="lazy"
                  className="sb-gallery-img"
                />
              ) : (
                <div className="sb-gallery-diagram">
                  <span className="sb-gallery-diagram-icon">🔷</span>
                </div>
              )}
              <span className="sb-gallery-label">{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
LibraryPanel.displayName = 'LibraryPanel';

// ── Artifacts panel (lazy — only rendered when active) ─────────────
const ArtifactsPanel = React.memo(({
  artifacts,
  diagrams,
  onOpenArtifact,
}: {
  artifacts: Artifact[];
  diagrams: Artifact[];
  onOpenArtifact: (id: string) => void;
}) => {
  const all = [...artifacts, ...diagrams].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="sb-panel">
      {all.length === 0 ? (
        <div className="sb-panel-empty">
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 3L1 7l3 4M10 3l3 4-3 4M8 1L6 13"/>
          </svg>
          <p>No artifacts yet</p>
          <span>Code files, HTML pages, and documents appear here</span>
        </div>
      ) : (
        <div className="sb-artifact-list">
          {all.map(a => (
            <button
              key={a.id}
              type="button"
              className="sb-artifact-item"
              onClick={() => onOpenArtifact(a.id)}
              title={`${a.title} — ${a.lineCount} lines`}
            >
              <span className="sb-artifact-icon">{langIcon(a.language)}</span>
              <div className="sb-artifact-info">
                <span className="sb-artifact-title">{a.title}</span>
                <span className="sb-artifact-meta">{langLabel(a.language)} · {a.lineCount} lines</span>
              </div>
              <svg className="sb-artifact-arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 6h8M6 2l4 4-4 4"/>
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
ArtifactsPanel.displayName = 'ArtifactsPanel';

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
  const [searchTerm,          setSearchTerm]          = useState('');
  const [debouncedSearch,     setDebouncedSearch]     = useState('');
  const [editingId,           setEditingId]           = useState<string | null>(null);
  const [editValue,           setEditValue]           = useState('');
  const [confirmingDeleteId,  setConfirmingDeleteId]  = useState<string | null>(null);
  const [collapsedGroups,     setCollapsedGroups]     = useState<Set<string>>(new Set());
  const [chatsCollapsed,      setChatsCollapsed]      = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Artifact store
  const { artifacts, diagrams, images } = useArtifacts();

  const handleOpenArtifact = useCallback((artifactId: string) => {
    setActiveArtifact(artifactId);
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

  // Search switches back to chat view automatically
  useEffect(() => {
    if (debouncedSearch.trim() && (view === 'library' || view === 'artifacts')) {
      onSetView('chat');
    }
  }, [debouncedSearch, view, onSetView]);

  // Escape closes sidebar on mobile
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggle(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onToggle]);

  // ── Filtered flat session list ────────────────────────────────
  const { filteredSessions, hasNoResults } = useMemo(() => {
    let list = sessions;
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.toLowerCase();
      list = sessions.filter(s =>
        s.title.toLowerCase().includes(term) ||
        s.messages.some(m => m.role === 'user' && m.content.toLowerCase().includes(term))
      );
    }
    list = list.slice(0, 60);
    return {
      filteredSessions: list,
      hasNoResults: debouncedSearch.trim().length > 0 && list.length === 0,
    };
  }, [sessions, debouncedSearch]);

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

  // ── Session item ──────────────────────────────────────────────
  const renderSessionItem = (session: ChatSession) => {
    const isActive     = activeSessionId === session.id && view === 'chat';
    const isConfirming = confirmingDeleteId === session.id;

    return (
      <div
        key={session.id}
        className={`sb-session${isActive ? ' sb-session--active' : ''}${isConfirming ? ' sb-session--confirming' : ''}`}
      >
        {editingId === session.id ? (
          <input
            autoFocus
            aria-label="Rename chat"
            className="sb-session-rename"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => saveEdit(session.id)}
            onKeyDown={e => {
              if (e.key === 'Enter')  saveEdit(session.id);
              if (e.key === 'Escape') setEditingId(null);
            }}
          />
        ) : (
          <>
            {/* Main trigger — proper button, no nesting issue */}
            <button
              type="button"
              className={`sb-session-trigger${isConfirming ? ' sb-session-trigger--confirming' : ''}`}
              onClick={() => !isConfirming && handleSessionClick(session.id)}
              aria-label={session.title || 'New Chat'}
            >
              <span className={`sb-session-title${isConfirming ? ' sb-session-title--confirm' : ''}`}>
                {isConfirming ? 'Delete this chat?' : smartTitle(session.title || 'New Chat')}
              </span>
            </button>

            {/* Action buttons — siblings to trigger, not children */}
            <div className={`sb-session-actions${isActive || isConfirming ? ' sb-session-actions--visible' : ''}`}>
              {isConfirming ? (
                <>
                  <button type="button" onClick={e => handleDeleteClick(e, session.id)} className="sb-session-btn sb-session-btn--danger" aria-label="Confirm delete">
                    <Icons.Check className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={cancelDelete} className="sb-session-btn" aria-label="Cancel delete">
                    <Icons.X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onToggleFavorite(session.id); }}
                    className={`sb-session-btn${session.isFavorite ? ' sb-session-btn--fav' : ''}`}
                    aria-label={session.isFavorite ? 'Unfavourite' : 'Favourite'}
                  >
                    <Icons.Star fill={session.isFavorite ? 'currentColor' : 'none'} className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={e => startEditing(e, session)} className="sb-session-btn" aria-label="Rename chat">
                    <Icons.Edit className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={e => handleDeleteClick(e, session.id)} className="sb-session-btn sb-session-btn--del" aria-label="Delete chat">
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

  // ── Logo ───────────────────────────────────────────────────────
  const SedrexMark = () => (
    <svg viewBox="0 0 28 28" fill="none" className="sb-logo-mark" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />
      <path
        d="M19 8H11C9.3 8 8 9.3 8 11V12.5C8 14.2 9.3 15.5 11 15.5H17C18.7 15.5 20 16.8 20 18.5V20C20 21.7 18.7 23 17 23H8"
        stroke="#10B981" strokeWidth="1.8" strokeLinecap="round"
      />
    </svg>
  );

  const HamburgerIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );

  const CloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6"  x2="6"  y2="18" />
      <line x1="6"  y1="6"  x2="18" y2="18" />
    </svg>
  );

  const libraryCount  = (images?.length || 0) + diagrams.length;
  const artifactCount = artifacts.length;

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <>
      {/* ── Mobile toggle ─────────────────────────────────────── */}
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

      {/* ── Mobile overlay ────────────────────────────────────── */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => { if (isMobile()) onToggle(); }}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar panel ─────────────────────────────────────── */}
      <aside
        id={id || 'app-sidebar'}
        role="navigation"
        aria-label="Sidebar"
        className={`sb${isOpen ? ' translate-x-0' : ''}`}
      >

        {/* ── Header: logo + collapse ────────────────────────── */}
        <div className="sb-header">
          {isOpen && (
            <div className="sb-logo">
              <SedrexMark />
              <div className="sb-logo-text">
                <span className="sb-logo-name">SEDREX</span>
                <span className="sb-logo-tag">Beta</span>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className={`sb-collapse-btn sidebar-desktop-toggle${!isOpen ? ' sb-collapse-btn--center' : ''}`}
          >
            <Icons.PanelLeftOpen className={`w-4 h-4 transition-transform${isOpen ? ' rotate-180' : ''}`} />
          </button>
        </div>

        {/* ── New Chat ──────────────────────────────────────── */}
        <div className="sb-actions">
          <button
            type="button"
            onClick={() => { onNewChat(); onSetView('chat'); if (isMobile()) onToggle(); }}
            className={`sb-new-chat${!isOpen ? ' sb-new-chat--icon' : ''}`}
            aria-label="New chat"
          >
            <Icons.Plus />
            {isOpen && <span className="sb-new-chat-label">New Chat</span>}
          </button>

          {/* Ctrl+K hint (icon mode) */}
          {!isOpen && !isMobile() && (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              aria-label="Command palette (Ctrl+K)"
              className="sb-ctrlk"
            >
              <span>Ctrl</span>
              <span className="sb-ctrlk-k">K</span>
            </button>
          )}
        </div>

        {/* ── Search (expanded only) ────────────────────────── */}
        {isOpen && (
          <div className="sb-search">
            <div className="sb-search-inner">
              <Icons.Search className="sb-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search chats…"
                value={searchTerm}
                onChange={handleSearchChange}
                aria-label="Search chats"
                className="sb-search-input"
              />
              {searchTerm.trim() && (
                <button
                  type="button"
                  onClick={() => { setSearchTerm(''); setDebouncedSearch(''); searchInputRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="sb-search-clear"
                >
                  <Icons.X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Codebase ──────────────────────────────────────── */}
        <SidebarCodebasePanel isOpen={isOpen} />

        {/* ── Nav strip: Library + Artifacts + Dashboard ──────── */}
        {isOpen ? (
          <div className="sb-nav">
            <button
              type="button"
              className={`sb-nav-btn${view === 'library' ? ' sb-nav-btn--active' : ''}`}
              onClick={() => { onSetView(view === 'library' ? 'chat' : 'library'); if (isMobile()) onToggle(); }}
            >
              <svg className="sb-nav-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="2" y="2" width="7" height="7" rx="1.5"/>
                <rect x="11" y="2" width="7" height="7" rx="1.5"/>
                <rect x="2" y="11" width="7" height="7" rx="1.5"/>
                <rect x="11" y="11" width="7" height="7" rx="1.5"/>
              </svg>
              <span>Library</span>
              {libraryCount > 0 && <span className="sb-nav-badge">{libraryCount}</span>}
            </button>

            <button
              type="button"
              className={`sb-nav-btn${view === 'artifacts' ? ' sb-nav-btn--active' : ''}`}
              onClick={() => { onSetView(view === 'artifacts' ? 'chat' : 'artifacts'); if (isMobile()) onToggle(); }}
            >
              <svg className="sb-nav-icon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 3L1 7l3 4M10 3l3 4-3 4M8 1L6 13"/>
              </svg>
              <span>Artifacts</span>
              {artifactCount > 0 && <span className="sb-nav-badge">{artifactCount}</span>}
            </button>

          </div>
        ) : (
          /* Icon-only nav */
          <div className="sb-nav-icons">
            <button
              type="button"
              className={`sb-icon-btn${view === 'library' ? ' sb-icon-btn--active' : ''}`}
              onClick={() => { onSetView(view === 'library' ? 'chat' : 'library'); }}
              title="Library"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="2" y="2" width="7" height="7" rx="1.5"/>
                <rect x="11" y="2" width="7" height="7" rx="1.5"/>
                <rect x="2" y="11" width="7" height="7" rx="1.5"/>
                <rect x="11" y="11" width="7" height="7" rx="1.5"/>
              </svg>
              {libraryCount > 0 && <span className="sb-icon-dot" />}
            </button>

            <button
              type="button"
              className={`sb-icon-btn${view === 'artifacts' ? ' sb-icon-btn--active' : ''}`}
              onClick={() => { onSetView(view === 'artifacts' ? 'chat' : 'artifacts'); }}
              title="Artifacts"
            >
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 3L1 7l3 4M10 3l3 4-3 4M8 1L6 13"/>
              </svg>
              {artifactCount > 0 && <span className="sb-icon-dot" />}
            </button>

          </div>
        )}

        {/* ── Scrollable body — favorites + chat list ──────── */}
        <div className={`sb-body custom-scrollbar${!isOpen && !isMobile() ? ' hidden' : ''}`}>

          {/* Spacer below nav buttons */}
          <div className="sb-chats-spacer" />

          {/* ── Favorites section ──────────────────────────── */}
          {filteredSessions.some(s => s.isFavorite) && (
            <>
              <p className="sb-section-label">
                <svg className="sb-section-icon" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                  <path d="M7 1l1.5 3.1L12 4.6l-2.5 2.4.6 3.4L7 8.8 3.9 10.4l.6-3.4L2 4.6l3.5-.5z"/>
                </svg>
                Favorites
              </p>
              <div className="sb-chat-list sb-favorites-list">
                {filteredSessions.filter(s => s.isFavorite).map(renderSessionItem)}
              </div>
              <div className="sb-section-divider" />
            </>
          )}

          {/* ── Chats section label — collapsible ──────────── */}
          <button
            type="button"
            className="sb-chats-label sb-chats-label--btn"
            onClick={() => setChatsCollapsed(c => !c)}
            aria-expanded={!chatsCollapsed as unknown as boolean}
          >
            <span>Chats</span>
            <svg
              className={`sb-chats-arrow${chatsCollapsed ? ' sb-chats-arrow--collapsed' : ''}`}
              viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M2 3.5l3 3 3-3"/>
            </svg>
          </button>

          {!chatsCollapsed && (hasNoResults ? (
            <div className="sb-no-results">
              <p className="sb-no-results-title">No chats found</p>
              <p className="sb-no-results-sub">No match for &ldquo;{debouncedSearch}&rdquo;</p>
              <button type="button" onClick={() => { setSearchTerm(''); setDebouncedSearch(''); }} className="sb-no-results-clear">
                Clear search
              </button>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="sb-empty">
              <p className="sb-empty-title">No chats yet.</p>
              <button type="button" onClick={() => { onNewChat(); onSetView('chat'); }} className="sb-empty-cta">
                Start your first chat →
              </button>
            </div>
          ) : (
            <div className="sb-chat-list">
              {filteredSessions.map(renderSessionItem)}
            </div>
          ))}
        </div>

        {/* ── Usage bar ─────────────────────────────────────── */}
        {isOpen && (
          <div className="px-3 pb-2">
            <UsageBar stats={stats} onUpgradeClick={() => onSetView('pricing')} />
          </div>
        )}

        {/* ── Footer / user ─────────────────────────────────── */}
        <div className="sb-footer">
          <button
            type="button"
            onClick={() => { onOpenSettings(); if (isMobile()) onToggle(); }}
            aria-label="Open settings"
            className={`sb-user${!isOpen ? ' sb-user--icon' : ''}`}
          >
            <div className="sb-avatar" aria-hidden="true">
              {user.email.charAt(0).toUpperCase()}
            </div>
            {isOpen && (
              <div className="sb-user-info">
                <p className="sb-user-name">{user.email.split('@')[0]}</p>
                <p className="sb-user-tier">{user.tier}</p>
              </div>
            )}
          </button>
        </div>

      </aside>
    </>
  );
};

export default Sidebar;
