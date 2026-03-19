/**
 * SEDREX — exportPDF.ts
 * Generates a beautifully styled PDF from a chat session.
 * Uses jsPDF (loaded dynamically — zero bundle cost until called).
 * Falls back to a styled HTML print window if jsPDF is unavailable.
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  model?: string;
}

interface ChatSession {
  title?: string;
  messages: Message[];
}

// ── Strip markdown to plain readable text ───────────────────────
function stripMarkdownForPDF(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (match) => {
      // Keep code blocks but remove fences
      const lines = match.split('\n');
      return lines.slice(1, -1).join('\n');
    })
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s/gm, '• ')
    .replace(/^\s*\d+\.\s/gm, (m) => m.trim() + ' ')
    .replace(/^\s*>\s/gm, '  ')
    .replace(/\|[^\n]+\|/g, (row) =>
      row.split('|').filter(Boolean).map(c => c.trim()).join('  |  ')
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Format timestamp ─────────────────────────────────────────────
function formatTime(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── HTML fallback export (print-to-PDF via browser) ─────────────
function exportViaHTML(session: ChatSession): void {
  const title = session.title || 'Chat Export';
  const exportDate = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const messagesHTML = session.messages
    .map((msg) => {
      const isUser = msg.role === 'user';
      const text = stripMarkdownForPDF(msg.content)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      const time = formatTime(msg.timestamp);
      return `
        <div class="msg ${isUser ? 'msg-user' : 'msg-ai'}">
          <div class="msg-header">
            <span class="msg-role">${isUser ? 'You' : 'SEDREX'}</span>
            ${time ? `<span class="msg-time">${time}</span>` : ''}
            ${msg.model && !isUser ? `<span class="msg-model">${msg.model}</span>` : ''}
          </div>
          <div class="msg-content">${text}</div>
        </div>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title} — SEDREX</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
  
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.7;
    color: #1a1a2e;
    background: #fff;
    padding: 0;
  }

  .page { max-width: 720px; margin: 0 auto; padding: 48px 40px; }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 24px;
    border-bottom: 2px solid #c9a84c;
    margin-bottom: 32px;
  }
  .header-logo {
    width: 40px; height: 40px; border-radius: 10px;
    background: rgba(201,168,76,0.1);
    border: 1px solid rgba(201,168,76,0.3);
    display: flex; align-items: center; justify-content: center;
  }
  .header-s {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 18px; font-weight: 700;
    color: #c9a84c;
  }
  .header-text { flex: 1; }
  .header-brand {
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: #c9a84c;
  }
  .header-title {
    font-size: 18px; font-weight: 700;
    color: #1a1a2e; letter-spacing: -0.02em;
    margin-top: 2px;
  }
  .header-meta {
    text-align: right;
    font-size: 11px; color: #888;
  }

  /* Messages */
  .msg { margin-bottom: 24px; page-break-inside: avoid; }
  .msg-header {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 6px;
  }
  .msg-role {
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .msg-user .msg-role { color: #1a1a2e; }
  .msg-ai   .msg-role { color: #c9a84c; }
  .msg-time {
    font-size: 10px; color: #aaa;
    font-family: 'IBM Plex Mono', monospace;
  }
  .msg-model {
    font-size: 10px; color: #c9a84c;
    font-family: 'IBM Plex Mono', monospace;
    opacity: 0.6;
    padding: 1px 6px; border-radius: 4px;
    background: rgba(201,168,76,0.08);
    border: 1px solid rgba(201,168,76,0.15);
  }
  .msg-content {
    font-size: 13px; line-height: 1.72;
    color: #2c2c3e;
  }
  .msg-user .msg-content {
    background: #f5f3ee;
    border-left: 3px solid #c9a84c;
    padding: 10px 14px;
    border-radius: 0 8px 8px 0;
  }
  .msg-ai .msg-content {
    padding: 0;
  }

  hr.msg-divider {
    border: none; border-top: 1px solid #eee;
    margin: 20px 0;
  }

  /* Footer */
  .footer {
    margin-top: 40px; padding-top: 16px;
    border-top: 1px solid #eee;
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-brand { font-size: 10px; color: #c9a84c; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .footer-note { font-size: 10px; color: #bbb; font-family: 'IBM Plex Mono', monospace; }

  @media print {
    body { padding: 0; }
    .page { padding: 24px; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-logo"><span class="header-s">S</span></div>
    <div class="header-text">
      <div class="header-brand">SEDREX · Verification-First Intelligence</div>
      <div class="header-title">${title.replace(/</g, '&lt;')}</div>
    </div>
    <div class="header-meta">
      Exported<br>${exportDate}<br>
      ${session.messages.length} message${session.messages.length !== 1 ? 's' : ''}
    </div>
  </div>

  ${messagesHTML}

  <div class="footer">
    <span class="footer-brand">SEDREX</span>
    <span class="footer-note">sedrex.ai · ${exportDate}</span>
  </div>
</div>
<script>
  window.onload = () => {
    setTimeout(() => { window.print(); }, 400);
  };
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Pop-up blocked — download instead
    const a = document.createElement('a');
    a.href = url; a.download = `${(title).replace(/[^a-z0-9]/gi, '_')}_sedrex.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ── Main export function ─────────────────────────────────────────
export async function exportChatPDF(session: ChatSession): Promise<void> {
  // Always use the beautiful HTML print approach — it's more reliable
  // cross-browser and produces the best visual output without adding
  // a heavy jsPDF dependency to the bundle.
  exportViaHTML(session);
}

export default exportChatPDF;