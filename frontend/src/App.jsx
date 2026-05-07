import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Topbar from './components/layout/Topbar';
import Sidebar from './components/layout/Sidebar';
import PipelineBar from './components/layout/PipelineBar';
import ScriptPanel from './components/ScriptPanel';
import ScenesView from './components/ScenesView';
import CharacterPanel from './components/CharacterPanel';
import EnvironmentsPanel from './components/EnvironmentsPanel';
import Login from './components/Login';
import ReelView from './components/ReelView';
import ModelsPage from './components/ModelsPage';
import { FAL_VIDEO_MODELS, DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID } from './falModels';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
const getMediaUrl = (url) => url?.startsWith('http') ? url : `${API}${url}`;

const EMPTY_CHARACTER = { id:'', name:'', description:'', keyFeature:'', referenceImageUrl:null };

function normalizeCharacters(input) {
  const list = Array.isArray(input) ? input : [input];
  return list
    .filter(item => item && (typeof item==='object' || typeof item==='string'))
    .map((item,idx) => {
      if (typeof item==='string') return {...EMPTY_CHARACTER, id:`char_${idx+1}`, description:item};
      return { id:item.id||`char_${idx+1}`, name:item.name||'', description:item.description||'', keyFeature:item.keyFeature||'', referenceImageUrl:item.referenceImageUrl||null };
    })
    .filter(item => item.name||item.description||item.keyFeature);
}

function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => { try { const x=window.localStorage.getItem(key); return x?JSON.parse(x):init; } catch { return init; } });
  const set = useCallback((v) => { setVal(prev => typeof v==='function' ? v(prev) : v); }, []);
  useEffect(() => { const t=setTimeout(()=>{ try { window.localStorage.setItem(key,JSON.stringify(val)); } catch {} }, 500); return ()=>clearTimeout(t); }, [key,val]);
  return [val, set];
}

function Loader({ label }) {
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-base)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:14 }}>
      <div style={{ width:28, height:28, borderRadius:'50%', border:'2px solid var(--amber)', borderTopColor:'transparent', animation:'spin 0.7s linear infinite' }} />
      <p style={{ fontSize:13, color:'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

export default function App() {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const [authToken, setAuthToken] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('ai-video-token');
    const exp = parseInt(localStorage.getItem('ai-video-token-exp')||'0', 10);
    if (!token || Date.now() > exp) {
      localStorage.removeItem('ai-video-token');
      localStorage.removeItem('ai-video-token-exp');
      setAuthChecked(true);
      return;
    }
    fetch(`${API}/api/auth/verify`, { headers:{'x-auth-token':token} })
      .then(r=>r.json())
      .then(d => { if (d.valid) setAuthToken(token); else { localStorage.removeItem('ai-video-token'); localStorage.removeItem('ai-video-token-exp'); } })
      .catch(() => { if (Date.now() < exp) setAuthToken(token); })
      .finally(() => setAuthChecked(true));
  }, []);

  const authenticatedFetch = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem('ai-video-token');
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'x-auth-token': token,
      },
    });
    if (res.status === 401) {
      localStorage.removeItem('ai-video-token');
      localStorage.removeItem('ai-video-token-exp');
      setAuthToken(null);
    }
    return res;
  }, []);

  const applySessionId = useCallback((sid) => {
    setSessionId(sid);
    sessionIdRef.current = sid;
    window.history.replaceState({}, '', '?session=' + sid);
  }, []);

  // ── Persistent state ───────────────────────────────────────────────────
  const [globalCharacters, setGlobalCharacters]       = useLocalStorage('ai-video-characters', []);
  const [primaryCharacterId, setPrimaryCharacterId]   = useLocalStorage('ai-video-primary-character-id', '');
  const [globalEnvironments, setGlobalEnvironments]   = useLocalStorage('ai-video-environments', []);
  const [targetLanguage, setTargetLanguage]           = useLocalStorage('ai-video-lang', 'Hindi');
  const [narrativeArc, setNarrativeArc]               = useLocalStorage('ai-video-arc', '');
  const [script, setScript]                           = useLocalStorage('ai-video-script', '');
  const [sceneCount, setSceneCount]                   = useLocalStorage('ai-video-scenecount', 3);
  const [scenes, setScenes]                           = useLocalStorage('ai-video-scenes', []);
  const [mergedVideo, setMergedVideo]                 = useLocalStorage('ai-video-merged', null);
  const [imageModelId, setImageModelId]               = useLocalStorage('ai-video-image-model', DEFAULT_IMAGE_MODEL_ID);
  const [videoModelId, setVideoModelId]               = useLocalStorage('ai-video-video-model', DEFAULT_VIDEO_MODEL_ID);

  // Migrate any stale video model id to the current default (vertex-veo3.1-lite)
  useEffect(() => {
    if (videoModelId !== DEFAULT_VIDEO_MODEL_ID) setVideoModelId(DEFAULT_VIDEO_MODEL_ID);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Transient state ────────────────────────────────────────────────────
  const [loadingScenes, setLoadingScenes]             = useState(false);
  const [merging, setMerging]                         = useState(false);
  const [autoRunStage, setAutoRunStage]               = useState('idle');
  const [autoRunCurrentScene, setAutoRunCurrentScene] = useState(null);
  const [, setAutoRunProgress]                        = useState({});
  const [saveStatus, setSaveStatus]                   = useState('idle'); // 'idle'|'saving'|'saved'|'error'
  const saveTimerRef                                  = useRef(null);
  const sseRef                                        = useRef(null);
  const [sessionId, setSessionId]                     = useState(() => new URLSearchParams(window.location.search).get('session'));
  const sessionIdRef                                  = useRef(new URLSearchParams(window.location.search).get('session'));
  const creatingSessionRef                            = useRef(false);
  const [isInitializing, setIsInitializing]           = useState(!!new URLSearchParams(window.location.search).get('session'));
  const [allSessions, setAllSessions]                 = useState([]);
  const [activeTab, setActiveTab]                     = useState('script');
  const [activeSceneId, setActiveSceneId]             = useState(null);
  const [activeCharId, setActiveCharId]               = useState(null);
  const [activeEnvId, setActiveEnvId]                 = useState(null);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'scenes') setActiveSceneId(null);
    if (tab !== 'characters') setActiveCharId(null);
    if (tab !== 'environments') setActiveEnvId(null);
  };

  // ── Legacy character migration ─────────────────────────────────────────
  useEffect(() => {
    if (globalCharacters.length) return;
    try {
      const legacy = window.localStorage.getItem('ai-video-character');
      if (!legacy) return;
      const migrated = normalizeCharacters(JSON.parse(legacy));
      if (migrated.length) { setGlobalCharacters(migrated); setPrimaryCharacterId(migrated[0].id); }
    } catch {}
  }, [globalCharacters.length, setGlobalCharacters, setPrimaryCharacterId]);

  // ── Keep primary in sync ───────────────────────────────────────────────
  useEffect(() => {
    if (!globalCharacters.length) { if (primaryCharacterId) setPrimaryCharacterId(''); return; }
    if (!primaryCharacterId || !globalCharacters.some(c=>c.id===primaryCharacterId)) setPrimaryCharacterId(globalCharacters[0].id);
  }, [globalCharacters, primaryCharacterId, setPrimaryCharacterId]);

  const activeCharacter = globalCharacters.find(c=>c.id===primaryCharacterId) || globalCharacters[0] || EMPTY_CHARACTER;

  // ── Media refresh helpers ──────────────────────────────────────────────
  const refreshMediaUrl = useCallback(async (url) => {
    if (!url || !url.startsWith('http')) return url;
    try {
      const r = await authenticatedFetch(`${API}/api/media/refresh`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      return d.url || url;
    } catch { return url; }
  }, [authenticatedFetch]);

  const refreshSessionMediaUrls = useCallback(async (sessionData) => {
    const sceneList = Array.isArray(sessionData?.scenes) ? sessionData.scenes : [];
    const urls = [];
    sceneList.forEach(scene => {
      if (scene?.imageUrl?.startsWith('http')) urls.push(scene.imageUrl);
      if (scene?.videoUrl?.startsWith('http')) urls.push(scene.videoUrl);
      (scene?.imageGenerations||[]).forEach(g => { if (g?.imageUrl?.startsWith('http')) urls.push(g.imageUrl); });
      (scene?.videoGenerations||[]).forEach(g => { if (g?.videoUrl?.startsWith('http')) urls.push(g.videoUrl); });
    });
    if (sessionData?.mergedVideo?.startsWith('http')) urls.push(sessionData.mergedVideo);
    if (!urls.length) return sessionData;
    try {
      const r = await authenticatedFetch(`${API}/api/media/refresh-batch`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({urls}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const refreshed = d.urls || {};
      return {
        ...sessionData,
        scenes: sceneList.map(scene => ({
          ...scene,
          imageUrl: refreshed[scene.imageUrl]||scene.imageUrl,
          videoUrl: refreshed[scene.videoUrl]||scene.videoUrl,
          imageGenerations: (scene.imageGenerations||[]).map(g=>({...g, imageUrl:refreshed[g.imageUrl]||g.imageUrl})),
          videoGenerations: (scene.videoGenerations||[]).map(g=>({...g, videoUrl:refreshed[g.videoUrl]||g.videoUrl})),
        })),
        mergedVideo: refreshed[sessionData.mergedVideo]||sessionData.mergedVideo,
      };
    } catch { return sessionData; }
  }, [authenticatedFetch]);

  // ── Fetch sessions list ────────────────────────────────────────────────
  useEffect(() => {
    if (!authToken) return;
    authenticatedFetch(`${API}/api/sessions`)
      .then(r=>r.json())
      .then(d=>{ if(d.sessions) setAllSessions(d.sessions); })
      .catch(console.error);
  }, [sessionId, narrativeArc, authToken, authenticatedFetch]);

  // ── Load session ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) { setIsInitializing(false); return; }
    authenticatedFetch(`${API}/api/sessions/${sessionId}`)
      .then(r=>r.json())
      .then(async data => {
        if (!data.error) {
          const hydrated = await refreshSessionMediaUrls(data);
          setScript(hydrated.script||'');
          const chars = normalizeCharacters(hydrated.globalCharacters||hydrated.globalCharacter);
          setGlobalCharacters(chars);
          setPrimaryCharacterId(chars[0]?.id||'');
          setGlobalEnvironments(hydrated.globalEnvironments||[]);
          setTargetLanguage(hydrated.targetLanguage||'Hindi');
          setNarrativeArc(hydrated.narrativeArc||'');
          setScenes(hydrated.scenes||[]);
          setMergedVideo(hydrated.mergedVideo||null);
          if ((hydrated.scenes||[]).length > 0) setActiveTab('scenes');
        }
      })
      .catch(console.error)
      .finally(() => setIsInitializing(false));
  }, [sessionId, authenticatedFetch, refreshSessionMediaUrls]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isInitializing) return;
    const hasData = script.trim() || activeCharacter?.description?.trim() || narrativeArc.trim() || scenes.length > 0;
    if (!hasData) return;
    const t = setTimeout(async () => {
      try {
        const body = JSON.stringify({ script, globalCharacter:activeCharacter, globalCharacters, primaryCharacterId, narrativeArc, scenes, mergedVideo, globalEnvironments, targetLanguage });
        if (!sessionIdRef.current) {
          // Only create a new session once a script has been entered
          if (!script.trim()) return;
          if (creatingSessionRef.current) return;
          creatingSessionRef.current = true;
          try {
            const res = await authenticatedFetch(`${API}/api/sessions`, { method:'POST', headers:{'Content-Type':'application/json'}, body });
            const d = await res.json();
            if (d.sessionId) {
              applySessionId(d.sessionId);
              authenticatedFetch(`${API}/api/sessions`).then(r=>r.json()).then(d=>{ if(d.sessions) setAllSessions(d.sessions); }).catch(()=>{});
            }
          } finally {
            creatingSessionRef.current = false;
          }
        } else {
          await authenticatedFetch(`${API}/api/sessions/${sessionIdRef.current}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body });
        }
      } catch(err) { console.error('Auto-save error:', err); }
    }, 1500);
    return () => clearTimeout(t);
  }, [script, globalCharacters, primaryCharacterId, narrativeArc, scenes, mergedVideo, globalEnvironments, targetLanguage, sessionId, isInitializing, authenticatedFetch, activeCharacter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scene helpers ──────────────────────────────────────────────────────
  const updateScene  = useCallback((id, updates) => setScenes(prev=>prev.map(s=>s.id===id?{...s,...updates}:s)), [setScenes]);
  const deleteScene  = useCallback((id) => setScenes(prev=>prev.filter(s=>s.id!==id)), [setScenes]);
  const addScene     = useCallback((afterIndex) => {
    const newScene = { id:Math.random().toString(36).substr(2,9), title:'', summary:'', location:'', timeOfDay:'', emotionalTone:'', dialogue:{text:'',phonetic:'',tone:'calm and deliberate',pacing:'slow with natural pauses',language:'Hindi',mode:'character'}, duration:8, status:'draft', selectedCharacterId:'', selectedEnvironmentId:'' };
    setScenes(prev => { const next=[...prev]; next.splice(afterIndex+1,0,newScene); return next; });
  }, [setScenes]);

  // ── Auth actions ───────────────────────────────────────────────────────
  const handleLogout = () => { localStorage.removeItem('ai-video-token'); localStorage.removeItem('ai-video-token-exp'); setAuthToken(null); };

  const handleReset = () => {
    if (!window.confirm('Start a new session?')) return;
    if (sseRef.current) sseRef.current.close();
    setAutoRunStage('idle'); setAutoRunCurrentScene(null); setAutoRunProgress({});
    setScript(''); setScenes([]); setGlobalCharacters([]); setPrimaryCharacterId(''); setNarrativeArc(''); setMergedVideo(null);
    // Clear only session-related keys, not auth token
    const keysToRemove = ['ai-video-characters','ai-video-primary-character-id','ai-video-environments','ai-video-lang','ai-video-arc','ai-video-script','ai-video-scenecount','ai-video-scenes','ai-video-merged','ai-video-image-model','ai-video-video-model'];
    keysToRemove.forEach(k => window.localStorage.removeItem(k));
    setSessionId(null);
    sessionIdRef.current = null;
    window.history.replaceState({}, '', window.location.pathname);
  };

  const handleDeleteSession = async () => {
    if (!sessionId) return;
    if (!window.confirm('Delete this session permanently?')) return;
    try {
      const r = await authenticatedFetch(`${API}/api/sessions/${sessionId}`, { method:'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error||'Failed');
      if (sseRef.current) sseRef.current.close();
      setAutoRunStage('idle'); setAutoRunCurrentScene(null); setAutoRunProgress({});
      setScript(''); setScenes([]); setGlobalCharacters([]); setPrimaryCharacterId(''); setNarrativeArc(''); setMergedVideo(null);
      setSessionId(null);
      sessionIdRef.current = null;
      setAllSessions(prev=>prev.filter(s=>s.id!==d.id));
      window.history.replaceState({}, '', window.location.pathname);
    } catch(err) { alert(`Delete failed: ${err.message}`); }
  };

  const handleSidebarDeleteSession = async (sid) => {
    if (!window.confirm('Delete this session permanently?')) return;
    try {
      const r = await authenticatedFetch(`${API}/api/sessions/${sid}`, { method:'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error||'Failed');
      setAllSessions(prev => prev.filter(s => s.id !== sid));
      // If deleting the active session, reset
      if (sid === sessionId) {
        if (sseRef.current) sseRef.current.close();
        setAutoRunStage('idle'); setAutoRunCurrentScene(null); setAutoRunProgress({});
        setScript(''); setScenes([]); setGlobalCharacters([]); setPrimaryCharacterId(''); setNarrativeArc(''); setMergedVideo(null);
        setSessionId(null);
        sessionIdRef.current = null;
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch(err) { alert(`Delete failed: ${err.message}`); }
  };

  const handleSidebarRenameSession = async (sid, name) => {
    try {
      const r = await authenticatedFetch(`${API}/api/sessions/${sid}/rename`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
      setAllSessions(prev => prev.map(s => s.id === sid ? { ...s, name } : s));
    } catch(err) { alert(`Rename failed: ${err.message}`); }
  };

  // ── Script split ───────────────────────────────────────────────────────
  const handleSplitScript = async () => {
    if (!script.trim()) return;
    setLoadingScenes(true);
    try {
      const r = await authenticatedFetch(`${API}/api/scenes`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({script,sceneCount}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const extractedChars = normalizeCharacters(d.characters||d.character);
      setGlobalCharacters(extractedChars);
      setPrimaryCharacterId(extractedChars[0]?.id||'');
      setNarrativeArc(d.narrativeArc||'');
      setScenes(d.scenes.map(s=>({...s, status:'draft', id:s.id||Math.random().toString(36).substr(2,9), selectedCharacterId:s.selectedCharacterId||'', selectedEnvironmentId:s.selectedEnvironmentId||''})));
      setMergedVideo(null);
      setAutoRunStage('idle');
      setAutoRunProgress({});
      setActiveTab('scenes');
    } catch(e) { alert(`Failed to split script: ${e.message}`); }
    finally { setLoadingScenes(false); }
  };

  // ── SSE event handler ──────────────────────────────────────────────────
  const handleSSEEvent = useCallback((ev) => {
    if (ev.type==='scene_progress') {
      const {sceneId, stage, status, data} = ev;
      setAutoRunCurrentScene(sceneId);
      setAutoRunProgress(prev=>({...prev,[sceneId]:{stage,status}}));
      if (status==='done' && data) {
        const updates = {};
        if (data.imagePrompt) updates.imagePrompt = data.imagePrompt;
        if (data.imageUrl) {
          const genId = Math.random().toString(36).substr(2,9);
          updates.imageGenerations = prev => {
            const prevGens = prev?.imageGenerations||[];
            return [...prevGens.map(g=>({...g,isFinal:false})), {id:genId, imageUrl:data.imageUrl, createdAt:Date.now(), isFinal:true}];
          };
          updates.imageUrl = data.imageUrl;
          updates.status = 'image_done';
        }
        if (data.videoPrompt) updates.videoPrompt = data.videoPrompt;
        if (data.videoUrl) { updates.videoUrl = data.videoUrl; updates.status='video_done'; }
        if (Object.keys(updates).length) {
          setScenes(prev => prev.map(s => {
            if (s.id !== sceneId) return s;
            const next = {...s};
            if (updates.imagePrompt) next.imagePrompt = updates.imagePrompt;
            if (updates.imageUrl) {
              const prevGens = s.imageGenerations||[];
              const genId = Math.random().toString(36).substr(2,9);
              next.imageGenerations = [...prevGens.map(g=>({...g,isFinal:false})), {id:genId, imageUrl:updates.imageUrl, createdAt:Date.now(), isFinal:true}];
              next.imageUrl = updates.imageUrl;
              next.status = 'image_done';
            }
            if (updates.videoPrompt) next.videoPrompt = updates.videoPrompt;
            if (updates.videoUrl) {
              const prevVidGens = s.videoGenerations || [];
              const vidGenId = data.generationId || Math.random().toString(36).substr(2,9);
              next.videoGenerations = [...prevVidGens.map(g=>({...g,isFinal:false})), {id:vidGenId, videoUrl:updates.videoUrl, createdAt:Date.now(), isFinal:true}];
              next.videoUrl = updates.videoUrl;
              next.status = 'video_done';
            }
            return next;
          }));
        }
      }
    } else if (ev.type==='pipeline_complete') {
      setMergedVideo(ev.data.mergedVideoUrl);
      setAutoRunStage('done');
      setAutoRunCurrentScene(null);
    } else if (ev.type==='merge') {
      setAutoRunCurrentScene(null);
    } else if (ev.type==='error') {
      console.error('Pipeline error:', ev);
    } else if (ev.type==='cancelled') {
      setAutoRunStage('idle');
    }
  }, [setScenes, setMergedVideo]);

  // ── Auto-run ───────────────────────────────────────────────────────────
  const handleAutoRun = () => {
    if (sseRef.current) sseRef.current.close();
    setAutoRunStage('running');
    setAutoRunProgress({});
    setMergedVideo(null);
    const videoSdk = FAL_VIDEO_MODELS.find(m => m.id === videoModelId)?.sdk ?? 'fal';
    const body = JSON.stringify({
      scenes, globalCharacter:activeCharacter, globalCharacters, globalEnvironments,
      targetLanguage, sessionId, imageModelId, videoModelId, videoSdk,
    });
    authenticatedFetch(`${API}/api/auto-run`, { method:'POST', headers:{'Content-Type':'application/json'}, body })
      .then(async res => {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const processLine = (line) => {
          if (!line.startsWith('data: ')) return;
          try { handleSSEEvent(JSON.parse(line.slice(6))); } catch {}
        };
        sseRef.current = { close: () => reader.cancel() };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream:true});
          const lines = buffer.split('\n');
          buffer = lines.pop();
          lines.forEach(processLine);
        }
        buffer.split('\n').forEach(processLine);
        setAutoRunStage(prev => prev==='running' ? 'done' : prev);
      })
      .catch(e => { console.error(e); setAutoRunStage('error'); });
  };

  const handleStopAutoRun = () => { if (sseRef.current) sseRef.current.close(); setAutoRunStage('idle'); setAutoRunCurrentScene(null); };

  // ── Manual save ────────────────────────────────────────────────────────
  const handleManualSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const body = JSON.stringify({ script, globalCharacter:activeCharacter, globalCharacters, primaryCharacterId, narrativeArc, scenes, mergedVideo, globalEnvironments, targetLanguage });
      if (!sessionIdRef.current) {
        const res = await authenticatedFetch(`${API}/api/sessions`, { method:'POST', headers:{'Content-Type':'application/json'}, body });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        applySessionId(d.sessionId);
        authenticatedFetch(`${API}/api/sessions`).then(r=>r.json()).then(d=>{ if(d.sessions) setAllSessions(d.sessions); }).catch(()=>{});
      } else {
        const res = await authenticatedFetch(`${API}/api/sessions/${sessionIdRef.current}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      }
      setSaveStatus('saved');
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [script, activeCharacter, globalCharacters, primaryCharacterId, narrativeArc, scenes, mergedVideo, globalEnvironments, targetLanguage, authenticatedFetch, applySessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Merge ──────────────────────────────────────────────────────────────
  const handleMerge = async () => {
    setMerging(true);
    try {
      const videoUrls = scenes.map(s=>(s.videoGenerations?.find(g=>g.isFinal)?.videoUrl||s.videoUrl)).filter(Boolean);
      if (!videoUrls.length) throw new Error('No videos to merge');
      const r = await authenticatedFetch(`${API}/api/merge`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({videoUrls}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMergedVideo(d.videoUrl);
    } catch(e) { alert(`Merge failed: ${e.message}`); }
    finally { setMerging(false); }
  };

  // ── Pipeline stage ─────────────────────────────────────────────────────
  const doneCount = { img:scenes.filter(s=>s.imageUrl).length, vid:scenes.filter(s=>s.videoUrl).length };
  const activePipelineStage = (() => {
    if (!scenes.length) return 'script';
    if (mergedVideo) return 'merge';
    if (doneCount.vid===scenes.length) return 'video';
    if (doneCount.img===scenes.length) return 'image';
    return 'image_prompt';
  })();

  // ── Early returns ──────────────────────────────────────────────────────
  if (!authChecked) return <Loader label="Checking access…" />;
  if (!authToken)   return <Login onLogin={setAuthToken} />;
  if (isInitializing) return <Loader label="Loading session…" />;

  const sessionSelectHandler = (sid) => { window.location.href = '?session=' + sid; };

  const mainContent = () => {
    switch (activeTab) {
      case 'models':
        return (
          <ModelsPage
            imageModelId={imageModelId}
            videoModelId={videoModelId}
            onImageModelChange={setImageModelId}
            onVideoModelChange={setVideoModelId}
          />
        );
      case 'script':
        return (
          <ScriptPanel
            script={script}
            setScript={setScript}
            sceneCount={sceneCount}
            setSceneCount={setSceneCount}
            targetLanguage={targetLanguage}
            setTargetLanguage={setTargetLanguage}
            onSplit={() => { handleSplitScript(); setActiveTab('scenes'); }}
            loading={loadingScenes}
          />
        );
      case 'characters':
        return (
          <CharacterPanel
            characters={globalCharacters}
            onUpdate={setGlobalCharacters}
            primaryCharacterId={primaryCharacterId}
            onSetPrimary={setPrimaryCharacterId}
            script={script}
            activeCharId={activeCharId}
            onCharSelect={setActiveCharId}
            authenticatedFetch={authenticatedFetch}
          />
        );
      case 'environments':
        return (
          <EnvironmentsPanel
            environments={globalEnvironments}
            onUpdate={setGlobalEnvironments}
            script={script}
            activeEnvId={activeEnvId}
            onEnvSelect={setActiveEnvId}
            authenticatedFetch={authenticatedFetch}
          />
        );
      case 'reel':
        return (
          <ReelView
            scenes={scenes}
            mergedVideo={mergedVideo}
            setMergedVideo={setMergedVideo}
            merging={merging}
            onMerge={handleMerge}
            refreshMediaUrl={refreshMediaUrl}
            authenticatedFetch={authenticatedFetch}
          />
        );
      case 'scenes':
      default:
        return (
          <ScenesView
            scenes={scenes}
            updateScene={updateScene}
            deleteScene={deleteScene}
            addScene={addScene}
            globalCharacter={activeCharacter}
            globalCharacters={globalCharacters}
            globalEnvironments={globalEnvironments}
            targetLanguage={targetLanguage}
            autoRunStage={autoRunStage}
            autoRunCurrentScene={autoRunCurrentScene}
            onAutoRun={handleAutoRun}
            onStopAutoRun={handleStopAutoRun}
            refreshMediaUrl={refreshMediaUrl}
            narrativeArc={narrativeArc}
            activeSceneId={activeSceneId}
            onSceneSelect={setActiveSceneId}
            imageModelId={imageModelId}
            videoModelId={videoModelId}
            authenticatedFetch={authenticatedFetch}
          />
        );
    }
  };

  return (
    <div className="app-shell">
      <Topbar
          onNew={handleReset}
          onLogout={handleLogout}
          onOpenReel={() => setActiveTab('reel')}
          hasScenes={scenes.length > 0}
          imageModelId={imageModelId}
          videoModelId={videoModelId}
          onOpenModels={() => setActiveTab('models')}
          onSave={handleManualSave}
          saveStatus={saveStatus}
        />

      <div className="app-body">
        <Sidebar
          sessions={allSessions}
          sessionId={sessionId}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onSessionSelect={sessionSelectHandler}
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSceneSelect={setActiveSceneId}
          characters={globalCharacters}
          activeCharId={activeCharId}
          onCharSelect={setActiveCharId}
          environments={globalEnvironments}
          activeEnvId={activeEnvId}
          onEnvSelect={setActiveEnvId}
          onSessionRename={handleSidebarRenameSession}
          onSessionDelete={handleSidebarDeleteSession}
        />

        <main className="main-content">
          {mainContent()}
        </main>
      </div>

      {/* Pipeline bar — only shown when there are scenes */}
      {scenes.length > 0 && (
        <PipelineBar
          activeStage={activePipelineStage}
          isRunning={autoRunStage==='running'}
        />
      )}
    </div>
  );
}
