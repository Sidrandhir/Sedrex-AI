import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Icons } from '../constants';
import { Link } from 'react-router-dom';
import './LandingPage.css';

type Props = { onOpenAuth: () => void };

/* ── Icons ─────────────────────────────────────────────────── */
const IcoCode = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
  </svg>
);
const IcoDiagram = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    <path d="M7 10v4M17 10v4M10 7h4M10 17h4"/>
  </svg>
);
const IcoImage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);
const IcoBrain = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2a2.5 2.5 0 0 1 5 0v.5a4 4 0 0 1 4 4v.5a2.5 2.5 0 0 1 0 5v.5a4 4 0 0 1-4 4h-5a4 4 0 0 1-4-4v-.5a2.5 2.5 0 0 1 0-5v-.5a4 4 0 0 1 4-4z"/>
  </svg>
);
const ArrowUp = () => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 16V4M4 10l6-6 6 6"/>
  </svg>
);
const ArrowDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <path d="M12 5v14M5 12l7 7 7-7"/>
  </svg>
);

/* ── Logo mark ─────────────────────────────────────────────── */
const LogoMark = ({ size = 30 }: { size?: number }) => (
  <svg viewBox="0 0 32 32" fill="none" width={size} height={size}>
    <rect width="32" height="32" rx="8" fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.2)" strokeWidth="1"/>
    <path d="M21 9.5H13C11.07 9.5 9.5 11.07 9.5 13V14.2C9.5 16.13 11.07 17.7 13 17.7H19C20.93 17.7 22.5 19.27 22.5 21.2V22C22.5 23.93 20.93 25.5 19 25.5H9.5"
      stroke="#10B981" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/* ── Main ──────────────────────────────────────────────────── */
const LandingPage: React.FC<Props> = ({ onOpenAuth }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [scrolled, setScrolled] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [promptIdx, setPromptIdx] = useState(0);
  const [counters, setCounters] = useState({ a: 0, b: 0, c: 0 });
  const countersDone = useRef(false);

  const prompts = [
    'Build me a real-time analytics dashboard',
    'Generate an enterprise architecture diagram',
    'Analyze this dataset and create charts',
    'Write and run a full API integration',
    'Create a production-ready UI component',
  ];

  const marqueeItems = [
    'Code to running artifact', 'Architecture diagrams', 'Image generation',
    'Deep reasoning', 'Real-time execution', 'Codebase awareness',
    'Artifact management', 'Instant preview', 'Multi-task routing',
    'Enterprise security', 'Code to running artifact', 'Architecture diagrams',
    'Image generation', 'Deep reasoning', 'Real-time execution',
    'Codebase awareness', 'Artifact management', 'Instant preview',
  ];

  /* theme */
  useEffect(() => {
    const saved = localStorage.getItem('sedrex_theme') as 'light' | 'dark' | null;
    const t = saved ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(t);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('sedrex_theme', next);
  };

  /* scroll */
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  /* typewriter */
  useEffect(() => {
    const prompt = prompts[promptIdx];
    let i = 0; setTypedText(''); setIsTyping(true);
    const t = setInterval(() => {
      if (i <= prompt.length) { setTypedText(prompt.slice(0, i)); i++; }
      else {
        clearInterval(t); setIsTyping(false);
        setTimeout(() => setPromptIdx(p => (p + 1) % prompts.length), 2600);
      }
    }, 36);
    return () => clearInterval(t);
  }, [promptIdx]);

  /* scroll reveal */
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          if (e.target.id === 'proof-strip' && !countersDone.current) {
            countersDone.current = true;
            animateCounters();
          }
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  /* cursor radial on caps */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const caps = document.querySelectorAll('.sdx-cap');
      caps.forEach(cap => {
        const rect = (cap as HTMLElement).getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        (cap as HTMLElement).style.setProperty('--mx', `${x}%`);
        (cap as HTMLElement).style.setProperty('--my', `${y}%`);
      });
    };
    window.addEventListener('mousemove', handler, { passive: true });
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  const animateCounters = () => {
    const dur = 1600; const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - t, 3);
      setCounters({ a: Math.round(e * 99), b: parseFloat((e * 2).toFixed(1)), c: Math.round(e * 50) });
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  return (
    <div className={`sdx-page ${theme}`}>

      {/* ── NAV ───────────────────────────────────────────── */}
      <nav className={`sdx-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="sdx-nav-inner">
          <div className="sdx-nav-logo" onClick={onOpenAuth}>
            <LogoMark />
            <span className="sdx-nav-logo-name">Sedrex</span>
          </div>

          <div className="sdx-nav-links">
            <a href="#capabilities" className="sdx-nav-link">Capabilities</a>
            <a href="#how-it-works" className="sdx-nav-link">How it works</a>
            <a href="#who-its-for" className="sdx-nav-link">Who it's for</a>
            <Link to="/pricing" className="sdx-nav-link">Pricing</Link>
          </div>

          <div className="sdx-nav-right">
            <button className="sdx-nav-theme" onClick={toggleTheme} aria-label="Toggle theme">
              <Icons.Sun className="ico-sun" />
              <Icons.Moon className="ico-moon" />
            </button>
            <button className="sdx-nav-signin" onClick={onOpenAuth}>Sign in</button>
            <button className="sdx-nav-cta" onClick={onOpenAuth}>Try Sedrex</button>
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════
          HERO
          ══════════════════════════════════════════════════ */}
      <section className="sdx-hero">
        <div className="sdx-hero-ambient" />
        <div className="sdx-hero-grid" />

        <div className="sdx-hero-inner">

          <div className="sdx-hero-badge">
            <span className="sdx-badge-dot" />
            Now in early access
          </div>

          <h1 className="sdx-hero-h1">
            Describe it once.
          </h1>
          <div className="sdx-hero-h1-sub">
            Get it <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>built.</em>
          </div>

          <p className="sdx-hero-sub">
            Sedrex converts your intent into working code, live diagrams, generated images, and running applications — inside one workspace, in real time.
          </p>

          {/* Chat bar */}
          <div className="sdx-bar-wrap">
            <div className="sdx-bar" onClick={onOpenAuth}>
              <div className="sdx-bar-text">
                <span className="sdx-bar-typed">{typedText}</span>
                <span className={`sdx-bar-cursor ${isTyping ? 'blink' : ''}`}>|</span>
              </div>
              <button
                className="sdx-bar-send"
                onClick={e => { e.stopPropagation(); onOpenAuth(); }}
                aria-label="Start"
              >
                <ArrowUp />
              </button>
            </div>

            <p className="sdx-bar-hint">Click anywhere to start building — free, no card needed</p>

            <div className="sdx-chips">
              {['Write code', 'Draw diagrams', 'Generate images', 'Deep analysis', 'Run & preview'].map(c => (
                <button key={c} className="sdx-chip" onClick={onOpenAuth}>{c}</button>
              ))}
            </div>
          </div>

        </div>

        <div className="sdx-scroll-cue">
          <ArrowDown />
        </div>
      </section>

      {/* ── Proof strip ─────────────────────────────────── */}
      <div className="sdx-proof" id="proof-strip">
        <div className="sdx-wrap">
          <div className="sdx-proof-inner reveal">
            <div className="sdx-proof-item">
              <div className="sdx-proof-num">{counters.a}<span>%</span></div>
              <div className="sdx-proof-label">Uptime SLA</div>
            </div>
            <div className="sdx-proof-divider" />
            <div className="sdx-proof-item">
              <div className="sdx-proof-num">{counters.b}<span>M</span></div>
              <div className="sdx-proof-label">Token context</div>
            </div>
            <div className="sdx-proof-divider" />
            <div className="sdx-proof-item">
              <div className="sdx-proof-num">0<span>ms</span></div>
              <div className="sdx-proof-label">Tool switching</div>
            </div>
            <div className="sdx-proof-divider" />
            <div className="sdx-proof-item">
              <div className="sdx-proof-num">{counters.c}<span>K+</span></div>
              <div className="sdx-proof-label">Artifacts created</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          CAPABILITIES
          ══════════════════════════════════════════════════ */}
      <section className="sdx-section" id="capabilities">
        <div className="sdx-wrap">

          <div className="reveal">
            <div className="sdx-label">What Sedrex does</div>
            <h2 className="sdx-h2">
              One surface.<br />
              <b>Every output.</b>
            </h2>
            <p className="sdx-p" style={{ marginTop: 14 }}>
              Stop copying between tools. Every output Sedrex creates is immediately usable — running, interactive, and yours.
            </p>
          </div>

          <div className="sdx-caps">

            {/* Code */}
            <div className="sdx-cap reveal d1">
              <div className="sdx-cap-eyebrow">
                01 <div className="sdx-cap-eyebrow-line" /> Code Execution
              </div>
              <div className="sdx-cap-icon"><IcoCode /></div>
              <div className="sdx-cap-title">Write it. Run it. Ship it.</div>
              <div className="sdx-cap-desc">
                Every piece of code Sedrex writes is instantly executed in a sandboxed environment and rendered as a live, interactive artifact — no copy-paste, no terminal.
              </div>
              <div className="sdx-cap-preview">
                <div className="sdx-cap-preview-bar">
                  <div className="sdx-cap-preview-dot" style={{ background: '#ef4444' }} />
                  <div className="sdx-cap-preview-dot" style={{ background: '#f59e0b' }} />
                  <div className="sdx-cap-preview-dot" style={{ background: '#10B981' }} />
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(245,245,243,0.3)', fontFamily: 'var(--f-mono)' }}>dashboard.tsx</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#10B981', fontFamily: 'var(--f-mono)', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 4 }}>▶ Running</span>
                </div>
                <div className="sdx-cap-preview-body">
                  <div className="sdx-code-line"><span className="ck">import</span> <span className="cn">React</span> <span className="ck">from</span> <span className="cs">'react'</span></div>
                  <div className="sdx-code-line"><span className="ck">import</span> {'{'} <span className="cn">LineChart</span>, <span className="cn">ResponsiveContainer</span> {'}'} <span className="ck">from</span> <span className="cs">'recharts'</span></div>
                  <div className="sdx-code-line"> </div>
                  <div className="sdx-code-line"><span className="ck">export default function</span> <span className="cf">Dashboard</span>{'() {'}</div>
                  <div className="sdx-code-line" style={{ paddingLeft: 14 }}><span className="ck">return</span> {'<'}<span className="cn">ResponsiveContainer</span>{'>'}{'<'}<span className="cn">LineChart</span> <span style={{color:'var(--teal)'}}>data</span>={'{data}'}{'/>'}{' </'}<span className="cn">ResponsiveContainer</span>{'>'}</div>
                  <div className="sdx-code-line">{'}'}</div>
                </div>
              </div>
            </div>

            {/* Diagrams */}
            <div className="sdx-cap reveal d2">
              <div className="sdx-cap-eyebrow">
                02 <div className="sdx-cap-eyebrow-line" /> Diagram Generation
              </div>
              <div className="sdx-cap-icon"><IcoDiagram /></div>
              <div className="sdx-cap-title">Architecture, on demand.</div>
              <div className="sdx-cap-desc">
                Describe a system in plain language. Sedrex generates enterprise-grade architecture diagrams, flowcharts, and data models — exportable at production quality.
              </div>
              <div className="sdx-cap-preview">
                <div className="sdx-cap-preview-bar">
                  <div className="sdx-cap-preview-dot" style={{ background: '#ef4444' }} />
                  <div className="sdx-cap-preview-dot" style={{ background: '#f59e0b' }} />
                  <div className="sdx-cap-preview-dot" style={{ background: '#10B981' }} />
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(245,245,243,0.3)', fontFamily: 'var(--f-mono)' }}>system-arch.svg</span>
                </div>
                <div className="sdx-diag">
                  <div className="sdx-dnode" style={{ fontSize: 10.5 }}>Client / Browser</div>
                  <div className="sdx-dline" />
                  <div className="sdx-dnode" style={{ background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.35)' }}>API Gateway</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, width: '100%', justifyContent: 'center' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(16,185,129,0.2)', marginRight: -1 }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                        <div style={{ width: 1, height: 16, background: 'rgba(16,185,129,0.2)' }} />
                        <div className="sdx-dnode" style={{ fontSize: 10 }}>Auth</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                        <div style={{ width: 1, height: 16, background: 'rgba(16,185,129,0.2)' }} />
                        <div className="sdx-dnode" style={{ fontSize: 10 }}>Services</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                        <div style={{ width: 1, height: 16, background: 'rgba(16,185,129,0.2)' }} />
                        <div className="sdx-dnode" style={{ fontSize: 10 }}>Storage</div>
                      </div>
                    </div>
                    <div style={{ flex: 1, height: 1, background: 'rgba(16,185,129,0.2)', marginLeft: -1 }} />
                  </div>
                  <div className="sdx-diag-label" style={{ marginTop: 10, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'rgba(245,245,243,0.25)', letterSpacing: '0.04em' }}>
                    Auto-generated · Export as SVG / PNG
                  </div>
                </div>
              </div>
            </div>

            {/* Images */}
            <div className="sdx-cap reveal d3">
              <div className="sdx-cap-eyebrow">
                03 <div className="sdx-cap-eyebrow-line" /> Image Generation
              </div>
              <div className="sdx-cap-icon"><IcoImage /></div>
              <div className="sdx-cap-title">Visual intelligence, inline.</div>
              <div className="sdx-cap-desc">
                Generate, iterate, and refine images within your workspace flow — from UI mockups and brand assets to photorealistic renders — without switching surfaces.
              </div>
              <div className="sdx-cap-preview">
                <div className="sdx-cap-preview-bar">
                  <div className="sdx-cap-preview-dot" style={{ background: '#ef4444' }} />
                  <div className="sdx-cap-preview-dot" style={{ background: '#f59e0b' }} />
                  <div className="sdx-cap-preview-dot" style={{ background: '#10B981' }} />
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(245,245,243,0.3)', fontFamily: 'var(--f-mono)' }}>image-workspace</span>
                </div>
                <div className="sdx-imgrid">
                  {[
                    { label: 'UI Mockup', bg: 'linear-gradient(135deg,#10B981,#059669)' },
                    { label: 'Brand Asset', bg: 'linear-gradient(135deg,#d4a85a,#b8860b)' },
                    { label: 'Data Viz', bg: 'linear-gradient(135deg,#2dd4bf,#0891b2)' },
                    { label: 'Render', bg: 'linear-gradient(135deg,#818cf8,#6d28d9)' },
                  ].map((t, i) => (
                    <div key={i} className="sdx-imtile" style={{ background: t.bg, animationDelay: `${i * 0.7}s` }}>
                      <span className="sdx-imtile-label">{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reasoning */}
            <div className="sdx-cap reveal d4">
              <div className="sdx-cap-eyebrow">
                04 <div className="sdx-cap-eyebrow-line" /> Deep Reasoning
              </div>
              <div className="sdx-cap-icon"><IcoBrain /></div>
              <div className="sdx-cap-title">Thinking that goes further.</div>
              <div className="sdx-cap-desc">
                Sedrex routes every task through a multi-stage intelligence pipeline — analysing, reasoning, verifying, and generating — to deliver elite-level output on every query.
              </div>
              <div className="sdx-cap-preview">
                <div className="sdx-cap-preview-bar">
                  <div className="sdx-cap-preview-dot" style={{ background: '#ef4444' }} />
                  <div className="sdx-cap-preview-dot" style={{ background: '#f59e0b' }} />
                  <div className="sdx-cap-preview-dot" style={{ background: '#10B981' }} />
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(245,245,243,0.3)', fontFamily: 'var(--f-mono)' }}>reasoning trace</span>
                </div>
                <div className="sdx-rchain">
                  {[
                    { label: 'Intent parsing', s: 'done', tag: null },
                    { label: 'Context retrieval', s: 'done', tag: null },
                    { label: 'Deep reasoning', s: 'active', tag: 'Live' },
                    { label: 'Cross-verification', s: 'wait', tag: null },
                    { label: 'Output synthesis', s: 'wait', tag: null },
                  ].map((r, i) => (
                    <div key={i} className={`sdx-rstep ${r.s}`}>
                      <div className="sdx-rdot" />
                      <span>{r.label}</span>
                      {r.tag && <span className="sdx-rstep-badge">{r.tag}</span>}
                      {r.s === 'done' && <span style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: 12 }}>✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Marquee ──────────────────────────────────────── */}
      <div className="sdx-marquee-wrap">
        <div className="sdx-marquee-track">
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <div key={i} className="sdx-marquee-item">
              <div className="sdx-marquee-dot" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          HOW IT WORKS
          ══════════════════════════════════════════════════ */}
      <section className="sdx-how" id="how-it-works">
        <div className="sdx-wrap">
          <div className="sdx-how-head reveal">
            <div className="sdx-label">How it works</div>
            <h2 className="sdx-h2">
              Three moves.<br />
              <b>Infinite outcomes.</b>
            </h2>
          </div>

          <div className="sdx-how-steps">
            {[
              {
                n: '01',
                title: 'State your intent',
                desc: 'No syntax. No templates. No setup. Describe exactly what you want to build in plain language — Sedrex understands context, domain, and depth automatically.',
              },
              {
                n: '02',
                title: 'Watch it execute',
                desc: 'Your request is analysed, routed through the optimal reasoning pipeline, and executed in a live sandbox — streamed back as code, diagrams, or rendered interfaces.',
              },
              {
                n: '03',
                title: 'Use the output immediately',
                desc: 'Artifacts are not static responses. They run, they render, they export. Iterate, extend, and ship — without ever leaving the surface you started from.',
              },
            ].map((s, i) => (
              <div key={i} className={`sdx-step-item reveal d${i + 1}`}>
                <div className="sdx-step-num">{s.n}</div>
                <div className="sdx-step-title">{s.title}</div>
                <div className="sdx-step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          USE CASES
          ══════════════════════════════════════════════════ */}
      <section className="sdx-usecases" id="who-its-for">
        <div className="sdx-wrap">
          <div className="reveal">
            <div className="sdx-label">Who it's for</div>
            <h2 className="sdx-h2">Built for people who <b>build.</b></h2>
          </div>

          <div className="sdx-uc-grid">
            {[
              { icon: '⬡', title: 'Solo Builders', text: 'Idea to working prototype in one session. No sprawl, no overhead, no tool fatigue.' },
              { icon: '◈', title: 'Product Teams', text: 'Turn briefs into interactive artifacts before standup ends. Shared, persistent, and live.' },
              { icon: '◉', title: 'Data Scientists', text: 'Upload data, get instant analysis, executable code, and charts — all in one surface.' },
              { icon: '◎', title: 'Enterprise Orgs', text: 'SSO, audit logs, and role-based access. Governed AI infrastructure that actually deploys.' },
            ].map((u, i) => (
              <div key={i} className={`sdx-uc-item reveal d${i + 1}`}>
                <div className="sdx-uc-icon">{u.icon}</div>
                <div className="sdx-uc-title">{u.title}</div>
                <div className="sdx-uc-text">{u.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          CTA
          ══════════════════════════════════════════════════ */}
      <section className="sdx-cta-section">
        <div className="sdx-cta-glow" />
        <div className="sdx-wrap">
          <div className="sdx-cta-inner reveal">
            <div className="sdx-label" style={{ textAlign: 'center' }}>Start now</div>
            <h2 className="sdx-cta-h">
              The gap between<br />
              idea and output<br />
              <em>no longer exists.</em>
            </h2>
            <p className="sdx-cta-p">
              Join the workspace where describing something is the same as building it.
            </p>
            <div className="sdx-cta-btns">
              <button className="sdx-btn-a" onClick={onOpenAuth}>
                Start building free
                <span style={{ fontSize: 16 }}>→</span>
              </button>
              <Link to="/pricing" className="sdx-btn-b">
                View pricing
              </Link>
            </div>
            <p className="sdx-cta-note">No credit card required · Full access trial · Cancel anytime</p>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="sdx-footer">
        <div className="sdx-wrap">
          <div className="sdx-footer-grid">
            <div className="sdx-footer-brand">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <LogoMark size={26} />
                <span className="sdx-logo-name">Sedrex</span>
              </div>
              <p className="sdx-footer-tagline">
                The workspace where intent becomes output — instantly.
              </p>
            </div>
            <div>
              <div className="sdx-footer-col-title">Product</div>
              <a href="#capabilities" className="sdx-footer-link">Capabilities</a>
              <Link to="/pricing" className="sdx-footer-link">Pricing</Link>
              <a href="#how-it-works" className="sdx-footer-link">How it works</a>
            </div>
            <div>
              <div className="sdx-footer-col-title">Legal</div>
              <Link to="/privacy" className="sdx-footer-link">Privacy Policy</Link>
              <Link to="/terms" className="sdx-footer-link">Terms of Service</Link>
              <Link to="/contact" className="sdx-footer-link">Contact</Link>
            </div>
          </div>
          <div className="sdx-footer-bottom">
            <span className="sdx-footer-copy">© {new Date().getFullYear()} Sedrex. All rights reserved.</span>
            <span className="sdx-footer-copy">Built for builders.</span>
          </div>
        </div>
      </footer>

    </div>
  );
};

export default LandingPage;