import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import './ChatSidebar.css';
import { ChatSession, UserStats, User } from '../types';
import { Icons } from '../constants';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  view: 'chat' | 'dashboard' | 'admin';
  onSetView: (view: 'chat' | 'dashboard' | 'admin') => void;
  stats: UserStats | null;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenSettings: () => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  isOpen: boolean;
  onToggle: () => void;
  user: User;
}

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
  user
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input to avoid filtering on every keystroke
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(val), 250);
  }, []);

  useEffect(() => {
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, []);


  // Escape key closes mobile sidebar overlay
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggle();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onToggle]);

  // Prevent sidebar open gesture if horizontal scroll lock is active (mobile)
  const safeOnToggle = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640 && window.__sidebarGestureLock) {
      // Ignore sidebar open if lock is set
      return;
    }
    onToggle();
  }, [onToggle]);



  // Restore filteredSessions definition
  const filteredSessions = useMemo(() => {
    let list = sessions;
    if (debouncedSearch.trim()) {
      const term = debouncedSearch.toLowerCase();
      list = sessions.filter(s =>
        s.title.toLowerCase().includes(term)
      );
    }
    return list.slice(0, 50);
  }, [sessions, debouncedSearch]);

  // Style helpers for ChatGPT-like session titles and menu
  const sessionTitleClass = "text-xs sm:text-sm font-semibold leading-tight truncate transition-colors group-hover:text-[var(--accent)]";
  const menuHeadingClass = "text-[0.98rem] font-bold uppercase tracking-wide text-[var(--text-secondary)] mb-2 mt-4";

  const favorites = filteredSessions.filter(s => s.isFavorite);
  const regular = filteredSessions.filter(s => !s.isFavorite);

  // Dropdown state for sections
  const [showFavorites, setShowFavorites] = useState(true);
  const [showChats, setShowChats] = useState(true);

  const startEditing = (e: React.MouseEvent, s: ChatSession) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditValue(s.title);
    setConfirmingDeleteId(null);
  };

  const saveEdit = (id: string) => {
    if (editValue.trim()) {
      onRenameSession(id, editValue.trim());
    }
    setEditingId(null);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirmingDeleteId === id) {
      onDeleteSession(id);
      setConfirmingDeleteId(null);
    } else {
      setConfirmingDeleteId(id);
      setEditingId(null);
    }
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingDeleteId(null);
  };

  const handleSessionClick = (id: string) => {
    onSelectSession(id);
    onSetView('chat');
    if (window.innerWidth < 640 && isOpen) {
      onToggle();
    }
  };

  const renderSessionItem = (session: ChatSession) => {
    const isActive = activeSessionId === session.id && view === 'chat';
    const isConfirming = confirmingDeleteId === session.id;
    
    if (!isOpen && window.innerWidth >= 640) return null;
    
    return (
      <div 
        key={session.id}
        onClick={() => !isConfirming && handleSessionClick(session.id)}
        className={`group relative flex items-center w-full p-3 sm:p-2.5 rounded-xl text-[13px] sm:text-[14px] md:text-[14px] lg:text-[15px] transition-all cursor-pointer ${
          isActive ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] shadow-md border border-[var(--border)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/50'
        } ${isConfirming ? 'border-red-500/50 bg-red-500/5' : ''}`}
      >
        {editingId === session.id ? (
          <input
            autoFocus
            aria-label="Edit chat session title"
            placeholder="Enter session title"
            className="w-full bg-transparent border-none outline-none focus:ring-0 p-0 text-[var(--text-primary)] text-xs sm:text-sm font-medium"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => saveEdit(session.id)}
            onKeyDown={(e) => e.key === 'Enter' && saveEdit(session.id)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className={`flex-1 truncate pr-[120px] font-medium ${isConfirming ? 'text-red-500 font-bold' : ''}`}>
              <span className="text-xs sm:text-sm">{isConfirming ? 'Delete chat?' : (session.title || 'New Chat')}</span>
            </span>
            <div className={`absolute right-2 flex items-center gap-1 transition-opacity ${isActive || isConfirming ? 'opacity-100' : 'opacity-0 sm:group-hover:opacity-100'}`}>
              {isConfirming ? (
                <>
                  <button aria-label="Confirm session deletion" onClick={(e) => handleDeleteClick(e, session.id)} data-nexus-tooltip="Yes, delete" className="p-2 text-red-500 rounded-lg"><Icons.Check className="w-4 h-4" /></button>
                  <button aria-label="Cancel session deletion" onClick={cancelDelete} data-nexus-tooltip="Cancel" className="p-2 text-[var(--text-secondary)] rounded-lg"><Icons.X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <button aria-label={session.isFavorite ? "Unpin session" : "Pin session"} onClick={(e) => { e.stopPropagation(); onToggleFavorite(session.id); }} data-nexus-tooltip={session.isFavorite ? "Unpin" : "Pin"} className={`p-2 transition-colors ${session.isFavorite ? 'text-[var(--accent)]' : 'hover:text-[var(--accent)]'}`}>
                    <Icons.Star fill={session.isFavorite ? 'currentColor' : 'none'} className="w-4 h-4" />
                  </button>
                  <button aria-label="Rename session" onClick={(e) => startEditing(e, session)} data-nexus-tooltip="Rename" className="p-2 hover:text-[var(--accent)] transition-colors"><Icons.Edit className="w-4 h-4" /></button>
                  <button aria-label="Delete session" onClick={(e) => handleDeleteClick(e, session.id)} data-nexus-tooltip="Delete" className="p-2 hover:text-red-500 transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                  {/* Extract button only on mobile view */}
                  <button
                    aria-label="Extract chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (typeof window !== 'undefined' && window.innerWidth < 640) {
                        // Download chat as markdown
                        const s = sessions.find(x => x.id === session.id);
                        if (!s || !s.messages || !s.messages.length) return;
                        let md = `# ${s.title || 'Chat Export'}\n\n`;
                        md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
                        s.messages.forEach(msg => {
                          const role = msg.role === 'user' ? '**You**' : '**Nexus AI**';
                          md += `### ${role}\n\n${msg.content}\n\n---\n\n`;
                        });
                        const blob = new Blob([md], { type: 'text/markdown' });
                        const filename = `${(s.title || 'chat').replace(/[^a-z0-9]/gi, '_')}_export.md`;
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }
                    }}
                    data-nexus-tooltip="Extract"
                    className="p-2 hover:text-emerald-500 transition-colors block sm:hidden"
                  >
                    <Icons.Download className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[40] sm:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onToggle}
      />
      {/* Mobile sidebar open button (only visible when sidebar is closed) */}
      {!isOpen && (
        <button
          className="fixed top-4 left-4 z-[60] sm:hidden bg-[var(--bg-secondary)] border border-[var(--border)] shadow-lg rounded-xl p-2 flex items-center justify-center"
          onClick={onToggle}
          aria-label="Open sidebar"
        >
          <Icons.PanelLeftOpen className="w-6 h-6" />
        </button>
      )}

      <aside 
        className={`fixed sm:relative flex flex-col h-full bg-[var(--bg-secondary)] text-[var(--text-primary)] border-r border-[var(--border)] z-[50] sidebar-transition ${
          isOpen ? 'translate-x-0 w-[280px] sm:w-64' : '-translate-x-full sm:translate-x-0 sm:w-[68px]'
        }`}
      >
        <div className="p-4 space-y-4 pt-safe">
          <div className="flex items-center justify-between mb-2">
            {(isOpen || window.innerWidth < 640) && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg">
                  <img src="/nexus-logo-modern.svg" alt="Nexus AI Logo" className="w-7 h-7" />
                </div>
                <h1 className="text-[14px] font-black tracking-tight text-[var(--text-primary)] uppercase">NEXUS AI</h1>
                {/* BEGIN: Beta Badge (remove this block to remove Beta label) */}
                <span className="sidebar-beta-badge">Beta</span>
                {/* END: Beta Badge */}
              </div>
            )}
            <button 
              onClick={onToggle}
              aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
              {...(!isOpen ? { 'data-nexus-tooltip': 'Expand sidebar' } : {})}
              className={`p-2 rounded-xl border border-[var(--border)] hover:border-[var(--text-secondary)] text-[var(--text-secondary)] transition-all flex items-center justify-center ${!isOpen ? 'mx-auto w-10 h-10' : 'w-9 h-9'}`}
            >
              <Icons.PanelLeftOpen className={`${isOpen ? 'rotate-180' : ''} w-5 h-5`} />
            </button>
          </div>

          <button 
            onClick={() => { onNewChat(); onSetView('chat'); if (window.innerWidth < 640) onToggle(); }} 
            {...(!isOpen ? { 'data-nexus-tooltip': 'New chat' } : {})}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--border)] hover:bg-[var(--bg-tertiary)] transition-all text-[14px] sm:text-[13px] font-semibold ${isOpen ? 'w-full' : 'w-10 h-10 p-0 justify-center mx-auto'}`}
          >
            <Icons.Plus />
            {isOpen && <span className="truncate uppercase tracking-widest text-[12px] sm:text-[11px]">New Chat</span>}
          </button>
        </div>

        {isOpen && (
          <div className="px-4 mb-6">
            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center text-[var(--text-secondary)]"><Icons.Search /></div>
              <input 
                ref={searchInputRef}
                type="text"
                placeholder="Search chats..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl py-3 pl-10 pr-4 text-[13px] font-medium outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto px-4 custom-scrollbar ${!isOpen && window.innerWidth >= 640 ? 'hidden' : ''}`}> 
          {/* Favorites Section */}
          <div className="sidebar-section">
            <div className="sidebar-section-header" onClick={() => setShowFavorites(v => !v)}>
              Favorites
              <span className="sidebar-arrow">{showFavorites ? 'v' : '>'}</span>
            </div>
            {showFavorites && favorites.length > 0 && (
              <div className="sidebar-session-list sidebar-session-list-simple">{favorites.map(renderSessionItem)}</div>
            )}
          </div>
          {/* Chats Section */}
          <div className="sidebar-section">
            <div className="sidebar-section-header" onClick={() => setShowChats(v => !v)}>
              History
              <span className="sidebar-arrow">{showChats ? 'v' : '>'}</span>
            </div>
            {showChats && (
              <div className="sidebar-session-list sidebar-session-list-simple">{regular.map(renderSessionItem)}</div>
            )}
          </div>
        </div>

        <div className="p-4 mt-auto border-t border-[var(--border)] space-y-4 pb-safe">
          {/* Billing/Upgrade hidden in beta */}

          <button 
            onClick={() => { onOpenSettings(); if (window.innerWidth < 640) onToggle(); }}
            {...(!isOpen ? { 'data-nexus-tooltip': 'Settings' } : {})}
            className={`flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-tertiary)] transition-all ${isOpen ? 'w-full' : 'w-10 h-10 p-0 justify-center mx-auto'}`}
          >
            <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0">
              {user.email.charAt(0).toUpperCase()}
            </div>
            {isOpen && (
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold truncate text-[13px]">{user.email.split('@')[0]}</p>
                <p className="text-[11px] font-bold text-emerald-500">{user.tier}</p>
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;