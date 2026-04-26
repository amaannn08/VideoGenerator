import React, { useState, useEffect, useCallback, useRef } from 'react';
import SceneCard from './components/SceneCard';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();

function Spinner({ size = 14, color = 'border-indigo-600' }) {
  return <div style={{ width: size, height: size }} className={`rounded-full border-2 ${color} border-t-transparent animate-spin flex-shrink-0`} />;
}

function Btn({ onClick, disabled, loading, children, variant = 'primary', className = '' }) {
  const base = 'inline-flex justify-center items-center gap-2 font-semibold text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const v = { primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm', ghost: 'bg-white text-gray-700 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 shadow-sm', danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm', success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' };
  return <button onClick={onClick} disabled={disabled || loading} className={`${base} ${v[variant] || v.primary} ${className}`}>{loading && <Spinner size={14} color={variant === 'primary' || variant === 'danger' || variant === 'success' ? 'border-white' : 'border-indigo-600'} />}{children}</button>;
}

function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => { try { const x = window.localStorage.getItem(key); return x ? JSON.parse(x) : init; } catch { return init; } });
  const set = useCallback((v) => { setVal(prev => { const nv = typeof v === 'function' ? v(prev) : v; return nv; }); }, []);
  useEffect(() => { const t = setTimeout(() => { try { window.localStorage.setItem(key, JSON.stringify(val)); } catch {} }, 500); return () => clearTimeout(t); }, [key, val]);
  return [val, set];
}

const PIPELINE_STAGES = [
  { key: 'script', label: 'Script' },
  { key: 'image_prompt', label: 'Img Prompts' },
  { key: 'image', label: 'Images' },
  { key: 'video_prompt', label: 'Vid Prompts' },
  { key: 'video', label: 'Videos' },
  { key: 'merge', label: 'Merged' },
];

export default function App() {
  const [globalCharacter, setGlobalCharacter] = useLocalStorage('ai-video-character', '');
  const [narrativeArc, setNarrativeArc] = useLocalStorage('ai-video-arc', '');
  const [script, setScript] = useLocalStorage('ai-video-script', '');
  const [sceneCount, setSceneCount] = useLocalStorage('ai-video-scenecount', 3);
  const [scenes, setScenes] = useLocalStorage('ai-video-scenes', []);
  const [mergedVideo, setMergedVideo] = useLocalStorage('ai-video-merged', null);

  const [loadingScenes, setLoadingScenes] = useState(false);
  const [merging, setMerging] = useState(false);
  const [autoRunStage, setAutoRunStage] = useState('idle'); // idle | running | done | error
  const [autoRunCurrentScene, setAutoRunCurrentScene] = useState(null);
  const [autoRunProgress, setAutoRunProgress] = useState({}); // { sceneId: { stage, status } }
  const sseRef = useRef(null);

  const [sessionId, setSessionId] = useState(() => new URLSearchParams(window.location.search).get('session'));
  const [isInitializing, setIsInitializing] = useState(!!sessionId);
  const [allSessions, setAllSessions] = useState([]);

  // Fetch all sessions for dropdown
  useEffect(() => {
    fetch(`${API}/api/sessions`)
      .then(res => res.json())
      .then(data => {
        if (data.sessions) setAllSessions(data.sessions);
      })
      .catch(console.error);
  }, [sessionId, narrativeArc]);

  // Load session from DB
  useEffect(() => {
    if (sessionId) {
      fetch(`${API}/api/sessions/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setScript(data.script || '');
            setGlobalCharacter(data.globalCharacter || '');
            setNarrativeArc(data.narrativeArc || '');
            setScenes(data.scenes || []);
            setMergedVideo(data.mergedVideo || null);
          }
        })
        .catch(console.error)
        .finally(() => setIsInitializing(false));
    } else {
      setIsInitializing(false);
    }
  }, [sessionId]);

  // Auto-save to DB when state changes
  useEffect(() => {
    if (!sessionId || isInitializing) return;
    const timeout = setTimeout(() => {
      fetch(`${API}/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, globalCharacter, narrativeArc, scenes, mergedVideo })
      }).catch(console.error);
    }, 2000);
    return () => clearTimeout(timeout);
  }, [script, globalCharacter, narrativeArc, scenes, mergedVideo, sessionId, isInitializing]);

  const updateScene = useCallback((id, updates) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, [setScenes]);

  // ── Scene Split ───────────────────────────────────────────────────────────
  const handleSplitScript = async () => {
    if (!script.trim()) return;
    setLoadingScenes(true);
    try {
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const sessRes = await fetch(`${API}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script, sceneCount })
        });
        const sessData = await sessRes.json();
        currentSessionId = sessData.sessionId;
        setSessionId(currentSessionId);
        window.history.replaceState({}, '', '?session=' + currentSessionId);
      }

      const r = await fetch(`${API}/api/scenes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script, sceneCount }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setGlobalCharacter(d.character || '');
      setNarrativeArc(d.narrativeArc || '');
      setScenes(d.scenes.map(s => ({ ...s, status: 'draft', id: s.id || Math.random().toString(36).substr(2, 9) })));
      setMergedVideo(null);
      setAutoRunStage('idle');
      setAutoRunProgress({});
    } catch (e) { alert(`Failed to split script: ${e.message}`); }
    finally { setLoadingScenes(false); }
  };

  // ── Auto-Run Pipeline ─────────────────────────────────────────────────────
  const handleAutoRun = () => {
    if (sseRef.current) sseRef.current.close();
    setAutoRunStage('running');
    setAutoRunProgress({});
    setMergedVideo(null);

    const body = JSON.stringify({ scenes, globalCharacter, sessionId });
    fetch(`${API}/api/auto-run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .then(async (res) => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processLine = (line) => {
          if (!line.startsWith('data: ')) return;
          try {
            const ev = JSON.parse(line.slice(6));
            handleSSEEvent(ev);
          } catch {}
        };

        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            lines.forEach(processLine);
          }
          buffer.split('\n').forEach(processLine);
        };

        sseRef.current = { close: () => reader.cancel() };
        await pump();
        setAutoRunStage(prev => prev === 'running' ? 'done' : prev);
      })
      .catch(e => { console.error(e); setAutoRunStage('error'); });
  };

  const handleSSEEvent = (ev) => {
    if (ev.type === 'scene_progress') {
      const { sceneId, stage, status, data } = ev;
      setAutoRunCurrentScene(sceneId);
      setAutoRunProgress(prev => ({ ...prev, [sceneId]: { stage, status } }));
      if (status === 'done' && data) {
        const updates = {};
        if (data.imagePrompt) updates.imagePrompt = data.imagePrompt;
        if (data.imageUrl) { updates.imageUrl = data.imageUrl; updates.status = 'image_done'; }
        if (data.videoPrompt) updates.videoPrompt = data.videoPrompt;
        if (data.videoUrl) { updates.videoUrl = data.videoUrl; updates.status = 'video_done'; }
        if (Object.keys(updates).length) updateScene(sceneId, updates);
      }
    } else if (ev.type === 'merge') {
      setAutoRunCurrentScene(null);
    } else if (ev.type === 'pipeline_complete') {
      setMergedVideo(ev.data.mergedVideoUrl);
      setAutoRunStage('done');
      setAutoRunCurrentScene(null);
    } else if (ev.type === 'error') {
      console.error('Pipeline error:', ev);
    } else if (ev.type === 'cancelled') {
      setAutoRunStage('idle');
    }
  };

  const handleStopAutoRun = () => {
    if (sseRef.current) sseRef.current.close();
    setAutoRunStage('idle');
    setAutoRunCurrentScene(null);
  };

  // ── Manual Merge ──────────────────────────────────────────────────────────
  const handleMerge = async () => {
    setMerging(true);
    try {
      const videoUrls = scenes.map(s => s.videoUrl).filter(Boolean);
      if (!videoUrls.length) throw new Error('No videos to merge');
      const r = await fetch(`${API}/api/merge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoUrls }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMergedVideo(d.videoUrl);
    } catch (e) { alert(`Merge failed: ${e.message}`); }
    finally { setMerging(false); }
  };

  const handleReset = () => {
    if (!window.confirm('Clear everything and restart?')) return;
    handleStopAutoRun();
    setScript(''); setScenes([]); setGlobalCharacter(''); setNarrativeArc(''); setMergedVideo(null);
    window.localStorage.clear();
    setSessionId(null);
    window.history.replaceState({}, '', window.location.pathname);
  };

  const allDone = scenes.length > 0 && scenes.every(s => Boolean(s.videoUrl));
  const doneCount = { img: scenes.filter(s => s.imageUrl).length, vid: scenes.filter(s => s.videoUrl).length };
  const isRunning = autoRunStage === 'running';

  // Determine active pipeline stage for the progress bar
  const activePipelineStage = (() => {
    if (!scenes.length) return 'script';
    if (mergedVideo) return 'merge';
    if (doneCount.vid === scenes.length) return 'video';
    if (doneCount.img === scenes.length) return 'image';
    return 'image_prompt';
  })();

  const isPartiallyDone = scenes.some(s => s.status && s.status !== 'draft') && !allDone;

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#f0f1f6] flex items-center justify-center flex-col gap-4">
        <Spinner size={32} color="border-indigo-600" />
        <p className="text-gray-500 font-semibold animate-pulse">Loading Session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f1f6] text-gray-900 font-sans pb-32">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-40 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-gray-900 tracking-tight">Cinematic AI Reel Builder</h1>
          <p className="text-[11px] text-gray-400 uppercase tracking-widest mt-0.5">DeepSeek · Gemini · Veo 3</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={sessionId || ''} 
            onChange={(e) => {
              if (e.target.value) {
                window.location.href = '?session=' + e.target.value;
              } else {
                window.location.href = window.location.pathname;
              }
            }}
            className="text-xs font-bold bg-white text-gray-700 border border-gray-200 px-3 py-2 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px] sm:max-w-[300px] truncate cursor-pointer"
          >
            <option value="">+ New Session</option>
            {allSessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.narrative_arc ? s.narrative_arc.substring(0, 50) + (s.narrative_arc.length > 50 ? '...' : '') : `Session ${s.id}`}
              </option>
            ))}
          </select>

          {sessionId && (
            <button 
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert('Session link copied to clipboard!');
              }} 
              className="text-xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-100 flex items-center gap-2"
            >
              🔗 Copy Share Link
            </button>
          )}
          <button onClick={handleReset} className="text-xs font-bold bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-100 flex items-center gap-2">🔄 Restart</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Step 1: Script */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h2 className="font-bold text-base mb-4 flex items-center gap-2">
            <span className="bg-indigo-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">1</span>
            Master Script
          </h2>
          <textarea
            value={script}
            onChange={e => setScript(e.target.value)}
            placeholder="Paste your master script here… The AI will break it into scenes, extract dialogue, emotional arcs, and generate everything automatically."
            className="w-full border border-gray-200 rounded-xl p-4 min-h-[160px] focus:outline-none focus:border-indigo-500 font-mono text-sm leading-relaxed resize-none"
          />
          <div className="mt-4 flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100 gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold text-gray-700">Scenes:</label>
              <input
                type="number"
                min={0}
                max={20}
                value={sceneCount}
                onChange={e => setSceneCount(Math.max(0, parseInt(e.target.value) || 0))}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none w-20 text-center"
              />
              <span className="text-sm text-gray-500 font-medium">
                {sceneCount === 0 ? 'Auto (Let AI decide)' : `scene${sceneCount !== 1 ? 's' : ''}`}
              </span>
            </div>
            <Btn onClick={handleSplitScript} loading={loadingScenes}>Split into Scenes</Btn>
          </div>
        </section>

        {/* Narrative Arc Banner */}
        {narrativeArc && (
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 rounded-2xl shadow-lg flex items-start gap-3">
            <span className="text-2xl mt-0.5">🎬</span>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Narrative Arc</div>
              <p className="text-sm font-medium leading-relaxed">{narrativeArc}</p>
            </div>
          </div>
        )}

        {/* Step 2: Scenes */}
        {scenes.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="font-bold text-base flex items-center gap-2">
                <span className="bg-indigo-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">2</span>
                Scene Generation
                <span className="text-sm text-gray-400 font-normal ml-1">{doneCount.img}/{scenes.length} images · {doneCount.vid}/{scenes.length} videos</span>
              </h2>
              <div className="flex gap-2">
                {isRunning ? (
                  <Btn onClick={handleStopAutoRun} variant="danger" className="px-5 py-2.5">
                    <Spinner size={14} color="border-white" /> Stop Auto-Run
                  </Btn>
                ) : (
                  <Btn onClick={handleAutoRun} variant="success" disabled={autoRunStage === 'done' && allDone} className="px-5 py-2.5 text-sm font-black">
                    {isPartiallyDone ? '▶ Resume Generation' : '▶ Auto-Generate All Scenes'}
                  </Btn>
                )}
              </div>
            </div>

            {/* Auto-run status banner */}
            {isRunning && autoRunCurrentScene && (
              <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
                <Spinner size={14} color="border-amber-600" />
                Processing Scene {scenes.findIndex(s => s.id === autoRunCurrentScene) + 1} of {scenes.length}…
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scenes.map((scene, i) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  index={i}
                  updateScene={updateScene}
                  globalCharacter={globalCharacter}
                  previousSceneImage={i > 0 ? (scenes[i-1].imageUrl || '') : ''}
                  totalScenes={scenes.length}
                  autoRunStage={autoRunStage}
                />
              ))}
            </div>
          </section>
        )}

        {/* Step 3: Final Reel */}
        {scenes.length > 0 && (
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 text-center flex flex-col items-center">
            <h2 className="font-bold text-base mb-1 flex items-center gap-2">
              <span className="bg-indigo-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full">3</span>
              Final Reel
            </h2>
            <p className="text-gray-500 text-sm mb-6">Merge all completed scene videos into one continuous cinematic reel.</p>

            <div className="flex flex-col items-center gap-6 w-full max-w-xs">
              {!mergedVideo ? (
                <Btn onClick={handleMerge} loading={merging} disabled={!allDone && !isRunning} className="px-8 py-3 text-base w-full">
                  {merging ? 'Merging…' : 'Merge & Export Reel'}
                </Btn>
              ) : (
                <div className="w-full flex flex-col items-center gap-4">
                  <video src={`${API}${mergedVideo}`} controls autoPlay className="w-full bg-black rounded-xl shadow-lg border border-gray-200" />
                  <a href={`${API}${mergedVideo}`} download className="text-indigo-600 font-semibold hover:underline text-sm">⬇ Download MP4</a>
                  <Btn onClick={handleMerge} loading={merging} disabled={!allDone && !isRunning} variant="ghost" className="w-full mt-2">
                    {merging ? 'Merging…' : '↻ Re-Merge & Export'}
                  </Btn>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Pipeline Progress Bar (sticky bottom) */}
      {scenes.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-sm border-t border-gray-200 px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center gap-2 justify-center">
            {PIPELINE_STAGES.map((s, i) => {
              const stageOrder = PIPELINE_STAGES.map(x => x.key);
              const activeIdx = stageOrder.indexOf(activePipelineStage);
              const thisIdx = stageOrder.indexOf(s.key);
              const done = thisIdx < activeIdx || (thisIdx === activeIdx && activePipelineStage === 'merge');
              const active = thisIdx === activeIdx && activePipelineStage !== 'merge';
              return (
                <React.Fragment key={s.key}>
                  <div className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full transition-all ${done ? 'bg-green-100 text-green-700' : active ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                    {done ? '✓' : active && isRunning ? <Spinner size={10} color="border-indigo-600" /> : null}
                    {s.label}
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && <span className={`text-[10px] font-black ${thisIdx < activeIdx ? 'text-green-500' : 'text-gray-300'}`}>→</span>}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
