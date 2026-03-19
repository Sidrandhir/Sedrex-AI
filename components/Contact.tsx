import React from 'react';

const Contact: React.FC = () => (
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
    <h1 className="text-2xl sm:text-4xl font-black text-[var(--accent)] mb-2 tracking-tight leading-tight sm:leading-tight">Contact Us</h1>
    <p className="mb-4 sm:mb-8 text-base sm:text-lg text-[var(--text-primary)] leading-relaxed sm:leading-relaxed">We value your feedback and are here to help with any questions about SEDREX.</p>
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Support</h2>
        <p className="text-[var(--text-primary)]">Email: <a href="mailto:support@nexusai.com" className="text-[var(--accent)] underline">support@nexusai.com</a></p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Business Inquiries</h2>
        <p className="text-[var(--text-primary)]">Email: <a href="mailto:business@nexusai.com" className="text-[var(--accent)] underline">business@nexusai.com</a></p>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Address</h2>
        <address className="not-italic text-[var(--text-primary)] leading-relaxed text-sm sm:text-base">
          SEDREX, Inc.<br />123 Innovation Drive<br />San Francisco, CA 94107<br />USA
        </address>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Social</h2>
        <ul className="flex gap-4 sm:gap-6 mt-2">
          <li><a href="https://twitter.com/nexusai" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">Twitter</a></li>
          <li><a href="https://linkedin.com/company/nexusai" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">LinkedIn</a></li>
        </ul>
      </div>
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-[var(--accent)] mb-2">Feedback</h2>
        <p className="text-[var(--text-primary)]">We welcome your suggestions! Please email us or use the in-app feedback form.</p>
      </div>
    </div>
	</section>
  </>
);

export default Contact;
