import React from 'react';
import { RotateCcw, Download, Merge, Film } from 'lucide-react';
import { Spinner } from './ui/primitives';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();
const getMediaUrl = (url) => url?.startsWith('http') ? url : `${API}${url}`;

export default function ReelView({ scenes, mergedVideo, setMergedVideo, merging, onMerge, refreshMediaUrl }) {
  const allDone = scenes.length > 0 && scenes.every(s => Boolean(s.videoUrl));
  const videoCount = scenes.filter(s => s.videoUrl).length;

  return (
    <div className="animate-fade-up" style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="step-badge">3</span>
        <h2 className="section-title">Final Reel</h2>
      </div>

      {/* Status */}
      <div className="surface" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <Film size={18} style={{ color: 'var(--amber)', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 3 }}>
            {allDone
              ? `${videoCount} scene${videoCount !== 1 ? 's' : ''} ready to merge`
              : `${videoCount} of ${scenes.length} scenes have video`}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {allDone
              ? 'All scenes complete — click Merge & Export to generate your final reel.'
              : 'Generate the remaining scene videos before merging.'}
          </p>
        </div>
      </div>

      {/* Merge action */}
      {!mergedVideo ? (
        <button
          className="btn btn-amber"
          onClick={onMerge}
          disabled={merging || !allDone}
          style={{ padding: '13px 28px', fontSize: 15, fontWeight: 700, alignSelf: 'flex-start' }}
        >
          {merging
            ? <><Spinner size={15} color="border-[#080910]" /> Merging scenes…</>
            : <><Merge size={16} /> Merge &amp; Export Reel</>}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Video player */}
          <div style={{
            background: '#000',
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid var(--border-default)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          }}>
            <video
              src={getMediaUrl(mergedVideo)}
              onError={async () => {
                const fresh = await refreshMediaUrl(mergedVideo);
                if (fresh && fresh !== mergedVideo) setMergedVideo(fresh);
              }}
              controls
              autoPlay
              style={{ width: '100%', display: 'block', maxHeight: 480 }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a
              href={getMediaUrl(mergedVideo)}
              download
              className="btn btn-amber"
              style={{ textDecoration: 'none' }}
            >
              <Download size={15} /> Download MP4
            </a>
            <button
              className="btn btn-outline"
              onClick={onMerge}
              disabled={merging}
            >
              {merging
                ? <><Spinner size={13} /> Re-merging…</>
                : <><RotateCcw size={13} /> Re-Merge</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
