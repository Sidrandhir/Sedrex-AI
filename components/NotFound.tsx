import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100dvh',
      width: '100vw',
      background: 'var(--bg-primary, #171717)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      color: 'var(--text-primary, #d4d4d8)',
      textAlign: 'center',
    }}>
      {/* Logo */}
      <img
        src="/sedrex-logo.svg"
        alt="Sedrex AI"
        style={{ width: 48, height: 48, marginBottom: '2rem', opacity: 0.9 }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />

      {/* 404 number */}
      <div style={{
        fontSize: 'clamp(5rem, 18vw, 9rem)',
        fontWeight: 800,
        lineHeight: 1,
        color: '#10B981',
        letterSpacing: '-0.05em',
        marginBottom: '1rem',
        textShadow: '0 0 80px rgba(16,185,129,0.25)',
      }}>
        404
      </div>

      {/* Headline */}
      <h1 style={{
        fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
        fontWeight: 700,
        color: 'var(--text-primary, #f4f4f5)',
        margin: '0 0 0.75rem',
        letterSpacing: '-0.02em',
      }}>
        This page doesn't exist.
      </h1>

      {/* Body text */}
      <p style={{
        fontSize: '1rem',
        color: 'var(--text-secondary, #a1a1aa)',
        maxWidth: 400,
        lineHeight: 1.65,
        margin: '0 0 2.5rem',
      }}>
        The page you're looking for has been moved or never existed. Head back to start a new conversation.
      </p>

      {/* Glass card with CTAs */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        flexWrap: 'wrap',
        justifyContent: 'center',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '0.65rem 1.5rem',
            borderRadius: '10px',
            border: 'none',
            background: '#10B981',
            color: '#fff',
            fontFamily: 'inherit',
            fontSize: '0.9375rem',
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '-0.01em',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          Go back home
        </button>

        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '0.65rem 1.5rem',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-secondary, #a1a1aa)',
            fontFamily: 'inherit',
            fontSize: '0.9375rem',
            fontWeight: 500,
            cursor: 'pointer',
            letterSpacing: '-0.01em',
            backdropFilter: 'blur(12px)',
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(16,185,129,0.4)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          Go back
        </button>
      </div>

      {/* Subtle footer */}
      <p style={{
        marginTop: '3rem',
        fontSize: '0.8125rem',
        color: 'rgba(161,161,170,0.45)',
        letterSpacing: '0.02em',
      }}>
        Sedrex AI — Stop Prompting. Start Executing.
      </p>
    </div>
  );
};

export default NotFound;
