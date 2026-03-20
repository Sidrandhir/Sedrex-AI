// components/MessageInput.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Message Input v4.3
//
// FIXES:
//   ✅ Model dropdown compact — single list by default,
//      detail panel appears ONLY on hover (not always open)
//   ✅ Both dropdowns portal to document.body (no clipping)
//   ✅ All original features intact
// ══════════════════════════════════════════════════════════════════

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AIModel, MessageImage, AttachedDocument } from '../types';
import { Icons } from '../constants';
import SlashCommandMenu from './SlashCommandMenu';
import { ProjectUploaderMenuItem, ProjectIndexChip } from './ProjectUploader';
import { useCodebaseIndex } from '../services/codebaseContext';
import CodeChip, { detectPastedCode } from './CodeChip';
import './MessageInput.css';

// ── Model definitions ─────────────────────────────────────────────
interface ModelOption {
  id:      AIModel | 'auto';
  label:   string;
  icon:    string;
  color:   string;
  bg:      string;
  desc:    string;
  example: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'auto', label: 'Auto', icon: '⚡',
    color: '#10B981', bg: 'rgba(16,185,129,0.12)',
    desc: 'SEDREX routes your query to the best engine automatically based on intent, complexity, and real-time data needs.',
    example: 'Best for: most everyday tasks',
  },
  {
    id: AIModel.GPT4, label: 'Reasoning & Planning', icon: '🧠',
    color: '#818cf8', bg: 'rgba(129,140,248,0.12)',
    desc: 'Deep analytical reasoning, strategy, structured thinking, and complex multi-step planning.',
    example: 'Best for: analysis, strategy, comparisons',
  },
  {
    id: AIModel.CLAUDE, label: 'Coding & Writing', icon: '💻',
    color: '#f97316', bg: 'rgba(249,115,22,0.12)',
    desc: 'Code generation, debugging, refactoring, long-form writing, and technical documentation.',
    example: 'Best for: code, debug, refactor, docs',
  },
  {
    id: AIModel.GEMINI, label: 'Search & Speed', icon: '🔍',
    color: '#34d399', bg: 'rgba(52,211,153,0.12)',
    desc: 'Real-time web search with Google grounding. Live data and multimodal support.',
    example: 'Best for: live data, news, research',
  },
];

const ACCEPTED_DOC_TYPES =
  '.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.json,.md,.py,.ts,.js,.tsx,.jsx' +
  ',.html,.css,.sql,.yaml,.yml,.toml,.sh,.bash,.rs,.go,.java,.cpp,.c,.rb,.php,.swift,.kt';

const DOC_META: Record<string, { icon: string; color: string; bg: string }> = {
  pdf:  { icon: '📄', color: '#f87171', bg: 'rgba(248,113,113,0.08)' },
  doc:  { icon: '📝', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)'  },
  docx: { icon: '📝', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)'  },
  xlsx: { icon: '📊', color: '#34d399', bg: 'rgba(52,211,153,0.08)'  },
  xls:  { icon: '📊', color: '#34d399', bg: 'rgba(52,211,153,0.08)'  },
  csv:  { icon: '📊', color: '#34d399', bg: 'rgba(52,211,153,0.08)'  },
  json: { icon: '{ }',color: '#fbbf24', bg: 'rgba(251,191,36,0.08)'  },
  md:   { icon: '📑', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)' },
  txt:  { icon: '📃', color: '#9ca3af', bg: 'rgba(156,163,175,0.08)' },
};
const getDocMeta = (fn: string) => {
  const ext = fn.split('.').pop()?.toLowerCase() ?? '';
  return DOC_META[ext] ?? { icon: '📎', color: '#10B981', bg: 'rgba(16,185,129,0.08)' };
};

const readText   = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result as string);
  r.onerror = () => rej();
  r.readAsText(f);
});
const readBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res((r.result as string).split(',')[1]);
  r.onerror = () => rej();
  r.readAsDataURL(f);
});

// ── Portal dropdown ───────────────────────────────────────────────
interface PortalDropdownProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen:    boolean;
  onClose:   () => void;
  children:  React.ReactNode;
  minWidth?: number;
  align?:    'left' | 'right';
}

const PortalDropdown: React.FC<PortalDropdownProps> = ({
  anchorRef, isOpen, onClose, children, minWidth = 200, align = 'left',
}) => {
  const [pos,    setPos]    = useState({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const update = () => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const pH   = panelRef.current?.offsetHeight ?? 240;
      const pW   = panelRef.current?.offsetWidth  ?? minWidth;
      const openUp = rect.top > pH || rect.top > (window.innerHeight - rect.bottom);
      const top  = openUp ? rect.top - pH - 8 : rect.bottom + 8;
      const left = align === 'right'
        ? Math.max(8, rect.right - pW)
        : Math.min(rect.left, window.innerWidth - pW - 8);
      setPos({ top, left });
    };
    update();
    window.addEventListener('resize',  update);
    window.addEventListener('scroll',  update, true);
    return () => {
      window.removeEventListener('resize',  update);
      window.removeEventListener('scroll',  update, true);
    };
  }, [isOpen, anchorRef, minWidth, align]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current  && !panelRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', h), 10);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return createPortal(
    <div ref={panelRef} style={{
      position: 'fixed', top: pos.top, left: pos.left,
      zIndex: 99999, minWidth,
      background:   'var(--bg-secondary, #0d1117)',
      border:       '1px solid var(--border, rgba(255,255,255,0.12))',
      borderRadius: 12,
      boxShadow:    '0 12px 40px rgba(0,0,0,0.7)',
      overflow:     'hidden',
      animation:    'miDropIn 0.12s ease',
    }}>
      {children}
    </div>,
    document.body,
  );
};

// ═══════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════

interface MessageInputProps {
  onSendMessage:    (content: string, images?: MessageImage[], docs?: AttachedDocument[]) => void;
  onStop:           () => void;
  isDisabled:       boolean;
  preferredModel?:  AIModel | 'auto';
  onModelChange?:   (model: AIModel | 'auto') => void;
  activeSessionId?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage, onStop, isDisabled,
  preferredModel = 'auto', onModelChange, activeSessionId,
}) => {
  const { hasIndex } = useCodebaseIndex();
  const [input,          setInput]          = useState('');
  const [attachedImages, setAttachedImages] = useState<MessageImage[]>([]);
  const [imagePreviews,  setImagePreviews]  = useState<string[]>([]);
  const [attachedDocs,   setAttachedDocs]   = useState<AttachedDocument[]>([]);
  const [isDragOver,     setIsDragOver]     = useState(false);
  const [isRecording,    setIsRecording]    = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showModelDrop,  setShowModelDrop]  = useState(false);
  const [hoveredModel,   setHoveredModel]   = useState<ModelOption | null>(null);
  const [showSlashMenu,  setShowSlashMenu]  = useState(false);
  const [slashQuery,     setSlashQuery]     = useState('');
  const [isProcessing,   setIsProcessing]   = useState(false);
  const [codeChips,      setCodeChips]      = useState<Array<{
    id: string; language: string; content: string; lineCount: number;
  }>>([]);

  const textareaRef   = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef   = useRef<HTMLInputElement>(null);
  const attachBtnRef  = useRef<HTMLButtonElement>(null);
  const modelBtnRef   = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<any>(null);
  const baseInputRef   = useRef('');

  const activeModel = MODEL_OPTIONS.find(m => m.id === preferredModel) ?? MODEL_OPTIONS[0];

  useEffect(() => {
    const ta = textareaRef.current; if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAttachMenu(false); setShowModelDrop(false); setShowSlashMenu(false);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/') && !val.includes(' ')) { setShowSlashMenu(true); setSlashQuery(val.slice(1)); }
    else { setShowSlashMenu(false); setSlashQuery(''); }
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData?.getData('text') ?? '';
    if (text && text.split('\n').length >= 3) {
      const lang = detectPastedCode(text);
      if (lang) {
        e.preventDefault();
        setCodeChips(p => [...p, { id: `chip-${Date.now()}`, language: lang, content: text, lineCount: text.split('\n').length }]);
        return;
      }
    }
    for (const item of Array.from(e.clipboardData?.items ?? [])) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const f = item.getAsFile(); if (!f) return;
        setIsProcessing(true);
        try { const b = await readBase64(f); setAttachedImage({ inlineData: { data: b }, mimeType: f.type }); setImagePreview(URL.createObjectURL(f)); }
        catch {} finally { setIsProcessing(false); }
        return;
      }
    }
  }, []);

  const handleImageFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setIsProcessing(true);
    const newImages: MessageImage[] = [];
    const newPreviews: string[] = [];
    try {
      for (const f of Array.from(files)) {
        const b = await readBase64(f);
        newImages.push({ inlineData: { data: b }, mimeType: f.type });
        newPreviews.push(URL.createObjectURL(f));
      }
      setAttachedImages(p => [...p, ...newImages]);
      setImagePreviews(p => [...p, ...newPreviews]);
    } catch {} finally { setIsProcessing(false); if (imageInputRef.current) imageInputRef.current.value = ''; }
  }, []);

  const handleDocFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setIsProcessing(true);
    const added: AttachedDocument[] = [];
    try { for (const f of Array.from(files)) added.push({ title: f.name, content: await readText(f), type: f.type || 'text/plain' }); setAttachedDocs(p => [...p, ...added]); }
    catch {} finally { setIsProcessing(false); if (docInputRef.current) docInputRef.current.value = ''; }
  }, []);

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragOver(false), []);
  const handleDrop      = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const files = e.dataTransfer.files; if (!files.length) return;
    const imgs: File[] = [], docs: File[] = [];
    for (const f of Array.from(files)) f.type.startsWith('image/') ? imgs.push(f) : docs.push(f);
    if (imgs.length) { const dt = new DataTransfer(); imgs.forEach(f => dt.items.add(f)); await handleImageFiles(dt.files); }
    if (docs.length) { const dt = new DataTransfer(); docs.forEach(f => dt.items.add(f)); await handleDocFiles(dt.files); }
  }, [handleImageFiles, handleDocFiles]);

  const handleMicToggle = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        baseInputRef.current = input;
      };
      recognition.onend   = () => setIsRecording(false);
      recognition.onerror = (e: any) => {
        console.error('Speech recognition error:', e.error);
        setIsRecording(false);
      };

      recognition.onresult = (event: any) => {
        let sessionFinal = '';
        let sessionInterim = '';

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            sessionFinal += res[0].transcript;
          } else {
            sessionInterim += res[0].transcript;
          }
        }

        const base = baseInputRef.current.trim();
        const fullFinal = (base ? base + ' ' : '') + sessionFinal.trim();
        setInput(fullFinal + (sessionInterim ? ' ' + sessionInterim.trim() : ''));
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed && !attachedImages.length && !attachedDocs.length && !codeChips.length) return;
    const codeDocs = codeChips.map(c => ({ title: `${c.language}-snippet.${c.language}`, content: c.content, type: `text/${c.language}` }));
    onSendMessage(trimmed, attachedImages.length ? attachedImages : undefined, [...attachedDocs, ...codeDocs]);
    setInput(''); setAttachedImages([]); setImagePreviews([]); setAttachedDocs([]); setCodeChips([]); setShowSlashMenu(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [input, attachedImages, attachedDocs, codeChips, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !showSlashMenu) {
      if (window.innerWidth < 768) return; // Let Enter create newline on mobile
      e.preventDefault();
      if (!isDisabled) handleSubmit();
    }
  }, [handleSubmit, isDisabled, showSlashMenu]);

  const handleSlashSelect = useCallback((t: string) => {
    setInput(t); setShowSlashMenu(false); setSlashQuery('');
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const hasContent     = !!(input.trim() || attachedImages.length || attachedDocs.length || codeChips.length || hasIndex);
  const hasAttachments = !!(attachedImages.length || attachedDocs.length || codeChips.length || hasIndex);

  // Shared button row item style
  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    width: '100%', padding: '9px 14px',
    background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left', fontSize: 13, fontWeight: 500,
    color: 'var(--text-primary, #e4e8f0)', transition: 'background 0.1s',
    whiteSpace: 'nowrap',
  };
  const hover = (e: React.MouseEvent<HTMLButtonElement>, on: boolean) => {
    e.currentTarget.style.background = on ? 'var(--bg-tertiary, rgba(255,255,255,0.06))' : 'transparent';
  };

  return (
    <div className="mi-root" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <style>{`@keyframes miDropIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Model row */}
      <div className="mi-model-row">
        <button
          ref={modelBtnRef}
          className="mi-model-btn"
          style={{ color: activeModel.color, borderColor: activeModel.bg, background: activeModel.bg }}
          onClick={() => { setShowModelDrop(v => !v); setShowAttachMenu(false); }}
          disabled={isDisabled}
        >
          <span>{activeModel.icon}</span>
          <span>{activeModel.label}</span>
          <svg className={`mi-model-chevron${showModelDrop ? ' mi-model-chevron--open' : ''}`}
            style={{ width: 10, height: 10 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        {/* ── COMPACT model dropdown ─────────────────────────────────
            Single-column list. Detail panel slides in ONLY on hover.
            Width expands from 190px → 380px when a model is hovered. */}
        <PortalDropdown
          anchorRef={modelBtnRef as React.RefObject<HTMLElement>}
          isOpen={showModelDrop}
          onClose={() => { setShowModelDrop(false); setHoveredModel(null); }}
          minWidth={hoveredModel ? 380 : 190}
        >
          <div style={{ display: 'flex', transition: 'width 0.15s' }}>
            {/* Left list — always visible */}
            <div style={{ width: 190, flexShrink: 0, padding: '6px 0',
              borderRight: hoveredModel ? '1px solid var(--border, rgba(255,255,255,0.08))' : 'none' }}>
              {MODEL_OPTIONS.map(m => (
                <button
                  key={m.id}
                  style={{
                    ...itemStyle,
                    fontWeight: m.id === preferredModel ? 700 : 500,
                    color:      m.id === preferredModel ? m.color : 'var(--text-primary, #e4e8f0)',
                    background: m.id === preferredModel ? m.bg : 'transparent',
                  }}
                  onClick={() => { onModelChange?.(m.id); setShowModelDrop(false); setHoveredModel(null); }}
                  onMouseEnter={e => { hover(e, true);  setHoveredModel(m); }}
                  onMouseLeave={e => { hover(e, false); }}
                >
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{m.icon}</span>
                  <span style={{ fontSize: 12, lineHeight: 1.3 }}>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Right detail — ONLY when hovering */}
            {hoveredModel && (
              <div style={{ width: 190, padding: '14px 14px',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                animation: 'miDropIn 0.1s ease' }}>
                <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: hoveredModel.color }}>
                  {hoveredModel.icon} {hoveredModel.label}
                </p>
                <p style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--text-secondary, #8b9ab0)', marginBottom: 6 }}>
                  {hoveredModel.desc}
                </p>
                <p style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--text-secondary, #8b9ab0)', opacity: 0.75 }}>
                  {hoveredModel.example}
                </p>
              </div>
            )}
          </div>
        </PortalDropdown>

        {isProcessing && (
          <div className="mi-processing">
            <span className="mi-processing-dot" /><span>Processing…</span>
          </div>
        )}
      </div>

      {/* Main input box */}
      <div className={`mi-box${isDragOver ? ' mi-box--drag' : ''}`}>

        {isDragOver && (
          <div className="mi-drag-overlay">
            <Icons.Attachment className="icon-24" /><span>Drop files here</span>
          </div>
        )}

        {/* Attachments */}
        {hasAttachments && (
          <div className="mi-attach-row">
            {imagePreviews.map((preview, i) => (
              <div key={`img-${i}`} className="mi-img-card">
                <img src={preview} className="mi-img-card-img" alt="Attached" />
                <button className="mi-img-card-remove" onClick={() => {
                  setAttachedImages(p => p.filter((_, j) => j !== i));
                  setImagePreviews(p => p.filter((_, j) => j !== i));
                }}>
                  <Icons.X className="icon-sm" />
                </button>
              </div>
            ))}
            {attachedDocs.map((doc, i) => {
              const m = getDocMeta(doc.title);
              return (
                <div key={i} className="mi-attach-card" style={{ borderColor: `${m.color}30` }}>
                  <div className="mi-attach-card-icon" style={{ background: m.bg, color: m.color }}>{m.icon}</div>
                  <div className="mi-attach-card-info">
                    <span className="mi-attach-card-name">{doc.title}</span>
                    <span className="mi-attach-card-sub">{doc.type}</span>
                  </div>
                  <button className="mi-attach-card-remove" onClick={() => setAttachedDocs(p => p.filter((_, j) => j !== i))}>
                    <Icons.X className="icon-sm" />
                  </button>
                </div>
              );
            })}
            {codeChips.map(c => (
              <CodeChip key={c.id} language={c.language} content={c.content} lineCount={c.lineCount}
                onRemove={() => setCodeChips(p => p.filter(x => x.id !== c.id))} />
            ))}
            <ProjectIndexChip />
          </div>
        )}

        {/* Input row */}
        <div className="mi-input-row">

          {/* Attach button */}
          <button
            ref={attachBtnRef}
            className={`mi-icon-btn${showAttachMenu ? ' mi-icon-btn--active' : ''}`}
            onClick={() => { setShowAttachMenu(v => !v); setShowModelDrop(false); }}
            disabled={isDisabled}
            title="Attach files"
          >
            <Icons.Attachment className={`mi-attach-icon${showAttachMenu ? ' mi-attach-icon--open' : ''}`} />
          </button>

          {/* Attach menu portal */}
          <PortalDropdown
            anchorRef={attachBtnRef as React.RefObject<HTMLElement>}
            isOpen={showAttachMenu}
            onClose={() => setShowAttachMenu(false)}
            minWidth={210}
          >
            <div style={{ padding: '6px 0' }}>
              <button style={itemStyle} onMouseEnter={e => hover(e, true)} onMouseLeave={e => hover(e, false)}
                onClick={() => { imageInputRef.current?.click(); setShowAttachMenu(false); }}>
                <svg style={{ width: 16, height: 16, color: '#818cf8', flexShrink: 0 }}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Upload image
              </button>
              <button style={itemStyle} onMouseEnter={e => hover(e, true)} onMouseLeave={e => hover(e, false)}
                onClick={() => { docInputRef.current?.click(); setShowAttachMenu(false); }}>
                <svg style={{ width: 16, height: 16, color: '#10B981', flexShrink: 0 }}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Upload file
              </button>
              <div style={{ height: 1, background: 'var(--border, rgba(255,255,255,0.08))', margin: '4px 8px' }} />
              <ProjectUploaderMenuItem onClose={() => setShowAttachMenu(false)} />
              <div style={{ padding: '4px 14px 8px', fontSize: 10, color: 'var(--text-secondary, #8b9ab0)', opacity: 0.65 }}>
                PDF, DOCX, CSV, TXT, code files
              </div>
            </div>
          </PortalDropdown>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            className="mi-textarea"
            placeholder={isDisabled ? 'SEDREX is thinking…' : 'Message SEDREX… (/ for commands)'}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={isDisabled}
            rows={1}
          />

          {/* Right buttons */}
          <div className="mi-right-btns">
            <button className={`mi-icon-btn mi-mic-btn${isRecording ? ' mi-mic-btn--active' : ''}`}
              onClick={handleMicToggle} disabled={isDisabled}
              title={isRecording ? 'Stop recording' : 'Voice input'}>
              {isRecording ? (
                <span className="mi-waveform">
                  <span className="mi-waveform-bar" /><span className="mi-waveform-bar" /><span className="mi-waveform-bar" />
                  <span className="mi-waveform-bar" /><span className="mi-waveform-bar" />
                </span>
              ) : <Icons.Mic className="mi-icon-sm" />}
            </button>

            {isDisabled ? (
              <button className="mi-send-btn mi-send-btn--stop" onClick={onStop} title="Stop">
                <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }} fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                className={`mi-send-btn${hasContent ? ' mi-send-btn--active' : ' mi-send-btn--disabled'}`}
                onClick={hasContent ? handleSubmit : undefined}
                disabled={!hasContent} title="Send">
                <Icons.Send />
              </button>
            )}
          </div>
        </div>
      </div>

      {showSlashMenu && (
        <SlashCommandMenu anchorEl={textareaRef.current} query={slashQuery}
          onSelect={handleSlashSelect} onClose={() => setShowSlashMenu(false)} />
      )}

      <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => handleImageFiles(e.target.files)} />
      <input ref={docInputRef} type="file" accept={ACCEPTED_DOC_TYPES} multiple style={{ display: 'none' }}
        onChange={e => handleDocFiles(e.target.files)} />
    </div>
  );
};

export default MessageInput;