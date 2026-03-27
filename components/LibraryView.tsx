// components/LibraryView.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Library full-page view
// Opens in ChatArea (not sidebar) when user clicks "Library" nav item.
// Shows all generated images and diagrams in a phone-gallery-style grid.
// ══════════════════════════════════════════════════════════════════

import React, { useState, useCallback, useEffect } from 'react';
import './FullViews.css';
import { useArtifacts, setActiveArtifact, openPanel, loadImagesWithContent, Artifact } from '../services/artifactStore';

type LibTab = 'all' | 'images' | 'diagrams';

const LANG_COLORS: Record<string, string> = {
  mermaid: 'rgba(16,185,129,0.15)',
};

const EmptyState = ({ tab }: { tab: LibTab }) => (
  <div className="lv-empty">
    <svg className="lv-empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="4" y="4" width="18" height="18" rx="3"/>
      <rect x="26" y="4" width="18" height="18" rx="3"/>
      <rect x="4" y="26" width="18" height="18" rx="3"/>
      <rect x="26" y="26" width="18" height="18" rx="3"/>
    </svg>
    <p className="lv-empty-title">
      {tab === 'images' ? 'No images yet' : tab === 'diagrams' ? 'No diagrams yet' : 'Your library is empty'}
    </p>
    <p className="lv-empty-sub">
      {tab === 'images'
        ? 'Ask Sedrex to generate an image — it will appear here.'
        : tab === 'diagrams'
        ? 'Ask Sedrex to draw a diagram — it will appear here.'
        : 'Generated images and diagrams from your chats will appear here.'}
    </p>
  </div>
);

const ImageCard = ({ item, onClick }: { item: Artifact; onClick: () => void }) => (
  <button type="button" className="lv-card" onClick={onClick} title={item.title}>
    <div className="lv-card-preview lv-card-preview--image">
      {item.content ? (
        <img
          src={item.content}
          alt={item.title}
          loading="lazy"
          className="lv-card-img"
        />
      ) : (
        <div className="lv-card-img-skeleton" aria-hidden="true" />
      )}
    </div>
    <div className="lv-card-footer">
      <span className="lv-card-title">{item.title}</span>
      <span className="lv-card-meta">Image</span>
    </div>
  </button>
);

const DiagramCard = ({ item, onClick }: { item: Artifact; onClick: () => void }) => (
  <button type="button" className="lv-card" onClick={onClick} title={item.title}>
    <div className="lv-card-preview lv-card-preview--diagram">
      <svg className="lv-diagram-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="6" y="6" width="14" height="12" rx="2"/>
        <rect x="28" y="6" width="14" height="12" rx="2"/>
        <rect x="17" y="30" width="14" height="12" rx="2"/>
        <path d="M13 18v6M35 18v6M24 36V24M13 24h22" strokeLinecap="round"/>
      </svg>
      <span className="lv-diagram-label">Diagram</span>
    </div>
    <div className="lv-card-footer">
      <span className="lv-card-title">{item.title}</span>
      <span className="lv-card-meta">{item.lineCount} lines</span>
    </div>
  </button>
);

const LibraryView: React.FC<{ onClose: () => void; userId?: string }> = ({ onClose, userId }) => {
  const { images, diagrams } = useArtifacts();
  const [tab, setTab] = useState<LibTab>('all');

  // Load image content lazily when Library opens — avoids startup timeout
  useEffect(() => {
    if (userId) {
      loadImagesWithContent(userId).catch(() => {});
    }
  }, [userId]);

  const handleOpen = useCallback((id: string) => {
    setActiveArtifact(id);
    openPanel();
  }, []);

  const safeImages  = images  || [];
  const allItems    = tab === 'all' ? [...safeImages, ...diagrams] : tab === 'images' ? safeImages : diagrams;

  const tabs: { id: LibTab; label: string; count: number }[] = [
    { id: 'all',      label: 'All',      count: safeImages.length + diagrams.length },
    { id: 'images',   label: 'Images',   count: safeImages.length },
    { id: 'diagrams', label: 'Diagrams', count: diagrams.length },
  ];

  return (
    <div className="lv-root">
      {/* Header */}
      <div className="lv-header">
        <div className="lv-header-left">
          <button type="button" className="lv-back" onClick={onClose} aria-label="Back to chat">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 3L5 8l5 5"/>
            </svg>
          </button>
          <h1 className="lv-title">Library</h1>
          <span className="lv-count">{safeImages.length + diagrams.length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="lv-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`lv-tab${tab === t.id ? ' lv-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count > 0 && <span className="lv-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="lv-content">
        {allItems.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="lv-grid">
            {allItems.map(item =>
              item.type === 'image' ? (
                <ImageCard key={item.id} item={item} onClick={() => handleOpen(item.id)} />
              ) : (
                <DiagramCard key={item.id} item={item} onClick={() => handleOpen(item.id)} />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryView;
