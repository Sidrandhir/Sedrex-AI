import React from 'react';

const Privacy: React.FC = () => (
  <>
    <div className="fixed left-4 top-4 z-30">
      <a
        href="/"
        className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--bg-secondary)] border border-[var(--border)] shadow hover:bg-[var(--accent)]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        aria-label="Back to Home"
      >
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </a>
    </div>
    <section
      className="max-w-3xl mx-auto my-8 sm:my-16 p-4 sm:p-8 rounded-3xl bg-[var(--bg-secondary)]/80 border border-[var(--border)] shadow-2xl shadow-emerald-500/10 animate-in slide-in-from-bottom-4 overflow-auto custom-scrollbar min-h-[60vh] max-h-[80vh] font-sans response-text"
      style={{ wordBreak: 'break-word' }}
    >
    <h1 className="text-2xl sm:text-4xl font-black text-[var(--accent)] mb-2 tracking-tight leading-tight sm:leading-tight">Privacy Policy</h1>
    <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-6 sm:mb-8">Last updated: February 18, 2026</p>
    <p className="mb-4 sm:mb-6 text-base sm:text-lg text-[var(--text-primary)] leading-relaxed sm:leading-relaxed">SEDREX is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our platform.</p>
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Information We Collect</h2>
        <ul className="list-disc pl-4 sm:pl-6 space-y-1 text-[var(--text-primary)]">
          <li><b>Account Data:</b> Email address, name, and authentication credentials.</li>
          <li><b>Usage Data:</b> Interactions, chat history, and preferences for improving your experience.</li>
          <li><b>Device Data:</b> Browser, device type, and technical logs for security and support.</li>
        </ul>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">How We Use Your Information</h2>
        <ul className="list-disc pl-4 sm:pl-6 space-y-1 text-[var(--text-primary)]">
          <li>To provide, maintain, and improve SEDREX services.</li>
          <li>To personalize your experience and deliver relevant results.</li>
          <li>To ensure security, prevent fraud, and comply with legal obligations.</li>
          <li>To communicate updates, support, and important information.</li>
        </ul>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Data Sharing</h2>
        <p className="text-[var(--text-primary)]">We do not sell your personal information. Data may be shared with trusted service providers (e.g., cloud hosting, analytics) under strict confidentiality and only as necessary to operate SEDREX. We may disclose information if required by law or to protect our rights and users.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Data Security</h2>
        <p className="text-[var(--text-primary)]">We use industry-standard security measures to protect your data. However, no system is completely secure. We encourage you to use strong passwords and keep your credentials confidential.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Your Rights</h2>
        <ul className="list-disc pl-4 sm:pl-6 space-y-1 text-[var(--text-primary)]">
          <li>Access, update, or delete your account information at any time.</li>
          <li>Request a copy of your data or ask for its removal by contacting us.</li>
          <li>Opt out of non-essential communications.</li>
        </ul>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Children's Privacy</h2>
        <p className="text-[var(--text-primary)]">SEDREX is not intended for children under 13. We do not knowingly collect data from children under 13.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Changes to This Policy</h2>
        <p className="text-[var(--text-primary)]">We may update this Privacy Policy. Changes will be posted on this page with a new effective date.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Contact Us</h2>
        <p className="text-[var(--text-primary)]">If you have questions about this Privacy Policy, please contact us at <a href="mailto:support@nexusai.com" className="text-[var(--accent)] underline">support@nexusai.com</a>.</p>
      </div>
    </div>
  </section>
  </>
);

export default Privacy;
