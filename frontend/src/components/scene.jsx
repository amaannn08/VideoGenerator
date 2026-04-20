import { useState, useRef } from 'react';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim();
const SCENES_ENDPOINT = import.meta.env.VITE_SCENES_ENDPOINT || '/api/thinking/scenes';
const SHOTS_ENDPOINT = import.meta.env.VITE_SHOTS_ENDPOINT || '/api/thinking/shots';
const PROMPTS_ENDPOINT = import.meta.env.VITE_PROMPTS_ENDPOINT || '/api/thinking/prompts';
const IMAGES_ENDPOINT = import.meta.env.VITE_IMAGES_ENDPOINT || '/api/thinking/images';
const VIDEOS_ENDPOINT = import.meta.env.VITE_VIDEOS_ENDPOINT || '/api/thinking/videos';

const buildApiUrl = (endpoint) => {
  if (!API_BASE_URL) return endpoint;
  return `${API_BASE_URL}${endpoint}`;
};

// ─── Stage IDs for the pipeline tracker ───
const PIPELINE_STAGES = ['scenes', 'shots', 'prompts', 'images', 'videos'];

const stageLabel = { scenes: 'Scenes', shots: 'Shots', prompts: 'Prompts', images: 'Reference Frames', videos: 'Videos' };

function stageStatus(stage, loadingStage, completedStages) {
  if (completedStages.includes(stage)) return 'done';
  if (loadingStage === stage) return 'loading';
  return 'pending';
}

// ─── Pill badge ───
function Pill({ children, color = 'gold' }) {
  const colors = {
    gold: 'bg-[#c9a22720] text-[#c9a227] border-[#c9a22740]',
    red: 'bg-[#8b1a1a30] text-[#e05252] border-[#8b1a1a50]',
    blue: 'bg-[#1a3a5c30] text-[#5b9bd5] border-[#1a3a5c50]',
    green: 'bg-[#1a4a2a30] text-[#5bd58a] border-[#1a4a2a50]',
    grey: 'bg-[#2a2a3020] text-[#888] border-[#2a2a3040]',
  };
  return (
    <span className={`inline-block text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded border ${colors[color]}`}>
      {children}
    </span>
  );
}

// ─── Stage indicator dot ───
function StageDot({ status }) {
  if (status === 'done') return (
    <div className="w-7 h-7 rounded-full bg-[#c9a227] flex items-center justify-center shadow-[0_0_8px_#c9a22780]">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  );
  if (status === 'loading') return (
    <div className="w-7 h-7 rounded-full border-2 border-[#c9a227] border-t-transparent animate-spin" />
  );
  return <div className="w-7 h-7 rounded-full border border-[#3a3a4a]" />;
}

// ─── Shot loading spinner ───
function ShotSpinner({ label }) {
  return (
    <div className="flex items-center gap-2 text-[#888] text-xs py-1">
      <div className="w-3 h-3 rounded-full border border-[#c9a227] border-t-transparent animate-spin" />
      {label}
    </div>
  );
}

function Scene() {
  const [script, setScript] = useState('');
  const [loadingStage, setLoadingStage] = useState('');
  const [completedStages, setCompletedStages] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [shotsByScene, setShotsByScene] = useState({});
  const [promptsByShot, setPromptsByShot] = useState({});
  const [imagesByShot, setImagesByShot] = useState({});
  const [videosByShot, setVideosByShot] = useState({});
  const [selectedSceneIds, setSelectedSceneIds] = useState([]);
  const [selectedShotIds, setSelectedShotIds] = useState([]);
  // Per-shot loading states
  const [shotLoadingIds, setShotLoadingIds] = useState({});
  const [error, setError] = useState('');

  const markComplete = (stage) =>
    setCompletedStages((prev) => (prev.includes(stage) ? prev : [...prev, stage]));

  const setShotLoading = (shotId, label) =>
    setShotLoadingIds((prev) => ({ ...prev, [shotId]: label }));

  const clearShotLoading = (shotId) =>
    setShotLoadingIds((prev) => { const n = { ...prev }; delete n[shotId]; return n; });

  const handleGenerateScenes = async () => {
    try {
      setLoadingStage('scenes');
      setError('');
      setScenes([]);
      setShotsByScene({});
      setPromptsByShot({});
      setImagesByShot({});
      setVideosByShot({});
      setSelectedSceneIds([]);
      setSelectedShotIds([]);
      setShotLoadingIds({});
      setCompletedStages([]);

      if (!script.trim()) throw new Error('Please enter a script first');

      const res = await fetch(buildApiUrl(SCENES_ENDPOINT), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);

      const parsedScenes = data?.result?.scenes || [];
      setScenes(parsedScenes);
      setSelectedSceneIds(parsedScenes.map((s) => s.id)); // auto-select all
      markComplete('scenes');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoadingStage('');
    }
  };

  const toggleScene = (id) =>
    setSelectedSceneIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );

  const toggleShot = (id) =>
    setSelectedShotIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );

  const generateShots = async () => {
    try {
      setLoadingStage('shots');
      setError('');
      const nextShotsByScene = { ...shotsByScene };
      const allShotIds = [];

      for (const sceneId of selectedSceneIds) {
        const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
        const scene = scenes[sceneIndex];
        if (!scene) continue;
        const previous_scene_summary = sceneIndex > 0 ? scenes[sceneIndex - 1]?.summary : '';

        const res = await fetch(buildApiUrl(SHOTS_ENDPOINT), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene, previous_scene_summary }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);

        const shots = data?.result?.shots || [];
        nextShotsByScene[sceneId] = shots;
        shots.forEach((shot) => allShotIds.push(shot.id));
      }

      setShotsByScene(nextShotsByScene);
      setSelectedShotIds(allShotIds); // auto-select all shots
      markComplete('shots');
    } catch (err) {
      setError(err.message || 'Failed to generate shots');
    } finally {
      setLoadingStage('');
    }
  };

  const generatePrompts = async () => {
    try {
      setLoadingStage('prompts');
      setError('');
      const allShots = Object.values(shotsByScene).flat();
      const selectedShots = allShots.filter((shot) => selectedShotIds.includes(shot.id));
      const nextPrompts = { ...promptsByShot };

      for (const shot of selectedShots) {
        setShotLoading(shot.id, 'Generating prompts…');
        const res = await fetch(buildApiUrl(PROMPTS_ENDPOINT), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shot }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
        nextPrompts[shot.id] = data?.result?.prompt_bundle;
        clearShotLoading(shot.id);
      }

      setPromptsByShot(nextPrompts);
      markComplete('prompts');
    } catch (err) {
      setError(err.message || 'Failed to generate prompts');
    } finally {
      setLoadingStage('');
    }
  };

  const generateImages = async () => {
    try {
      setLoadingStage('images');
      setError('');
      const nextImages = { ...imagesByShot };

      for (const shotId of selectedShotIds) {
        const promptBundle = promptsByShot[shotId];
        const sid = String(shotId ?? '').trim();
        const ip = String(promptBundle?.image_prompt ?? '').trim();
        if (!sid || !ip) continue;

        setShotLoading(sid, 'Generating reference frame…');
        const res = await fetch(buildApiUrl(IMAGES_ENDPOINT), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shot_id: sid, image_prompt: ip }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
        nextImages[sid] = data?.result;
        clearShotLoading(sid);
      }

      setImagesByShot(nextImages);
      markComplete('images');
    } catch (err) {
      setError(err.message || 'Failed to generate images');
    } finally {
      setLoadingStage('');
    }
  };

  const generateVideos = async () => {
    try {
      setLoadingStage('videos');
      setError('');
      const nextVideos = { ...videosByShot };

      for (const shotId of selectedShotIds) {
        const promptBundle = promptsByShot[shotId];
        const shot = Object.values(shotsByScene).flat().find((item) => item.id === shotId);
        if (!promptBundle?.video_prompt || !shot) continue;

        const imageData = imagesByShot[shotId];
        setShotLoading(shotId, 'Generating video (Veo 3)…');

        const res = await fetch(buildApiUrl(VIDEOS_ENDPOINT), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shot_id: shotId,
            video_prompt: promptBundle.video_prompt,
            duration: shot.duration,
            image_url: imageData?.image_url ?? null, // pass the generated reference image
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
        nextVideos[shotId] = data?.result;
        clearShotLoading(shotId);
      }

      setVideosByShot(nextVideos);
      markComplete('videos');
    } catch (err) {
      setError(err.message || 'Failed to generate videos');
    } finally {
      setLoadingStage('');
    }
  };

  const allShots = Object.values(shotsByScene).flat();
  const allShotsReady = allShots.length > 0;
  const promptsReady = Object.keys(promptsByShot).length > 0;
  const imagesReady = Object.keys(imagesByShot).length > 0;

  return (
    <div className="min-h-screen bg-[#07070d] text-white font-sans">
      {/* Header */}
      <header className="border-b border-[#1a1a2a] px-8 py-5 flex items-center gap-4">
        <div className="w-8 h-8 rounded bg-[#c9a22720] border border-[#c9a22740] flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="10" rx="1" stroke="#c9a227" strokeWidth="1.2"/>
            <path d="M6 6l4 2-4 2V6z" fill="#c9a227"/>
          </svg>
        </div>
        <div>
          <h1 className="text-base font-semibold tracking-tight text-white">Cinematic AI Pipeline</h1>
          <p className="text-[11px] text-[#555] tracking-wide">Script → Scenes → Shots → Prompts → Images → Video</p>
        </div>
        {/* Pipeline stage dots */}
        <div className="ml-auto flex items-center gap-1.5">
          {PIPELINE_STAGES.map((s, i) => {
            const status = stageStatus(s, loadingStage, completedStages);
            return (
              <div key={s} className="flex items-center gap-1.5">
                <div className="flex flex-col items-center gap-0.5">
                  <StageDot status={status} />
                  <span className="text-[9px] text-[#444] uppercase tracking-widest">{stageLabel[s].slice(0, 3)}</span>
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <div className={`w-5 h-px ${completedStages.includes(s) ? 'bg-[#c9a227]' : 'bg-[#2a2a3a]'}`} />
                )}
              </div>
            );
          })}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* ─── Script Input ─── */}
        <section className="rounded-xl border border-[#1e1e2e] bg-[#0d0d18] overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e1e2e]">
            <span className="text-[#c9a227] text-xs font-bold uppercase tracking-widest">01</span>
            <span className="text-sm font-semibold text-[#ddd]">Script</span>
            <Pill color="grey">Start here</Pill>
          </div>
          <div className="p-5 space-y-4">
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={"Enter your cinematic script here…\n\nExample:\n  Emperor Ashoka stands on the bloodied Kalinga battlefield. He surveys the devastation — thousands dead. His expression changes from confidence to horror. He whispers: \"Is vijay ki keemat… hazaaron zindagiyan thi.\" He slowly turns and walks away, changed forever."}
              rows={9}
              className="w-full bg-[#0a0a12] border border-[#2a2a3a] rounded-lg p-4 text-sm text-[#ccc] resize-none focus:outline-none focus:border-[#c9a22780] placeholder:text-[#333] leading-relaxed font-mono"
            />
            <button
              onClick={handleGenerateScenes}
              disabled={loadingStage === 'scenes'}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#c9a227] text-black text-sm font-bold rounded-lg hover:bg-[#d4ad30] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loadingStage === 'scenes' ? (
                <><div className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" /> Analysing Script…</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="black" strokeWidth="2" strokeLinecap="round"/></svg> Generate Scenes</>
              )}
            </button>
          </div>
        </section>

        {/* ─── Error ─── */}
        {error && (
          <div className="rounded-lg border border-[#8b1a1a50] bg-[#8b1a1a15] px-4 py-3 text-sm text-[#e05252] flex gap-2 items-start">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mt-0.5 shrink-0"><circle cx="7" cy="7" r="6" stroke="#e05252" strokeWidth="1.3"/><path d="M7 4v3M7 9.5v.5" stroke="#e05252" strokeWidth="1.5" strokeLinecap="round"/></svg>
            {error}
          </div>
        )}

        {/* ─── Scenes ─── */}
        {scenes.length > 0 && (
          <section className="rounded-xl border border-[#1e1e2e] bg-[#0d0d18] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e1e2e]">
              <span className="text-[#c9a227] text-xs font-bold uppercase tracking-widest">02</span>
              <span className="text-sm font-semibold text-[#ddd]">Scenes</span>
              <Pill color="green">{scenes.length} found</Pill>
              <span className="text-[11px] text-[#555] ml-1">Click to deselect</span>
              <button
                onClick={generateShots}
                disabled={!selectedSceneIds.length || !!loadingStage}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-[#c9a227] text-xs font-bold rounded-lg hover:border-[#c9a22780] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loadingStage === 'shots' ? (
                  <><div className="w-3 h-3 rounded-full border border-[#c9a227] border-t-transparent animate-spin" /> Generating Shots…</>
                ) : 'Generate Shots →'}
              </button>
            </div>
            <div className="p-5 grid gap-3">
              {scenes.map((scene, idx) => {
                const selected = selectedSceneIds.includes(scene.id);
                return (
                  <article
                    key={scene.id || idx}
                    onClick={() => toggleScene(scene.id)}
                    className={`rounded-lg border p-4 cursor-pointer transition-all ${selected ? 'border-[#c9a22780] bg-[#c9a22708]' : 'border-[#1e1e2e] hover:border-[#2a2a3a]'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-bold text-[#c9a227] uppercase tracking-wider">Scene {idx + 1}</span>
                          <Pill color={selected ? 'gold' : 'grey'}>{scene.emotion}</Pill>
                        </div>
                        <p className="text-sm text-[#ccc] leading-relaxed">{scene.summary}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#666]">
                          <span>📍 {scene.location?.slice(0, 60)}{scene.location?.length > 60 ? '…' : ''}</span>
                          <span>🕐 {scene.time_of_day}</span>
                        </div>
                        {scene.character_anchor && (
                          <p className="mt-2 text-[11px] text-[#c9a227] opacity-60">⚓ {scene.character_anchor}</p>
                        )}
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${selected ? 'bg-[#c9a227] border-[#c9a227]' : 'border-[#3a3a4a]'}`}>
                        {selected && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Shots ─── */}
        {allShotsReady && (
          <section className="rounded-xl border border-[#1e1e2e] bg-[#0d0d18] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e1e2e]">
              <span className="text-[#c9a227] text-xs font-bold uppercase tracking-widest">03</span>
              <span className="text-sm font-semibold text-[#ddd]">Shots</span>
              <Pill color="green">{allShots.length} total</Pill>
              <span className="text-[11px] text-[#555] ml-1">Click to deselect</span>
              <button
                onClick={generatePrompts}
                disabled={!selectedShotIds.length || !!loadingStage}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-[#c9a227] text-xs font-bold rounded-lg hover:border-[#c9a22780] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loadingStage === 'prompts' ? (
                  <><div className="w-3 h-3 rounded-full border border-[#c9a227] border-t-transparent animate-spin" /> Generating Prompts…</>
                ) : 'Generate Prompts →'}
              </button>
            </div>
            <div className="p-5 grid gap-3">
              {allShots.map((shot) => {
                const selected = selectedShotIds.includes(shot.id);
                const isLoading = shotLoadingIds[shot.id];
                return (
                  <article
                    key={shot.id}
                    onClick={() => toggleShot(shot.id)}
                    className={`rounded-lg border p-4 cursor-pointer transition-all ${selected ? 'border-[#c9a22780] bg-[#c9a22708]' : 'border-[#1e1e2e] hover:border-[#2a2a3a]'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-bold text-[#c9a227] uppercase tracking-wider">{shot.id}</span>
                          <Pill color="blue">{shot.duration}s</Pill>
                          <Pill color="grey">{shot.emotion}</Pill>
                        </div>
                        <p className="text-sm text-[#ccc] leading-relaxed">{shot.visual}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#666]">
                          <span>🎥 {shot.camera_framing}</span>
                          <span>↔ {shot.camera_motion}</span>
                        </div>
                        {shot.dialogue && shot.dialogue !== 'none' && (
                          <p className="mt-2 text-[11px] text-[#c9a227] opacity-80 font-medium">💬 {shot.dialogue}</p>
                        )}
                        {isLoading && <ShotSpinner label={isLoading} />}
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${selected ? 'bg-[#c9a227] border-[#c9a227]' : 'border-[#3a3a4a]'}`}>
                        {selected && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2 2 4-4" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Prompts ─── */}
        {promptsReady && (
          <section className="rounded-xl border border-[#1e1e2e] bg-[#0d0d18] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e1e2e]">
              <span className="text-[#c9a227] text-xs font-bold uppercase tracking-widest">04</span>
              <span className="text-sm font-semibold text-[#ddd]">Prompts</span>
              <Pill color="green">{Object.keys(promptsByShot).length} generated</Pill>
              <button
                onClick={generateImages}
                disabled={!!loadingStage}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#1a1a2e] border border-[#2a2a4a] text-[#c9a227] text-xs font-bold rounded-lg hover:border-[#c9a22780] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loadingStage === 'images' ? (
                  <><div className="w-3 h-3 rounded-full border border-[#c9a227] border-t-transparent animate-spin" /> Rendering Frames…</>
                ) : 'Generate Reference Frames →'}
              </button>
            </div>
            <div className="p-5 grid gap-4">
              {Object.entries(promptsByShot).map(([shotId, prompt]) => {
                const isLoading = shotLoadingIds[shotId];
                return (
                  <article key={shotId} className="rounded-lg border border-[#1e1e2e] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#c9a227] uppercase tracking-wider">{shotId}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-md bg-[#0a0a12] border border-[#1e1e2e] p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="2" width="9" height="7" rx="1" stroke="#c9a227" strokeWidth="1"/><circle cx="5.5" cy="5.5" r="1.5" stroke="#c9a227" strokeWidth="1"/></svg>
                          <span className="text-[10px] text-[#c9a227] font-bold uppercase tracking-widest">Image</span>
                        </div>
                        <p className="text-[11px] text-[#999] leading-relaxed">{prompt?.image_prompt}</p>
                      </div>
                      <div className="rounded-md bg-[#0a0a12] border border-[#1e1e2e] p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="2" width="9" height="7" rx="1" stroke="#5b9bd5" strokeWidth="1"/><path d="M4 4.5l3 1-3 1V4.5z" fill="#5b9bd5"/></svg>
                          <span className="text-[10px] text-[#5b9bd5] font-bold uppercase tracking-widest">Video</span>
                        </div>
                        <p className="text-[11px] text-[#999] leading-relaxed">{prompt?.video_prompt}</p>
                      </div>
                    </div>
                    {isLoading && <ShotSpinner label={isLoading} />}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Images ─── */}
        {imagesReady && (
          <section className="rounded-xl border border-[#1e1e2e] bg-[#0d0d18] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e1e2e]">
              <span className="text-[#c9a227] text-xs font-bold uppercase tracking-widest">05</span>
              <span className="text-sm font-semibold text-[#ddd]">Reference Frames</span>
              <Pill color="green">{Object.keys(imagesByShot).length} rendered</Pill>
              <button
                onClick={generateVideos}
                disabled={!!loadingStage}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-[#c9a227] text-black text-xs font-bold rounded-lg hover:bg-[#d4ad30] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loadingStage === 'videos' ? (
                  <><div className="w-3 h-3 rounded-full border-2 border-black border-t-transparent animate-spin" /> Generating Videos (Veo 3)…</>
                ) : '⚡ Generate Videos with Veo 3'}
              </button>
            </div>
            <div className="p-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Object.entries(imagesByShot).map(([shotId, image]) => {
                const isLoading = shotLoadingIds[shotId];
                return (
                  <article key={shotId} className="rounded-lg border border-[#1e1e2e] overflow-hidden">
                    {image?.image_url ? (
                      <img
                        src={image.image_url}
                        alt={`Shot ${shotId}`}
                        className="w-full aspect-[9/16] object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-[9/16] bg-[#0a0a12] flex items-center justify-center">
                        <span className="text-[#444] text-xs">No image</span>
                      </div>
                    )}
                    <div className="p-2 bg-[#0a0a12]">
                      <span className="text-[10px] font-bold text-[#c9a227] uppercase tracking-widest">{shotId}</span>
                      {isLoading && <ShotSpinner label={isLoading} />}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Videos ─── */}
        {Object.keys(videosByShot).length > 0 && (
          <section className="rounded-xl border border-[#c9a22730] bg-[#0d0d18] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#c9a22730]">
              <span className="text-[#c9a227] text-xs font-bold uppercase tracking-widest">06</span>
              <span className="text-sm font-semibold text-[#ddd]">Generated Videos</span>
              <Pill color="green">{Object.keys(videosByShot).length} clips</Pill>
            </div>
            <div className="p-5 grid gap-4">
              {Object.entries(videosByShot).map(([shotId, video]) => {
                const refImage = imagesByShot[shotId]?.image_url;
                const isLoading = shotLoadingIds[shotId];
                return (
                  <article key={shotId} className="rounded-lg border border-[#1e1e2e] overflow-hidden bg-[#0a0a12]">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1e1e2e]">
                      <span className="text-xs font-bold text-[#c9a227] uppercase tracking-wider">{shotId}</span>
                      <Pill color="green">veo 3</Pill>
                    </div>
                    {video?.video_url && (
                      <video
                        controls
                        poster={refImage}
                        className="w-full max-h-[60vh] object-contain bg-black"
                        src={video.video_url}
                      />
                    )}
                    {isLoading && <div className="px-4 py-2"><ShotSpinner label={isLoading} /></div>}
                  </article>
                );
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

export default Scene;