import React from 'react';
import { Clapperboard, Plus, LogOut, Film, Image as ImageIcon, Video } from 'lucide-react';
import { FAL_IMAGE_MODELS, FAL_VIDEO_MODELS } from '../../falModels';

export default function Topbar({ onNew, onLogout, onOpenReel, hasScenes, imageModelId, videoModelId, onOpenModels }) {
  const imgModel = FAL_IMAGE_MODELS.find(m => m.id === imageModelId);
  const vidModel = FAL_VIDEO_MODELS.find(m => m.id === videoModelId);

  return (
    <header className="topbar">
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Clapperboard size={18} strokeWidth={1.5} style={{ color: 'var(--amber)' }} />
        <span style={{
          fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15,
          color: 'var(--text-primary)', letterSpacing: '-0.02em',
        }}>
          Cinematic AI
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginLeft: 4 }}>
          REEL BUILDER
        </span>
      </div>

      {/* Active model chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 16, flex: 1 }}>
        <button
          onClick={onOpenModels}
          title="Change image model"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
            fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)',
            transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <ImageIcon size={10} />
          <span>{imgModel?.label || 'Nano Banana 2'}</span>
        </button>
        <button
          onClick={onOpenModels}
          title="Change video model"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
            fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)',
            transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          <Video size={10} />
          <span>{vidModel?.label || 'Veo 3.1'}</span>
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {hasScenes && (
          <button className="btn btn-amber btn-sm" onClick={onOpenReel} style={{ gap: 6 }}>
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
