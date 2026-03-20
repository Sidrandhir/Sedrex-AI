import React, { useEffect, useState } from 'react';
import { Icons } from '../constants';
import { Link } from 'react-router-dom';
import './LandingPage.css';

type Props = { onOpenAuth: () => void };

const LandingPage: React.FC<Props> = ({ onOpenAuth }) => {
  const [theme, setTheme]                     = useState<'light' | 'dark'>('dark');
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const [activeWord, setActiveWord]           = useState(0);
  const [typedText, setTypedText]             = useState('');
  const [isTyping, setIsTyping]               = useState(true);
  const [currentPrompt, setCurrentPrompt]     = useState(0);

  const rotatingWords    = ['verify.', 'trust.', 'confirm.', 'know.'];
  const typewriterPrompts = [
    'Is this news article actually accurate?',
    'Verify this scientific claim for me',
    'Cross-check these market numbers',
    'What are reliable sources on this?',
  ];
  const routeLabels = ['Verification', 'Research', 'Analysis', 'Fact-check'];
  const routeIcons  = ['✓', '🔍', '📊', '⚡'];

  // ── Theme init ─────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('sedrex_theme') as 'light' | 'dark' | null;
    setTheme(saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('sedrex_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  // ── Rotating word ──────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setActiveWord(p => (p + 1) % rotatingWords.length), 2600);
    return () => clearInterval(t);
  }, []);

  // ── Typewriter ─────────────────────────────────────────────────
  useEffect(() => {
    const prompt = typewriterPrompts[currentPrompt];
    let i = 0;
    setTypedText('');
    setIsTyping(true);
    const timer = setInterval(() => {
      if (i <= prompt.length) { setTypedText(prompt.slice(0, i)); i++; }
      else {
        clearInterval(timer);
        setIsTyping(false);
        setTimeout(() => setCurrentPrompt(p => (p + 1) % typewriterPrompts.length), 2400);
      }
    }, 45);
    return () => clearInterval(timer);
  }, [currentPrompt]);

  // ── Cursor glow ────────────────────────────────────────────────
  useEffect(() => {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
    const handler = (e: MouseEvent) => {
      const el = document.querySelector('.cursor-glow') as HTMLElement;
      if (el) { el.style.left = `${e.clientX}px`; el.style.top = `${e.clientY}px`; }
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // ── Scroll reveal ──────────────────────────────────────────────
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setVisibleSections(p => new Set([...p, e.target.id])); }),
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('[data-animate]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const vis = (id: string) => visibleSections.has(id);

  // ── SEDREX logo SVG ─────────────────────────────────────────────
  const SedrexLogoSVG = () => (
    <svg viewBox="0 0 28 28" fill="none" style={{ width: 36, height: 36 }}>
      <rect width="28" height="28" rx="7" fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />
      <path
        d="M19 8H11C9.3 8 8 9.3 8 11V12.5C8 14.2 9.3 15.5 11 15.5H17C18.7 15.5 20 16.8 20 18.5V20C20 21.7 18.7 23 17 23H8"
        stroke="#10B981" strokeWidth="1.8" strokeLinecap="round"
      />
    </svg>
  );

  return (
    <div className={`landing-page ${theme}`}>

      {/* ── Background ─────────────────────────────────────────── */}
      <div className="background-container">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="gradient-orb orb-3" />
        <div className="mesh-gradient" />
        <div className="grid-pattern" />
      </div>
      <div className="cursor-glow" />

      {/* ── Particles ──────────────────────────────────────────── */}
      <div className="particles-container">
        {[...Array(14)].map((_, i) => (
          <div key={i} className="particle" style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 14}s`,
            animationDuration: `${14 + Math.random() * 16}s`,
          }} />
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          NAVBAR
          ══════════════════════════════════════════════════════════ */}
      <nav className="navbar">
        <div className="nav-container">
          <div className="logo-section">
            <SedrexLogoSVG />
            <div className="logo-text" style={{ marginLeft: 10 }}>
              <h1 className="logo-title">SEDREX</h1>
              <p className="logo-subtitle">Verify before you act.</p>
            </div>
          </div>
          <div className="nav-buttons">
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              <Icons.Sun className="sun-icon" />
              <Icons.Moon className="moon-icon" />
            </button>
            <button className="nav-btn nav-login" onClick={onOpenAuth}>Sign In</button>
            <button className="nav-btn nav-primary" onClick={onOpenAuth}>Try Free</button>
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════════
          HERO
          ══════════════════════════════════════════════════════════ */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-text">

            <div className="hero-eyebrow">
              <span className="eyebrow-dot" />
              Verification-First Intelligence
            </div>

            <h2 className="hero-title">
              The AI that checks<br />
              <span className="hero-title-line2">
                before it answers.{' '}
                <span className="rotating-word-wrapper">
                  {rotatingWords.map((w, i) => (
                    <span key={w} className={`rotating-word ${i === activeWord ? 'active' : ''}`}>{w}</span>
                  ))}
                </span>
              </span>
            </h2>

            <p className="hero-subtitle">
              SEDREX connects information sources, cross-references evidence, and delivers
              verified, source-backed answers — so you act on truth, not assumption.
            </p>

            <div className="hero-cta">
              <button className="btn btn-primary-large btn-glow" onClick={onOpenAuth}>
                Start Free — No Card Needed
                <span className="btn-arrow">→</span>
              </button>
              <a href="#how-it-works" className="btn btn-ghost">
                See how it works
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="btn-chevron">
                  <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Demo card */}
          <div className="hero-card">
            <div className="card-3d">
              <div className="card-front">
                <div className="card-browser-bar">
                  <div className="browser-dots">
                    <span className="dot dot-red" /><span className="dot dot-yellow" /><span className="dot dot-green" />
                  </div>
                  <span className="browser-title">SEDREX</span>
                </div>
                <div className="card-body">
                  <div className="card-input-area">
                    <span className="card-typing">
                      {typedText}
                      <span className={`type-cursor ${isTyping ? 'blink' : ''}`}>|</span>
                    </span>
                  </div>
                  <div className="card-routing">
                    <div className="routing-label">
                      <span className="routing-dot" />
                      <span className="routing-text">Verified by</span>
                      <span className="routing-active-badge">
                        {routeIcons[currentPrompt]} {routeLabels[currentPrompt]}
                      </span>
                    </div>
                  </div>
                  {/* Confidence indicator */}
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: 2, color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase' }}>
                      Confidence
                    </div>
                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: '87%', height: '100%', background: 'linear-gradient(90deg, #c9a84c, #e8c96a)', borderRadius: 2, animation: 'confBarLoad 1.2s ease both' }} />
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: '#c9a84c', fontWeight: 700 }}>87%</div>
                  </div>
                  <div className="card-response">
                    <div className="response-line rl-1" />
                    <div className="response-line rl-2" />
                    <div className="response-line rl-3" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="trust-strip">
          <p className="trust-text">
            Built for analysts, researchers, journalists, and professionals who cannot afford wrong answers.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          HOW IT WORKS
          ══════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="how-section" data-animate>
        <div className={`section-inner ${vis('how-it-works') ? 'visible' : ''}`}>
          <div className="section-header">
            <span className="section-tag">How it works</span>
            <h2 className="section-title">You ask. SEDREX verifies. You act.</h2>
            <p className="section-description">Three steps. Zero doubt.</p>
          </div>
          <div className="steps-container">
            {[
              { num: '01', icon: '💬', title: 'You ask anything', desc: 'Type a question, paste a claim, or share a document. SEDREX understands context instantly.' },
              { num: '02', icon: '🔗', title: 'SEDREX connects sources', desc: 'Cross-references multiple information sources in parallel, building an evidence chain in real time.' },
              { num: '03', icon: '✓',  title: 'Verified answer delivered', desc: 'You get a structured, confidence-scored, source-backed answer. No guessing, no hallucination.' },
            ].map((step, i) => (
              <div key={step.num} className={`step-card ${vis('how-it-works') ? 'visible' : ''}`}
                style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="step-number">{step.num}</div>
                <div className="step-icon">{step.icon}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          CAPABILITIES
          ══════════════════════════════════════════════════════════ */}
      <section id="capabilities" className="capabilities-section" data-animate>
        <div className={`section-inner ${vis('capabilities') ? 'visible' : ''}`}>
          <div className="section-header">
            <span className="section-tag">Capabilities</span>
            <h2 className="section-title">One platform. Every kind of intelligence.</h2>
            <p className="section-description">SEDREX covers every intent — with verification at the core of every answer.</p>
          </div>
          <div className="cap-grid">
            {[
              { icon: '✓', title: 'Fact Verification', desc: 'Cross-references claims against multiple authoritative sources. Confidence score on every answer. No hallucination.', tags: ['Claim checking', 'Source citation', 'Confidence score'], gradient: 'cap-gradient-1' },
              { icon: '⚡', title: 'Deep Research', desc: 'Multi-source synthesis for complex questions. Connects dots across documents, web, and databases simultaneously.', tags: ['Multi-source', 'Document analysis', 'Web grounding'], gradient: 'cap-gradient-2' },
              { icon: '🔍', title: 'Live Intelligence', desc: 'Real-time web search with instant verification. Current events, prices, and breaking news — always sourced.', tags: ['Live search', 'Breaking news', 'Real-time data'], gradient: 'cap-gradient-3' },
            ].map((cap, i) => (
              <div key={cap.title} className={`cap-card ${cap.gradient} ${vis('capabilities') ? 'visible' : ''}`}
                style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="cap-icon-large">{cap.icon}</div>
                <h3 className="cap-title">{cap.title}</h3>
                <p className="cap-desc">{cap.desc}</p>
                <div className="cap-tags">{cap.tags.map(t => <span key={t} className="cap-tag">{t}</span>)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          PAIN vs GAIN
          ══════════════════════════════════════════════════════════ */}
      <section id="why-sedrex" className="pain-section" data-animate>
        <div className={`section-inner ${vis('why-sedrex') ? 'visible' : ''}`}>
          <div className="section-header">
            <span className="section-tag">The problem</span>
            <h2 className="section-title">AI that guesses is dangerous.<br/>SEDREX verifies.</h2>
          </div>
          <div className="pain-grid">
            <div className={`pain-card ${vis('why-sedrex') ? 'visible' : ''}`}>
              <div className="pain-header-bar pain-red"><span className="pain-x">✕</span> Without SEDREX</div>
              <ul className="pain-list">
                <li><span className="pain-icon-bad">⚠️</span> AI confidently gives wrong answers — you don't know until it's too late.</li>
                <li><span className="pain-icon-bad">🔁</span> You manually verify every important claim across multiple tabs.</li>
                <li><span className="pain-icon-bad">😤</span> No sources cited — can't tell fact from hallucination.</li>
                <li><span className="pain-icon-bad">⏳</span> Hours wasted validating AI output before you can use it.</li>
              </ul>
            </div>
            <div className={`pain-card ${vis('why-sedrex') ? 'visible' : ''}`} style={{ transitionDelay: '100ms' }}>
              <div className="pain-header-bar pain-green"><span className="pain-check">✓</span> With SEDREX</div>
              <ul className="pain-list">
                <li><span className="pain-icon-good">✓</span> Every answer verified against real sources before delivery.</li>
                <li><span className="pain-icon-good">📎</span> Sources cited automatically — click through to verify yourself.</li>
                <li><span className="pain-icon-good">📊</span> Confidence score on every response — you know exactly how sure to be.</li>
                <li><span className="pain-icon-good">⚡</span> Act on information immediately. No re-verification needed.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FEATURES
          ══════════════════════════════════════════════════════════ */}
      <section id="features" className="features-section" data-animate>
        <div className={`section-inner ${vis('features') ? 'visible' : ''}`}>
          <div className="section-header">
            <span className="section-tag">Built for real work</span>
            <h2 className="section-title">Everything a power user needs.</h2>
            <p className="section-description">Tools that actually save you time — and protect your reputation.</p>
          </div>
          <div className="features-grid">
            {[
              { icon: '📎', title: 'Drop any file', desc: 'PDFs, Word docs, Excel, CSV — SEDREX reads and verifies claims in your documents instantly.' },
              { icon: '🌐', title: 'Live web grounding', desc: 'Real-time source verification. Every answer grounded in current, citable information.' },
              { icon: '📊', title: 'Confidence scoring', desc: 'Every answer carries a confidence level. High, moderate, or low — you always know.' },
              { icon: '🔗', title: 'Source citations', desc: 'Clickable sources on every response. Full transparency, full traceability.' },
              { icon: '🔄', title: 'Smart follow-ups', desc: 'SEDREX suggests the deepest next question. Keeps your research momentum going.' },
              { icon: '🌗', title: 'Light & dark mode', desc: 'Professional interface for all-day use. Easy on the eyes, hard on misinformation.' },
            ].map((feat, i) => (
              <div key={feat.title} className={`feature-card ${vis('features') ? 'visible' : ''}`}
                style={{ transitionDelay: `${i * 70}ms` }}>
                <div className="feature-icon">{feat.icon}</div>
                <h3 className="feature-title">{feat.title}</h3>
                <p className="feature-desc">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          MOMENTUM
          ══════════════════════════════════════════════════════════ */}
      <section id="momentum" className="momentum-section" data-animate>
        <div className={`section-inner ${vis('momentum') ? 'visible' : ''}`}>
          <div className="momentum-content">
            <h2 className="momentum-title">
              In a world full of AI noise,<br />
              <span className="momentum-highlight">verified intelligence wins.</span>
            </h2>
            <p className="momentum-subtitle">
              Every decision made on unverified AI output is a liability. SEDREX eliminates that risk.
            </p>
            <div className="momentum-stats">
              <div className="m-stat">
                <span className="m-stat-num">0</span>
                <span className="m-stat-label">hallucinations in verified responses</span>
              </div>
              <div className="m-stat-divider" />
              <div className="m-stat">
                <span className="m-stat-num">3×</span>
                <span className="m-stat-label">faster research with built-in verification</span>
              </div>
              <div className="m-stat-divider" />
              <div className="m-stat">
                <span className="m-stat-num">∞</span>
                <span className="m-stat-label">sources checked before every answer</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          CTA
          ══════════════════════════════════════════════════════════ */}
      <section className="cta-section" data-animate id="cta">
        <div className={`cta-inner ${vis('cta') ? 'visible' : ''}`}>
          <div className="cta-glow" />
          <span className="cta-eyebrow">Ready to stop guessing?</span>
          <h2 className="cta-title">Your next verified answer is one message away.</h2>
          <p className="cta-subtitle">Free to start. No credit card. Verification-first from message one.</p>
          <button className="btn btn-primary-large btn-glow btn-cta" onClick={onOpenAuth}>
            Get Started Free <span className="btn-arrow">→</span>
          </button>
          <p className="cta-microcopy">Takes 10 seconds. Cancel anytime.</p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FOOTER
          ══════════════════════════════════════════════════════════ */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <SedrexLogoSVG />
            <span className="footer-logo-text" style={{ marginLeft: 8 }}>SEDREX</span>
          </div>
          <p className="footer-copy">&copy; {new Date().getFullYear()} SEDREX Technologies Pvt Ltd · India</p>
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