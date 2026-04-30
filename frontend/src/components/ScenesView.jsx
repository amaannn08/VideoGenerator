import React from 'react';
import { Play, Square, Plus, Film } from 'lucide-react';
import { Spinner } from './ui/primitives';
import SceneCard from './SceneCard';

export default function ScenesView({
  scenes, updateScene, deleteScene, addScene,
  globalCharacter, globalCharacters, globalEnvironments, targetLanguage,
  autoRunStage, autoRunCurrentScene,
  onAutoRun, onStopAutoRun,
  refreshMediaUrl, narrativeArc,
}) {
  const allDone = scenes.length > 0 && scenes.every(s => Boolean(s.videoUrl));
  const isRunning = autoRunStage === 'running';
  const doneCount = { img: scenes.filter(s => s.imageUrl).length, vid: scenes.filter(s => s.videoUrl).length };
  const isPartiallyDone = scenes.some(s => s.status && s.status !== 'draft') && !allDone;

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

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {scenes.map((scene, i) => (
          <SceneCard
            key={scene.id} scene={scene} index={i}
            updateScene={updateScene}
            globalCharacter={globalCharacter} globalCharacters={globalCharacters}
            globalEnvironments={globalEnvironments} targetLanguage={targetLanguage}
            previousSceneImage={i > 0 ? (scenes[i - 1].imageUrl || '') : ''}
            totalScenes={scenes.length} autoRunStage={autoRunStage}
            onDelete={() => deleteScene(scene.id)}
            onAddAfter={() => addScene(i)}
            refreshMediaUrl={refreshMediaUrl}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
        <button className="btn btn-outline" onClick={() => addScene(scenes.length - 1)} style={{ borderStyle: 'dashed' }}>
          <Plus size={14} /> Add Scene
        </button>
      </div>
    </div>
  );
}
