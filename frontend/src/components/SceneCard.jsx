import React, { useState, useEffect, memo, useRef } from 'react';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();

function Spinner({ size = 14, color = 'border-indigo-600' }) {
  return <div style={{ width: size, height: size }} className={`rounded-full border-2 ${color} border-t-transparent animate-spin flex-shrink-0`} />;
}

function Btn({ onClick, disabled, loading, children, variant = 'primary', className = '' }) {
  const base = 'inline-flex justify-center items-center gap-2 font-semibold text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const v = { primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm', ghost: 'bg-white text-gray-700 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 shadow-sm', danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm' };
  return <button onClick={onClick} disabled={disabled || loading} className={`${base} ${v[variant]} ${className}`}>{loading && <Spinner size={14} color={variant === 'primary' || variant === 'danger' ? 'border-white' : 'border-indigo-600'} />}{children}</button>;
}

function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => { document.body.style.overflow = isOpen ? 'hidden' : 'unset'; return () => { document.body.style.overflow = 'unset'; }; }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[92vh] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="font-bold text-xl text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800 w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 font-bold text-2xl">&times;</button>
        </div>
        <div className="p-8 flex-1 overflow-y-auto bg-[#fafbfc]">{children}</div>
      </div>
    </div>
  );
}

const STAGES = ['draft', 'generating_image_prompt', 'image_prompt_ready', 'image_generating', 'image_done', 'generating_video_prompt', 'video_prompt_ready', 'video_generating', 'video_done'];

const SceneCard = memo(({ scene, index, updateScene, globalCharacter, previousSceneImage, totalScenes, autoRunStage, onDelete, onAddAfter }) => {
  const { status } = scene;
  const [imgModal, setImgModal] = useState(false);
  const [vidModal, setVidModal] = useState(false);
  const [scriptModal, setScriptModal] = useState(false);
  const [localImg, setLocalImg] = useState(scene.imagePrompt || '');
  const [localVid, setLocalVid] = useState(scene.videoPrompt || '');
  const [localDialogue, setLocalDialogue] = useState(scene.dialogue?.text || '');
  const [localTone, setLocalTone] = useState(scene.dialogue?.tone || 'calm and deliberate');
  const [localPacing, setLocalPacing] = useState(scene.dialogue?.pacing || 'slow with natural pauses');
  const [localLang, setLocalLang] = useState(scene.dialogue?.language || 'Hindi');
  const [localSummary, setLocalSummary] = useState(scene.summary || '');
  const [localLocation, setLocalLocation] = useState(scene.location || '');
  const [localTimeOfDay, setLocalTimeOfDay] = useState(scene.timeOfDay || '');
  const [localTitle, setLocalTitle] = useState(scene.title || '');
  const [localDuration, setLocalDuration] = useState(scene.duration || 8);
  const [imgCustomInstruction, setImgCustomInstruction] = useState(scene.imgCustomInstruction || '');
  const [vidCustomInstruction, setVidCustomInstruction] = useState(scene.vidCustomInstruction || '');
  const [scenePromptInput, setScenePromptInput] = useState('');
  const [generatingScene, setGeneratingScene] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => setLocalImg(scene.imagePrompt || ''), [scene.imagePrompt]);
  useEffect(() => setLocalVid(scene.videoPrompt || ''), [scene.videoPrompt]);
  useEffect(() => setLocalDialogue(scene.dialogue?.text || ''), [scene.dialogue?.text]);
  useEffect(() => setLocalSummary(scene.summary || ''), [scene.summary]);
  useEffect(() => setLocalLocation(scene.location || ''), [scene.location]);
  useEffect(() => setLocalTimeOfDay(scene.timeOfDay || ''), [scene.timeOfDay]);
  useEffect(() => setLocalTitle(scene.title || ''), [scene.title]);
  useEffect(() => setLocalDuration(scene.duration || 8), [scene.duration]);
  useEffect(() => setImgCustomInstruction(scene.imgCustomInstruction || ''), [scene.imgCustomInstruction]);
  useEffect(() => setVidCustomInstruction(scene.vidCustomInstruction || ''), [scene.vidCustomInstruction]);

  const saveDialogue = (text, tone, pacing, lang) => {
    updateScene(scene.id, { dialogue: { ...(scene.dialogue || {}), text, tone, pacing, language: lang } });
  };

  const abort = () => { if (abortRef.current) abortRef.current.abort(); };
  const signal = () => { abort(); abortRef.current = new AbortController(); return abortRef.current.signal; };

  const handleStop = () => {
    abort();
    const fallbacks = { generating_image_prompt: 'draft', image_generating: 'image_prompt_ready', generating_video_prompt: 'image_done', video_generating: 'video_prompt_ready' };
    if (fallbacks[status]) updateScene(scene.id, { status: fallbacks[status] });
  };

  const genSceneFromPrompt = async () => {
    if (!scenePromptInput.trim()) return;
    setGeneratingScene(true);
    try {
      const r = await fetch(`${API}/api/scenes/generate-one`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPrompt: scenePromptInput, globalCharacter, sceneIndex: index, totalScenes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      updateScene(scene.id, { ...d.scene, status: 'draft' });
      setScenePromptInput('');
    } catch (e) {
      alert(`Failed to generate scene: ${e.message}`);
    } finally {
      setGeneratingScene(false);
    }
  };

  const genImgPrompt = async () => {
    updateScene(scene.id, { status: 'generating_image_prompt' });
    try {
      const r = await fetch(`${API}/api/prompts/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene, character: globalCharacter, previousSceneImageDesc: previousSceneImage, sceneIndex: index, totalScenes, customInstruction: imgCustomInstruction }), signal: signal() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      updateScene(scene.id, { imagePrompt: d.imagePrompt, status: 'image_prompt_ready' });
      setImgModal(true);
    } catch (e) { if (e.name !== 'AbortError') { alert(e.message); updateScene(scene.id, { status: 'draft' }); } }
  };

  const genImage = async () => {
    updateScene(scene.id, { status: 'image_generating' });
    try {
      const r = await fetch(`${API}/api/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagePrompt: scene.imagePrompt, referenceImage: previousSceneImage }), signal: signal() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      updateScene(scene.id, { imageUrl: d.imageUrl, status: 'image_done' });
    } catch (e) { if (e.name !== 'AbortError') { alert(e.message); updateScene(scene.id, { status: 'image_prompt_ready' }); } }
  };

  const genVidPrompt = async () => {
    updateScene(scene.id, { status: 'generating_video_prompt' });
    try {
      const r = await fetch(`${API}/api/prompts/video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene, character: globalCharacter, sceneIndex: index, totalScenes, customInstruction: vidCustomInstruction }), signal: signal() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      updateScene(scene.id, { videoPrompt: d.videoPrompt, duration: d.duration || scene.duration, status: 'video_prompt_ready' });
    } catch (e) { if (e.name !== 'AbortError') { alert(e.message); updateScene(scene.id, { status: 'image_done' }); } }
  };

  const genVideo = async () => {
    updateScene(scene.id, { status: 'video_generating' });
    try {
      const r = await fetch(`${API}/api/video`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoPrompt: scene.videoPrompt, imageUrl: scene.imageUrl, duration: scene.duration }), signal: signal() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      updateScene(scene.id, { videoUrl: d.videoUrl, status: 'video_done' });
    } catch (e) { if (e.name !== 'AbortError') { alert(e.message); updateScene(scene.id, { status: 'video_prompt_ready' }); } }
  };

  const isGenerating = status.includes('generating');
  const hasImgP = Boolean(scene.imagePrompt);
  const hasImg = Boolean(scene.imageUrl);
  const hasVidP = Boolean(scene.videoPrompt);
  const hasVid = Boolean(scene.videoUrl);

  const statusColors = { draft: 'bg-gray-100 text-gray-500', generating_image_prompt: 'bg-amber-100 text-amber-700', image_prompt_ready: 'bg-blue-100 text-blue-700', image_generating: 'bg-amber-100 text-amber-700', image_done: 'bg-blue-100 text-blue-700', generating_video_prompt: 'bg-amber-100 text-amber-700', video_prompt_ready: 'bg-purple-100 text-purple-700', video_generating: 'bg-amber-100 text-amber-700', video_done: 'bg-green-100 text-green-700' };
  const statusLabels = { draft: 'Draft', generating_image_prompt: 'Generating Prompt…', image_prompt_ready: 'Image Prompt Ready', image_generating: 'Rendering Image…', image_done: 'Image Done', generating_video_prompt: 'Generating Prompt…', video_prompt_ready: 'Video Prompt Ready', video_generating: 'Rendering Video…', video_done: '✓ Complete' };

  const isAutoActive = autoRunStage && autoRunStage !== 'idle';

  return (
    <>
      <div className={`bg-white rounded-2xl border shadow-sm flex flex-col overflow-hidden transition-all hover:shadow-md ${status === 'video_done' ? 'border-green-200' : isGenerating ? 'border-amber-200 shadow-amber-100' : 'border-gray-200'}`}>
        <div className="bg-gray-50 border-b border-gray-100 px-3 py-2 flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Scene {index + 1}</span>
              <select
                value={localDuration}
                onChange={e => {
                  const newDuration = parseInt(e.target.value, 10);
                  setLocalDuration(newDuration);
                  updateScene(scene.id, { duration: newDuration });
                }}
                className="bg-gray-200 text-gray-600 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
              >
                <option value={4}>4s</option>
                <option value={6}>6s</option>
                <option value={8}>8s</option>
              </select>
              {scene.emotionalTone && <span className="bg-indigo-50 text-indigo-600 text-[10px] px-2 py-0.5 rounded-full font-semibold border border-indigo-100 truncate max-w-[120px]" title={scene.emotionalTone}>🎭 {scene.emotionalTone.split(',')[0]}</span>}
            </div>
            {scene.title && <p className="font-bold text-gray-800 text-sm mt-0.5 truncate">{scene.title}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1 ${statusColors[status] || 'bg-gray-100 text-gray-500'}`}>
              {isGenerating && <Spinner size={10} color="border-current" />}
              {statusLabels[status] || status}
            </span>
            <button
              title="Add scene below"
              onClick={onAddAfter}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700 font-black text-sm transition-colors"
            >
              ＋
            </button>
            <button
              title="Delete scene"
              onClick={() => { if (window.confirm(`Delete Scene ${index + 1}?`)) onDelete(); }}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 font-bold text-base transition-colors leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-3 flex-1 flex flex-col gap-2">
          {/* Scene summary */}
          <div className="group relative border border-transparent hover:border-indigo-100 hover:bg-indigo-50/30 p-1.5 -mx-1.5 rounded-lg transition-colors cursor-pointer" onClick={() => setScriptModal(true)}>
            <p className="text-sm text-gray-600 line-clamp-2">{scene.summary}</p>
            <p className="text-[11px] text-gray-400 mt-1">📍 {scene.location} · {scene.timeOfDay}</p>
            <button className="absolute top-2 right-2 bg-white text-indigo-600 hover:text-indigo-800 text-[10px] px-2 py-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity font-semibold border border-indigo-100">
              Edit Details
            </button>
          </div>

          {/* Dialogue — editable inline */}
          <div className="bg-gradient-to-br from-slate-50 to-indigo-50 border border-indigo-100 rounded-xl px-2.5 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">🎙 Dialogue</div>
              <input
                value={localLang}
                onChange={e => setLocalLang(e.target.value)}
                onBlur={() => saveDialogue(localDialogue, localTone, localPacing, localLang)}
                className="text-[10px] font-bold text-indigo-500 bg-indigo-100 border-0 rounded px-1.5 py-0.5 w-20 text-center focus:outline-none focus:ring-1 focus:ring-indigo-400"
                placeholder="Language"
              />
            </div>
            <textarea
              value={localDialogue}
              onChange={e => setLocalDialogue(e.target.value)}
              onBlur={() => saveDialogue(localDialogue, localTone, localPacing, localLang)}
              rows={2}
              placeholder="No dialogue — type the spoken line here…"
              className="w-full text-sm text-gray-800 italic font-medium bg-white/70 border border-indigo-100 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400/30 placeholder:text-gray-300 placeholder:not-italic"
            />
            <div className="flex gap-1.5">
              <select value={localTone} onChange={e => { setLocalTone(e.target.value); saveDialogue(localDialogue, e.target.value, localPacing, localLang); }} className="text-[10px] font-semibold bg-white border border-indigo-100 rounded px-1.5 py-1 flex-1 text-gray-600 focus:outline-none">
                <option>commanding and calm</option>
                <option>heavy and burdened</option>
                <option>whisper-like and introspective</option>
                <option>broken and raw</option>
                <option>quiet and resolute</option>
                <option>calm and deliberate</option>
              </select>
              <select value={localPacing} onChange={e => { setLocalPacing(e.target.value); saveDialogue(localDialogue, localTone, e.target.value, localLang); }} className="text-[10px] font-semibold bg-white border border-indigo-100 rounded px-1.5 py-1 flex-1 text-gray-600 focus:outline-none">
                <option>slow with natural pauses</option>
                <option>slow with long pauses between words</option>
                <option>each word deliberate</option>
                <option>clipped and intense</option>
                <option>breathless</option>
              </select>
            </div>
          </div>

          {/* Progress indicators */}
          <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wider bg-gray-50 rounded-lg p-1.5 border border-gray-100 overflow-x-auto">
            {[['Img Prompt', hasImgP], ['Image', hasImg], ['Vid Prompt', hasVidP], ['Video', hasVid]].map(([label, done]) => (
              <div key={label} className={`flex items-center gap-1 ${done ? 'text-green-600' : 'text-gray-300'}`}>
                {done ? <span className="bg-green-100 text-green-700 rounded-full w-4 h-4 flex items-center justify-center text-[10px]">✓</span> : <span className="border-2 border-gray-200 rounded-full w-4 h-4" />}
                {label}
              </div>
            ))}
          </div>

          {/* Action buttons — only shown in manual mode */}
          {!isAutoActive && (
            <div className="mt-auto flex gap-2 flex-wrap">
              {status === 'draft' && !scene.summary && (
                <div className="w-full space-y-2">
                  <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">✨ Generate Scene from Prompt</div>
                  <textarea
                    value={scenePromptInput}
                    onChange={e => setScenePromptInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) genSceneFromPrompt(); }}
                    rows={3}
                    placeholder="Describe this scene… e.g. 'The king walks onto an empty battlefield at dawn, grief-stricken, dialogue: मैं हार गया'"
                    className="w-full text-xs border border-indigo-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none resize-none bg-indigo-50/50 placeholder:text-gray-300"
                  />
                  <Btn
                    onClick={genSceneFromPrompt}
                    loading={generatingScene}
                    disabled={!scenePromptInput.trim()}
                    className="w-full text-xs"
                  >
                    {generatingScene ? 'Generating…' : '✨ Generate Scene'}
                  </Btn>
                </div>
              )}
              {status === 'draft' && scene.summary && <Btn onClick={genImgPrompt} className="w-full text-xs">Generate Image Prompt</Btn>}
              {status === 'generating_image_prompt' && <Btn onClick={handleStop} variant="danger" className="w-full text-xs"><Spinner size={12} color="border-white" />Stop</Btn>}
              {hasImgP && <Btn onClick={() => setImgModal(true)} variant={hasImg ? 'ghost' : 'primary'} className="flex-1 text-xs">🖼 {hasImg ? 'View Image' : 'Setup Image'}</Btn>}
              {hasImg && <Btn onClick={() => setVidModal(true)} variant={hasVid ? 'ghost' : 'primary'} className="flex-1 text-xs">🎦 {hasVid ? 'View Video' : 'Setup Video'}</Btn>}
            </div>
          )}

          {/* Auto-run active indicator */}
          {isAutoActive && !hasVid && (
            <div className="mt-auto flex items-center gap-2 text-[11px] text-indigo-500 font-semibold">
              <Spinner size={11} color="border-indigo-400" />
              Auto-generating…
            </div>
          )}

          {/* View buttons in auto-run mode */}
          {isAutoActive && (hasImg || hasVid) && (
            <div className="mt-auto flex gap-2">
              {hasImg && <Btn onClick={() => setImgModal(true)} variant="ghost" className="flex-1 text-xs">🖼 View Image</Btn>}
              {hasVid && <Btn onClick={() => setVidModal(true)} variant="ghost" className="flex-1 text-xs">🎬 View Video</Btn>}
            </div>
          )}
        </div>
      </div>

      {/* Script Modal */}
      <Modal isOpen={scriptModal} onClose={() => setScriptModal(false)} title={`Edit Scene ${index + 1} Details`}>
        <div className="flex flex-col gap-5 p-2">
          <div>
            <label className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-1.5 block">Scene Title</label>
            <input 
              value={localTitle} 
              onChange={e => setLocalTitle(e.target.value)} 
              onBlur={() => updateScene(scene.id, { title: localTitle })}
              className="w-full text-sm border shadow-sm rounded-xl p-3.5 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white font-medium outline-none transition-all" 
              placeholder="e.g. The King's Decree"
            />
          </div>
          <div>
            <label className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-1.5 block">Scene Action / Summary</label>
            <textarea 
              value={localSummary} 
              onChange={e => setLocalSummary(e.target.value)} 
              onBlur={() => updateScene(scene.id, { summary: localSummary })}
              rows={5}
              className="w-full text-sm border shadow-sm rounded-xl p-3.5 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white resize-none font-medium leading-relaxed outline-none transition-all" 
              placeholder="Describe the main action happening in the scene..."
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-1.5 block">Location</label>
              <input 
                value={localLocation} 
                onChange={e => setLocalLocation(e.target.value)} 
                onBlur={() => updateScene(scene.id, { location: localLocation })}
                className="w-full text-sm border shadow-sm rounded-xl p-3.5 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white font-medium outline-none transition-all" 
                placeholder="e.g. Royal Palace Courtyard"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-1.5 block">Time of Day</label>
              <input 
                value={localTimeOfDay} 
                onChange={e => setLocalTimeOfDay(e.target.value)} 
                onBlur={() => updateScene(scene.id, { timeOfDay: localTimeOfDay })}
                className="w-full text-sm border shadow-sm rounded-xl p-3.5 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white font-medium outline-none transition-all" 
                placeholder="e.g. Golden Hour Dusk"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Btn onClick={() => setScriptModal(false)} className="px-6 py-2.5 text-base">Done Editing</Btn>
          </div>
        </div>
      </Modal>

      {/* Image Modal */}
      <Modal isOpen={imgModal} onClose={() => setImgModal(false)} title={`${scene.title || `Scene ${index + 1}`} — Image`}>
        <div className="h-full flex flex-col lg:flex-row gap-6 min-h-0">
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex flex-col flex-1 shadow-inner min-h-0">
            <label className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-2 block">📝 Image Prompt</label>
            <textarea value={localImg} onChange={e => setLocalImg(e.target.value)} onBlur={() => updateScene(scene.id, { imagePrompt: localImg })} className="flex-1 w-full text-base border-0 shadow-sm rounded-xl p-3 mb-2 focus:ring-4 focus:ring-indigo-500/20 bg-white resize-none font-medium leading-relaxed min-h-[150px]" />
            
            <div className="space-y-1.5 mb-2 bg-white/50 p-2.5 rounded-xl border border-indigo-100">
              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Custom Instruction (Optional)</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={imgCustomInstruction} 
                  onChange={e => setImgCustomInstruction(e.target.value)} 
                  onBlur={() => updateScene(scene.id, { imgCustomInstruction })}
                  placeholder="e.g. 'Make it rain', 'Angry expression'" 
                  className="flex-1 text-xs border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none"
                />
                <button onClick={genImgPrompt} disabled={isGenerating} className="text-xs font-bold bg-indigo-100 border border-indigo-200 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg disabled:opacity-50 shrink-0">↻ Regenerate</button>
              </div>
            </div>

            {hasImgP && <Btn onClick={status === 'image_generating' ? handleStop : genImage} variant={status === 'image_generating' ? 'danger' : 'primary'} className="w-full py-4 text-lg rounded-2xl mt-auto shrink-0">{status === 'image_generating' ? <><Spinner size={18} color="border-white" />Stop</> : 'Generate Image'}</Btn>}
          </div>
          <div className="flex-1 flex flex-col min-w-[280px] min-h-0">
            {hasImg ? (
              <div className="flex-1 flex flex-col min-h-0">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block text-center">Storyboard Frame</label>
                <div className="bg-white rounded-3xl p-4 flex justify-center relative shadow-2xl border border-gray-100 flex-1 min-h-0">
                  <img src={`${API}${scene.imageUrl}`} alt="Storyboard" className="w-full h-full object-contain rounded-xl" />
                  <button onClick={genImage} disabled={isGenerating} className="absolute bottom-6 right-6 bg-white/95 text-xs px-4 py-2 rounded-full shadow-xl font-black text-gray-800 hover:scale-110 transition-transform flex items-center gap-2">↻ Re-Render</button>
                </div>
              </div>
            ) : <div className="flex-1 flex items-center justify-center border-2 border-dashed border-indigo-200 rounded-2xl text-gray-400 text-sm">Generate the image to preview it here</div>}
          </div>
        </div>
      </Modal>

      {/* Video Modal */}
      <Modal isOpen={vidModal} onClose={() => setVidModal(false)} title={`${scene.title || `Scene ${index + 1}`} — Video`}>
        <div className="h-full flex flex-col lg:flex-row gap-6 min-h-0">
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2 flex flex-col flex-1 shadow-inner min-h-0">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-indigo-800 uppercase tracking-widest">🎬 Video Prompt</label>
                <select
                  value={localDuration}
                  onChange={e => {
                    const newDuration = parseInt(e.target.value, 10);
                    setLocalDuration(newDuration);
                    updateScene(scene.id, { duration: newDuration });
                  }}
                  className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value={4}>4s</option>
                  <option value={6}>6s</option>
                  <option value={8}>8s</option>
                </select>
              </div>
              {/* Dialogue editor in modal */}
              <div className="bg-white border border-indigo-200 rounded-xl p-2.5 space-y-1.5">
                <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">🎙 Dialogue (feeds into prompt)</div>
                <textarea
                  value={localDialogue}
                  onChange={e => setLocalDialogue(e.target.value)}
                  onBlur={() => saveDialogue(localDialogue, localTone, localPacing, localLang)}
                  rows={1}
                  placeholder="Type spoken line here…"
                  className="w-full text-xs text-gray-800 italic bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                />
                <div className="flex gap-2">
                  <input value={localLang} onChange={e => setLocalLang(e.target.value)} onBlur={() => saveDialogue(localDialogue, localTone, localPacing, localLang)} className="text-[11px] border border-indigo-100 rounded-lg px-2 py-1.5 w-20 text-center font-semibold focus:outline-none" placeholder="Language" />
                  <select value={localTone} onChange={e => { setLocalTone(e.target.value); saveDialogue(localDialogue, e.target.value, localPacing, localLang); }} className="text-[11px] border border-indigo-100 rounded-lg px-2 py-1.5 flex-1 font-semibold focus:outline-none">
                    <option>commanding and calm</option>
                    <option>heavy and burdened</option>
                    <option>whisper-like and introspective</option>
                    <option>broken and raw</option>
                    <option>quiet and resolute</option>
                    <option>calm and deliberate</option>
                  </select>
                  <select value={localPacing} onChange={e => { setLocalPacing(e.target.value); saveDialogue(localDialogue, localTone, e.target.value, localLang); }} className="text-[11px] border border-indigo-100 rounded-lg px-2 py-1.5 flex-1 font-semibold focus:outline-none">
                    <option>slow with natural pauses</option>
                    <option>slow with long pauses between words</option>
                    <option>each word deliberate</option>
                    <option>clipped and intense</option>
                    <option>breathless</option>
                  </select>
                </div>
              </div>
              {!hasVidP && status !== 'generating_video_prompt' ? (
                <div className="flex-1 flex items-center justify-center border-2 border-dashed border-indigo-200 rounded-2xl">
                  <Btn onClick={genVidPrompt} className="text-lg px-8 py-4">Generate Video Prompt</Btn>
                </div>
              ) : !hasVidP && status === 'generating_video_prompt' ? (
                <div className="flex-1 flex items-center justify-center border-2 border-dashed border-red-200 rounded-2xl">
                  <Btn onClick={handleStop} variant="danger" className="text-lg px-8 py-4"><Spinner size={18} color="border-white" />Stop</Btn>
                </div>
              ) : (
                <>
                  <textarea value={localVid} onChange={e => setLocalVid(e.target.value)} onBlur={() => updateScene(scene.id, { videoPrompt: localVid })} className="flex-1 w-full text-base border-0 shadow-sm rounded-xl p-3 focus:ring-4 focus:ring-indigo-500/20 bg-white resize-none font-medium leading-relaxed min-h-[150px]" />
                  
                  <div className="space-y-1.5 mt-2 bg-white/50 p-2.5 rounded-xl border border-indigo-100">
                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Custom Instruction (Optional)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={vidCustomInstruction} 
                        onChange={e => setVidCustomInstruction(e.target.value)} 
                        onBlur={() => updateScene(scene.id, { vidCustomInstruction })}
                        placeholder="e.g. 'Slow pan right', 'Character sighs'" 
                        className="flex-1 text-xs border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none"
                      />
                      <button onClick={genVidPrompt} disabled={isGenerating} className="text-xs font-bold bg-indigo-100 border border-indigo-200 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg disabled:opacity-50 shrink-0">↻ Regenerate</button>
                    </div>
                  </div>

                  {hasVidP && <Btn onClick={status === 'video_generating' ? handleStop : genVideo} variant={status === 'video_generating' ? 'danger' : 'primary'} className="w-full py-4 text-lg rounded-2xl mt-4 shrink-0">{status === 'video_generating' ? <><Spinner size={18} color="border-white" />Stop</> : 'Generate Video (Veo 3)'}</Btn>}
                </>
              )}
            </div>
            {scene.imageUrl && !hasVid && (
              <div className="flex-1 flex flex-col bg-white border-2 border-gray-50 rounded-3xl p-4 items-center justify-center shadow-sm min-h-0">
                <img src={`${API}${scene.imageUrl}`} className="max-h-full h-auto w-auto max-w-full rounded-2xl object-contain shadow-2xl border-4 border-white mb-2" />
                <div className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Master Frame</div>
              </div>
            )}
          {hasVid && (
            <div className="flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block text-center">Final Video Render</label>
              <div className="bg-black rounded-3xl overflow-hidden shadow-2xl border-8 border-gray-900 flex-1 min-h-0">
                <video src={`${API}${scene.videoUrl}`} controls autoPlay loop className="w-full h-full object-contain" />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
});

export default SceneCard;
