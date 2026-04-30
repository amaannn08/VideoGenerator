import React, { useState } from 'react';
import { User, Lock, LogIn, Loader2, Clapperboard } from 'lucide-react';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Login failed');
      localStorage.setItem('ai-video-token', d.token);
      localStorage.setItem('ai-video-token-exp', String(Date.now() + d.expiresIn));
      onLogin(d.token);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Subtle radial glow */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(245,166,35,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div className="w-full max-w-[360px] animate-fade-up relative z-10">
        {/* Brand mark */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-5"
            style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-default)',
              boxShadow: '0 0 32px var(--amber-glow-lg)',
            }}
          >
            <Clapperboard size={22} strokeWidth={1.5} style={{ color: 'var(--amber)' }} />
          </div>
          <h1
            className="font-display text-2xl font-800 tracking-tight"
            style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, color: 'var(--text-primary)' }}
          >
            Cinematic AI
          </h1>
          <p
            className="text-label mt-1"
            style={{ letterSpacing: '0.16em' }}
          >
            Reel Builder · Private Access
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 16,
            padding: '28px 28px 24px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}
        >
          {/* Username */}
          <div style={{ marginBottom: 16 }}>
            <label className="text-label block" style={{ marginBottom: 8 }}>Username</label>
            <div style={{ position: 'relative' }}>
              <User
                size={15}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="cine-input"
                style={{ paddingLeft: 36 }}
                placeholder="Enter username"
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: error ? 16 : 22 }}>
            <label className="text-label block" style={{ marginBottom: 8 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={15}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="cine-input"
                style={{ paddingLeft: 36 }}
                placeholder="Enter password"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                background: 'var(--red-dim)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--red)',
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-amber"
            style={{ width: '100%', padding: '10px 16px', fontSize: 14, fontWeight: 700 }}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                <LogIn size={15} />
                Sign In
              </>
            )}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 20 }}>
          Session lasts 24 hours
        </p>
      </div>
    </div>
  );
}
