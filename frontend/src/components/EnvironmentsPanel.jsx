import React, { useState } from 'react';
import { MapPin, Sparkles, Plus, X } from 'lucide-react';
import { Spinner } from './ui/primitives';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();

const S = {
  card: { background:'var(--bg-raised)', border:'1px solid var(--border-default)', borderRadius:12, padding:16, position:'relative', display:'flex', flexDirection:'column', gap:10 },
  label: { fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 },
  grid: { display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))' },
};

export default function EnvironmentsPanel({ environments, onUpdate, script }) {
  const [extracting, setExtracting] = useState(false);
  const envs = environments || [];

  const handleExtract = async () => {
    if (!script?.trim()) return alert('Paste your script first.');
    setExtracting(true);
    try {
      const r = await fetch(`${API}/api/extract/environments`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({script}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onUpdate(d.environments || []);
    } catch(e) { alert(`Extraction failed: ${e.message}`); }
    finally { setExtracting(false); }
  };

  const updateEnv = (idx, field, val) => onUpdate(envs.map((e,i) => i===idx ? {...e,[field]:val} : e));
  const removeEnv = (idx) => onUpdate(envs.filter((_,i) => i!==idx));
  const addEnv = () => onUpdate([...envs, { id:Math.random().toString(36).substr(2,9), name:'', description:'', keyFeature:'' }]);

  return (
    <div className="animate-fade-up" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span className="step-badge" style={{ background:'var(--bg-overlay)', color:'var(--green)', border:'1px solid rgba(34,197,94,0.3)' }}>
            <MapPin size={11} />
          </span>
          <h2 className="section-title">Environments <span style={{fontWeight:400, color:'var(--text-muted)', fontSize:13}}>({envs.length})</span></h2>
        </div>
        <button className="btn btn-outline btn-sm" style={{ color:'var(--green)', borderColor:'rgba(34,197,94,0.3)' }} onClick={handleExtract} disabled={extracting}>
          {extracting ? <Spinner size={11} color="border-[var(--green)]" /> : <Sparkles size={12} />}
          Extract from Script
        </button>
      </div>

      {envs.length === 0 && (
        <div className="surface" style={{ padding:'32px 20px', textAlign:'center' }}>
          <MapPin size={28} style={{ color:'var(--text-muted)', margin:'0 auto 10px' }} />
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>No environments yet. Extract from script or add manually.</p>
        </div>
      )}

      <div style={S.grid}>
        {envs.map((env, idx) => (
          <div key={env.id||idx} style={S.card}>
            <button
              onClick={() => removeEnv(idx)}
              style={{ position:'absolute', top:10, right:10, width:22, height:22, borderRadius:'50%', background:'var(--red-dim)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--red)' }}
            ><X size={11} /></button>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, paddingRight:24 }}>
              <div>
                <label style={S.label}>Name</label>
                <input value={env.name||''} onChange={e=>updateEnv(idx,'name',e.target.value)} placeholder="e.g. Kalinga Battlefield" className="cine-input" style={{padding:'7px 10px'}} />
              </div>
              <div>
                <label style={S.label}>Key Feature</label>
                <input value={env.keyFeature||''} onChange={e=>updateEnv(idx,'keyFeature',e.target.value)} placeholder="e.g. blood-soaked red earth" className="cine-input" style={{padding:'7px 10px'}} />
              </div>
            </div>
            <div>
              <label style={S.label}>Description</label>
              <textarea value={env.description||''} onChange={e=>updateEnv(idx,'description',e.target.value)} rows={2} placeholder="Atmospheric description: surface, weather, lighting, scale…" className="cine-input" style={{resize:'none', lineHeight:1.55}} />
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-outline" onClick={addEnv} style={{ alignSelf:'flex-start', borderStyle:'dashed' }}>
        <Plus size={14} /> Add Environment
      </button>
    </div>
  );
}
