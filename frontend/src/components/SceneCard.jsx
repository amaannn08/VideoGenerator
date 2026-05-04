import React, { useState, useEffect, memo, useRef } from 'react';
import { Plus, X, MapPin, Mic, Sparkles, Image as ImageIcon, Film, FileText, RefreshCw, Check, Smile, Trash2, ChevronDown, ChevronUp, History } from 'lucide-react';
import { FAL_VIDEO_MODELS, FAL_IMAGE_MODELS } from '../falModels';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
const getMediaUrl = (url) => url?.startsWith('http') ? url : `${API}${url}`;

function Spinner({ size = 14, color = 'border-[var(--amber)]' }) {
  return <div style={{ width: size, height: size }} className={`rounded-full border-2 ${color} border-t-transparent animate-spin flex-shrink-0`} />;
}

function Btn({ onClick, disabled, loading, children, variant = 'primary', className = '' }) {
  const cls = { primary: 'btn btn-amber', ghost: 'btn btn-outline', danger: 'btn btn-danger' };
  const spinColor = variant === 'primary' ? 'border-[#080910]' : 'border-[var(--amber)]';
  return <button onClick={onClick} disabled={disabled || loading} className={`${cls[variant] || cls.primary} ${className}`}>{loading && <Spinner size={13} color={spinColor} />}{children}</button>;
}

function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => { document.body.style.overflow = isOpen ? 'hidden' : 'unset'; return () => { document.body.style.overflow = 'unset'; }; }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(0,0,0,0.8)' }}>
      <div className="bg-white" style={{ border:'1px solid var(--border-default)', borderRadius:20, width:'100%', maxWidth:960, height: 'min(85vh, 800px)', maxHeight:'calc(100vh - 32px)', boxShadow:'0 32px 80px rgba(0,0,0,0.7)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div className="bg-gray-50 border-b border-gray-200" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px' }}>
          <h2 className="text-gray-900" style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:16 }}>{title}</h2>
          <button onClick={onClose} className="bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors" style={{ width:32, height:32, borderRadius:'50%', cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>&times;</button>
        </div>
        <div className="bg-white text-gray-900" style={{ padding:'24px', flex:1, overflowY:'auto' }}>{children}</div>
      </div>
    </div>
  );
}

const STAGES = ['draft', 'generating_image_prompt', 'image_prompt_ready', 'image_generating', 'image_done', 'generating_video_prompt', 'video_prompt_ready', 'video_generating', 'video_done'];

const SceneCard = memo(({ scene, index, updateScene, globalCharacter, globalCharacters = [], globalEnvironments, targetLanguage, previousSceneImage, totalScenes, autoRunStage, onDelete, onAddAfter, refreshMediaUrl, imageModelId, videoModelId, authenticatedFetch }) => {
  const { status } = scene;
  const [imgModal, setImgModal] = useState(false);
  const [vidModal, setVidModal] = useState(false);
  const [scriptModal, setScriptModal] = useState(false);
  const [historyModal, setHistoryModal] = useState(false);
  const [localImg, setLocalImg] = useState(scene.imagePrompt || '');
  const [localVid, setLocalVid] = useState(scene.videoPrompt || '');
  const [localDialogue, setLocalDialogue] = useState(scene.dialogue?.text || '');
  const [localTone, setLocalTone] = useState(scene.dialogue?.tone || 'calm and deliberate');
  const [localPacing, setLocalPacing] = useState(scene.dialogue?.pacing || 'slow with natural pauses');
  const [localLang, setLocalLang] = useState(scene.dialogue?.language || 'Hindi');
  const [localDialogueMode, setLocalDialogueMode] = useState(scene.dialogue?.mode === 'narration' ? 'narration' : 'character');
  const [localSummary, setLocalSummary] = useState(scene.summary || '');
  const [localLocation, setLocalLocation] = useState(scene.location || '');
  const [localTimeOfDay, setLocalTimeOfDay] = useState(scene.timeOfDay || '');
  const [localTitle, setLocalTitle] = useState(scene.title || '');
  const [localDuration, setLocalDuration] = useState(scene.duration || 8);
  const [localAspectRatio, setLocalAspectRatio] = useState(scene.aspectRatio || '9:16');
  const [localResolution, setLocalResolution] = useState(scene.resolution || '720p');
  const [localNegativePrompt, setLocalNegativePrompt] = useState(scene.negativePrompt || '');
  const [localCfgScale, setLocalCfgScale] = useState(scene.cfgScale !== undefined ? scene.cfgScale : 0.5);
  const [localGenAudio, setLocalGenAudio] = useState(scene.generateAudio !== undefined ? scene.generateAudio : true);
  
  const [imgCustomInstruction, setImgCustomInstruction] = useState(scene.imgCustomInstruction || '');
  const [vidCustomInstruction, setVidCustomInstruction] = useState(scene.vidCustomInstruction || '');
  const [scenePromptInput, setScenePromptInput] = useState('');
  const [generatingScene, setGeneratingScene] = useState(false);
  const [isRefreshingImage, setIsRefreshingImage] = useState(false);
  const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);
  const [showGenerations, setShowGenerations] = useState(false);
  const [showImageGenerations, setShowImageGenerations] = useState(false);
  const [showAdvancedImg, setShowAdvancedImg] = useState(false);
  const [showAdvancedVid, setShowAdvancedVid] = useState(false);
  const [localImageModelId, setLocalImageModelId] = useState(imageModelId);
  const [localVideoModelId, setLocalVideoModelId] = useState(videoModelId);
  const abortRef = useRef(null);

  // Keep local model ids in sync when global defaults change
  useEffect(() => setLocalImageModelId(imageModelId), [imageModelId]);
  useEffect(() => setLocalVideoModelId(videoModelId), [videoModelId]);

  useEffect(() => setLocalImg(scene.imagePrompt || ''), [scene.imagePrompt]);
  useEffect(() => setLocalVid(scene.videoPrompt || ''), [scene.videoPrompt]);
  useEffect(() => setLocalDialogue(scene.dialogue?.text || ''), [scene.dialogue?.text]);
  useEffect(() => setLocalDialogueMode(scene.dialogue?.mode === 'narration' ? 'narration' : 'character'), [scene.dialogue?.mode]);
  useEffect(() => setLocalSummary(scene.summary || ''), [scene.summary]);
  useEffect(() => setLocalLocation(scene.location || ''), [scene.location]);
  useEffect(() => setLocalTimeOfDay(scene.timeOfDay || ''), [scene.timeOfDay]);
  useEffect(() => setLocalTitle(scene.title || ''), [scene.title]);
  useEffect(() => setLocalDuration(scene.duration || 8), [scene.duration]);
  useEffect(() => setLocalAspectRatio(scene.aspectRatio || '9:16'), [scene.aspectRatio]);
  useEffect(() => setLocalResolution(scene.resolution || '720p'), [scene.resolution]);
  useEffect(() => setLocalNegativePrompt(scene.negativePrompt || ''), [scene.negativePrompt]);
  useEffect(() => setLocalCfgScale(scene.cfgScale !== undefined ? scene.cfgScale : 0.5), [scene.cfgScale]);
  useEffect(() => setLocalGenAudio(scene.generateAudio !== undefined ? scene.generateAudio : true), [scene.generateAudio]);
  useEffect(() => setImgCustomInstruction(scene.imgCustomInstruction || ''), [scene.imgCustomInstruction]);
  useEffect(() => setVidCustomInstruction(scene.vidCustomInstruction || ''), [scene.vidCustomInstruction]);
  
  // Snap duration when video model changes to ensure it's always valid
  useEffect(() => {
    const modelDef = FAL_VIDEO_MODELS.find(m => m.id === localVideoModelId);
    if (modelDef && modelDef.allowedDurations && !modelDef.allowedDurations.includes(localDuration)) {
      const snapped = modelDef.allowedDurations.reduce((prev, curr) => 
        Math.abs(curr - localDuration) < Math.abs(prev - localDuration) ? curr : prev
      );
      setLocalDuration(snapped);
      updateScene(scene.id, { duration: snapped });
    }
  }, [localVideoModelId]);

  const getAutoEnvironment = () => (
    (globalEnvironments || []).find(e =>
      scene.location && e.name && scene.location.toLowerCase().includes(e.name.toLowerCase())
    ) || (globalEnvironments || [])[0] || null
  );
  const activeEnvironment = (globalEnvironments || []).find(e => e.id === scene.selectedEnvironmentId) || getAutoEnvironment();
  const activeCharacter = (globalCharacters || []).find(c => c.id === scene.selectedCharacterId) || globalCharacter;

  const saveDialogue = (text, tone, pacing, lang, mode = localDialogueMode) => {
    updateScene(scene.id, {
      dialogue: {
        ...(scene.dialogue || {}),
        text,
        tone,
        pacing,
        language: lang,
        mode: mode === 'narration' ? 'narration' : 'character',
      },
    });
  };

  const abort = () => { if (abortRef.current) abortRef.current.abort(); };
  const signal = () => { abort(); abortRef.current = new AbortController(); return abortRef.current.signal; };

  const refreshImageUrl = async () => {
    if (!scene.imageUrl || isRefreshingImage || !refreshMediaUrl) return;
    setIsRefreshingImage(true);
    try {
      const freshUrl = await refreshMediaUrl(scene.imageUrl);
      if (freshUrl && freshUrl !== scene.imageUrl) {
        updateScene(scene.id, { imageUrl: freshUrl });
      }
    } finally {
      setIsRefreshingImage(false);
    }
  };

  const refreshVideoUrl = async () => {
    if (!scene.videoUrl || isRefreshingVideo || !refreshMediaUrl) return;
    setIsRefreshingVideo(true);
    try {
      const freshUrl = await refreshMediaUrl(scene.videoUrl);
      if (freshUrl && freshUrl !== scene.videoUrl) {
        updateScene(scene.id, { videoUrl: freshUrl });
      }
    } finally {
      setIsRefreshingVideo(false);
    }
  };

  const handleStop = () => {
    abort();
    const fallbacks = { generating_image_prompt: 'draft', image_generating: 'image_prompt_ready', generating_video_prompt: 'image_done', video_generating: 'video_prompt_ready' };
    if (fallbacks[status]) updateScene(scene.id, { status: fallbacks[status] });
  };

  const genSceneFromPrompt = async () => {
    if (!scenePromptInput.trim()) return;
    setGeneratingScene(true);
    try {
      const r = await authenticatedFetch(`${API}/api/scenes/generate-one`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPrompt: scenePromptInput, globalCharacter: activeCharacter, sceneIndex: index, totalScenes }),
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
      const r = await authenticatedFetch(`${API}/api/prompts/image`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene, character: activeCharacter, previousSceneImageDesc: previousSceneImage, sceneIndex: index, totalScenes, customInstruction: imgCustomInstruction, environment: activeEnvironment }), signal: signal() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      updateScene(scene.id, { imagePrompt: d.imagePrompt, status: 'image_prompt_ready' });
      setImgModal(true);
    } catch (e) { if (e.name !== 'AbortError') { alert(e.message); updateScene(scene.id, { status: 'draft' }); } }
  };

  const genImage = async () => {
    updateScene(scene.id, { status: 'image_generating' });
    try {
      const options = {
        aspect_ratio: localAspectRatio === '9:16' ? 'portrait_16_9' : localAspectRatio === '16:9' ? 'landscape_16_9' : 'square',
        negative_prompt: localNegativePrompt
      };
      const r = await authenticatedFetch(`${API}/api/image`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          imagePrompt: scene.imagePrompt, 
          referenceImage: previousSceneImage, 
          modelId: localImageModelId,
          options
        }), 
        signal: signal() 
      });
      const d = await r.json();
      if (!r.ok) {
        const msg = d.falMsg || d.error || 'Image generation failed';
        const extra = d.falType ? ` [${d.falType}]` : '';
        throw new Error(`${msg}${extra}`);
      }
      const genId = Math.random().toString(36).substr(2, 9);
      const generation = { id: genId, imageUrl: d.imageUrl, createdAt: Date.now(), isFinal: true };
      const prevGens = (scene.imageGenerations || []).map(g => ({ ...g, isFinal: false }));
      updateScene(scene.id, {
        imageGenerations: [...prevGens, generation],
        imageUrl: d.imageUrl,
        status: 'image_done',
      });
    } catch (e) { if (e.name !== 'AbortError') { alert(e.message); updateScene(scene.id, { status: 'image_prompt_ready' }); } }
  };

  const setFinalImageGeneration = (genId) => {
    const updated = (scene.imageGenerations || []).map(g => ({ ...g, isFinal: g.id === genId }));
    const finalGen = updated.find(g => g.isFinal);
    updateScene(scene.id, { imageGenerations: updated, imageUrl: finalGen?.imageUrl || scene.imageUrl });
  };

  const deleteImageGeneration = (genId) => {
    const updated = (scene.imageGenerations || []).filter(g => g.id !== genId);
    if (!updated.some(g => g.isFinal) && updated.length > 0) {
      updated[updated.length - 1] = { ...updated[updated.length - 1], isFinal: true };
    }
    const finalGen = updated.find(g => g.isFinal);
    updateScene(scene.id, {
      imageGenerations: updated,
      imageUrl: finalGen?.imageUrl || null,
      status: updated.length === 0 ? 'image_prompt_ready' : 'image_done',
    });
  };

  const genVidPrompt = async () => {
    updateScene(scene.id, { status: 'generating_video_prompt' });
    try {
      const r = await authenticatedFetch(`${API}/api/prompts/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene,
          character: activeCharacter,
          sceneIndex: index,
          totalScenes,
          customInstruction: vidCustomInstruction,
          environment: activeEnvironment,
          targetLanguage,
        }),
        signal: signal(),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.falMsg || d.error || 'Video prompt failed');
      updateScene(scene.id, { videoPrompt: d.videoPrompt, duration: d.duration || scene.duration, status: 'video_prompt_ready' });
    } catch (e) { if (e.name !== 'AbortError') { alert(e.message); updateScene(scene.id, { status: 'image_done' }); } }
  };

  const genVideo = async () => {
    updateScene(scene.id, { status: 'video_generating' });
    try {
      const options = {
        aspect_ratio: localAspectRatio,
        resolution: localResolution,
        negative_prompt: localNegativePrompt,
        cfg_scale: localCfgScale,
        generate_audio: localGenAudio
      };
      const sdk = FAL_VIDEO_MODELS.find(m => m.id === localVideoModelId)?.sdk ?? 'fal';
      const r = await authenticatedFetch(`${API}/api/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoPrompt: scene.videoPrompt, 
          imageUrl: activeImageUrl, 
          duration: scene.duration, 
          dialogue: scene.dialogue, 
          modelId: localVideoModelId,
          sdk,
          options
        }),
        signal: signal(),
      });
      const d = await r.json();
      if (!r.ok) {
        const msg = d.falMsg || d.error || 'Video generation failed';
        const extra = d.falType ? ` [${d.falType}]` : '';
        const link = d.falDetailUrl ? `\n${d.falDetailUrl}` : '';
        throw new Error(`${msg}${extra}${link}`);
      }
      const genId = Math.random().toString(36).substr(2, 9);
      const generation = { id: genId, videoUrl: d.videoUrl, createdAt: Date.now(), isFinal: true };
      // Mark all existing generations as not final, then add new one as final
      const prevGens = (scene.videoGenerations || []).map(g => ({ ...g, isFinal: false }));
      updateScene(scene.id, {
        videoGenerations: [...prevGens, generation],
        videoUrl: d.videoUrl,
        status: 'video_done',
      });
    } catch (e) { if (e.name !== 'AbortError') { alert(e.message); updateScene(scene.id, { status: 'video_prompt_ready' }); } }
  };

  const setFinalGeneration = (genId) => {
    const updated = (scene.videoGenerations || []).map(g => ({ ...g, isFinal: g.id === genId }));
    const finalGen = updated.find(g => g.isFinal);
    updateScene(scene.id, { videoGenerations: updated, videoUrl: finalGen?.videoUrl || scene.videoUrl });
  };

  const deleteGeneration = (genId) => {
    const updated = (scene.videoGenerations || []).filter(g => g.id !== genId);
    // If deleted was final, mark last one as final
    if (!updated.some(g => g.isFinal) && updated.length > 0) {
      updated[updated.length - 1] = { ...updated[updated.length - 1], isFinal: true };
    }
    const finalGen = updated.find(g => g.isFinal);
    updateScene(scene.id, {
      videoGenerations: updated,
      videoUrl: finalGen?.videoUrl || null,
      status: updated.length === 0 ? 'video_prompt_ready' : 'video_done',
    });
  };

  const isGenerating = status.includes('generating');
  const hasImgP = Boolean(scene.imagePrompt);
  const imageGenerations = scene.imageGenerations || [];
  const finalImageGen = imageGenerations.find(g => g.isFinal);
  const hasImg = Boolean(finalImageGen?.imageUrl || scene.imageUrl);
  const activeImageUrl = finalImageGen?.imageUrl || scene.imageUrl || null;
  const hasVidP = Boolean(scene.videoPrompt);
  const videoGenerations = scene.videoGenerations || [];
  const finalGen = videoGenerations.find(g => g.isFinal);
  const hasVid = Boolean(finalGen?.videoUrl || scene.videoUrl);
  const activeVideoUrl = finalGen?.videoUrl || scene.videoUrl || null;

  const statusColors = { draft: 'bg-gray-100 text-gray-500', generating_image_prompt: 'bg-amber-100 text-amber-700', image_prompt_ready: 'bg-blue-100 text-blue-700', image_generating: 'bg-amber-100 text-amber-700', image_done: 'bg-blue-100 text-blue-700', generating_video_prompt: 'bg-amber-100 text-amber-700', video_prompt_ready: 'bg-purple-100 text-purple-700', video_generating: 'bg-amber-100 text-amber-700', video_done: 'bg-green-100 text-green-700' };
  const statusLabels = { draft: 'Draft', generating_image_prompt: 'Generating Prompt…', image_prompt_ready: 'Image Prompt Ready', image_generating: 'Rendering Image…', image_done: 'Image Done', generating_video_prompt: 'Generating Prompt…', video_prompt_ready: 'Video Prompt Ready', video_generating: 'Rendering Video…', video_done: '✓ Complete' };

  const isAutoActive = autoRunStage && autoRunStage !== 'idle';

  const cardBorder = status === 'video_done' ? '1px solid rgba(34,197,94,0.3)' : isGenerating ? '1px solid rgba(245,166,35,0.3)' : '1px solid var(--border-default)';
  const cardGlow = status === 'video_done' ? '0 0 20px rgba(34,197,94,0.06)' : isGenerating ? '0 0 20px rgba(245,166,35,0.06)' : 'none';

  return (
    <>
      <div style={{ background:'var(--bg-surface)', border:cardBorder, borderRadius:14, boxShadow:cardGlow, display:'flex', flexDirection:'column', overflow:'hidden', transition:'box-shadow 0.2s', height:'100%' }}>
        <div style={{ background:'var(--bg-raised)', borderBottom:'1px solid var(--border-subtle)', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>Scene {index + 1}</span>
              <select 
                value={localDuration} 
                onChange={e => { 
                  const d = parseInt(e.target.value, 10); 
                  setLocalDuration(d); 
                  updateScene(scene.id, { duration: d }); 
                }} 
                style={{ 
                  background: 'var(--bg-overlay)', 
                  color: 'var(--text-secondary)', 
                  fontSize: 11, 
                  fontWeight: 700, 
                  padding: '3px 6px', 
                  borderRadius: 6, 
                  border: '1px solid var(--border-subtle)', 
                  cursor: 'pointer' 
                }}
              >
                {(FAL_VIDEO_MODELS.find(m => m.id === localVideoModelId)?.allowedDurations || [4, 6, 8]).map(d => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
              {scene.emotionalTone && <span style={{ fontSize:10, color:'var(--amber)', background:'var(--amber-glow)', border:'1px solid rgba(245,166,35,0.2)', padding:'2px 8px', borderRadius:999, fontWeight:600, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={scene.emotionalTone}>{scene.emotionalTone.split(',')[0]}</span>}
            </div>
            {scene.title && <p style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', marginTop:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{scene.title}</p>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:999, whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4, background: status==='video_done'?'var(--green-dim)':isGenerating?'var(--amber-glow)':'var(--bg-overlay)', color: status==='video_done'?'var(--green)':isGenerating?'var(--amber)':'var(--text-muted)' }}>
              {isGenerating && <Spinner size={9} />}{statusLabels[status] || status}
            </span>
            <button onClick={onAddAfter} style={{ width:24, height:24, borderRadius:'50%', background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary)' }}><Plus size={12} /></button>
            <button onClick={() => { if(window.confirm(`Delete Scene ${index+1}?`)) onDelete(); }} style={{ width:24, height:24, borderRadius:'50%', background:'var(--red-dim)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--red)' }}><X size={12} /></button>
          </div>
        </div>

        <div style={{ padding:'12px 14px', flex:1, minHeight:0, display:'flex', flexDirection:'column', gap:10, overflowY:'auto' }}>
          <button type="button" onClick={() => setScriptModal(true)} style={{ textAlign:'left', background:'var(--bg-raised)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'10px 12px', cursor:'pointer', transition:'border-color 0.15s', flexShrink:0, height:80, overflow:'hidden' }} onMouseOver={e=>e.currentTarget.style.borderColor='var(--border-strong)'} onMouseOut={e=>e.currentTarget.style.borderColor='var(--border-subtle)'}>
            <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', marginBottom:4 }}>{scene.summary || <span style={{color:'var(--text-muted)'}}>No summary — click to edit</span>}</p>
            <p style={{ fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}><MapPin size={10} /> {scene.location}{scene.timeOfDay ? ' · '+scene.timeOfDay : ''}</p>
          </button>

          <details style={{ background:'var(--bg-raised)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'8px 12px' }} open>
            <summary style={{ listStyle:'none', cursor:'pointer', fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:5, marginBottom:6 }}><Mic size={10} /> Dialogue</summary>
            <input value={localLang} onChange={e=>setLocalLang(e.target.value)} onBlur={()=>saveDialogue(localDialogue,localTone,localPacing,localLang)} placeholder="Language" style={{ fontSize:10, fontWeight:700, color:'var(--amber)', background:'var(--amber-glow)', border:'none', borderRadius:6, padding:'3px 8px', width:70, textAlign:'center', outline:'none', marginBottom:6 }} />
            <div style={{ display:'flex', gap:4, marginBottom:6, flexWrap:'wrap' }}>
              <button type="button" onClick={() => { setLocalDialogueMode('character'); saveDialogue(localDialogue, localTone, localPacing, localLang, 'character'); }} style={{ flex:1, fontSize:10, fontWeight:700, padding:'6px 8px', borderRadius:6, border:'1px solid var(--border-subtle)', cursor:'pointer', background: localDialogueMode === 'character' ? 'var(--amber-glow)' : 'var(--bg-overlay)', color:'var(--text-secondary)' }}>Character speaks</button>
              <button type="button" onClick={() => { setLocalDialogueMode('narration'); saveDialogue(localDialogue, localTone, localPacing, localLang, 'narration'); }} style={{ flex:1, fontSize:10, fontWeight:700, padding:'6px 8px', borderRadius:6, border:'1px solid var(--border-subtle)', cursor:'pointer', background: localDialogueMode === 'narration' ? 'var(--amber-glow)' : 'var(--bg-overlay)', color:'var(--text-secondary)' }}>Narration (VO)</button>
            </div>
            <textarea value={localDialogue} onChange={e=>setLocalDialogue(e.target.value)} onBlur={()=>saveDialogue(localDialogue,localTone,localPacing,localLang)} rows={2} placeholder={localDialogueMode === 'narration' ? 'Voice-over line… (narrator address)' : 'Spoken line — optionally note who speaks…'} style={{ width:'100%', fontSize:12, fontStyle:'italic', color:'var(--text-primary)', background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', borderRadius:8, padding:'8px 10px', resize:'none', outline:'none', lineHeight:1.5, boxSizing:'border-box' }} />
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              <select value={localTone} onChange={e=>{setLocalTone(e.target.value);saveDialogue(localDialogue,e.target.value,localPacing,localLang);}} style={{ fontSize:10, flex:1, background:'var(--bg-overlay)', color:'var(--text-secondary)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:'4px 6px', outline:'none' }}>
                <option>commanding and calm</option><option>heavy and burdened</option><option>whisper-like and introspective</option><option>broken and raw</option><option>quiet and resolute</option><option>calm and deliberate</option>
              </select>
              <select value={localPacing} onChange={e=>{setLocalPacing(e.target.value);saveDialogue(localDialogue,localTone,e.target.value,localLang);}} style={{ fontSize:10, flex:1, background:'var(--bg-overlay)', color:'var(--text-secondary)', border:'1px solid var(--border-subtle)', borderRadius:6, padding:'4px 6px', outline:'none' }}>
                <option>slow with natural pauses</option><option>slow with long pauses between words</option><option>each word deliberate</option><option>clipped and intense</option><option>breathless</option>
              </select>
            </div>
          </details>

          <div style={{ display:'grid', gap:8 }}>
            <div>
              <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--amber)', marginBottom:4 }}>Character</p>
              <select value={scene.selectedCharacterId||''} onChange={e=>updateScene(scene.id,{selectedCharacterId:e.target.value})} style={{ width:'100%', fontSize:12, background:'var(--bg-raised)', color:'var(--text-primary)', border:'1px solid var(--border-subtle)', borderRadius:8, padding:'7px 10px', outline:'none' }}>
                <option value="">Auto (Primary Character)</option>
                {(globalCharacters||[]).map((c,i)=><option key={c.id||i} value={c.id}>{c.name||`Character ${i+1}`}</option>)}
              </select>
            </div>
            <div>
              <p style={{ fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--green)', marginBottom:4 }}>Environment</p>
              <select value={scene.selectedEnvironmentId||''} onChange={e=>updateScene(scene.id,{selectedEnvironmentId:e.target.value})} style={{ width:'100%', fontSize:12, background:'var(--bg-raised)', color:'var(--text-primary)', border:'1px solid var(--border-subtle)', borderRadius:8, padding:'7px 10px', outline:'none' }}>
                <option value="">Auto (Match by Scene Location)</option>
                {(globalEnvironments||[]).map((e,i)=><option key={e.id||i} value={e.id}>{e.name||`Environment ${i+1}`}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display:'flex', gap:8, background:'var(--bg-raised)', borderRadius:8, padding:'8px 10px', border:'1px solid var(--border-subtle)', overflowX:'auto' }}>
            {[['Img Prompt',hasImgP],['Image',hasImg],['Vid Prompt',hasVidP],['Video',hasVid]].map(([label,done])=>(
              <div key={label} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:done?'var(--green)':'var(--text-muted)', whiteSpace:'nowrap' }}>
                {done?<Check size={10} strokeWidth={3} />:<span style={{width:10,height:10,borderRadius:'50%',border:'1.5px solid var(--text-muted)',display:'inline-block'}} />}{label}
              </div>
            ))}
          </div>

          {/* Action buttons — only shown in manual mode */}
          {!isAutoActive && (
            <div className="mt-auto flex gap-2 flex-wrap">
              {status === 'draft' && !scene.summary && (
                <div className="w-full space-y-2">
                  <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1"><Sparkles className="w-3 h-3" /> Generate Scene from Prompt</div>
                  <textarea
                    value={scenePromptInput}
                    onChange={e => setScenePromptInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) genSceneFromPrompt(); }}
                    rows={3}
                    placeholder="Describe this scene… e.g. 'The king walks onto an empty battlefield at dawn, grief-stricken, dialogue: मैं हार गया'"
                    className="w-full text-xs border border-indigo-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none resize-none bg-indigo-50/50 text-gray-900 placeholder:text-gray-400"
                  />
                  <Btn
                    onClick={genSceneFromPrompt}
                    loading={generatingScene}
                    disabled={!scenePromptInput.trim()}
                    className="w-full text-xs"
                  >
                    {generatingScene ? 'Generating…' : <><Sparkles className="w-4 h-4" /> Generate Scene</>}
                  </Btn>
                </div>
              )}
              {status === 'draft' && scene.summary && <Btn onClick={genImgPrompt} className="w-full text-xs">Generate Image Prompt</Btn>}
              {status === 'generating_image_prompt' && <Btn onClick={handleStop} variant="danger" className="w-full text-xs"><Spinner size={12} color="border-white" />Stop</Btn>}
              {hasImgP && <Btn onClick={() => setImgModal(true)} variant={hasImg ? 'ghost' : 'primary'} className="flex-1 text-xs"><ImageIcon className={`w-4 h-4 ${hasImg ? 'text-green-500' : 'text-indigo-200'}`} /> {hasImg ? 'View Image' : 'Setup Image'}</Btn>}
              {hasImg && <Btn onClick={() => setVidModal(true)} variant={hasVid ? 'ghost' : 'primary'} className="flex-1 text-xs"><Film className={`w-4 h-4 ${hasVid ? 'text-green-500' : 'text-indigo-200'}`} /> {hasVid ? 'View Video' : 'Setup Video'}</Btn>}
              {(imageGenerations.length + videoGenerations.length) > 0 && (
                <Btn onClick={() => setHistoryModal(true)} variant="ghost" className="flex-1 text-xs"><History className="w-4 h-4 text-indigo-500" /> History ({imageGenerations.length + videoGenerations.length})</Btn>
              )}
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
              {hasImg && <Btn onClick={() => setImgModal(true)} variant="ghost" className="flex-1 text-xs"><ImageIcon className={`w-4 h-4 ${hasImg ? 'text-green-500' : 'text-gray-400'}`} /> View Image</Btn>}
              {hasVid && <Btn onClick={() => setVidModal(true)} variant="ghost" className="flex-1 text-xs"><Film className={`w-4 h-4 ${hasVid ? 'text-green-500' : 'text-gray-400'}`} /> View Video</Btn>}
              {(imageGenerations.length + videoGenerations.length) > 0 && (
                <Btn onClick={() => setHistoryModal(true)} variant="ghost" className="flex-1 text-xs"><History className="w-4 h-4 text-indigo-500" /> History ({imageGenerations.length + videoGenerations.length})</Btn>
              )}
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
              className="w-full text-sm border shadow-sm rounded-xl p-3.5 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white text-gray-900 font-medium outline-none transition-all" 
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
              className="w-full text-sm border shadow-sm rounded-xl p-3.5 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white text-gray-900 resize-none font-medium leading-relaxed outline-none transition-all" 
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
                className="w-full text-sm border shadow-sm rounded-xl p-3.5 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white text-gray-900 font-medium outline-none transition-all" 
                placeholder="e.g. Royal Palace Courtyard"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-1.5 block">Time of Day</label>
              <input 
                value={localTimeOfDay} 
                onChange={e => setLocalTimeOfDay(e.target.value)} 
                onBlur={() => updateScene(scene.id, { timeOfDay: localTimeOfDay })}
                className="w-full text-sm border shadow-sm rounded-xl p-3.5 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-300 bg-white text-gray-900 font-medium outline-none transition-all" 
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
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex flex-col flex-1 shadow-inner min-h-0 text-gray-900">
            <label className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-2 flex items-center gap-1"><FileText className="w-4 h-4" /> Image Prompt</label>
            <textarea value={localImg} onChange={e => setLocalImg(e.target.value)} onBlur={() => updateScene(scene.id, { imagePrompt: localImg })} className="flex-1 w-full text-base border-0 shadow-sm rounded-xl p-3 mb-2 focus:ring-4 focus:ring-indigo-500/20 bg-white text-gray-900 resize-none font-medium leading-relaxed min-h-[150px]" />
            
            <div className="space-y-1.5 mb-2 bg-white/50 p-2.5 rounded-xl border border-indigo-100">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Custom Instruction (Optional)</label>
                <button 
                  onClick={() => setShowAdvancedImg(!showAdvancedImg)}
                  className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                >
                  {showAdvancedImg ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showAdvancedImg ? 'Hide Advanced' : 'Show Advanced'}
                </button>
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={imgCustomInstruction} 
                  onChange={e => setImgCustomInstruction(e.target.value)} 
                  onBlur={() => updateScene(scene.id, { imgCustomInstruction })}
                  placeholder="e.g. 'Make it rain', 'Angry expression'" 
                  className="flex-1 text-xs border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none text-gray-900 bg-white"
                />
                <button onClick={genImgPrompt} disabled={isGenerating} className="text-xs font-bold bg-indigo-100 border border-indigo-200 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg disabled:opacity-50 shrink-0 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Regenerate</button>
              </div>

              {showAdvancedImg && (
                <div className="mt-3 pt-3 border-t border-indigo-100 space-y-3">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 block">Aspect Ratio</label>
                      <select 
                        value={localAspectRatio} 
                        onChange={e => { setLocalAspectRatio(e.target.value); updateScene(scene.id, { aspectRatio: e.target.value }); }}
                        className="w-full text-xs border border-indigo-100 rounded-lg px-2 py-1.5 focus:outline-none text-gray-900 bg-white"
                      >
                        <option value="9:16">9:16 (Portrait)</option>
                        <option value="16:9">16:9 (Landscape)</option>
                        <option value="1:1">1:1 (Square)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 block">Negative Prompt</label>
                    <textarea 
                      value={localNegativePrompt} 
                      onChange={e => { setLocalNegativePrompt(e.target.value); updateScene(scene.id, { negativePrompt: e.target.value }); }}
                      placeholder="e.g. blurry, low quality, distorted hands"
                      className="w-full text-[11px] border border-indigo-100 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none text-gray-900 bg-white resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </div>

            {hasImgP && (
              <>
                <div className="mt-auto">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 block">Image Model</label>
                  <select
                    value={localImageModelId}
                    onChange={e => setLocalImageModelId(e.target.value)}
                    className="w-full text-xs border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none text-gray-900 bg-white"
                  >
                    {FAL_IMAGE_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <Btn onClick={status === 'image_generating' ? handleStop : genImage} variant={status === 'image_generating' ? 'danger' : 'primary'} className="w-full py-4 text-lg rounded-2xl shrink-0">
                  {status === 'image_generating' ? <><Spinner size={18} color="border-white" />Stop</> : imageGenerations.length > 0 ? 'Generate Another Attempt' : 'Generate Image'}
                </Btn>
              </>
            )}          </div>
          <div className="flex-1 flex flex-col min-w-[280px] min-h-0">
            {hasImg ? (
              <div className="flex-1 flex flex-col min-h-0">
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block text-center">Storyboard Frame</label>
                <div className="bg-white rounded-3xl p-4 flex justify-center relative shadow-2xl border border-gray-100 flex-1 min-h-0 text-gray-900">
                  <img src={getMediaUrl(activeImageUrl)} onError={refreshImageUrl} alt="Storyboard" className="w-full h-full object-contain rounded-xl" />
                  <button onClick={genImage} disabled={isGenerating} className="absolute bottom-6 right-6 bg-white/95 text-xs px-4 py-2 rounded-full shadow-xl font-black text-gray-800 hover:scale-110 transition-transform flex items-center gap-2"><RefreshCw className="w-3 h-3" /> Re-Render</button>
                </div>
                {imageGenerations.length > 0 && (
                  <div className="mt-3 border border-gray-200 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setShowImageGenerations(o => !o)}
                      className="w-full px-3 py-2.5 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-[11px] font-black text-gray-600 uppercase tracking-widest">Generations ({imageGenerations.length})</span>
                      {showImageGenerations ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                    </button>
                    {showImageGenerations && (
                      <div className="p-2 space-y-2 max-h-[300px] overflow-y-auto">
                        {imageGenerations.map((gen, gi) => (
                          <div key={gen.id} className={`border rounded-xl overflow-hidden text-gray-900 ${gen.isFinal ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                            <div className="flex items-center justify-between px-2.5 py-1.5">
                              <span className="text-[10px] font-bold text-gray-500">Attempt {gi + 1}</span>
                              <div className="flex items-center gap-1">
                                {gen.isFinal ? (
                                  <span className="flex items-center gap-1 text-[10px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                    <Check className="w-2.5 h-2.5" strokeWidth={3} /> Final
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setFinalImageGeneration(gen.id)}
                                    className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors"
                                  >
                                    Set Final
                                  </button>
                                )}
                                <button
                                  onClick={() => { if (window.confirm('Delete this image generation?')) deleteImageGeneration(gen.id); }}
                                  className="w-5 h-5 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <img src={getMediaUrl(gen.imageUrl)} alt={`Attempt ${gi + 1}`} className="w-full max-h-[180px] object-contain bg-black" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : <div className="flex-1 flex items-center justify-center border-2 border-dashed border-indigo-200 rounded-2xl text-gray-400 text-sm">Generate the image to preview it here</div>}
          </div>
        </div>
      </Modal>

      {/* Video Modal */}
      <Modal isOpen={vidModal} onClose={() => setVidModal(false)} title={`${scene.title || `Scene ${index + 1}`} — Video`}>
        <div className="h-full flex flex-col lg:flex-row gap-6 min-h-0">
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2 flex flex-col flex-1 shadow-inner min-h-0 text-gray-900">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black text-indigo-800 uppercase tracking-widest flex items-center gap-1"><Film className="w-4 h-4" /> Video Prompt</label>
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
                <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1"><Mic className="w-3 h-3" /> Dialogue (feeds into prompt)</div>
                <textarea
                  value={localDialogue}
                  onChange={e => setLocalDialogue(e.target.value)}
                  onBlur={() => saveDialogue(localDialogue, localTone, localPacing, localLang)}
                  rows={1}
                  placeholder="Type spoken line here…"
                  className="w-full text-xs text-gray-800 italic bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                />
                <div className="flex gap-2">
                  <input value={localLang} onChange={e => setLocalLang(e.target.value)} onBlur={() => saveDialogue(localDialogue, localTone, localPacing, localLang)} className="text-[11px] border border-indigo-100 rounded-lg px-2 py-1.5 w-20 text-center font-semibold focus:outline-none text-gray-900 bg-white" placeholder="Language" />
                  <select value={localTone} onChange={e => { setLocalTone(e.target.value); saveDialogue(localDialogue, e.target.value, localPacing, localLang); }} className="text-[11px] border border-indigo-100 rounded-lg px-2 py-1.5 flex-1 font-semibold focus:outline-none text-gray-900 bg-white">
                    <option>commanding and calm</option>
                    <option>heavy and burdened</option>
                    <option>whisper-like and introspective</option>
                    <option>broken and raw</option>
                    <option>quiet and resolute</option>
                    <option>calm and deliberate</option>
                  </select>
                  <select value={localPacing} onChange={e => { setLocalPacing(e.target.value); saveDialogue(localDialogue, localTone, e.target.value, localLang); }} className="text-[11px] border border-indigo-100 rounded-lg px-2 py-1.5 flex-1 font-semibold focus:outline-none text-gray-900 bg-white">
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
                  <textarea value={localVid} onChange={e => setLocalVid(e.target.value)} onBlur={() => updateScene(scene.id, { videoPrompt: localVid })} className="flex-1 w-full text-base border-0 shadow-sm rounded-xl p-3 focus:ring-4 focus:ring-indigo-500/20 bg-white text-gray-900 resize-none font-medium leading-relaxed min-h-[150px]" />
                  
                  <div className="space-y-1.5 mt-2 bg-white/50 p-2.5 rounded-xl border border-indigo-100">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Custom Instruction (Optional)</label>
                      <button 
                        onClick={() => setShowAdvancedVid(!showAdvancedVid)}
                        className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                      >
                        {showAdvancedVid ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {showAdvancedVid ? 'Hide Advanced' : 'Show Advanced Settings'}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={vidCustomInstruction} 
                        onChange={e => setVidCustomInstruction(e.target.value)} 
                        onBlur={() => updateScene(scene.id, { vidCustomInstruction })}
                        placeholder="e.g. 'Slow pan right', 'Character sighs'" 
                        className="flex-1 text-xs border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none text-gray-900 bg-white"
                      />
                      <button onClick={genVidPrompt} disabled={isGenerating} className="text-xs font-bold bg-indigo-100 border border-indigo-200 text-indigo-700 hover:bg-indigo-200 px-4 py-2 rounded-lg disabled:opacity-50 shrink-0 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Regenerate</button>
                    </div>

                    {showAdvancedVid && (
                      <div className="mt-3 pt-3 border-t border-indigo-100 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 block">Aspect Ratio</label>
                            <select 
                              value={localAspectRatio} 
                              onChange={e => { setLocalAspectRatio(e.target.value); updateScene(scene.id, { aspectRatio: e.target.value }); }}
                              className="w-full text-xs border border-indigo-100 rounded-lg px-2 py-1.5 focus:outline-none text-gray-900 bg-white"
                            >
                              <option value="9:16">9:16 (Portrait)</option>
                              <option value="16:9">16:9 (Landscape)</option>
                              <option value="1:1">1:1 (Square)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 block">Resolution</label>
                            <select 
                              value={localResolution} 
                              onChange={e => { setLocalResolution(e.target.value); updateScene(scene.id, { resolution: e.target.value }); }}
                              className="w-full text-xs border border-indigo-100 rounded-lg px-2 py-1.5 focus:outline-none text-gray-900 bg-white"
                            >
                              <option value="720p">720p</option>
                              <option value="1080p">1080p</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 block">CFG Scale ({localCfgScale})</label>
                            <input 
                              type="range" min="0" max="1" step="0.1"
                              value={localCfgScale} 
                              onChange={e => { setLocalCfgScale(parseFloat(e.target.value)); updateScene(scene.id, { cfgScale: parseFloat(e.target.value) }); }}
                              className="w-full accent-indigo-500"
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-4">
                            <input 
                              type="checkbox" id={`audio-${scene.id}`}
                              checked={localGenAudio} 
                              onChange={e => { setLocalGenAudio(e.target.checked); updateScene(scene.id, { generateAudio: e.target.checked }); }}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <label htmlFor={`audio-${scene.id}`} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest cursor-pointer">Generate Audio</label>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 block">Negative Prompt</label>
                          <textarea 
                            value={localNegativePrompt} 
                            onChange={e => { setLocalNegativePrompt(e.target.value); updateScene(scene.id, { negativePrompt: e.target.value }); }}
                            placeholder="e.g. blurry, low quality, distorted"
                            className="w-full text-[11px] border border-indigo-100 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none text-gray-900 bg-white resize-none"
                            rows={2}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {hasVidP && (
                    <>
                      <div className="mt-2">
                        <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1 block">Video Model</label>
                        <select
                          value={localVideoModelId}
                          onChange={e => setLocalVideoModelId(e.target.value)}
                          className="w-full text-xs border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none text-gray-900 bg-white"
                        >
                          {FAL_VIDEO_MODELS.map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <Btn 
                        onClick={status === 'video_generating' ? handleStop : genVideo} 
                        variant={status === 'video_generating' ? 'danger' : 'primary'} 
                        className="w-full py-4 text-lg rounded-2xl mt-4 shrink-0"
                      >
                        {status === 'video_generating' ? <><Spinner size={18} color="border-white" />Stop</> : videoGenerations.length > 0 ? 'Generate Another Attempt' : `Generate Video`}
                      </Btn>
                    </>
                  )}

                  {/* Generation History */}
                  {videoGenerations.length > 0 && (
                    <div className="mt-3 border border-gray-200 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => setShowGenerations(o => !o)}
                        className="w-full px-3 py-2.5 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <span className="text-[11px] font-black text-gray-600 uppercase tracking-widest">Generations ({videoGenerations.length})</span>
                        {showGenerations ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                      </button>
                      {showGenerations && (
                        <div className="p-2 space-y-2 max-h-[300px] overflow-y-auto">
                          {videoGenerations.map((gen, gi) => (
                            <div key={gen.id} className={`border rounded-xl overflow-hidden text-gray-900 ${gen.isFinal ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                              <div className="flex items-center justify-between px-2.5 py-1.5">
                                <span className="text-[10px] font-bold text-gray-500">Attempt {gi + 1}</span>
                                <div className="flex items-center gap-1">
                                  {gen.isFinal ? (
                                    <span className="flex items-center gap-1 text-[10px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                      <Check className="w-2.5 h-2.5" strokeWidth={3} /> Final
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => setFinalGeneration(gen.id)}
                                      className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors"
                                    >
                                      Set Final
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { if (window.confirm('Delete this generation?')) deleteGeneration(gen.id); }}
                                    className="w-5 h-5 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              <video src={getMediaUrl(gen.videoUrl)} controls className="w-full max-h-[180px] object-contain bg-black" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            {activeImageUrl && !hasVid && (
              <div className="flex-1 flex flex-col bg-white border-2 border-gray-50 rounded-3xl p-4 items-center justify-center shadow-sm min-h-0 text-gray-900">
                <img src={getMediaUrl(activeImageUrl)} onError={refreshImageUrl} className="max-h-full h-auto w-auto max-w-full rounded-2xl object-contain shadow-2xl border-4 border-white mb-2" />
                <div className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Master Frame</div>
              </div>
            )}
          {hasVid && (
            <div className="flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
              <label className="text-xs font-black text-gray-400 uppercase tracking-widest block text-center">Final Video Render</label>
              <div className="bg-black rounded-3xl overflow-hidden shadow-2xl border-8 border-gray-900 flex-1 min-h-0">
                <video src={getMediaUrl(activeVideoUrl)} onError={refreshVideoUrl} controls autoPlay loop className="w-full h-full object-contain" />
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* History Modal — all image and video attempts for this scene */}
      <Modal isOpen={historyModal} onClose={() => setHistoryModal(false)} title={`${scene.title || `Scene ${index + 1}`} — All Generations`}>
        <div className="flex flex-col gap-6">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ImageIcon className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-black text-indigo-800 uppercase tracking-widest">Image Attempts ({imageGenerations.length})</h3>
            </div>
            {imageGenerations.length === 0 ? (
              <div className="text-xs text-gray-400 italic border-2 border-dashed border-gray-200 rounded-2xl px-4 py-6 text-center">No image attempts yet</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {imageGenerations.map((gen, gi) => (
                  <div key={gen.id} className={`border rounded-2xl overflow-hidden text-gray-900 flex flex-col ${gen.isFinal ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                      <span className="text-[11px] font-bold text-gray-500">Attempt {gi + 1}</span>
                      <div className="flex items-center gap-1.5">
                        {gen.isFinal ? (
                          <span className="flex items-center gap-1 text-[10px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <Check className="w-2.5 h-2.5" strokeWidth={3} /> Final
                          </span>
                        ) : (
                          <button
                            onClick={() => setFinalImageGeneration(gen.id)}
                            className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors"
                          >
                            Set as Final
                          </button>
                        )}
                        <button
                          onClick={() => { if (window.confirm('Delete this image attempt?')) deleteImageGeneration(gen.id); }}
                          className="w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <img src={getMediaUrl(gen.imageUrl)} alt={`Image attempt ${gi + 1}`} className="w-full max-h-[260px] object-contain bg-black" />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Film className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-black text-indigo-800 uppercase tracking-widest">Video Attempts ({videoGenerations.length})</h3>
            </div>
            {videoGenerations.length === 0 ? (
              <div className="text-xs text-gray-400 italic border-2 border-dashed border-gray-200 rounded-2xl px-4 py-6 text-center">No video attempts yet</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {videoGenerations.map((gen, gi) => (
                  <div key={gen.id} className={`border rounded-2xl overflow-hidden text-gray-900 flex flex-col ${gen.isFinal ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                      <span className="text-[11px] font-bold text-gray-500">Attempt {gi + 1}</span>
                      <div className="flex items-center gap-1.5">
                        {gen.isFinal ? (
                          <span className="flex items-center gap-1 text-[10px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <Check className="w-2.5 h-2.5" strokeWidth={3} /> Final
                          </span>
                        ) : (
                          <button
                            onClick={() => setFinalGeneration(gen.id)}
                            className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors"
                          >
                            Set as Final
                          </button>
                        )}
                        <button
                          onClick={() => { if (window.confirm('Delete this video attempt?')) deleteGeneration(gen.id); }}
                          className="w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <video src={getMediaUrl(gen.videoUrl)} controls className="w-full max-h-[260px] object-contain bg-black" />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
});

export default SceneCard;
