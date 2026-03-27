// components/LandingPage.tsx
import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

type Props = { onOpenAuth: () => void };

/* ── SVG Icons ───────────────────────────────────────────────── */
const IcoCode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </svg>
);
const IcoDiagram = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <path d="M7 10v4M17 10v4M10 7h4"/>
  </svg>
);
const IcoImage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);
const IcoBrain = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
  </svg>
);
const IcoSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const IcoShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IcoZap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const IcoUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const IcoBarChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);
const IcoCheck = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="2 8 6 12 14 4"/>
  </svg>
);
const IcoX = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>
  </svg>
);
const IcoArrowUp = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 16V4M4 10l6-6 6 6"/>
  </svg>
);
const IcoArrowDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22" aria-hidden="true">
    <path d="M12 5v14M5 12l7 7 7-7"/>
  </svg>
);
const IcoSun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const IcoMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const IcoMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" width="22" height="22">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const IcoClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" width="22" height="22">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

/* ── Logo ──────────────────────────────────────────────────── */
const LogoMark = ({ size = 30 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" fill="none" width={size} height={size} aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.22)" strokeWidth="1"/>
    <path d="M21 9.5H13C11.07 9.5 9.5 11.07 9.5 13V14.2C9.5 16.13 11.07 17.7 13 17.7H19C20.93 17.7 22.5 19.27 22.5 21.2V22C22.5 23.93 20.93 25.5 19 25.5H9.5"
      stroke="#10B981" strokeWidth="2.1" strokeLinecap="round"/>
  </svg>
);

/* ── Marquee items ─────────────────────────────────────────── */
const MARQUEE = [
  'Live code execution', 'Architecture diagrams', 'Deep reasoning',
  'Image generation', 'Real-time web search', 'Codebase analysis',
  'Artifact history', 'Instant preview', 'Data visualisation',
  'Enterprise security', 'Context persistence', 'Smart routing',
];

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */
const LandingPage: React.FC<Props> = ({ onOpenAuth }) => {
  const [theme, setTheme]       = useState<'light' | 'dark'>('dark');
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [typedText, setTypedText]   = useState('');
  const [isTyping, setIsTyping]     = useState(true);
  const [promptIdx, setPromptIdx]   = useState(0);
  const [stats, setStats] = useState({ tokens: 0, latency: 0, artifacts: 0 });
  const statsDone = useRef(false);

  const PROMPTS = [
    'Build me a real-time analytics dashboard',
    'Debug this race condition in my code',
    'Draw an architecture diagram for my system',
    'Analyse this dataset and chart the trends',
    'Write an auth service with refresh tokens',
    'Create a dark-mode component library',
  ];

  /* theme init */
  useEffect(() => {
    const saved = localStorage.getItem('sedrex_theme') as 'light' | 'dark' | null;
    const sys   = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(saved ?? sys);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('sedrex_theme', next);
  };

  /* scroll */
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);

  /* lock body when mobile menu open */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  /* typewriter */
  useEffect(() => {
    const prompt = PROMPTS[promptIdx];
    let i = 0;
    setTypedText('');
    setIsTyping(true);
    const t = setInterval(() => {
      if (i <= prompt.length) { setTypedText(prompt.slice(0, i)); i++; }
      else {
        clearInterval(t);
        setIsTyping(false);
        setTimeout(() => setPromptIdx(p => (p + 1) % PROMPTS.length), 2800);
      }
    }, 34);
    return () => clearInterval(t);
  }, [promptIdx]);

  /* scroll reveal */
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('lp-in');
          if (e.target.id === 'lp-stats' && !statsDone.current) {
            statsDone.current = true;
            animateStats();
          }
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.lp-reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  /* cursor radial on caps */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      document.querySelectorAll<HTMLElement>('.lp-cap').forEach(cap => {
        const r = cap.getBoundingClientRect();
        cap.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        cap.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    };
    window.addEventListener('mousemove', h, { passive: true });
    return () => window.removeEventListener('mousemove', h);
  }, []);

  const animateStats = () => {
    const dur = 1800;
    const start = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const p = easeOut(Math.min((now - start) / dur, 1));
      setStats({
        tokens:    parseFloat((p * 1.5).toFixed(1)),
        latency:   Math.round(p * 98),
        artifacts: Math.round(p * 10000),
      });
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={`lp ${theme}`} lang="en">

      {/* ── NAV ──────────────────────────────────────────────── */}
      <nav className={`lp-nav${scrolled ? ' lp-nav--scrolled' : ''}`} role="navigation" aria-label="Main navigation">
        <div className="lp-nav-inner">

          <button type="button" className="lp-nav-logo" onClick={onOpenAuth} aria-label="Go to Sedrex home">
            <LogoMark />
            <span className="lp-nav-logo-name">Sedrex</span>
          </button>

          <div className="lp-nav-links" role="list">
            <a href="#capabilities" className="lp-nav-link" role="listitem">Capabilities</a>
            <a href="#how-it-works" className="lp-nav-link" role="listitem">How it works</a>
            <a href="#who-its-for"  className="lp-nav-link" role="listitem">Who it's for</a>
            <Link to="/pricing"     className="lp-nav-link" role="listitem">Pricing</Link>
          </div>

          <div className="lp-nav-right">
            <button type="button" className="lp-nav-theme" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <IcoSun /> : <IcoMoon />}
            </button>
            <button type="button" className="lp-nav-signin" onClick={onOpenAuth}>Sign in</button>
            <button type="button" className="lp-nav-cta"    onClick={onOpenAuth}>Start free</button>
            <button type="button" className="lp-nav-hamburger" onClick={() => setMenuOpen(v => !v)} aria-label="Toggle menu" aria-expanded={menuOpen}>
              {menuOpen ? <IcoClose /> : <IcoMenu />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div className={`lp-drawer${menuOpen ? ' lp-drawer--open' : ''}`} aria-hidden={!menuOpen}>
        <div className="lp-drawer-inner">
          <a href="#capabilities" className="lp-drawer-link" onClick={closeMenu}>Capabilities</a>
          <a href="#how-it-works" className="lp-drawer-link" onClick={closeMenu}>How it works</a>
          <a href="#who-its-for"  className="lp-drawer-link" onClick={closeMenu}>Who it's for</a>
          <Link to="/pricing"     className="lp-drawer-link" onClick={closeMenu}>Pricing</Link>
          <div className="lp-drawer-divider" />
          <button type="button" className="lp-drawer-signin" onClick={() => { closeMenu(); onOpenAuth(); }}>Sign in</button>
          <button type="button" className="lp-drawer-cta"    onClick={() => { closeMenu(); onOpenAuth(); }}>Start building free →</button>
        </div>
      </div>
      {menuOpen && <div className="lp-drawer-overlay" onClick={closeMenu} aria-hidden="true" />}

      {/* ══════════════════════════════════════════════════════
          HERO
          ══════════════════════════════════════════════════════ */}
      <section className="lp-hero" aria-label="Hero">
        <div className="lp-hero-ambient" aria-hidden="true" />
        <div className="lp-hero-grid"    aria-hidden="true" />

        <div className="lp-hero-inner">
          <div className="lp-hero-left">

            <div className="lp-hero-eyebrow">
              <span className="lp-eyebrow-dot" aria-hidden="true" />
              Every AI model. Zero tab-switching.
            </div>

            <h1 className="lp-hero-h1">
              One question.<br />
              The sharpest answer.<br />
              <em className="lp-hero-em">Every single time.</em>
            </h1>

            <p className="lp-hero-sub">
              Sedrex reads what you need, picks the best AI for it, and delivers the output as something you can actually use — running code, a live diagram, a rendered image — right inside one workspace.
            </p>

            <div className="lp-hero-bar-wrap">
              <div className="lp-hero-bar" onClick={onOpenAuth} role="button" tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && onOpenAuth()} aria-label="Start building">
                <span className="lp-bar-typed" aria-live="polite">{typedText}<span className={`lp-bar-cursor${isTyping ? ' lp-bar-cursor--blink' : ''}`} aria-hidden="true">|</span></span>
                <button type="button" className="lp-bar-send" onClick={e => { e.stopPropagation(); onOpenAuth(); }} aria-label="Send">
                  <IcoArrowUp />
                </button>
              </div>
            </div>

            <div className="lp-hero-chips" role="list" aria-label="Quick actions">
              {['Write code', 'Debug errors', 'Draw diagrams', 'Generate images', 'Research anything'].map(c => (
                <button type="button" key={c} className="lp-chip" onClick={onOpenAuth} role="listitem">{c}</button>
              ))}
            </div>

          </div>

          {/* Product mockup */}
          <div className="lp-hero-mockup" aria-label="Product preview" aria-hidden="true">
            <div className="lp-mock-window">
              <div className="lp-mock-titlebar">
                <div className="lp-mock-dots">
                  <span /><span /><span />
                </div>
                <span className="lp-mock-title">Sedrex</span>
                <span className="lp-mock-badge">● Live</span>
              </div>
              <div className="lp-mock-body">
                {/* Chat pane */}
                <div className="lp-mock-chat">
                  <div className="lp-mock-msg lp-mock-msg--user">Build a real-time dashboard with charts</div>
                  <div className="lp-mock-msg lp-mock-msg--ai">
                    <div className="lp-mock-model-tag">Claude Sonnet 4.6</div>
                    <div className="lp-mock-msg-text">Building your dashboard with live data support and responsive charts…</div>
                    <div className="lp-mock-artifact-ref">
                      <IcoCode />
                      <span>dashboard.tsx · 147 lines</span>
                      <span className="lp-mock-run">▶ Running</span>
                    </div>
                  </div>
                  <div className="lp-mock-suggestions">
                    <span>Add dark mode</span>
                    <span>Export as PDF</span>
                    <span>Add filters</span>
                  </div>
                </div>
                {/* Artifact pane */}
                <div className="lp-mock-artifact">
                  <div className="lp-mock-artifact-bar">
                    <span className="lp-mock-fname">dashboard.tsx</span>
                    <div className="lp-mock-artifact-tabs">
                      <span className="active">Code</span>
                      <span>Preview</span>
                    </div>
                  </div>
                  <div className="lp-mock-code">
                    <div className="lp-cl"><span className="lp-ck">import</span> <span className="lp-cn">React</span><span className="lp-cp">,</span> <span className="lp-cp">{'{'}</span> <span className="lp-cn">useState</span> <span className="lp-cp">{'}'}</span> <span className="lp-ck">from</span> <span className="lp-cs">'react'</span></div>
                    <div className="lp-cl"><span className="lp-ck">import</span> <span className="lp-cp">{'{'}</span> <span className="lp-cn">LineChart</span><span className="lp-cp">,</span> <span className="lp-cn">ResponsiveContainer</span> <span className="lp-cp">{'}'}</span></div>
                    <div className="lp-cl lp-cl-dim">  <span className="lp-ck">from</span> <span className="lp-cs">'recharts'</span></div>
                    <div className="lp-cl"> </div>
                    <div className="lp-cl"><span className="lp-ck">export default function</span> <span className="lp-cf">Dashboard</span><span className="lp-cp">() {'{'}</span></div>
                    <div className="lp-cl lp-cl-dim">  <span className="lp-ck">const</span> <span className="lp-cv">[data, setData]</span> <span className="lp-cp">=</span> <span className="lp-cf">useState</span><span className="lp-cp">([])</span></div>
                    <div className="lp-cl"> </div>
                    <div className="lp-cl lp-cl-dim">  <span className="lp-ck">return</span> <span className="lp-cp">(</span></div>
                    <div className="lp-cl lp-cl-highlight">    <span className="lp-cp">&lt;</span><span className="lp-cn">ResponsiveContainer</span> <span className="lp-ca">width</span><span className="lp-cp">=</span><span className="lp-cs">"100%"</span><span className="lp-cp">&gt;</span></div>
                    <div className="lp-cl lp-cl-dim">      <span className="lp-cp">&lt;</span><span className="lp-cn">LineChart</span> <span className="lp-ca">data</span><span className="lp-cp">={'{'}data{'}'}</span><span className="lp-cp">/&gt;</span></div>
                    <div className="lp-cl lp-cl-dim">    <span className="lp-cp">&lt;/</span><span className="lp-cn">ResponsiveContainer</span><span className="lp-cp">&gt;</span></div>
                    <div className="lp-cl lp-cl-dim">  <span className="lp-cp">)</span></div>
                    <div className="lp-cl"><span className="lp-cp">{'}'}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-scroll-cue" aria-hidden="true"><IcoArrowDown /></div>
      </section>

      {/* ── Capability strip ───────────────────────────────── */}
      <div className="lp-models" aria-label="What Sedrex handles">
        <div className="lp-wrap">
          <div className="lp-models-inner">
            <span className="lp-models-label">Handles</span>
            <div className="lp-models-logos" role="list">
              {['Code & debugging', 'System design', 'Data analysis', 'Image creation', 'Live research', 'Deep reasoning', 'Writing & docs'].map(m => (
                <span key={m} className="lp-model-tag" role="listitem">{m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────────── */}
      <div className="lp-stats" role="region" aria-label="Platform statistics">
        <div className="lp-wrap">
          <div className="lp-stats-inner lp-reveal" id="lp-stats">
            <div className="lp-stat">
              <div className="lp-stat-num">{stats.tokens.toFixed(1)}<span className="lp-stat-unit">M+</span></div>
              <div className="lp-stat-label">Context window</div>
            </div>
            <div className="lp-stat-divider" aria-hidden="true" />
            <div className="lp-stat">
              <div className="lp-stat-num">&lt;{stats.latency || 100}<span className="lp-stat-unit">ms</span></div>
              <div className="lp-stat-label">First response</div>
            </div>
            <div className="lp-stat-divider" aria-hidden="true" />
            <div className="lp-stat">
              <div className="lp-stat-num">{stats.artifacts.toLocaleString()}<span className="lp-stat-unit">+</span></div>
              <div className="lp-stat-label">Artifacts shipped</div>
            </div>
            <div className="lp-stat-divider" aria-hidden="true" />
            <div className="lp-stat">
              <div className="lp-stat-num">6<span className="lp-stat-unit">+</span></div>
              <div className="lp-stat-label">Intelligence sources</div>
            </div>
            <div className="lp-stat-divider" aria-hidden="true" />
            <div className="lp-stat">
              <div className="lp-stat-num lp-stat-num--badge">Enterprise<span className="lp-stat-unit"> ready</span></div>
              <div className="lp-stat-label">Secure by design</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Marquee ─────────────────────────────────────────── */}
      <div className="lp-marquee" aria-hidden="true">
        <div className="lp-marquee-track">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <div key={i} className="lp-marquee-item">
              <span className="lp-marquee-dot" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CAPABILITIES
          ══════════════════════════════════════════════════════ */}
      <section className="lp-section" id="capabilities" aria-label="Capabilities">
        <div className="lp-wrap">
          <div className="lp-reveal">
            <div className="lp-section-label">What Sedrex does</div>
            <h2 className="lp-h2">Ask once.<br /><strong>Get it done.</strong></h2>
            <p className="lp-h2-sub">Most tools make you think about which AI to use. Sedrex thinks for you — picks the right intelligence, runs your work, and delivers something you can actually ship.</p>
          </div>

          <div className="lp-caps">

            {/* Code */}
            <div className="lp-cap lp-reveal lp-d1">
              <div className="lp-cap-eyebrow"><span>01</span><div className="lp-cap-line" />Code Execution</div>
              <div className="lp-cap-icon"><IcoCode /></div>
              <div className="lp-cap-title">Write it. Run it. Ship it.</div>
              <div className="lp-cap-desc">Code Sedrex writes runs immediately and shows you a live preview. No copy-pasting into a terminal. No "it works on my machine." Just output, right there.</div>
              <div className="lp-cap-preview">
                <div className="lp-preview-bar">
                  <div className="lp-preview-dots" aria-hidden="true"><span/><span/><span className="lp-dot-green"/></div>
                  <span className="lp-preview-fname">dashboard.tsx</span>
                  <span className="lp-preview-status">▶ Running</span>
                </div>
                <div className="lp-preview-body">
                  <div className="lp-cl"><span className="lp-ck">import</span> <span className="lp-cn">React</span> <span className="lp-ck">from</span> <span className="lp-cs">'react'</span></div>
                  <div className="lp-cl"><span className="lp-ck">import</span> <span className="lp-cp">{'{'}</span> <span className="lp-cn">LineChart</span> <span className="lp-cp">{'}'}</span> <span className="lp-ck">from</span> <span className="lp-cs">'recharts'</span></div>
                  <div className="lp-cl"> </div>
                  <div className="lp-cl lp-cl-highlight"><span className="lp-ck">export default function</span> <span className="lp-cf">Dashboard</span><span className="lp-cp">{'() {'}</span></div>
                  <div className="lp-cl lp-cl-dim">  <span className="lp-ck">return</span> <span className="lp-cp">&lt;</span><span className="lp-cn">LineChart</span> <span className="lp-ca">data</span><span className="lp-cp">={'{data}'} /&gt;</span></div>
                  <div className="lp-cl"><span className="lp-cp">{'}'}</span></div>
                </div>
              </div>
            </div>

            {/* Diagrams */}
            <div className="lp-cap lp-reveal lp-d2">
              <div className="lp-cap-eyebrow"><span>02</span><div className="lp-cap-line" />Diagram Generation</div>
              <div className="lp-cap-icon"><IcoDiagram /></div>
              <div className="lp-cap-title">Draw the system, skip the tool.</div>
              <div className="lp-cap-desc">Describe your system in plain language. Sedrex draws the architecture diagram, flowchart, or ERD — export it as SVG or PNG and drop it straight into your docs.</div>
              <div className="lp-cap-preview">
                <div className="lp-preview-bar">
                  <div className="lp-preview-dots" aria-hidden="true"><span/><span/><span className="lp-dot-green"/></div>
                  <span className="lp-preview-fname">system-arch.svg</span>
                </div>
                <div className="lp-diag">
                  <div className="lp-dnode">Client</div>
                  <div className="lp-dline" aria-hidden="true" />
                  <div className="lp-dnode lp-dnode--accent">API Gateway</div>
                  <div className="lp-drow" aria-hidden="true">
                    <div className="lp-dline-h" /><div className="lp-dline-h" /><div className="lp-dline-h" />
                  </div>
                  <div className="lp-dnodes">
                    {['Auth', 'Services', 'Storage'].map(n => (
                      <div key={n} className="lp-dnode lp-dnode--sm">{n}</div>
                    ))}
                  </div>
                  <div className="lp-diag-note">Auto-generated · SVG / PNG export</div>
                </div>
              </div>
            </div>

            {/* Images */}
            <div className="lp-cap lp-reveal lp-d3">
              <div className="lp-cap-eyebrow"><span>03</span><div className="lp-cap-line" />Image Generation</div>
              <div className="lp-cap-icon"><IcoImage /></div>
              <div className="lp-cap-title">Describe it. See it.</div>
              <div className="lp-cap-desc">Turn a text prompt into a high-quality image — UI mockups, brand visuals, photorealistic renders. Generated, refined, and ready to use without opening a single design tool.</div>
              <div className="lp-cap-preview">
                <div className="lp-preview-bar">
                  <div className="lp-preview-dots" aria-hidden="true"><span/><span/><span className="lp-dot-green"/></div>
                  <span className="lp-preview-fname">image · 2048×2048</span>
                </div>
                <div className="lp-imgrid">
                  {['UI Mockup', 'Brand Asset', 'Data Viz', 'Render'].map((label, i) => (
                    <div key={i} className={`lp-imtile lp-imtile--${i + 1}`}>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reasoning */}
            <div className="lp-cap lp-reveal lp-d4">
              <div className="lp-cap-eyebrow"><span>04</span><div className="lp-cap-line" />Deep Reasoning</div>
              <div className="lp-cap-icon"><IcoBrain /></div>
              <div className="lp-cap-title">The answer, not the guess.</div>
              <div className="lp-cap-desc">Hard questions trigger a deeper pass — Sedrex breaks the problem apart, checks its own reasoning, and only responds when the answer is solid. First response, right response.</div>
              <div className="lp-cap-preview">
                <div className="lp-preview-bar">
                  <div className="lp-preview-dots" aria-hidden="true"><span/><span/><span className="lp-dot-green"/></div>
                  <span className="lp-preview-fname">reasoning trace</span>
                </div>
                <div className="lp-rchain">
                  {[
                    { label: 'Intent parsing',    s: 'done'   },
                    { label: 'Context retrieval', s: 'done'   },
                    { label: 'Deep reasoning',    s: 'active', badge: 'Live' },
                    { label: 'Cross-verification',s: 'wait'   },
                    { label: 'Output synthesis',  s: 'wait'   },
                  ].map((r, i) => (
                    <div key={i} className={`lp-rstep lp-rstep--${r.s}`}>
                      <div className="lp-rdot" aria-hidden="true" />
                      <span>{r.label}</span>
                      {r.badge && <span className="lp-rbadge">{r.badge}</span>}
                      {r.s === 'done' && <span className="lp-rcheck" aria-label="Complete"><IcoCheck /></span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Search */}
            <div className="lp-cap lp-reveal lp-d5">
              <div className="lp-cap-eyebrow"><span>05</span><div className="lp-cap-line" />Live Search</div>
              <div className="lp-cap-icon"><IcoSearch /></div>
              <div className="lp-cap-title">Not last year. Right now.</div>
              <div className="lp-cap-desc">When your question needs a fresh answer, Sedrex pulls from the live web — so you never get confidently wrong information about something that changed last Tuesday.</div>
              <div className="lp-cap-preview">
                <div className="lp-preview-bar">
                  <div className="lp-preview-dots" aria-hidden="true"><span/><span/><span className="lp-dot-green"/></div>
                  <span className="lp-preview-fname">live · grounded</span>
                </div>
                <div className="lp-search-demo">
                  <div className="lp-search-row"><span className="lp-search-icon"><IcoSearch /></span><span className="lp-search-q">Latest React 19 features</span></div>
                  <div className="lp-search-sources">
                    <div className="lp-source">react.dev · 2 min ago</div>
                    <div className="lp-source">github.com · 14 min ago</div>
                    <div className="lp-source">vercel.com · 1 hr ago</div>
                  </div>
                  <div className="lp-search-answer">React 19 ships with Actions, use() hook, and improved hydration…</div>
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="lp-cap lp-reveal lp-d6">
              <div className="lp-cap-eyebrow"><span>06</span><div className="lp-cap-line" />Enterprise Security</div>
              <div className="lp-cap-icon"><IcoShield /></div>
              <div className="lp-cap-title">Your data stays yours.</div>
              <div className="lp-cap-desc">Encrypted end-to-end. Code runs in isolation. Nothing you share is used to train anything. Audit logs, SSO, and role controls for teams that take security seriously.</div>
              <div className="lp-cap-preview">
                <div className="lp-preview-bar">
                  <div className="lp-preview-dots" aria-hidden="true"><span/><span/><span className="lp-dot-green"/></div>
                  <span className="lp-preview-fname">security posture</span>
                </div>
                <div className="lp-security-list">
                  {['End-to-end encrypted', 'Sandboxed execution', 'No training on your data', 'Audit trail & logs', 'SSO ready', 'GDPR compliant'].map(f => (
                    <div key={f} className="lp-security-row">
                      <span className="lp-security-check"><IcoCheck /></span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          HOW IT WORKS
          ══════════════════════════════════════════════════════ */}
      <section className="lp-how" id="how-it-works" aria-label="How it works">
        <div className="lp-wrap">
          <div className="lp-how-head lp-reveal">
            <div className="lp-section-label">How it works</div>
            <h2 className="lp-h2">Say it.<br /><strong>See it done.</strong></h2>
          </div>

          <div className="lp-how-steps">
            {[
              {
                n: '01',
                icon: <IcoZap />,
                title: 'Just say what you need',
                desc: 'No prompting guides. No model selection menus. No configuration. Type what you want to build — Sedrex figures out the rest before you finish the sentence.',
                detail: 'Intent detection · Complexity scoring · Smart routing',
              },
              {
                n: '02',
                icon: <IcoBrain />,
                title: 'Watch it think and build',
                desc: 'Sedrex reasons through your request and streams the result back in real time — as working code, a rendered diagram, or a live interface. Not a wall of text.',
                detail: 'Deep reasoning · Live streaming · Parallel execution',
              },
              {
                n: '03',
                icon: <IcoCode />,
                title: 'Use it immediately',
                desc: 'What Sedrex produces is not a suggestion — it runs, it renders, it exports. Iterate on it, extend it, or hand it off. Everything stays in one place, always.',
                detail: 'Live preview · Artifact history · One-click export',
              },
            ].map((s, i) => (
              <div key={i} className={`lp-step lp-reveal lp-d${i + 1}`}>
                <div className="lp-step-num">{s.n}</div>
                <div className="lp-step-icon">{s.icon}</div>
                <div className="lp-step-title">{s.title}</div>
                <div className="lp-step-desc">{s.desc}</div>
                <div className="lp-step-detail">{s.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          WHO IT'S FOR
          ══════════════════════════════════════════════════════ */}
      <section className="lp-who" id="who-its-for" aria-label="Who it's for">
        <div className="lp-wrap">
          <div className="lp-reveal">
            <div className="lp-section-label">Who it's for</div>
            <h2 className="lp-h2">For people who <strong>make things.</strong></h2>
          </div>

          <div className="lp-who-grid">
            {[
              {
                icon: <IcoCode />,
                title: 'Developers',
                text: 'Write code, debug it, draw the architecture, and generate the docs — without switching between four different tools. Everything lives in one workspace that remembers your context.',
                tags: ['Code generation', 'Debug & fix', 'System design'],
              },
              {
                icon: <IcoBarChart />,
                title: 'Data Scientists',
                text: 'Upload raw data, get instant analysis, executable Python, and charts you can actually read. Ask follow-up questions without re-uploading anything.',
                tags: ['Data analysis', 'Visualisations', 'Python execution'],
              },
              {
                icon: <IcoUsers />,
                title: 'Product Teams',
                text: 'Turn a brief into a working prototype before standup ends. Every artifact is persistent and shareable — not buried in someone\'s private chat history.',
                tags: ['Rapid prototyping', 'UI mockups', 'Team artifacts'],
              },
              {
                icon: <IcoShield />,
                title: 'Enterprises',
                text: 'SSO, audit logs, and role controls — built in, not bolted on. AI that scales across your organisation without trading security for convenience.',
                tags: ['SSO & RBAC', 'Audit trails', 'Data privacy'],
              },
            ].map((u, i) => (
              <div key={i} className={`lp-who-card lp-reveal lp-d${i + 1}`}>
                <div className="lp-who-icon">{u.icon}</div>
                <div className="lp-who-title">{u.title}</div>
                <div className="lp-who-text">{u.text}</div>
                <div className="lp-who-tags">
                  {u.tags.map(t => <span key={t} className="lp-who-tag">{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CTA
          ══════════════════════════════════════════════════════ */}
      <section className="lp-cta" aria-label="Call to action">
        <div className="lp-cta-glow" aria-hidden="true" />
        <div className="lp-wrap">
          <div className="lp-cta-inner lp-reveal">
            <div className="lp-section-label lp-section-label--center">Your next build</div>
            <h2 className="lp-cta-h">
              Stop thinking about<br />
              which AI to use.<br />
              <em>Just build.</em>
            </h2>
            <p className="lp-cta-sub">
              Sedrex is free to start. No setup, no credit card, no twelve tabs open at once. Your next idea is one message away.
            </p>
            <div className="lp-cta-btns">
              <button type="button" className="lp-btn-primary" onClick={onOpenAuth}>
                Start building free
                <span aria-hidden="true">→</span>
              </button>
              <Link to="/pricing" className="lp-btn-secondary">
                View pricing
              </Link>
            </div>
            <p className="lp-cta-note">
              <span>Free to start</span>
              <span className="lp-note-dot" aria-hidden="true" />
              <span>No credit card required</span>
              <span className="lp-note-dot" aria-hidden="true" />
              <span>Cancel anytime</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="lp-footer" role="contentinfo">
        <div className="lp-wrap">
          <div className="lp-footer-grid">

            <div className="lp-footer-brand">
              <div className="lp-footer-logo">
                <LogoMark size={26} />
                <span className="lp-footer-logo-name">Sedrex</span>
              </div>
              <p className="lp-footer-tagline">The workspace where what you say becomes something you can ship.</p>
              <div className="lp-footer-socials">
                <a href="https://twitter.com/sedrexai" className="lp-social" aria-label="Twitter / X" rel="noopener noreferrer" target="_blank">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
                </a>
                <a href="https://github.com/sedrexai" className="lp-social" aria-label="GitHub" rel="noopener noreferrer" target="_blank">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
                </a>
                <a href="https://linkedin.com/company/sedrexai" className="lp-social" aria-label="LinkedIn" rel="noopener noreferrer" target="_blank">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                </a>
              </div>
            </div>

            <div className="lp-footer-col">
              <div className="lp-footer-col-title">Product</div>
              <a href="#capabilities" className="lp-footer-link">Capabilities</a>
              <Link to="/pricing"     className="lp-footer-link">Pricing</Link>
              <a href="#how-it-works" className="lp-footer-link">How it works</a>
              <a href="#who-its-for"  className="lp-footer-link">Who it's for</a>
            </div>

            <div className="lp-footer-col">
              <div className="lp-footer-col-title">Company</div>
              <Link to="/contact"  className="lp-footer-link">Contact</Link>
              <a href="mailto:hello@sedrex.ai" className="lp-footer-link">hello@sedrex.ai</a>
            </div>

            <div className="lp-footer-col">
              <div className="lp-footer-col-title">Legal</div>
              <Link to="/privacy" className="lp-footer-link">Privacy Policy</Link>
              <Link to="/terms"   className="lp-footer-link">Terms of Service</Link>
            </div>

          </div>

          <div className="lp-footer-bottom">
            <span>© {new Date().getFullYear()} Sedrex. All rights reserved.</span>
            <span className="lp-footer-made">Built for builders.</span>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default LandingPage;
