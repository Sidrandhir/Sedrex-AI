// components/OnboardingSurvey.tsx
// ══════════════════════════════════════════════════════════════════
// SEDREX — Onboarding Survey (4 steps)
//   Step 1: Role (developer / student / professional / creator / founder / researcher)
//   Step 2: Primary use (coding / writing / research / planning / work / everything)
//   Step 3: Response style (concise / detailed / casual / technical)
//   Step 4: Optional codebase upload (upload folder OR skip → start chatting)
// ══════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icons } from '../constants';
import './OnboardingSurvey.css';
import { runIndexing, useUploadState } from './ProjectUploader';
import { useCodebaseIndex } from '../services/codebaseContext';
import { onboardingStepViewed, onboardingCompleted, onboardingSkipped } from '../services/posthogService';

type Props = {
  onComplete: (personification: string) => void;
  userName?: string;
};

const OnboardingSurvey: React.FC<Props> = ({ onComplete, userName }) => {
  const [step,     setStep]     = useState(0);
  const [answers,  setAnswers]  = useState({ role: '', purpose: '', style: '' });
  const [fadeIn,   setFadeIn]   = useState(false);
  const [slideDir, setSlideDir] = useState<'in' | 'out'>('in');
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { state: uploadState, progress } = useUploadState();
  const { hasIndex, projectName, totalFiles } = useCodebaseIndex();

  useEffect(() => {
    requestAnimationFrame(() => setFadeIn(true));
    onboardingStepViewed(0, 4);
  }, []);

  const transitionToStep = useCallback((next: number) => {
    setSlideDir('out');
    setTimeout(() => {
      setStep(next);
      setSlideDir('in');
      onboardingStepViewed(next, 4);
    }, 250);
  }, []);

  // ── Data ───────────────────────────────────────────────────────
  const roles = [
    { id: 'developer',   label: 'Developer',   sub: 'Code, debug, build',          icon: '⌨️' },
    { id: 'student',     label: 'Student',      sub: 'Learn, research, study',       icon: '📚' },
    { id: 'professional',label: 'Professional', sub: 'Work, manage, plan',           icon: '💼' },
    { id: 'creator',     label: 'Creator',      sub: 'Write, design, create',        icon: '✏️' },
    { id: 'founder',     label: 'Founder',      sub: 'Strategy, growth, ops',        icon: '🚀' },
    { id: 'researcher',  label: 'Researcher',   sub: 'Analyze, explore, discover',   icon: '🔬' },
  ];

  const purposes = [
    { id: 'coding',      label: 'Coding & Tech',         sub: 'Build and debug software',      icon: '⚡' },
    { id: 'writing',     label: 'Writing & Content',     sub: 'Draft, edit, summarize',         icon: '✍️' },
    { id: 'research',    label: 'Research & Learning',   sub: 'Understand new topics',          icon: '🔍' },
    { id: 'planning',    label: 'Planning & Strategy',   sub: 'Decisions and trade-offs',       icon: '🧠' },
    { id: 'work',        label: 'Day-to-day Tasks',      sub: 'Emails, reports, data',          icon: '📋' },
    { id: 'everything',  label: 'A bit of everything',   sub: 'Versatile all-rounder',          icon: '🌐' },
  ];

  const styles = [
    { id: 'concise',   label: 'Short & direct',       sub: 'Get to the point fast',          icon: '⚡' },
    { id: 'detailed',  label: 'Detailed & thorough',  sub: 'Explain step by step',            icon: '📖' },
    { id: 'casual',    label: 'Casual & friendly',    sub: 'Like chatting with a friend',     icon: '😊' },
    { id: 'technical', label: 'Technical & precise',  sub: 'Exact terms, no fluff',           icon: '🔧' },
  ];

  // ── Build personification string ───────────────────────────────
  const buildPersonification = (): string => {
    const roleMap: Record<string, string> = {
      developer:    'The user is a developer — prioritize code examples, technical accuracy, and implementation details.',
      student:      'The user is a student — explain concepts clearly, use analogies, and support learning.',
      professional: 'The user is a working professional — be structured, actionable, and time-efficient.',
      creator:      'The user is a creative — support writing, ideation, and creative workflows.',
      founder:      'The user is a founder/entrepreneur — focus on strategy, growth, decisions, and execution.',
      researcher:   'The user is a researcher — provide depth, cite reasoning, and support analytical thinking.',
    };
    const purposeMap: Record<string, string> = {
      coding:      'Primary need: coding and technical tasks. Prioritize working code, debugging help, and best practices.',
      writing:     'Primary need: writing and content. Help with drafts, editing, structure, and tone.',
      research:    'Primary need: research and learning. Provide thorough explanations and multiple perspectives.',
      planning:    'Primary need: planning and strategy. Offer frameworks, trade-off analysis, and clear recommendations.',
      work:        'Primary need: everyday work tasks. Help with emails, summaries, reports, and data interpretation.',
      everything:  'The user needs help across many areas. Be versatile, adaptive, and well-rounded.',
    };
    const styleMap: Record<string, string> = {
      concise:   'Response style: concise and direct. Keep answers short, skip unnecessary detail.',
      detailed:  'Response style: detailed and thorough. Explain fully, step by step when needed.',
      casual:    'Response style: casual and conversational. Be warm, approachable, and human.',
      technical: 'Response style: technical and precise. Use proper terminology, be exact.',
    };
    const parts: string[] = [];
    if (answers.role    && roleMap[answers.role])       parts.push(roleMap[answers.role]);
    if (answers.purpose && purposeMap[answers.purpose]) parts.push(purposeMap[answers.purpose]);
    if (answers.style   && styleMap[answers.style])     parts.push(styleMap[answers.style]);
    return parts.length > 0 ? parts.join(' ') : 'Concise and professional';
  };

  const handleFinish = useCallback(() => {
    onboardingCompleted({
      role:             answers.role,
      purpose:          answers.purpose,
      style:            answers.style,
      hasCodebaseIndex: hasIndex,
    });
    onComplete(buildPersonification());
  }, [answers, hasIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSkip = useCallback(() => {
    onboardingSkipped(step);
    onComplete('Concise and professional');
  }, [onComplete, step]);

  const handleFolderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) runIndexing(e.target.files);
    if (folderInputRef.current) folderInputRef.current.value = '';
  }, []);

  // ── Steps ──────────────────────────────────────────────────────
  const TOTAL_STEPS = 4;
  const progress_pct = ((step + 1) / TOTAL_STEPS) * 100;
  const firstName = userName?.split('@')[0]?.split(' ')[0] || '';

  const renderStep = () => {
    switch (step) {
      // ── Step 0: Role ─────────────────────────────────────────
      case 0:
        return (
          <div className={`survey-step ${slideDir === 'in' ? 'slide-in' : 'slide-out'}`}>
            <div className="survey-step-emoji">👋</div>
            <h2 className="survey-step-title">
              {firstName ? `Hey ${firstName}, what describes you best?` : 'What describes you best?'}
            </h2>
            <p className="survey-step-sub">This helps Sedrex tailor every answer to you.</p>
            <div className="survey-options">
              {roles.map(r => (
                <button
                  key={r.id}
                  type="button"
                  className={`survey-option${answers.role === r.id ? ' selected' : ''}`}
                  onClick={() => {
                    setAnswers(p => ({ ...p, role: r.id }));
                    setTimeout(() => transitionToStep(1), 300);
                  }}
                >
                  <span className="option-emoji">{r.icon}</span>
                  <div className="option-text">
                    <span className="option-label">{r.label}</span>
                    <span className="option-sub">{r.sub}</span>
                  </div>
                  <div className="option-check">
                    {answers.role === r.id && <Icons.Check className="w-4 h-4" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      // ── Step 1: Purpose ──────────────────────────────────────
      case 1:
        return (
          <div className={`survey-step ${slideDir === 'in' ? 'slide-in' : 'slide-out'}`}>
            <div className="survey-step-emoji">🎯</div>
            <h2 className="survey-step-title">What will you mostly use Sedrex for?</h2>
            <p className="survey-step-sub">Pick the one that fits best — you can always change later.</p>
            <div className="survey-options">
              {purposes.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className={`survey-option${answers.purpose === p.id ? ' selected' : ''}`}
                  onClick={() => {
                    setAnswers(prev => ({ ...prev, purpose: p.id }));
                    setTimeout(() => transitionToStep(2), 300);
                  }}
                >
                  <span className="option-emoji">{p.icon}</span>
                  <div className="option-text">
                    <span className="option-label">{p.label}</span>
                    <span className="option-sub">{p.sub}</span>
                  </div>
                  <div className="option-check">
                    {answers.purpose === p.id && <Icons.Check className="w-4 h-4" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      // ── Step 2: Response style ────────────────────────────────
      case 2:
        return (
          <div className={`survey-step ${slideDir === 'in' ? 'slide-in' : 'slide-out'}`}>
            <div className="survey-step-emoji">💬</div>
            <h2 className="survey-step-title">How should Sedrex talk to you?</h2>
            <p className="survey-step-sub">Pick your vibe. This shapes every response.</p>
            <div className="survey-options">
              {styles.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`survey-option${answers.style === s.id ? ' selected' : ''}`}
                  onClick={() => {
                    setAnswers(prev => ({ ...prev, style: s.id }));
                    setTimeout(() => transitionToStep(3), 300);
                  }}
                >
                  <span className="option-emoji">{s.icon}</span>
                  <div className="option-text">
                    <span className="option-label">{s.label}</span>
                    <span className="option-sub">{s.sub}</span>
                  </div>
                  <div className="option-check">
                    {answers.style === s.id && <Icons.Check className="w-4 h-4" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      // ── Step 3: Codebase upload (optional) ───────────────────
      case 3:
        return (
          <div className={`survey-step ${slideDir === 'in' ? 'slide-in' : 'slide-out'}`}>
            <div className="survey-step-emoji">📁</div>
            <h2 className="survey-step-title">Index your codebase</h2>
            <p className="survey-step-sub">
              Give Sedrex context about your project — it'll reference your files in every answer.
              <br />This step is completely optional.
            </p>

            <input
              ref={folderInputRef}
              type="file"
              className="survey-hidden-input"
              aria-label="Upload project folder"
              // @ts-ignore
              webkitdirectory=""
              multiple
              onChange={handleFolderChange}
            />

            {/* Idle — upload CTA */}
            {uploadState === 'idle' && !hasIndex && (
              <div className="survey-upload-area">
                <button
                  type="button"
                  className="survey-upload-btn"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="survey-upload-icon">
                    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                    <path d="M12 11v6M9 14l3-3 3 3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="survey-upload-label">Upload project folder</span>
                  <span className="survey-upload-hint">.ts .tsx .js .py .css .json .md and more</span>
                </button>
              </div>
            )}

            {/* Indexing — progress */}
            {uploadState === 'indexing' && (
              <div className="survey-indexing">
                <div className="survey-indexing-header">
                  <svg className="survey-indexing-spinner" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 1.5A6.5 6.5 0 118 14.5" strokeLinecap="round"/>
                  </svg>
                  <span className="survey-indexing-pct">Indexing {progress.pct}%</span>
                </div>
                <div className="survey-indexing-bar-track">
                  <div className="survey-indexing-bar-fill" style={{ width: `${progress.pct}%` }} />
                </div>
                <p className="survey-indexing-file">{progress.file}</p>
              </div>
            )}

            {/* Error */}
            {uploadState === 'error' && (
              <div className="survey-upload-error">
                <span>Could not index project.</span>
                <button type="button" onClick={() => folderInputRef.current?.click()} className="survey-retry-btn">
                  Retry
                </button>
              </div>
            )}

            {/* Done — success chip + continue */}
            {hasIndex && (
              <div className="survey-indexed-success">
                <div className="survey-indexed-chip">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="survey-indexed-icon">
                    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
                  </svg>
                  <span className="survey-indexed-name">{projectName}</span>
                  <span className="survey-indexed-count">{totalFiles} files</span>
                </div>
                <p className="survey-indexed-msg">
                  Sedrex will now reference your code in every answer.
                </p>
              </div>
            )}

            {/* CTA buttons */}
            <div className="survey-step4-actions">
              <button
                type="button"
                className="survey-finish-btn"
                onClick={handleFinish}
                disabled={uploadState === 'indexing'}
              >
                {hasIndex ? 'Start chatting' : 'Skip & start chatting'}
                <span className="finish-arrow">→</span>
              </button>
              {!hasIndex && uploadState !== 'indexing' && (
                <button type="button" className="survey-skip-inline" onClick={handleSkip}>
                  Skip everything
                </button>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`survey-overlay${fadeIn ? ' visible' : ''}`}>
      <div className="survey-container">

        {/* Header */}
        <div className="survey-header">
          <div className="survey-logo">
            <div className="survey-logo-icon">
              <Icons.Robot className="w-5 h-5 text-white" />
            </div>
            <span className="survey-logo-text">SEDREX</span>
          </div>
          {step < 3 && (
            <button type="button" className="survey-skip" onClick={handleSkip}>
              Skip for now
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="survey-progress-bar">
          <div className="survey-progress-fill" style={{ width: `${progress_pct}%` }} />
        </div>
        <div className="survey-progress-label">{step + 1} of {TOTAL_STEPS}</div>

        {/* Content */}
        <div className="survey-content">{renderStep()}</div>

        {/* Back */}
        {step > 0 && step < 3 && (
          <button type="button" className="survey-back" onClick={() => transitionToStep(step - 1)}>
            ← Back
          </button>
        )}
        {step === 3 && (
          <button type="button" className="survey-back" onClick={() => transitionToStep(2)}>
            ← Back
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingSurvey;
