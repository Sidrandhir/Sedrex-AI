// services/codebaseContext.ts
// ══════════════════════════════════════════════════════════════════
// SEDREX — Codebase Context Store
//
// Holds the indexed project in memory for the current session.
// Provides hooks for App.tsx and aiService.ts to read/write it.
//
// Design: module-level singleton so aiService.ts can access it
// without React context (aiService is not a React component).
// ══════════════════════════════════════════════════════════════════

import { ProjectIndex, buildCodebaseContext } from './fileIndexer';

// ── Module-level singleton ────────────────────────────────────────
// Accessible from aiService.ts without React hooks.
let _currentIndex: ProjectIndex | null = null;
let _listeners: Array<() => void> = [];

export function setProjectIndex(index: ProjectIndex | null): void {
  _currentIndex = index;
  _listeners.forEach(fn => fn());
}

export function getProjectIndex(): ProjectIndex | null {
  return _currentIndex;
}

export function clearProjectIndex(): void {
  _currentIndex = null;
  _listeners.forEach(fn => fn());
}

export function subscribeToIndex(fn: () => void): () => void {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

// ── Context injector ──────────────────────────────────────────────
// Called by aiService.ts before every prompt.
// Returns empty string if no project is indexed.
export function getCodebaseContextForQuery(query: string): string {
  if (!_currentIndex) return '';
  return buildCodebaseContext(query, _currentIndex, 8);
}

// ── React hook ───────────────────────────────────────────────────
// Used by App.tsx and Sidebar to read index state reactively.
import { useState, useEffect } from 'react';

export function useCodebaseIndex() {
  const [index, setIndex] = useState<ProjectIndex | null>(_currentIndex);

  useEffect(() => {
    setIndex(_currentIndex);
    const unsub = subscribeToIndex(() => setIndex(_currentIndex));
    return unsub;
  }, []);

  return {
    index,
    hasIndex:    index !== null,
    totalFiles:  index?.totalFiles ?? 0,
    totalChunks: index?.totalChunks ?? 0,
    projectName: index?.projectName ?? '',
    clear:       clearProjectIndex,
    set:         setProjectIndex,
  };
}