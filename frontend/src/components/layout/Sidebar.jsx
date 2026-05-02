import React from 'react';
import { User, MapPin, Film, FileText, ChevronRight, Cpu } from 'lucide-react';

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

export default function Sidebar({
  sessions, sessionId, activeTab, onTabChange, onSessionSelect,
  scenes = [], activeSceneId, onSceneSelect,
  characters = [], activeCharId, onCharSelect,
  environments = [], activeEnvId, onEnvSelect,
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

              {/* Scenes sub-list */}
              {key==='scenes' && isActive && scenes.length>0 && (
                <SubList
                  items={scenes} activeId={activeSceneId} onSelect={onSceneSelect}
                  accentColor="var(--amber)"
                  getLabel={(s,i) => { const t=s.title||`Scene ${i+1}`; return t.length>22?t.substring(0,22)+'…':t; }}
                  getStatus={(s) => s.status}
                />
              )}

              {/* Characters sub-list */}
              {key==='characters' && isActive && characters.length>0 && (
                <SubList
                  items={characters} activeId={activeCharId} onSelect={onCharSelect}
                  accentColor="var(--amber)"
                  getLabel={(c,i) => { const t=c.name||`Character ${i+1}`; return t.length>22?t.substring(0,22)+'…':t; }}
                />
              )}

              {/* Environments sub-list */}
              {key==='environments' && isActive && environments.length>0 && (
                <SubList
                  items={environments} activeId={activeEnvId} onSelect={onEnvSelect}
                  accentColor="var(--green)"
                  getLabel={(e,i) => { const t=e.name||`Environment ${i+1}`; return t.length>22?t.substring(0,22)+'…':t; }}
                />
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
        {sessions.map(s => {
          const label = s.narrative_arc ? s.narrative_arc.substring(0,38)+(s.narrative_arc.length>38?'…':'') : `Session ${s.id.substring(0,6)}`;
          return (
            <button key={s.id} className={`sidebar-session-pill${s.id===sessionId?' active':''}`} onClick={()=>onSessionSelect(s.id)} title={s.narrative_arc||s.id}>
              <span className="session-dot" />
              <span className="line-clamp-1" style={{fontSize:12}}>{label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

