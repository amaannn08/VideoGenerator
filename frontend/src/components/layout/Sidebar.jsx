import React, { useState, useRef } from 'react';
import { User, MapPin, Film, FileText, ChevronRight, Cpu, Pencil, Trash2, Check, X } from 'lucide-react';

const NAV = [
  { key: 'script',       label: 'Script',        Icon: FileText },
  { key: 'characters',   label: 'Characters',    Icon: User },
  { key: 'environments', label: 'Environments',  Icon: MapPin },
  { key: 'scenes',       label: 'Scenes',        Icon: Film },
  { key: 'models',       label: 'AI Models',     Icon: Cpu },
];

const SCENE_DOT = { video_done:'var(--green)', image_done:'var(--blue)', image_generating:'var(--amber)', video_generating:'var(--amber)', draft:'var(--text-muted)' };

function SubList({ items, activeId, onSelect, accentColor, getLabel, getStatus }) {
  return (
    <div style={{ paddingLeft:8, paddingBottom:4 }}>
      {items.map((item, i) => {
        const isActive = activeId === item.id;
        const dotColor = getStatus ? (SCENE_DOT[getStatus(item)] || 'var(--text-muted)') : accentColor;
        const label = getLabel(item, i);
        return (
          <button key={item.id || i} onClick={() => onSelect(isActive ? null : item.id)}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 10px', marginBottom:1, borderRadius:7, border:'none', background:isActive?`rgba(${accentColor === 'var(--green)' ? '34,197,94' : '245,166,35'},0.1)`:'transparent', color:isActive?accentColor:'var(--text-muted)', fontSize:12, fontWeight:isActive?600:400, cursor:'pointer', textAlign:'left', transition:'all 0.15s' }}
            onMouseOver={e=>{ if(!isActive){e.currentTarget.style.background='var(--bg-raised)';e.currentTarget.style.color='var(--text-primary)';}}}
            onMouseOut={e=>{ if(!isActive){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-muted)';}}}
          >
            <span style={{ width:6, height:6, borderRadius:'50%', background:dotColor, flexShrink:0 }} />
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{label}</span>
            {isActive && <ChevronRight size={11} style={{ flexShrink:0 }} />}
          </button>
        );
      })}
    </div>
  );
}

function SessionItem({ s, isActive, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef(null);

  const label = s.name || (s.narrative_arc ? s.narrative_arc.substring(0, 38) + (s.narrative_arc.length > 38 ? '…' : '') : `Session ${s.id.substring(0, 6)}`);

  const startEdit = (e) => {
    e.stopPropagation();
    setDraft(s.name || label);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = async (e) => {
    e?.stopPropagation();
    if (draft.trim()) await onRename(s.id, draft.trim());
    setEditing(false);
  };

  const cancelEdit = (e) => {
    e?.stopPropagation();
    setEditing(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(s.id);
  };

  if (editing) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', marginBottom:2 }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }}
          style={{ flex:1, fontSize:12, background:'var(--bg-overlay)', color:'var(--text-primary)', border:'1px solid var(--amber)', borderRadius:6, padding:'4px 8px', outline:'none' }}
          onClick={e => e.stopPropagation()}
        />
        <button onClick={commitEdit} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--green)', padding:2 }}><Check size={13} /></button>
        <button onClick={cancelEdit} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:2 }}><X size={13} /></button>
      </div>
    );
  }

  return (
    <div
      style={{ position:'relative', display:'flex', alignItems:'center', marginBottom:2 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        className={`sidebar-session-pill${isActive ? ' active' : ''}`}
        onClick={() => onSelect(s.id)}
        title={s.name || s.narrative_arc || s.id}
        style={{ flex:1, paddingRight: hovered ? 52 : 12 }}
      >
        <span className="session-dot" />
        <span className="line-clamp-1" style={{ fontSize:12 }}>{label}</span>
      </button>
      {hovered && (
        <div style={{ position:'absolute', right:6, display:'flex', gap:2, alignItems:'center' }}>
          <button
            onClick={startEdit}
            title="Rename"
            style={{ background:'var(--bg-overlay)', border:'none', cursor:'pointer', color:'var(--text-muted)', borderRadius:4, padding:'2px 4px', display:'flex', alignItems:'center' }}
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={handleDelete}
            title="Delete"
            style={{ background:'var(--red-dim)', border:'none', cursor:'pointer', color:'var(--red)', borderRadius:4, padding:'2px 4px', display:'flex', alignItems:'center' }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  sessions, sessionId, activeTab, onTabChange, onSessionSelect,
  scenes = [], activeSceneId, onSceneSelect,
  characters = [], activeCharId, onCharSelect,
  environments = [], activeEnvId, onEnvSelect,
  onSessionRename, onSessionDelete,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-section-label">Pages</div>
      <nav style={{ paddingBottom:4 }}>
        {NAV.map(({ key, label, Icon }) => {
          const count = key==='scenes' ? scenes.length : key==='characters' ? characters.length : key==='environments' ? environments.length : 0;
          const isActive = activeTab === key;
          return (
            <React.Fragment key={key}>
              <button className={`sidebar-nav-item${isActive?' active':''}`} onClick={() => onTabChange(key)}>
                <Icon size={15} className="nav-icon" />
                {label}
                {count > 0 && (
                  <span style={{ marginLeft:'auto', fontSize:10, fontWeight:700, color:isActive?'var(--amber)':'var(--text-muted)', background:'var(--bg-overlay)', padding:'1px 7px', borderRadius:999 }}>{count}</span>
                )}
              </button>

              {key==='scenes' && isActive && scenes.length>0 && (
                <SubList items={scenes} activeId={activeSceneId} onSelect={onSceneSelect} accentColor="var(--amber)"
                  getLabel={(s,i) => { const t=s.title||`Scene ${i+1}`; return t.length>22?t.substring(0,22)+'…':t; }}
                  getStatus={(s) => s.status} />
              )}
              {key==='characters' && isActive && characters.length>0 && (
                <SubList items={characters} activeId={activeCharId} onSelect={onCharSelect} accentColor="var(--amber)"
                  getLabel={(c,i) => { const t=c.name||`Character ${i+1}`; return t.length>22?t.substring(0,22)+'…':t; }} />
              )}
              {key==='environments' && isActive && environments.length>0 && (
                <SubList items={environments} activeId={activeEnvId} onSelect={onEnvSelect} accentColor="var(--green)"
                  getLabel={(e,i) => { const t=e.name||`Environment ${i+1}`; return t.length>22?t.substring(0,22)+'…':t; }} />
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="divider" />

      <div className="sidebar-section-label">Sessions</div>
      <div style={{ flex:1, overflowY:'auto', paddingBottom:12 }}>
        {sessions.length===0 && (
          <p style={{ fontSize:11, color:'var(--text-muted)', padding:'6px 16px' }}>No sessions yet.</p>
        )}
        {sessions.map(s => (
          <SessionItem
            key={s.id}
            s={s}
            isActive={s.id === sessionId}
            onSelect={onSessionSelect}
            onRename={onSessionRename}
            onDelete={onSessionDelete}
          />
        ))}
      </div>
    </aside>
  );
}
