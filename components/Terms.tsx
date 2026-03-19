import React from 'react';

const Terms: React.FC = () => (
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
    <h1 className="text-2xl sm:text-4xl font-black text-[var(--accent)] mb-2 tracking-tight leading-tight sm:leading-tight">Terms of Service</h1>
    <p className="text-xs sm:text-sm text-[var(--text-secondary)] mb-6 sm:mb-8">Last updated: February 18, 2026</p>
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Acceptance of Terms</h2>
        <p className="text-[var(--text-primary)]">By accessing or using SEDREX, you agree to these Terms of Service. If you do not agree, please do not use the platform.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Use of Service</h2>
        <ul className="list-disc pl-4 sm:pl-6 space-y-1 text-[var(--text-primary)]">
          <li>You must be at least 13 years old to use SEDREX.</li>
          <li>You are responsible for your account security and activity.</li>
          <li>Do not use SEDREX for unlawful, harmful, or abusive purposes.</li>
          <li>Do not attempt to reverse engineer, disrupt, or misuse the service.</li>
        </ul>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Intellectual Property</h2>
        <p className="text-[var(--text-primary)]">All content, trademarks, and technology on SEDREX are owned by SEDREX or its licensors. You may not copy, modify, or distribute any part of the service without permission.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Account Termination</h2>
        <p className="text-[var(--text-primary)]">We reserve the right to suspend or terminate accounts that violate these terms or pose a risk to the platform or its users.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Disclaimer</h2>
        <p className="text-[var(--text-primary)]">SEDREX is provided "as is" without warranties of any kind. We do not guarantee accuracy, reliability, or availability. Use the service at your own risk.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Limitation of Liability</h2>
        <p className="text-[var(--text-primary)]">SEDREX is not liable for any indirect, incidental, or consequential damages arising from your use of the service.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Changes to Terms</h2>
        <p className="text-[var(--text-primary)]">We may update these Terms of Service. Continued use of SEDREX after changes means you accept the new terms.</p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Contact</h2>
        <p className="text-[var(--text-primary)]">For questions about these Terms, contact <a href="mailto:support@nexusai.com" className="text-[var(--accent)] underline">support@nexusai.com</a>.</p>
      </div>
    </div>
  </section>
  </>
);

export default Terms;
