import React, { useState } from 'react';
import { User, Sparkles, Image as ImageIcon, X, Plus, Crown, ArrowLeft } from 'lucide-react';
import { Spinner } from './ui/primitives';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();
const getMediaUrl = (url) => url?.startsWith('http') ? url : `${API}${url}`;
const S = {
  label: { fontSize:10, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--text-muted)', display:'block', marginBottom:5 },
  grid: { display:'grid', gap:16, gridTemplateColumns:'repeat(auto-fill, minmax(420px, 1fr))', alignItems:'stretch' },
};

function CharPreviewPanel({ char, onGenRef, generating }) {
  const img = char.referenceImageUrl ? getMediaUrl(char.referenceImageUrl) : null;
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:14, display:'flex', flexDirection:'column', overflow:'hidden', height:'100%' }}>
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <ImageIcon size={13} style={{ color:'var(--amber)' }} />
        <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-muted)' }}>Reference Image</span>
        {img && <span style={{ marginLeft:'auto', fontSize:10, background:'rgba(59,130,246,0.15)', color:'#60a5fa', padding:'2px 8px', borderRadius:999, fontWeight:700 }}>Ready</span>}
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:'#000', overflow:'hidden' }}>
        {img ? (
          <img src={img} alt={char.name||'ref'} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
        ) : (
          <div style={{ textAlign:'center', padding:32 }}>
            <div style={{ width:52, height:52, borderRadius:'50%', border:'2px dashed var(--border-strong)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <User size={22} style={{ color:'var(--text-muted)' }} />
            </div>
            <p style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.7 }}>No reference image yet<br/><span style={{fontSize:11}}>Generate using the button below</span></p>
          </div>
        )}
      </div>
      <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <button onClick={onGenRef} disabled={generating||!char.description} className="btn btn-outline btn-sm" style={{ flex:1, justifyContent:'center' }} title={!char.description?'Add a description first':''}>
          {generating ? <Spinner size={11}/> : <Sparkles size={12}/>}
          {img ? 'Regenerate' : 'Generate Ref Image'}
        </button>
        {img && <a href={img} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:'var(--amber)', textDecoration:'none', fontWeight:600, flexShrink:0 }}>Open ↗</a>}
      </div>
    </div>
  );
}

export default function CharacterPanel({ characters, onUpdate, script, primaryCharacterId, onSetPrimary, activeCharId, onCharSelect }) {
  const [extracting, setExtracting] = useState(false);
  const [generatingRefId, setGeneratingRefId] = useState('');
  
  const chars = characters || [];

  const updateChar = (id, field, val) => onUpdate(chars.map(c => c.id===id ? {...c,[field]:val} : c));
  const removeChar = (id) => { const next=chars.filter(c=>c.id!==id); onUpdate(next); if(id===primaryCharacterId) onSetPrimary(next[0]?.id||''); if(id===activeCharId) onCharSelect(null); };
  const addChar = () => { const nc={id:Math.random().toString(36).substr(2,9),name:'',description:'',keyFeature:'',referenceImageUrl:null}; const next=[...chars,nc]; onUpdate(next); if(!primaryCharacterId&&next[0]) onSetPrimary(next[0].id); onCharSelect(nc.id); };

  const handleExtract = async () => {
    if (!script?.trim()) return alert('Paste your script first.');
    setExtracting(true);
    try {
      const r = await fetch(`${API}/api/extract/character`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({script})});
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      const normalized = (Array.isArray(d.characters)?d.characters:d.character?[d.character]:[]).filter(c=>c&&typeof c==='object').map((c,i)=>({id:c.id||`char_${i+1}`,name:c.name||'',description:c.description||'',keyFeature:c.keyFeature||'',referenceImageUrl:c.referenceImageUrl||null})).filter(c=>c.name||c.description||c.keyFeature);
      onUpdate(normalized); onSetPrimary(normalized[0]?.id||'');
    } catch(e) { alert(`Character extraction failed: ${e.message}`); } finally { setExtracting(false); }
  };

  const handleGenRef = async (char) => {
    if (!char.description) return alert('Add a character description first.');
    setGeneratingRefId(char.id);
    try {
      const r = await fetch(`${API}/api/image`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imagePrompt:`CHARACTER: ${char.description}\nCHARACTER_KEY_FEATURE: ${char.keyFeature}\nACTION: Standing still, facing camera, neutral expression\nENVIRONMENT: Plain dark background\nLIGHTING: Soft diffused front lighting\nCAMERA: Medium portrait shot, 9:16\nSTYLE: cinematic, ultra realistic, 4k`})});
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      onUpdate(chars.map(c=>c.id===char.id?{...c,referenceImageUrl:d.imageUrl}:c));
    } catch(e) { alert(`Ref image failed: ${e.message}`); } finally { setGeneratingRefId(''); }
  };

  // ── Detail view ──────────────────────────────────────────────────────────
  if (activeCharId) {
    const charIdx = chars.findIndex(c=>c.id===activeCharId);
    const char = chars[charIdx];
    if (!char) { onCharSelect(null); return null; }
    const prev = charIdx>0 ? chars[charIdx-1] : null;
    const next = charIdx<chars.length-1 ? chars[charIdx+1] : null;
    return (
      <div className="animate-fade-up" style={{ display:'flex', flexDirection:'column', gap:14, height:'100%' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <button className="btn btn-ghost btn-sm" onClick={()=>onCharSelect(null)} style={{gap:6}}><ArrowLeft size={14}/> All Characters</button>
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>Character {charIdx+1} of {chars.length}{char.name?` — ${char.name}`:''}</span>
          <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
            {prev && <button className="btn btn-outline btn-sm" onClick={()=>onCharSelect(prev.id)}>← Prev</button>}
            {next && <button className="btn btn-outline btn-sm" onClick={()=>onCharSelect(next.id)}>Next →</button>}
            <button className="btn btn-outline btn-sm" onClick={addChar} style={{borderStyle:'dashed',gap:5}}><Plus size={13}/> Add Character</button>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, flex:1, minHeight:0 }}>
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:14, padding:20, display:'flex', flexDirection:'column', gap:14, overflowY:'auto' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={()=>onSetPrimary(char.id)} className="btn btn-sm" style={{ gap:5, background:primaryCharacterId===char.id?'rgba(245,166,35,0.15)':'var(--bg-overlay)', color:primaryCharacterId===char.id?'var(--amber)':'var(--text-muted)', border:`1px solid ${primaryCharacterId===char.id?'rgba(245,166,35,0.3)':'var(--border-subtle)'}` }}>
                <Crown size={11}/> {primaryCharacterId===char.id?'Primary':'Set Primary'}
              </button>
              <button onClick={()=>removeChar(char.id)} className="btn btn-sm" style={{ marginLeft:'auto', gap:5, background:'var(--red-dim)', color:'var(--red)', border:'none' }}><X size={11}/> Delete</button>
            </div>
            <div><label style={S.label}>Name</label><input value={char.name||''} onChange={e=>updateChar(char.id,'name',e.target.value)} placeholder="e.g. Ashoka" className="cine-input"/></div>
            <div><label style={S.label}>Physical Description</label><textarea value={char.description||''} onChange={e=>updateChar(char.id,'description',e.target.value)} rows={5} placeholder="Skin tone, build, attire, hair, distinguishing features…" className="cine-input" style={{resize:'none',lineHeight:1.55}}/></div>
            <div><label style={S.label}>Key Feature</label><input value={char.keyFeature||''} onChange={e=>updateChar(char.id,'keyFeature',e.target.value)} placeholder="e.g. deep scar across left jaw" className="cine-input"/></div>
          </div>
          <CharPreviewPanel char={char} onGenRef={()=>handleGenRef(char)} generating={generatingRefId===char.id}/>
        </div>
      </div>
    );
  }

  // ── Grid view ──────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-up" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span className="step-badge" style={{ background:'var(--bg-overlay)', color:'var(--amber)', border:'1px solid rgba(245,166,35,0.3)' }}><User size={11}/></span>
          <h2 className="section-title">Characters <span style={{fontWeight:400,color:'var(--text-muted)',fontSize:13}}>({chars.length})</span></h2>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline btn-sm" onClick={addChar} style={{borderStyle:'dashed',gap:5}}><Plus size={13}/> Add Character</button>
          <button className="btn btn-outline-amber btn-sm" onClick={handleExtract} disabled={extracting}>
            {extracting?<Spinner size={11} color="border-[var(--amber)]"/>:<Sparkles size={12}/>} Extract from Script
          </button>
        </div>
      </div>
      {chars.length===0 && (
        <div className="surface" style={{ padding:'32px 20px', textAlign:'center' }}>
          <User size={28} style={{ color:'var(--text-muted)', margin:'0 auto 10px' }}/>
          <p style={{ fontSize:13, color:'var(--text-muted)' }}>No characters yet. Extract from script or add manually.</p>
        </div>
      )}
      <div style={S.grid}>
        {chars.map((char,idx)=>(
          <div key={char.id||idx} onClick={()=>onCharSelect(char.id)}
            style={{ background:'var(--bg-raised)', border:'1px solid var(--border-default)', borderRadius:12, padding:16, position:'relative', display:'flex', flexDirection:'column', gap:12, cursor:'pointer', height:'100%', minHeight:260, transition:'border-color 0.15s' }}
            onMouseOver={e=>e.currentTarget.style.borderColor='rgba(245,166,35,0.3)'}
            onMouseOut={e=>e.currentTarget.style.borderColor='var(--border-default)'}
          >
            <button onClick={e=>{e.stopPropagation();removeChar(char.id);}} style={{ position:'absolute', top:10, right:10, width:22, height:22, borderRadius:'50%', background:'var(--red-dim)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--red)' }}><X size={11}/></button>
            <button onClick={e=>{e.stopPropagation();onSetPrimary(char.id);}} className="btn btn-sm" style={{ alignSelf:'flex-start', gap:5, background:primaryCharacterId===char.id?'rgba(245,166,35,0.15)':'var(--bg-overlay)', color:primaryCharacterId===char.id?'var(--amber)':'var(--text-muted)', border:`1px solid ${primaryCharacterId===char.id?'rgba(245,166,35,0.3)':'var(--border-subtle)'}` }}>
              <Crown size={11}/> {primaryCharacterId===char.id?'Primary':'Set Primary'}
            </button>
            {char.referenceImageUrl && (
              <div style={{ borderRadius:8, overflow:'hidden', height:120, background:'#000' }}>
                <img src={getMediaUrl(char.referenceImageUrl)} alt="ref" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              </div>
            )}
            <div><label style={S.label}>Name</label><p style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{char.name||<span style={{color:'var(--text-muted)',fontWeight:400}}>Unnamed</span>}</p></div>
            <div><label style={S.label}>Description</label><p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.55, display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{char.description||<span style={{color:'var(--text-muted)'}}>No description</span>}</p></div>
            {char.keyFeature && <div><label style={S.label}>Key Feature</label><p style={{ fontSize:12, color:'var(--amber)', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{char.keyFeature}</p></div>}
          </div>
        ))}
      </div>
    </div>
  );
}
