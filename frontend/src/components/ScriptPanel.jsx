import React from 'react';
import { Sparkles } from 'lucide-react';
import { Spinner } from './ui/primitives';

const LANGUAGES = ['Hindi','English','Tamil','Telugu','Bengali','Marathi','Punjabi','Urdu','Gujarati','Kannada','Malayalam'];

export default function ScriptPanel({ script, setScript, sceneCount, setSceneCount, targetLanguage, setTargetLanguage, onSplit, loading }) {
  return (
    <section className="surface" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span className="step-badge">1</span>
        <h2 className="section-title">Master Script</h2>
      </div>

      <textarea
        value={script}
        onChange={e => setScript(e.target.value)}
        placeholder="Paste your master script here… The AI will break it into scenes, extract dialogue, emotional arcs, and generate everything automatically."
        className="cine-input"
        style={{ flex: 1, minHeight: 300, resize: 'none', lineHeight: 1.65, fontFamily: 'inherit' }}
      />

      <div style={{
        marginTop: 12,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 14px',
        background: 'var(--bg-raised)',
        borderRadius: 10,
        border: '1px solid var(--border-subtle)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-label">Scenes</span>
            <input
              type="number"
              min={0} max={20}
              value={sceneCount}
              onChange={e => setSceneCount(Math.max(0, parseInt(e.target.value) || 0))}
              className="cine-input"
              style={{ width: 64, textAlign: 'center', padding: '6px 8px' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {sceneCount === 0 ? 'auto' : `scene${sceneCount !== 1 ? 's' : ''}`}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-label">Language</span>
            <select
              value={targetLanguage}
              onChange={e => setTargetLanguage(e.target.value)}
              className="cine-input"
              style={{ padding: '6px 28px 6px 10px', width: 'auto' }}
            >
              {LANGUAGES.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <button
          className="btn btn-amber"
          onClick={onSplit}
          disabled={loading || !script.trim()}
          style={{ minWidth: 150 }}
        >
          {loading ? <Spinner size={13} color="border-[#080910]" /> : <Sparkles size={14} />}
          {loading ? 'Splitting…' : 'Split into Scenes'}
        </button>
      </div>
    </section>
  );
}
