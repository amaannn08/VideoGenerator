import React, { useState } from 'react';
import { MapPin, Sparkles, Plus, X, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import { Spinner } from './ui/primitives';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();
const S = {
  label: { fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 },
  grid: { display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fill, minmax(420px, 1fr))', alignItems:'stretch' },
};

function EnvPreviewPanel({ env }) {
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:14, display:'flex', flexDirection:'column', overflow:'hidden', height:'100%' }}>
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <ImageIcon size={13} style={{ color:'var(--green)' }}/>
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>Environment Preview</span>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:'#000', overflow:'hidden' }}>
        <div style={{ textAlign:'center', padding:32 }}>
          <div style={{ width:52, height:52, borderRadius:'50%', border:'2px dashed var(--border-strong)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            <MapPin size={22} style={{ color:'var(--text-muted)' }}/>
          </div>
          <p style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.7 }}>
            Environment visuals are generated<br/>as part of each scene render
          </p>
        </div>
      </div>
      {env.keyFeature && (
        <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border-subtle)', flexShrink:0 }}>
          <p style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>Key Feature</p>
          <p style={{ fontSize:12, color:'var(--green)', fontStyle:'italic' }}>{env.keyFeature}</p>
        </div>
      )}
    </div>
  );
}

export default function EnvironmentsPanel({ environments, onUpdate, script, activeEnvId, onEnvSelect }) {
  const [extracting, setExtracting] = useState(false);
  const envs = environments || [];

  const handleExtract = async () => {
    if (!script?.trim()) return alert('Paste your script first.');
    setExtracting(true);
    try {
      const r = await fetch(`${API}/api/extract/environments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script})});
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      onUpdate(d.environments || []);
    } catch(e) { alert(`Extraction failed: ${e.message}`); } finally { setExtracting(false); }
  };

  const updateEnv = (id, field, val) => onUpdate(envs.map(e => e.id===id ? {...e,[field]:val} : e));
  const removeEnv = (id) => { onUpdate(envs.filter(e=>e.id!==id)); if(id===activeEnvId) onEnvSelect(null); };
  const addEnv = () => { const ne={id:Math.random().toString(36).substr(2,9),name:'',description:'',keyFeature:''}; const next=[...envs,ne]; onUpdate(next); onEnvSelect(ne.id); };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (activeEnvId) {
    const envIdx = envs.findIndex(e=>e.id===activeEnvId);
    const env = envs[envIdx];
    if (!env) { onEnvSelect(null); return null; }
    const prev = envIdx>0 ? envs[envIdx-1] : null;
    const next = envIdx<envs.length-1 ? envs[envIdx+1] : null;
    return (
      <div className="animate-fade-up" style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <button className="btn btn-ghost btn-sm" onClick={()=>onEnvSelect(null)} style={{gap:6}}><ArrowLeft size={14}/> All Environments</button>
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>Environment {envIdx+1} of {envs.length}{env.name?` — ${env.name}`:''}</span>
          <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
            {prev && <button className="btn btn-outline btn-sm" onClick={()=>onEnvSelect(prev.id)}>← Prev</button>}
            {next && <button className="btn btn-outline btn-sm" onClick={()=>onEnvSelect(next.id)}>Next →</button>}
            <button className="btn btn-outline btn-sm" onClick={addEnv} style={{borderStyle:'dashed',gap:5}}><Plus size={13}/> Add Environment</button>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, flex:1, minHeight:0 }}>
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:14, padding:20, display:'flex', flexDirection:'column', gap:14, overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button onClick={()=>removeEnv(env.id)} className="btn btn-sm" style={{ gap:5, background:'var(--red-dim)', color:'var(--red)', border:'none' }}><X size={11}/> Delete</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><label style={S.label}>Name</label><input value={env.name||''} onChange={e=>updateEnv(env.id,'name',e.target.value)} placeholder="e.g. Kalinga Battlefield" className="cine-input"/></div>
              <div><label style={S.label}>Key Feature</label><input value={env.keyFeature||''} onChange={e=>updateEnv(env.id,'keyFeature',e.target.value)} placeholder="e.g. blood-soaked red earth" className="cine-input"/></div>
            </div>
            <div><label style={S.label}>Description</label><textarea value={env.description||''} onChange={e=>updateEnv(env.id,'description',e.target.value)} rows={6} placeholder="Atmospheric description: surface, weather, lighting, scale…" className="cine-input" style={{resize:'none',lineHeight:1.55}}/></div>
          </div>
          <EnvPreviewPanel env={env}/>
        </div>
      </div>
    );
  }

  // ── Grid view ──────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-up" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span className="step-badge" style={{ background:'var(--bg-overlay)', color:'var(--green)', border:'1px solid rgba(34,197,94,0.3)' }}><MapPin size={11}/></span>
          <h2 className="section-title">Environments <span style={{fontWeight:400,color:'var(--text-muted)',fontSize:13}}>({envs.length})</span></h2>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline btn-sm" onClick={addEnv} style={{borderStyle:'dashed',gap:5}}><Plus size={13}/> Add Environment</button>
          <button className="btn btn-outline btn-sm" style={{color:'var(--green)',borderColor:'rgba(34,197,94,0.3)'}} onClick={handleExtract} disabled={extracting}>
            {extracting?<Spinner size={11} color="border-[var(--green)]"/>:<Sparkles size={12}/>} Extract from Script
          </button>
        </div>
      </div>
      {envs.length===0 && (
        <div className="surface" style={{ padding:'32px 20px', textAlign:'center' }}>
          <MapPin size={28} style={{ color:'var(--text-muted)', margin:'0 auto 10px' }}/>
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>No environments yet. Extract from script or add manually.</p>
        </div>
      )}
      <div style={S.grid}>
        {envs.map((env,idx)=>(
          <div key={env.id||idx} onClick={()=>onEnvSelect(env.id)}
            style={{ background:'var(--bg-raised)', border:'1px solid var(--border-default)', borderRadius:12, padding:16, position:'relative', display:'flex', flexDirection:'column', gap:10, cursor:'pointer', height:'100%', minHeight:260, transition:'border-color 0.15s' }}
            onMouseOver={e=>e.currentTarget.style.borderColor='rgba(34,197,94,0.3)'}
            onMouseOut={e=>e.currentTarget.style.borderColor='var(--border-default)'}
          >
            <button onClick={e=>{e.stopPropagation();removeEnv(env.id);}} style={{ position:'absolute', top:10, right:10, width:22, height:22, borderRadius:'50%', background:'var(--red-dim)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--red)' }}><X size={11}/></button>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, paddingRight:24 }}>
              <div><label style={S.label}>Name</label><p style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{env.name||<span style={{color:'var(--text-muted)',fontWeight:400}}>Unnamed</span>}</p></div>
              <div><label style={S.label}>Key Feature</label><p style={{ fontSize:12, color:'var(--green)', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{env.keyFeature||<span style={{color:'var(--text-muted)',fontStyle:'normal'}}>—</span>}</p></div>
            </div>
            <div><label style={S.label}>Description</label><p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.55, display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{env.description||<span style={{color:'var(--text-muted)'}}>No description</span>}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
