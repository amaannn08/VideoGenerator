import React from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { Spinner } from '../ui/primitives';

const STAGES = [
  { key: 'script',       label: 'Script' },
  { key: 'image_prompt', label: 'Img Prompts' },
  { key: 'image',        label: 'Images' },
  { key: 'video_prompt', label: 'Vid Prompts' },
  { key: 'video',        label: 'Videos' },
  { key: 'merge',        label: 'Merged' },
];

export default function PipelineBar({ activeStage, isRunning }) {
  const order = STAGES.map(s => s.key);
  const activeIdx = order.indexOf(activeStage);

  return (
    <div className="pipeline-bar">
      {STAGES.map((s, i) => {
        const thisIdx = order.indexOf(s.key);
        const done   = thisIdx < activeIdx || (thisIdx === activeIdx && activeStage === 'merge');
        const active = thisIdx === activeIdx && activeStage !== 'merge';
        return (
          <React.Fragment key={s.key}>
            <div className={`pipeline-stage ${done ? 'done' : active ? 'active' : 'idle'}`}>
              {done
                ? <Check size={10} strokeWidth={3} />
                : active && isRunning
                  ? <Spinner size={10} color="border-[var(--amber)]" />
                  : null}
              {s.label}
            </div>
            {i < STAGES.length - 1 && (
              <ArrowRight size={11} style={{ color: done ? 'var(--green)' : 'var(--text-muted)', flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
