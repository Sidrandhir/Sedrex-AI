import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';
import './OnboardingSurvey.css';

type Props = {
  onComplete: (personification: string) => void;
  userName?: string;
};

const OnboardingSurvey: React.FC<Props> = ({ onComplete, userName }) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    role: '',
    purpose: '',
    style: '',
  });
  const [fadeIn, setFadeIn] = useState(false);
  const [slideDir, setSlideDir] = useState<'in' | 'out'>('in');

  useEffect(() => {
    requestAnimationFrame(() => setFadeIn(true));
  }, []);

  const transitionToStep = (nextStep: number) => {
    setSlideDir('out');
    setTimeout(() => {
      setStep(nextStep);
      setSlideDir('in');
    }, 250);
  };

  const roles = [
    { id: 'developer', emoji: '💻', label: 'Developer', sub: 'Code, debug, build' },
    { id: 'student', emoji: '📚', label: 'Student', sub: 'Learn, research, study' },
    { id: 'professional', emoji: '💼', label: 'Professional', sub: 'Work, manage, plan' },
    { id: 'creator', emoji: '🎨', label: 'Creator', sub: 'Write, design, create' },
    { id: 'founder', emoji: '🚀', label: 'Founder', sub: 'Strategy, growth, ops' },
    { id: 'researcher', emoji: '🔬', label: 'Researcher', sub: 'Analyze, explore, discover' },
  ];

  const purposes = [
    { id: 'coding', emoji: '⚡', label: 'Coding & Tech', sub: 'Build and debug software' },
    { id: 'writing', emoji: '✍️', label: 'Writing & Content', sub: 'Draft, edit, summarize' },
    { id: 'research', emoji: '🔍', label: 'Research & Learning', sub: 'Understand new topics' },
    { id: 'planning', emoji: '🧠', label: 'Planning & Strategy', sub: 'Decisions and trade-offs' },
    { id: 'work', emoji: '📋', label: 'Day-to-day Tasks', sub: 'Emails, reports, data' },
    { id: 'everything', emoji: '🌐', label: 'A bit of everything', sub: 'Versatile all-rounder' },
  ];

  const styles = [
    { id: 'concise', emoji: '⚡', label: 'Short & direct', sub: 'Get to the point fast' },
    { id: 'detailed', emoji: '📖', label: 'Detailed & thorough', sub: 'Explain step by step' },
    { id: 'casual', emoji: '😊', label: 'Casual & friendly', sub: 'Like chatting with a friend' },
    { id: 'technical', emoji: '🔧', label: 'Technical & precise', sub: 'Exact terms, no fluff' },
  ];

  const buildPersonification = (): string => {
    const roleMap: Record<string, string> = {
      developer: 'The user is a developer — prioritize code examples, technical accuracy, and implementation details.',
      student: 'The user is a student — explain concepts clearly, use analogies, and support learning.',
      professional: 'The user is a working professional — be structured, actionable, and time-efficient.',
      creator: 'The user is a creative — support writing, ideation, and creative workflows.',
      founder: 'The user is a founder/entrepreneur — focus on strategy, growth, decisions, and execution.',
      researcher: 'The user is a researcher — provide depth, cite reasoning, and support analytical thinking.',
    };
    const purposeMap: Record<string, string> = {
      coding: 'Primary need: coding and technical tasks. Prioritize working code, debugging help, and best practices.',
      writing: 'Primary need: writing and content. Help with drafts, editing, structure, and tone.',
      research: 'Primary need: research and learning. Provide thorough explanations and multiple perspectives.',
      planning: 'Primary need: planning and strategy. Offer frameworks, trade-off analysis, and clear recommendations.',
      work: 'Primary need: everyday work tasks. Help with emails, summaries, reports, and data interpretation.',
      everything: 'The user needs help across many areas. Be versatile, adaptive, and well-rounded.',
    };
    const styleMap: Record<string, string> = {
      concise: 'Response style: concise and direct. Keep answers short, skip unnecessary detail.',
      detailed: 'Response style: detailed and thorough. Explain fully, step by step when needed.',
      casual: 'Response style: casual and conversational. Be warm, approachable, and human.',
      technical: 'Response style: technical and precise. Use proper terminology, be exact.',
    };

    const parts: string[] = [];
    if (answers.role && roleMap[answers.role]) parts.push(roleMap[answers.role]);
    if (answers.purpose && purposeMap[answers.purpose]) parts.push(purposeMap[answers.purpose]);
    if (answers.style && styleMap[answers.style]) parts.push(styleMap[answers.style]);

    return parts.length > 0 ? parts.join(' ') : 'Concise and professional';
  };

  const handleFinish = () => {
    const personification = buildPersonification();
    onComplete(personification);
  };

  const handleSkip = () => {
    onComplete('Concise and professional');
  };

  const totalSteps = 3;
  const progress = ((step + 1) / totalSteps) * 100;
  const firstName = userName?.split(' ')[0] || '';

  const renderStep = () => {
    switch (step) {
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
                  className={`survey-option ${answers.role === r.id ? 'selected' : ''}`}
                  onClick={() => {
                    setAnswers(p => ({ ...p, role: r.id }));
                    setTimeout(() => transitionToStep(1), 300);
                  }}
                >
                  <span className="option-emoji">{r.emoji}</span>
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
                  className={`survey-option ${answers.purpose === p.id ? 'selected' : ''}`}
                  onClick={() => {
                    setAnswers(prev => ({ ...prev, purpose: p.id }));
                    setTimeout(() => transitionToStep(2), 300);
                  }}
                >
                  <span className="option-emoji">{p.emoji}</span>
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
                  className={`survey-option ${answers.style === s.id ? 'selected' : ''}`}
                  onClick={() => {
                    setAnswers(prev => ({ ...prev, style: s.id }));
                  }}
                >
                  <span className="option-emoji">{s.emoji}</span>
                  <div className="option-text">
                    <span className="option-label">{s.label}</span>
                    <span className="option-sub">{s.sub}</span>
                  </div>
                  <div className="option-check">
                    {answers.style === s.id && <Icons.Check className="w-4 h-4" />}
                  </div>
                </button>
              ))}
              {answers.style && (
                <button className="survey-finish-btn" onClick={handleFinish}>
                  Let's go <span className="finish-arrow">→</span>
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
    <div className={`survey-overlay ${fadeIn ? 'visible' : ''}`}>
      <div className="survey-container">
        {/* Header */}
        <div className="survey-header">
          <div className="survey-logo">
            <div className="survey-logo-icon"><Icons.Robot className="w-5 h-5 text-white" /></div>
            <span className="survey-logo-text">SEDREX</span>
          </div>
          <button className="survey-skip" onClick={handleSkip}>
            Skip for now
          </button>
        </div>

        {/* Progress */}
        <div className="survey-progress-bar">
          <div className="survey-progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="survey-progress-label">
          {step + 1} of {totalSteps}
        </div>

        {/* Content */}
        <div className="survey-content">
          {renderStep()}
        </div>

        {/* Back button */}
        {step > 0 && (
          <button className="survey-back" onClick={() => transitionToStep(step - 1)}>
            ← Back
          </button>
        )}
      </div>
    </div>
  );
};

export default OnboardingSurvey;
