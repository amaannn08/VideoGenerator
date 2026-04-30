import React, { useState } from 'react';
import { User, Sparkles, Image as ImageIcon, X, Plus, Crown } from 'lucide-react';
import { Spinner } from './ui/primitives';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();

const createChar = () => ({ id: Math.random().toString(36).substr(2,9), name:'', description:'', keyFeature:'', referenceImageUrl: null });

const S = {
  card: { background:'var(--bg-raised)', border:'1px solid var(--border-default)', borderRadius:12, padding:16, position:'relative', display:'flex', flexDirection:'column', gap:12 },
  label: { fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 },
  grid: { display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))' },
};

export default function CharacterPanel({ characters, onUpdate, script, primaryCharacterId, onSetPrimary }) {
  const [extracting, setExtracting] = useState(false);
  const [generatingRefId, setGeneratingRefId] = useState('');
  const chars = characters || [];

  const updateChar = (idx, field, val) => onUpdate(chars.map((c,i) => i===idx ? {...c,[field]:val} : c));
  const removeChar = (idx) => { const next = chars.filter((_,i)=>i!==idx); onUpdate(next); if(chars[idx]?.id===primaryCharacterId) onSetPrimary(next[0]?.id||''); };
  const addChar = () => { const next=[...chars,createChar()]; onUpdate(next); if(!primaryCharacterId&&next[0]) onSetPrimary(next[0].id); };

  const handleExtract = async () => {
    if (!script?.trim()) return alert('Paste your script first.');
    setExtracting(true);
    try {
      const r = await fetch(`${API}/api/extract/character`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({script}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const normalized = (Array.isArray(d.characters) ? d.characters : d.character ? [d.character] : [])
        .filter(c=>c&&typeof c==='object')
        .map((c,i)=>({ id:c.id||`char_${i+1}`, name:c.name||'', description:c.description||'', keyFeature:c.keyFeature||'', referenceImageUrl:c.referenceImageUrl||null }))
        .filter(c=>c.name||c.description||c.keyFeature);
      onUpdate(normalized);
      onSetPrimary(normalized[0]?.id||'');
    } catch(e) { alert(`Character extraction failed: ${e.message}`); }
    finally { setExtracting(false); }
  };

  const handleGenRef = async (char) => {
    if (!char.description) return alert('Add a character description first.');
    setGeneratingRefId(char.id);
    try {
      const r = await fetch(`${API}/api/image`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ imagePrompt:`CHARACTER: ${char.description}\nCHARACTER_KEY_FEATURE: ${char.keyFeature}\nACTION: Standing still, facing camera, neutral expression\nENVIRONMENT: Plain dark background\nLIGHTING: Soft diffused front lighting\nCAMERA: Medium portrait shot, 9:16\nSTYLE: cinematic, ultra realistic, 4k` }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onUpdate(chars.map(c => c.id===char.id ? {...c, referenceImageUrl:d.imageUrl} : c));
    } catch(e) { alert(`Ref image failed: ${e.message}`); }
    finally { setGeneratingRefId(''); }
  };

  return (
    <div className="animate-fade-up" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span className="step-badge" style={{ background:'var(--bg-overlay)', color:'var(--amber)', border:'1px solid rgba(245,166,35,0.3)' }}>
            <User size={11} />
          </span>
          <h2 className="section-title">Characters <span style={{fontWeight:400, color:'var(--text-muted)', fontSize:13}}>({chars.length})</span></h2>
        </div>
        <button className="btn btn-outline-amber btn-sm" onClick={handleExtract} disabled={extracting}>
          {extracting ? <Spinner size={11} color="border-[var(--amber)]" /> : <Sparkles size={12} />}
          Extract from Script
        </button>
      </div>

      {chars.length === 0 && (
        <div className="surface" style={{ padding:'32px 20px', textAlign:'center' }}>
          <User size={28} style={{ color:'var(--text-muted)', margin:'0 auto 10px' }} />
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>No characters yet. Extract from script or add manually.</p>
        </div>
      )}

      {/* Cards */}
      <div style={S.grid}>
        {chars.map((char, idx) => (
          <div key={char.id||idx} style={S.card}>
            {/* Remove */}
            <button
              onClick={() => removeChar(idx)}
              style={{ position:'absolute', top:10, right:10, width:22, height:22, borderRadius:'50%', background:'var(--red-dim)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--red)' }}
            ><X size={11} /></button>

            {/* Primary badge */}
            <button
              onClick={() => onSetPrimary(char.id)}
              className={`btn btn-sm`}
              style={{ alignSelf:'flex-start', gap:5, background: primaryCharacterId===char.id ? 'rgba(245,166,35,0.15)' : 'var(--bg-overlay)', color: primaryCharacterId===char.id ? 'var(--amber)' : 'var(--text-muted)', border:`1px solid ${primaryCharacterId===char.id ? 'rgba(245,166,35,0.3)' : 'var(--border-subtle)'}` }}
            >
              <Crown size={11} /> {primaryCharacterId===char.id ? 'Primary' : 'Set Primary'}
            </button>

            <div>
              <label style={S.label}>Name</label>
              <input value={char.name||''} onChange={e=>updateChar(idx,'name',e.target.value)} placeholder="e.g. Ashoka" className="cine-input" />
            </div>
            <div>
              <label style={S.label}>Physical Description</label>
              <textarea value={char.description||''} onChange={e=>updateChar(idx,'description',e.target.value)} rows={3} placeholder="Skin tone, build, attire, hair, distinguishing features…" className="cine-input" style={{resize:'none', lineHeight:1.55}} />
            </div>
            <div>
              <label style={S.label}>Key Feature</label>
              <input value={char.keyFeature||''} onChange={e=>updateChar(idx,'keyFeature',e.target.value)} placeholder="e.g. deep scar across left jaw" className="cine-input" />
            </div>

            {/* Ref image */}
            <div>
              <label style={S.label}>Reference Image</label>
              <div style={{ border:'1px dashed var(--border-default)', borderRadius:10, overflow:'hidden', minHeight:100, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-overlay)', position:'relative' }}>
                {char.referenceImageUrl ? (
                  <>
                    <img src={char.referenceImageUrl} alt="ref" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    <button onClick={()=>updateChar(idx,'referenceImageUrl',null)} style={{ position:'absolute', top:6, right:6, width:20, height:20, borderRadius:'50%', background:'rgba(0,0,0,0.7)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}><X size={10} /></button>
                  </>
                ) : (
                  <div style={{ textAlign:'center', padding:16 }}>
                    <ImageIcon size={22} style={{ color:'var(--text-muted)', marginBottom:6 }} />
                    <p style={{ fontSize:11, color:'var(--text-muted)' }}>No reference image</p>
                  </div>
                )}
              </div>
              <button
                onClick={() => handleGenRef(char)}
                disabled={generatingRefId===char.id || !char.description}
                className="btn btn-outline btn-sm"
                style={{ width:'100%', marginTop:8, justifyContent:'center' }}
              >
                {generatingRefId===char.id ? <Spinner size={11} /> : <Sparkles size={12} />}
                Generate Ref Image
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="btn btn-outline" onClick={addChar} style={{ alignSelf:'flex-start', borderStyle:'dashed' }}>
        <Plus size={14} /> Add Character
      </button>
    </div>
  );
}
