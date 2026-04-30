import React from 'react';
import { Clapperboard, Plus, LogOut, Film } from 'lucide-react';

export default function Topbar({ onNew, onLogout, onOpenReel, hasScenes }) {
  return (
    <header className="topbar">
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
        <Clapperboard size={18} strokeWidth={1.5} style={{ color: 'var(--amber)' }} />
        <span style={{
          fontFamily: 'Syne, sans-serif',
          fontWeight: 700,
          fontSize: 15,
          color: 'var(--text-primary)',
          letterSpacing: '-0.02em',
        }}>
          Cinematic AI
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginLeft: 4 }}>
          REEL BUILDER
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {hasScenes && (
          <button
            className="btn btn-amber btn-sm"
            onClick={onOpenReel}
            style={{ gap: 6 }}
          >
            <Film size={13} /> Final Reel
          </button>
        )}
        <button className="btn btn-outline-amber btn-sm" onClick={onNew}>
          <Plus size={13} /> New Script
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onLogout} style={{ color: 'var(--text-muted)' }}>
          <LogOut size={13} /> Logout
        </button>
      </div>
    </header>
  );
}
