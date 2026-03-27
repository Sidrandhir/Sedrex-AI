// components/ProjectUploader.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Project Uploader v2.1
//
// TWO exports:
//   <ProjectUploaderMenuItem onClose={fn} />  → inside + attach menu
//   <ProjectIndexChip />                      → inside mi-attach-row
//
// FIXED in this version:
//   - Full loading animation with progress % and file name scrolling
//   - Pulsing border on chip while indexing so user knows it's working
//   - Smooth transition from loading → done state
// ══════════════════════════════════════════════════════════════════

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { indexProjectFiles, SUPPORTED_EXTENSIONS } from '../services/fileIndexer';
import { setProjectIndex, useCodebaseIndex } from '../services/codebaseContext';

// ── Shared upload state (module-level so both components share it) ─
type UploadState = 'idle' | 'indexing' | 'done' | 'error';

let _uploadState: UploadState = 'idle';
let _progress = { current: 0, total: 0, file: '', pct: 0 };
let _error     = '';
let _listeners: Array<() => void> = [];

function setUploadState(s: UploadState) { _uploadState = s; _listeners.forEach(f => f()); }
function setProgress(p: typeof _progress) { _progress = p; _listeners.forEach(f => f()); }
function setError(e: string) { _error = e; _listeners.forEach(f => f()); }
export function resetUploadState() { setUploadState('idle'); }

export function useUploadState() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  }, []);
  return { state: _uploadState, progress: _progress, error: _error };
}

export async function runIndexing(files: FileList) {
  if (!files || files.length === 0) return;
  setUploadState('indexing');
  setError('');
  setProgress({ current: 0, total: files.length, file: 'Reading files…', pct: 0 });

  try {
    const index = await indexProjectFiles(Array.from(files), (current, total, file) => {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      setProgress({ current, total, file: file || 'Processing…', pct });
    });

    if (index.totalFiles === 0) {
      setError('No supported files found. Select a folder with .ts, .tsx, .js, or .css files.');
      setUploadState('error');
      return;
    }

    setProjectIndex(index);
    setUploadState('done');
  } catch (err: any) {
    setError(err.message || 'Failed to index project.');
    setUploadState('error');
  }
}

// ══════════════════════════════════════════════════════════════════
// 1. MENU ITEM — inside the + attach menu
// ══════════════════════════════════════════════════════════════════

export const ProjectUploaderMenuItem: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const { state, progress } = useUploadState();
  const { hasIndex } = useCodebaseIndex();

  const onFolderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onClose();
    if (e.target.files) runIndexing(e.target.files);
    if (folderInputRef.current) folderInputRef.current.value = '';
  }, [onClose]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onClose();
    if (e.target.files) runIndexing(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onClose]);

  return (
    <>
      <input ref={folderInputRef} type="file" style={{ display: 'none' }}
        aria-label="Upload project folder"
        // @ts-ignore
        webkitdirectory="" multiple onChange={onFolderChange} />
      <input ref={fileInputRef} type="file" style={{ display: 'none' }}
        aria-label="Upload project files"
        multiple accept={Array.from(SUPPORTED_EXTENSIONS).join(',')} onChange={onFileChange} />

      {/* Section label */}
      <div style={{
        padding: '8px 14px 4px', fontSize: 10, fontWeight: 700,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-secondary)', opacity: 0.6,
        borderTop: '1px solid var(--border)', marginTop: 4,
      }}>
        Codebase context
      </div>

      {/* Folder upload */}
      <button onClick={() => folderInputRef.current?.click()}
        className="mi-attach-menu-item" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          className="mi-attach-menu-icon">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
        </svg>
        <span>{hasIndex ? 'Re-upload project folder' : 'Upload project folder'}</span>
      </button>

      {/* File select */}
      <button onClick={() => fileInputRef.current?.click()}
        className="mi-attach-menu-item" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          className="mi-attach-menu-icon">
          <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
          <path d="M13 2v7h7M9 12h6M9 16h4"/>
        </svg>
        <span>Select source files</span>
      </button>

      <div className="mi-attach-menu-hint" style={{ paddingTop: 4 }}>
        .ts .tsx .js .css .json .md — node_modules excluded
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
};

// ══════════════════════════════════════════════════════════════════
// 2. CHIP — inside mi-attach-row
//    Shows: loading animation → done chip → nothing when cleared
// ══════════════════════════════════════════════════════════════════

export const ProjectIndexChip: React.FC = () => {
  const { state, progress, error } = useUploadState();
  const { hasIndex, totalFiles, projectName, clear } = useCodebaseIndex();

  // ── Indexing state — pulsing progress chip ────────────────────
  if (state === 'indexing') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '5px 12px', borderRadius: 10,
        border: '1px solid rgba(201,169,110,0.4)',
        background: 'rgba(201,169,110,0.06)',
        fontSize: 12, flexShrink: 0, maxWidth: 260,
        animation: 'chipPulse 1.5s ease-in-out infinite',
      }}>
        {/* Spinner */}
        <svg style={{ width: 13, height: 13, flexShrink: 0, animation: 'spin 0.8s linear infinite', color: 'var(--accent, #10B981)' }}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 1.5A6.5 6.5 0 118 14.5" strokeLinecap="round"/>
        </svg>

        {/* Progress info */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: 'var(--accent, #10B981)', fontWeight: 600, fontSize: 11 }}>
            Indexing {progress.pct}%
          </div>
          <div style={{
            color: 'var(--text-secondary)', fontSize: 10,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: 160,
          }}>
            {progress.file}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          width: 40, height: 3, background: 'rgba(201,169,110,0.15)',
          borderRadius: 2, overflow: 'hidden', flexShrink: 0,
        }}>
          <div style={{
            width: `${progress.pct}%`, height: '100%',
            background: 'var(--accent, #10B981)',
            borderRadius: 2, transition: 'width 0.3s ease',
          }}/>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes chipPulse {
            0%, 100% { border-color: rgba(201,169,110,0.4); }
            50%       { border-color: rgba(201,169,110,0.8); }
          }
        `}</style>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 10px', borderRadius: 10,
        border: '1px solid rgba(248,113,113,0.3)',
        background: 'rgba(248,113,113,0.06)',
        fontSize: 11, color: '#f87171', flexShrink: 0,
      }}>
        <svg style={{ width: 12, height: 12, flexShrink: 0 }}
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="7"/><path d="M8 5v3M8 10.5v.5"/>
        </svg>
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {error || 'Indexing failed'}
        </span>
        <button onClick={() => setUploadState('idle')} type="button" aria-label="Dismiss error"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#f87171', display: 'flex' }}>
          <svg style={{ width: 11, height: 11 }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2l12 12M14 2L2 14"/>
          </svg>
        </button>
      </div>
    );
  }

  // ── Done state — green chip ───────────────────────────────────
  if (state === 'done' && hasIndex) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 10px 5px 8px',
        background: 'rgba(74,222,128,0.07)',
        border: '1px solid rgba(74,222,128,0.25)',
        borderRadius: 10, fontSize: 12, flexShrink: 0, maxWidth: 220,
        cursor: 'default',
        animation: 'chipIn 0.2s ease',
      }}
        title={`${totalFiles} files indexed from "${projectName}"`}
      >
        <svg style={{ width: 13, height: 13, flexShrink: 0, color: '#4ade80' }}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontWeight: 500 }}>
          {projectName}
        </span>
        <span style={{ padding: '1px 6px', background: 'rgba(74,222,128,0.15)', borderRadius: 20, fontSize: 10, color: '#4ade80', fontWeight: 600, flexShrink: 0 }}>
          {totalFiles} files
        </span>
        <button onClick={(e) => { e.stopPropagation(); clear(); setUploadState('idle'); }} type="button"
          aria-label="Remove project context"
          style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', flexShrink: 0, marginLeft: 2, opacity: 0.7, transition: 'opacity 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        >
          <svg style={{ width: 12, height: 12 }} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2l12 12M14 2L2 14"/>
          </svg>
        </button>
        <style>{`@keyframes chipIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`}</style>
      </div>
    );
  }

  return null;
};

export default ProjectUploaderMenuItem;