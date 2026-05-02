import React, { useState } from 'react';
import { Check, Zap, Clock, Image as ImageIcon, Film, Volume2, VolumeX, Layers, Star } from 'lucide-react';
import { FAL_IMAGE_MODELS, FAL_VIDEO_MODELS } from '../falModels';

const SPEED_META = {
  fast:   { label: 'Fast',   color: '#22c55e',  bg: 'rgba(34,197,94,0.12)' },
  medium: { label: 'Medium', color: '#f5a623',  bg: 'rgba(245,166,35,0.12)' },
  slow:   { label: 'Slow',   color: '#3b82f6',  bg: 'rgba(59,130,246,0.12)' },
};

function Tag({ children, color = 'var(--text-muted)', bg = 'var(--bg-overlay)' }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 999, color, background: bg, border: `1px solid ${color}22`,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function SpeedBadge({ speed }) {
  const meta = SPEED_META[speed] || SPEED_META.medium;
  const Icon = speed === 'fast' ? Zap : Clock;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 999, color: meta.color, background: meta.bg,
    }}>
      <Icon size={9} strokeWidth={2.5} />{meta.label}
    </span>
  );
}

function ModelCard({ model, isSelected, onSelect, type }) {
  const [hovered, setHovered] = useState(false);

  const border = isSelected
    ? '1.5px solid var(--amber)'
    : hovered
    ? '1.5px solid var(--border-strong)'
    : '1.5px solid var(--border-subtle)';

  const glow = isSelected
    ? '0 0 24px rgba(245,166,35,0.15), 0 4px 16px rgba(0,0,0,0.3)'
    : hovered
    ? '0 4px 16px rgba(0,0,0,0.25)'
    : '0 2px 8px rgba(0,0,0,0.2)';

  return (
    <button
      onClick={() => onSelect(model.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: isSelected ? 'rgba(245,166,35,0.06)' : hovered ? 'var(--bg-raised)' : 'var(--bg-surface)',
        border, borderRadius: 14, padding: '16px 18px',
        boxShadow: glow, transition: 'all 0.18s ease',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {/* Selection indicator */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        width: 20, height: 20, borderRadius: '50%',
        background: isSelected ? 'var(--amber)' : 'var(--bg-overlay)',
        border: isSelected ? 'none' : '1.5px solid var(--border-default)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.18s ease',
        boxShadow: isSelected ? '0 0 10px rgba(245,166,35,0.4)' : 'none',
      }}>
        {isSelected && <Check size={11} color="#0a0b0f" strokeWidth={3} />}
      </div>

      {/* Header */}
      <div style={{ paddingRight: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14,
            color: isSelected ? 'var(--amber)' : 'var(--text-primary)',
            transition: 'color 0.15s',
          }}>
            {model.label}
          </span>
          {model.recommended && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 999,
              color: '#0a0b0f', background: 'var(--amber)',
            }}>
              <Star size={8} strokeWidth={3} /> Default
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
          {model.sublabel}
        </p>
      </div>

      {/* Capabilities */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <SpeedBadge speed={model.speed} />
        {model.supportsRef && (
          <Tag color="#6366f1" bg="rgba(99,102,241,0.12)">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Layers size={8} /> Ref Image
            </span>
          </Tag>
        )}
        {model.supportsI2V && (
          <Tag color="#6366f1" bg="rgba(99,102,241,0.12)">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <ImageIcon size={8} /> Img-to-Vid
            </span>
          </Tag>
        )}
        {type === 'video' && (
          model.hasAudio
            ? <Tag color="#22c55e" bg="rgba(34,197,94,0.12)"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Volume2 size={8} /> Audio</span></Tag>
            : <Tag color="var(--text-muted)" bg="var(--bg-overlay)"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><VolumeX size={8} /> No Audio</span></Tag>
        )}
        {model.tags?.filter(t => !['fast', 'reference'].includes(t)).map(t => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
    </button>
  );
}

export default function ModelsPage({ imageModelId, videoModelId, onImageModelChange, onVideoModelChange }) {
  return (
    <div style={{ width: '100%' }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 800,
          color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 8,
        }}>
          AI Model Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 560 }}>
          Choose the default models for image and video generation across all scenes.
          Your selection is saved automatically and used in both manual generation and the auto-run pipeline.
        </p>
      </div>

      {/* ── Image Models ──────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 48 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 16, paddingBottom: 12,
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ImageIcon size={15} color="#818cf8" />
          </div>
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>
              Image Generation
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              Used for storyboard frames — one per scene
            </p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span style={{
              fontSize: 11, color: 'var(--amber)', fontWeight: 600,
              background: 'var(--amber-glow)', padding: '4px 10px', borderRadius: 8,
              border: '1px solid rgba(245,166,35,0.2)',
            }}>
              {FAL_IMAGE_MODELS.find(m => m.id === imageModelId)?.label || 'Nano Banana 2'}
            </span>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
          gap: 16,
        }}>
          {FAL_IMAGE_MODELS.map(model => (
            <ModelCard
              key={model.id}
              model={model}
              type="image"
              isSelected={imageModelId === model.id}
              onSelect={onImageModelChange}
            />
          ))}
        </div>
      </section>

      {/* ── Video Models ──────────────────────────────────────────────────────── */}
      <section>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 16, paddingBottom: 12,
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: 'rgba(245,166,35,0.12)',
            border: '1px solid rgba(245,166,35,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Film size={15} color="var(--amber)" />
          </div>
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', margin: 0 }}>
              Video Generation
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              Used for animating scenes — image-to-video when a frame is available
            </p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span style={{
              fontSize: 11, color: 'var(--amber)', fontWeight: 600,
              background: 'var(--amber-glow)', padding: '4px 10px', borderRadius: 8,
              border: '1px solid rgba(245,166,35,0.2)',
            }}>
              {FAL_VIDEO_MODELS.find(m => m.id === videoModelId)?.label || 'Veo 3.1'}
            </span>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
          gap: 16,
        }}>
          {FAL_VIDEO_MODELS.map(model => (
            <ModelCard
              key={model.id}
              model={model}
              type="video"
              isSelected={videoModelId === model.id}
              onSelect={onVideoModelChange}
            />
          ))}
        </div>
      </section>

      {/* Footer info */}
      <div style={{
        marginTop: 40, padding: '14px 18px', borderRadius: 12,
        background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Check size={14} color="var(--green)" strokeWidth={2.5} />
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          Changes are saved instantly to your browser and applied to all future generations in this session.
          The auto-run pipeline will also use your selected models.
        </p>
      </div>
    </div>
  );
}
