import React, { useEffect, useState } from 'react';
import { Icons } from '../constants';
import NexusLogo from '../public/nexus-logo-modern.svg';
import { Link } from 'react-router-dom';
import './LandingPage.css';

type Props = {
  onOpenAuth: () => void;
};

const LandingPage: React.FC<Props> = ({ onOpenAuth }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const [activeWord, setActiveWord] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [currentPrompt, setCurrentPrompt] = useState(0);

  const rotatingWords = ['faster.', 'smarter.', 'clearer.', 'easier.'];
  const typewriterPrompts = [
    'Help me plan a product launch strategy',
    'Debug this React component',
    'What happened in tech today?',
    'Analyze this quarterly report',
  ];
  const routeLabels = ['Reasoning & Planning', 'Coding & Writing', 'Search & Speed', 'Reasoning & Planning'];
  const routeIcons = ['🧠', '⚡', '🔍', '🧠'];

  useEffect(() => {
    const savedTheme = localStorage.getItem('nexus_theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('nexus_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Rotating hero word
  useEffect(() => {
    const interval = setInterval(() => setActiveWord(prev => (prev + 1) % rotatingWords.length), 2600);
    return () => clearInterval(interval);
  }, []);

  // Typewriter effect
  useEffect(() => {
    const prompt = typewriterPrompts[currentPrompt];
    let charIndex = 0;
    setTypedText('');
    setIsTyping(true);

    const typeInterval = setInterval(() => {
      if (charIndex <= prompt.length) {
        setTypedText(prompt.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setIsTyping(false);
        setTimeout(() => setCurrentPrompt(prev => (prev + 1) % typewriterPrompts.length), 2400);
      }
    }, 45);
    return () => clearInterval(typeInterval);
  }, [currentPrompt]);

  // Cursor glow — skip on touch devices (no mouse)
  useEffect(() => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) return;
    const handleMouseMove = (e: MouseEvent) => {
      const el = document.querySelector('.cursor-glow') as HTMLElement;
      if (el) { el.style.left = `${e.clientX}px`; el.style.top = `${e.clientY}px`; }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Intersection Observer for scroll reveals
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(entry => {
        if (entry.isIntersecting) setVisibleSections(prev => new Set([...prev, entry.target.id]));
      }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const isVisible = (id: string) => visibleSections.has(id);

  return (
    <div className={`landing-page ${theme}`}>
      {/* Background */}
      <div className="background-container">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
        <div className="mesh-gradient"></div>
        <div className="grid-pattern"></div>
      </div>
      <div className="cursor-glow"></div>

      {/* Particles */}
      <div className="particles-container">
        {[...Array(16)].map((_, i) => (
          <div
            key={i}
            className="particle particle-style"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 14}s`,
              animationDuration: `${14 + Math.random() * 16}s`,
            }}
          />
        ))}
      </div>

      {/* Nav */}
      <nav className="navbar">
        <div className="nav-container">
          <div className="logo-section">
            <img src={NexusLogo} alt="Nexus Logo" className="logo-icon" style={{width:32, height:32, marginRight:8, filter:'drop-shadow(0 2px 8px #16A34A33)'}} />
            <div className="logo-text">
              <h1 className="logo-title">Nexus AI</h1>
              <p className="logo-subtitle">One input. Best output.</p>
            </div>
          </div>
          <div className="nav-buttons">
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" data-nexus-tooltip={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
              <Icons.Sun className="sun-icon" />
              <Icons.Moon className="moon-icon" />
            </button>
            <button className="nav-btn nav-login" onClick={onOpenAuth}>Sign In</button>
            <button className="nav-btn nav-primary" onClick={onOpenAuth}>Try Free</button>
          </div>
        </div>
      </nav>

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-eyebrow">
              <span className="eyebrow-dot"></span>
              The AI that thinks before it answers
            </div>
            <h2 className="hero-title">
              Stop switching AIs.<br />
              <span className="hero-title-line2">
                Start getting answers{' '}
                <span className="rotating-word-wrapper">
                  {rotatingWords.map((word, i) => (
                    <span key={word} className={`rotating-word ${i === activeWord ? 'active' : ''}`}>{word}</span>
                  ))}
                </span>
              </span>
            </h2>
            <p className="hero-subtitle">
              Nexus understands what you need and routes every question to the right intelligence — reasoning, coding, or live search. You just type.
            </p>
            <div className="hero-cta">
              <button className="btn btn-primary-large btn-glow" onClick={onOpenAuth}>
                Start Free — No Card Needed
                <span className="btn-arrow">→</span>
              </button>
              <a href="#how-it-works" className="btn btn-ghost">
                See how it works
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-chevron"><path d="M7 13l5 5 5-5M7 6l5 5 5-5"/></svg>
              </a>
            </div>
          </div>

          {/* 3D Demo Card */}
          <div className="hero-card">
            <div className="card-3d">
              <div className="card-front">
                <div className="card-browser-bar">
                  <div className="browser-dots">
                    <span className="dot dot-red"></span>
                    <span className="dot dot-yellow"></span>
                    <span className="dot dot-green"></span>
                  </div>
                  <span className="browser-title">Nexus AI</span>
                </div>
                <div className="card-body">
                  <div className="card-input-area">
                    <span className="card-typing">{typedText}<span className={`type-cursor ${isTyping ? 'blink' : ''}`}>|</span></span>
                  </div>
                  <div className="card-routing">
                    <div className="routing-label">
                      <span className="routing-dot"></span>
                      <span className="routing-text">Routed to</span>
                      <span className="routing-active-badge">
                        {routeIcons[currentPrompt]} {routeLabels[currentPrompt]}
                      </span>
                    </div>
                  </div>
                  <div className="card-response">
                    <div className="response-line rl-1"></div>
                    <div className="response-line rl-2"></div>
                    <div className="response-line rl-3"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="trust-strip">
          <p className="trust-text">Built for professionals, developers, and teams who want answers — not options.</p>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section id="how-it-works" className="how-section" data-animate>
        <div className={`section-inner ${isVisible('how-it-works') ? 'visible' : ''}`}>
          <div className="section-header">
            <span className="section-tag">How it works</span>
            <h2 className="section-title">You ask. Nexus thinks. You win.</h2>
            <p className="section-description">Three steps. Zero decision fatigue.</p>
          </div>
          <div className="steps-container">
            <div className="step-line"></div>
            {[
              { num: '01', icon: '💬', title: 'You type naturally', desc: 'Ask anything — strategy, code, current events. No model picking. No guesswork.' },
              { num: '02', icon: '🧠', title: 'Nexus reads your intent', desc: 'Our engine classifies what you need — reasoning, precision, or speed — in milliseconds.' },
              { num: '03', icon: '✨', title: 'Best answer. First try.', desc: 'The right intelligence activates. Accurate, contextual response. No tool-switching.' },
            ].map((step, i) => (
              <div key={step.num} className={`step-card ${isVisible('how-it-works') ? 'visible' : ''} step-delay-${i}`}>
                <div className="step-number">{step.num}</div>
                <div className="step-icon">{step.icon}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ CAPABILITIES ═══════════════ */}
      <section id="capabilities" className="capabilities-section" data-animate>
        <div className={`section-inner ${isVisible('capabilities') ? 'visible' : ''}`}>
          <div className="section-header">
            <span className="section-tag">Capabilities</span>
            <h2 className="section-title">One platform. Every kind of thinking.</h2>
            <p className="section-description">Nexus covers every intent — so you never switch tools again.</p>
          </div>
          <div className="cap-grid">
            {[
              { icon: '🧠', title: 'Reasoning & Planning', desc: 'Strategy, trade-offs, decisions, frameworks. When you need to think deeply — Nexus thinks with you.', tags: ['Compare options', 'Build plans', 'Analyze data'], gradient: 'cap-gradient-1' },
              { icon: '⚡', title: 'Coding & Writing', desc: 'Implementation, debugging, documentation, structured writing. Technical precision on demand.', tags: ['Write code', 'Fix bugs', 'Draft docs'], gradient: 'cap-gradient-2' },
              { icon: '🔍', title: 'Search & Speed', desc: 'Real-time answers, live web search, image understanding, quick summaries. Instant intelligence.', tags: ['Live search', 'Quick facts', 'Summarize'], gradient: 'cap-gradient-3' },
            ].map((cap, i) => (
              <div key={cap.title} className={`cap-card ${cap.gradient} ${isVisible('capabilities') ? 'visible' : ''} cap-delay-${i}`}>
                <div className="cap-icon-large">{cap.icon}</div>
                <h3 className="cap-title">{cap.title}</h3>
                <p className="cap-desc">{cap.desc}</p>
                <div className="cap-tags">{cap.tags.map(t => <span key={t} className="cap-tag">{t}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ PAIN vs GAIN ═══════════════ */}
      <section id="why-nexus" className="pain-section" data-animate>
        <div className={`section-inner ${isVisible('why-nexus') ? 'visible' : ''}`}>
          <div className="section-header">
            <span className="section-tag">The problem</span>
            <h2 className="section-title">You're wasting time choosing AIs.<br/>Nexus ends that.</h2>
          </div>
          <div className="pain-grid">
            <div className={`pain-card pain-old ${isVisible('why-nexus') ? 'visible' : ''}`}>
              <div className="pain-header-bar pain-red"><span className="pain-x">✕</span> Without Nexus</div>
              <ul className="pain-list">
                <li><span className="pain-icon-bad">⏳</span>Open ChatGPT. Not great. Try Claude. Hmm. Try Gemini.</li>
                <li><span className="pain-icon-bad">🤷</span>"Which model is better for this?" — every single time</li>
                <li><span className="pain-icon-bad">💸</span>Pay for 3 subscriptions. Use each one 30% of the time.</li>
                <li><span className="pain-icon-bad">😤</span>Copy-paste context between tools. Lose your flow.</li>
              </ul>
            </div>
            <div className={`pain-card pain-new ${isVisible('why-nexus') ? 'visible' : ''} pain-delay`}>
              <div className="pain-header-bar pain-green"><span className="pain-check">✓</span> With Nexus</div>
              <ul className="pain-list">
                <li><span className="pain-icon-good">⚡</span>One input. Best answer. First try. Every time.</li>
                <li><span className="pain-icon-good">🧠</span>Nexus reads your intent — you never pick a model.</li>
                <li><span className="pain-icon-good">💰</span>One subscription. Full coverage.</li>
                <li><span className="pain-icon-good">🎯</span>Stay in one place. Stay in flow. Stay productive.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ FEATURES ═══════════════ */}
      <section id="features" className="features-section" data-animate>
        <div className={`section-inner ${isVisible('features') ? 'visible' : ''}`}>
          <div className="section-header">
            <span className="section-tag">Built for real work</span>
            <h2 className="section-title">Everything a power user needs.</h2>
            <p className="section-description">Tools that actually save you time.</p>
          </div>
          <div className="features-grid">
            {[
              { icon: '📄', title: 'Drop any file', desc: 'PDFs, Word docs, Excel, CSV, ZIP — drop it in and ask questions about your data.' },
              { icon: '🌐', title: 'Live web search', desc: 'Real-time grounding with current events, prices, and news. Always up-to-date.' },
              { icon: '🎙️', title: 'Voice to text', desc: 'Speak your question. Nexus transcribes and responds. Hands-free intelligence.' },
              { icon: '📊', title: 'Charts & visuals', desc: 'Generate interactive charts from your data — no export needed.' },
              { icon: '🔄', title: 'Smart follow-ups', desc: 'AI suggests the next best question. Keeps your momentum going.' },
              { icon: '🌗', title: 'Light & dark', desc: 'Professional interface in both themes. Built for all-day use.' },
            ].map((feat, i) => (
              <div key={feat.title} className={`feature-card ${isVisible('features') ? 'visible' : ''} feature-delay-${i}`}>
                <div className="feature-icon">{feat.icon}</div>
                <h3 className="feature-title">{feat.title}</h3>
                <p className="feature-desc">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FOMO / MOMENTUM ═══════════════ */}
      <section id="momentum" className="momentum-section" data-animate>
        <div className={`section-inner ${isVisible('momentum') ? 'visible' : ''}`}>
          <div className="momentum-content">
            <h2 className="momentum-title">
              The AI landscape moves fast.<br />
              <span className="momentum-highlight">People who consolidate now, win.</span>
            </h2>
            <p className="momentum-subtitle">
              Every day you spend switching between AI tools is a day someone else spent getting answers in one place.
            </p>
            <div className="momentum-stats">
              <div className="m-stat">
                <span className="m-stat-num">3×</span>
                <span className="m-stat-label">faster than tab-switching between AI tools</span>
              </div>
              <div className="m-stat-divider"></div>
              <div className="m-stat">
                <span className="m-stat-num">1</span>
                <span className="m-stat-label">subscription instead of multiple</span>
              </div>
              <div className="m-stat-divider"></div>
              <div className="m-stat">
                <span className="m-stat-num">0</span>
                <span className="m-stat-label">model decisions you need to make</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ CTA ═══════════════ */}
      <section className="cta-section" data-animate id="cta">
        <div className={`cta-inner ${isVisible('cta') ? 'visible' : ''}`}>
          <div className="cta-glow"></div>
          <span className="cta-eyebrow">Ready?</span>
          <h2 className="cta-title">Your next best answer is one message away.</h2>
          <p className="cta-subtitle">Free to start. No credit card. No model picking. Just results.</p>
          <button className="btn btn-primary-large btn-glow btn-cta" onClick={onOpenAuth}>
            Get Started Free<span className="btn-arrow">→</span>
          </button>
          <p className="cta-microcopy">Takes 10 seconds. Cancel anytime.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <img src={NexusLogo} alt="Nexus Logo" className="footer-logo-icon" style={{width:28, height:28, marginRight:8, filter:'drop-shadow(0 2px 8px #16A34A33)'}} />
            <span className="footer-logo-text">Nexus AI</span>
          </div>
          <p className="footer-copy">&copy; {new Date().getFullYear()} Nexus AI. All rights reserved.</p>
          <div className="footer-links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
