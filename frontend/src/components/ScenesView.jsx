import React, { useState } from 'react';
import { Play, Square, Plus, Film, ArrowLeft } from 'lucide-react';
import { Spinner } from './ui/primitives';
import SceneCard from './SceneCard';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();
const getMediaUrl = (url) => url?.startsWith('http') ? url : `${API}${url}`;

function PreviewPanel({ scene, sceneIdx }) {
  const finalImage = (scene.imageGenerations || []).find(g => g.isFinal)?.imageUrl || scene.imageUrl;
  const finalVideo = (scene.videoGenerations || []).find(g => g.isFinal)?.videoUrl || scene.videoUrl;
  const [mode, setMode] = useState(finalVideo ? 'video' : 'image');

  React.useEffect(() => { if (finalVideo) setMode('video'); }, [finalVideo]);

  const TabBtn = ({ value, label, available }) => (
    <button
      onClick={() => setMode(value)}
      disabled={!available}
      style={{
        fontSize: 11, fontWeight: 700, padding: '5px 14px', borderRadius: 8, border: 'none',
        cursor: available ? 'pointer' : 'not-allowed',
        background: mode === value
          ? (value === 'video' ? 'rgba(34,197,94,0.15)' : 'var(--amber-glow)')
          : 'var(--bg-overlay)',
        color: mode === value
          ? (value === 'video' ? 'var(--green)' : 'var(--amber)')
          : available ? 'var(--text-secondary)' : 'var(--text-muted)',
        opacity: available ? 1 : 0.45,
        transition: 'all 0.15s',
      }}
    >{label}</button>
  );

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', minHeight: 0 }}>

      {/* Header + tabs */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Film size={13} style={{ color: 'var(--amber)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4 }}>Preview</span>
        <TabBtn value="image" label="🎨 Image" available={!!finalImage} />
        <TabBtn value="video" label="▶ Video" available={!!finalVideo} />
        {finalVideo && <span style={{ marginLeft: 'auto', fontSize: 10, background: 'var(--green-dim)', color: 'var(--green)', padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>Ready</span>}
      </div>

      {/* Media */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', overflow: 'hidden' }}>
        {mode === 'video' && finalVideo ? (
          <video key={finalVideo} src={getMediaUrl(finalVideo)} controls autoPlay loop style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : mode === 'image' && finalImage ? (
          <img key={finalImage} src={getMediaUrl(finalImage)} alt="Scene storyboard" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', border: '2px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Film size={22} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {mode === 'video' ? 'No video yet' : 'No image yet'}<br />
              <span style={{ fontSize: 11 }}>Generate using the controls on the left</span>
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      {(finalImage || finalVideo) && (
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {mode === 'video' && finalVideo ? '▶ Final render' : '🎨 Storyboard'} · Scene {sceneIdx + 1}
          </span>
          {mode === 'image' && finalImage && (
            <a href={getMediaUrl(finalImage)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--amber)', textDecoration: 'none', fontWeight: 600 }}>Open ↗</a>
          )}
          {mode === 'video' && finalVideo && (
            <a href={getMediaUrl(finalVideo)} download style={{ fontSize: 11, color: 'var(--green)', textDecoration: 'none', fontWeight: 600 }}>Download ↓</a>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScenesView({
  scenes, updateScene, deleteScene, addScene,
  globalCharacter, globalCharacters, globalEnvironments, targetLanguage,
  autoRunStage, autoRunCurrentScene,
  onAutoRun, onStopAutoRun,
  refreshMediaUrl, narrativeArc,
  activeSceneId, onSceneSelect,
  imageModelId, videoModelId,
}) {
  const allDone = scenes.length > 0 && scenes.every(s => Boolean(s.videoUrl));
  const isRunning = autoRunStage === 'running';
  const doneCount = { img: scenes.filter(s => s.imageUrl).length, vid: scenes.filter(s => s.videoUrl).length };
  const isPartiallyDone = scenes.some(s => s.status && s.status !== 'draft') && !allDone;

  // ── Single scene detail view ───────────────────────────────────────────
  if (activeSceneId) {
    const sceneIdx = scenes.findIndex(s => s.id === activeSceneId);
    const scene = scenes[sceneIdx];
    if (!scene) { onSceneSelect(null); return null; }
    const prevScene = sceneIdx > 0 ? scenes[sceneIdx - 1] : null;
    const nextScene = sceneIdx < scenes.length - 1 ? scenes[sceneIdx + 1] : null;

    return (
      <div
        className="animate-fade-up scenes-detail-root"
        style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}
      >
        {/* Breadcrumb nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onSceneSelect(null)} style={{ gap: 6 }}>
            <ArrowLeft size={14} /> All Scenes
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Scene {sceneIdx + 1} of {scenes.length}{scene.title ? ` — ${scene.title}` : ''}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {prevScene && <button className="btn btn-outline btn-sm" onClick={() => onSceneSelect(prevScene.id)}>← Prev</button>}
            {nextScene && <button className="btn btn-outline btn-sm" onClick={() => onSceneSelect(nextScene.id)}>Next →</button>}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => { addScene(sceneIdx); onSceneSelect(null); }}
              style={{ borderStyle: 'dashed', gap: 5 }}
            >
              <Plus size={13} /> Add Scene
            </button>
          </div>
        </div>

        {/* Two-column layout — fills remaining height under breadcrumb (fits screen) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: 'minmax(0, 1fr)',
            gap: 16,
            flex: 1,
            minHeight: 0,
            alignItems: 'stretch',
          }}
        >
          {/* LEFT — scene card controls */}
          <div style={{ height: '100%', overflowY: 'auto', paddingRight: 2, minHeight: 0 }}>
            <SceneCard
              scene={scene} index={sceneIdx}
              updateScene={updateScene}
              globalCharacter={globalCharacter} globalCharacters={globalCharacters}
              globalEnvironments={globalEnvironments} targetLanguage={targetLanguage}
              previousSceneImage={prevScene?.imageUrl || ''}
              totalScenes={scenes.length} autoRunStage={autoRunStage}
              onDelete={() => { deleteScene(scene.id); onSceneSelect(null); }}
              onAddAfter={() => addScene(sceneIdx)}
              refreshMediaUrl={refreshMediaUrl}
              imageModelId={imageModelId}
              videoModelId={videoModelId}
            />
          </div>
          {/* RIGHT — preview panel */}
          <PreviewPanel scene={scene} sceneIdx={sceneIdx} />
        </div>
      </div>
    );
  }

  // ── Grid view ──────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {narrativeArc && (
        <div style={{ background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.18)', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Film size={16} style={{ color: 'var(--amber)', marginTop: 1, flexShrink: 0 }} />
          <div>
            <p className="text-label" style={{ marginBottom: 4 }}>Narrative Arc</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{narrativeArc}</p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="step-badge">2</span>
          <h2 className="section-title">Scene Generation</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{doneCount.img}/{scenes.length} images · {doneCount.vid}/{scenes.length} videos</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => addScene(scenes.length - 1)}
            style={{ borderStyle: 'dashed', gap: 5 }}
          >
            <Plus size={13} /> Add Scene
          </button>
          {isRunning ? (
            <button className="btn btn-danger btn-sm" onClick={onStopAutoRun}><Square size={13} /> Stop</button>
          ) : (
            <button className="btn btn-success btn-sm" onClick={onAutoRun} disabled={autoRunStage === 'done' && allDone}>
              <Play size={13} style={{ fill: 'currentColor' }} />
              {isPartiallyDone ? 'Resume Generation' : 'Auto-Generate All'}
            </button>
          )}
        </div>
      </div>

      {isRunning && autoRunCurrentScene && (
        <div style={{ background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.18)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--amber)', fontWeight: 500 }}>
          <Spinner size={13} color="border-[var(--amber)]" />
          Processing Scene {scenes.findIndex(s => s.id === autoRunCurrentScene) + 1} of {scenes.length}…
        </div>
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', alignItems: 'stretch' }}>
        {scenes.map((scene, i) => (
          <div key={scene.id} style={{ cursor: 'pointer' }} onClick={() => onSceneSelect(scene.id)}>
            <SceneCard
              scene={scene} index={i}
              updateScene={updateScene}
              globalCharacter={globalCharacter} globalCharacters={globalCharacters}
              globalEnvironments={globalEnvironments} targetLanguage={targetLanguage}
              previousSceneImage={i > 0 ? (scenes[i - 1].imageUrl || '') : ''}
              totalScenes={scenes.length} autoRunStage={autoRunStage}
              onDelete={() => deleteScene(scene.id)}
              onAddAfter={() => addScene(i)}
              refreshMediaUrl={refreshMediaUrl}
              imageModelId={imageModelId}
              videoModelId={videoModelId}
            />
          </div>
        ))}
      </div>


    </div>
  );
}
