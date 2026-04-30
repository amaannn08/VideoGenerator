import React from 'react';
import { User, MapPin, Film, FileText, ChevronRight } from 'lucide-react';

const NAV = [
  { key: 'script',       label: 'Script',        Icon: FileText },
  { key: 'characters',   label: 'Characters',    Icon: User },
  { key: 'environments', label: 'Environments',  Icon: MapPin },
  { key: 'scenes',       label: 'Scenes',        Icon: Film },
];

const STATUS_DOT = {
  video_done:   'var(--green)',
  image_done:   'var(--blue)',
  image_generating: 'var(--amber)',
  video_generating: 'var(--amber)',
  draft:        'var(--text-muted)',
};

export default function Sidebar({
  sessions, sessionId, activeTab, onTabChange, onSessionSelect,
  scenes = [], activeSceneId, onSceneSelect,
}) {
  return (
    <aside className="sidebar">
      {/* Pages nav — top */}
      <div className="sidebar-section-label">Pages</div>
      <nav style={{ paddingBottom: 4 }}>
        {NAV.map(({ key, label, Icon }) => (
          <React.Fragment key={key}>
            <button
              className={`sidebar-nav-item${activeTab === key ? ' active' : ''}`}
              onClick={() => onTabChange(key)}
            >
              <Icon size={15} className="nav-icon" />
              {label}
              {key === 'scenes' && scenes.length > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: activeTab === 'scenes' ? 'var(--amber)' : 'var(--text-muted)', background: 'var(--bg-overlay)', padding: '1px 7px', borderRadius: 999 }}>
                  {scenes.length}
                </span>
              )}
            </button>

            {/* Scene sub-list — shown when Scenes tab is active */}
            {key === 'scenes' && activeTab === 'scenes' && scenes.length > 0 && (
              <div style={{ paddingLeft: 8, paddingBottom: 4 }}>
                {scenes.map((scene, i) => {
                  const isActive = activeSceneId === scene.id;
                  const dotColor = STATUS_DOT[scene.status] || 'var(--text-muted)';
                  const label = scene.title
                    ? scene.title.length > 22 ? scene.title.substring(0, 22) + '…' : scene.title
                    : `Scene ${i + 1}`;
                  return (
                    <button
                      key={scene.id}
                      onClick={() => onSceneSelect(isActive ? null : scene.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '6px 10px',
                        marginBottom: 1,
                        borderRadius: 7,
                        border: 'none',
                        background: isActive ? 'var(--amber-glow)' : 'transparent',
                        color: isActive ? 'var(--amber)' : 'var(--text-muted)',
                        fontSize: 12,
                        fontWeight: isActive ? 600 : 400,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                      onMouseOver={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-raised)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                      onMouseOut={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                    >
                      {/* Status dot */}
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{label}</span>
                      {isActive && <ChevronRight size={11} style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="divider" />

      {/* Sessions — scrollable */}
      <div className="sidebar-section-label">Sessions</div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
        {sessions.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 16px' }}>
            No sessions yet.
          </p>
        )}
        {sessions.map(s => {
          const label = s.narrative_arc
            ? s.narrative_arc.substring(0, 38) + (s.narrative_arc.length > 38 ? '…' : '')
            : `Session ${s.id.substring(0, 6)}`;
          return (
            <button
              key={s.id}
              className={`sidebar-session-pill${s.id === sessionId ? ' active' : ''}`}
              onClick={() => onSessionSelect(s.id)}
              title={s.narrative_arc || s.id}
            >
              <span className="session-dot" />
              <span className="line-clamp-1" style={{ fontSize: 12 }}>{label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
