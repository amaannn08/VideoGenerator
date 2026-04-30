import React from 'react';
import { User, MapPin, Film, FileText } from 'lucide-react';

const NAV = [
  { key: 'script',       label: 'Script',        Icon: FileText },
  { key: 'characters',   label: 'Characters',    Icon: User },
  { key: 'environments', label: 'Environments',  Icon: MapPin },
  { key: 'scenes',       label: 'Scenes',        Icon: Film },
];

export default function Sidebar({ sessions, sessionId, activeTab, onTabChange, onSessionSelect }) {
  return (
    <aside className="sidebar">
      {/* Pages nav — top */}
      <div className="sidebar-section-label">Pages</div>
      <nav style={{ paddingBottom: 8 }}>
        {NAV.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`sidebar-nav-item${activeTab === key ? ' active' : ''}`}
            onClick={() => onTabChange(key)}
          >
            <Icon size={15} className="nav-icon" />
            {label}
          </button>
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
