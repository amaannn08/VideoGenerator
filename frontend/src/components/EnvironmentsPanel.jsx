import React, { useState } from 'react';
import { MapPin, Sparkles, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();

function Spinner({ size = 14, color = 'border-indigo-600' }) {
  return <div style={{ width: size, height: size }} className={`rounded-full border-2 ${color} border-t-transparent animate-spin flex-shrink-0`} />;
}

export default function EnvironmentsPanel({ environments, onUpdate, script }) {
  const [open, setOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const envs = environments || [];

  const handleExtract = async () => {
    if (!script?.trim()) return alert('Paste your script first before extracting environments.');
    setExtracting(true);
    try {
      const r = await fetch(`${API}/api/extract/environments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onUpdate(d.environments || []);
    } catch (e) {
      alert(`Environment extraction failed: ${e.message}`);
    } finally {
      setExtracting(false);
    }
  };

  const updateEnv = (idx, field, value) => {
    const next = envs.map((e, i) => i === idx ? { ...e, [field]: value } : e);
    onUpdate(next);
  };

  const removeEnv = (idx) => onUpdate(envs.filter((_, i) => i !== idx));

  const addEnv = () => onUpdate([
    ...envs,
    { id: Math.random().toString(36).substr(2, 9), name: '', description: '', keyFeature: '' }
  ]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${envs.length > 0 ? 'bg-emerald-600' : 'bg-gray-200'}`}>
            <MapPin className={`w-4 h-4 ${envs.length > 0 ? 'text-white' : 'text-gray-400'}`} />
          </div>
          <span className="font-bold text-sm text-gray-800">
            Environments
            {envs.length > 0 && <span className="ml-1.5 text-xs font-semibold text-gray-400">({envs.length})</span>}
          </span>
          {envs.length === 0 && (
            <span className="text-[10px] text-gray-400 font-medium">Extract locations from script for better prompt grounding</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); handleExtract(); }}
            disabled={extracting}
            className="text-[11px] font-bold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            {extracting ? <Spinner size={11} color="border-white" /> : <Sparkles className="w-3 h-3" />}
            Extract from Script
          </button>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 space-y-3">
          {envs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              No environments yet. Click "Extract from Script" or add one manually.
            </p>
          )}

          {envs.map((env, idx) => (
            <div key={env.id || idx} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2 relative">
              <button
                onClick={() => removeEnv(idx)}
                className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-6">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-0.5 block">Name</label>
                  <input
                    value={env.name || ''}
                    onChange={e => updateEnv(idx, 'name', e.target.value)}
                    placeholder="e.g. Kalinga Battlefield"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-400 focus:border-transparent outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-0.5 block">Key Feature</label>
                  <input
                    value={env.keyFeature || ''}
                    onChange={e => updateEnv(idx, 'keyFeature', e.target.value)}
                    placeholder="e.g. blood-soaked red earth, grey overcast sky"
                    className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-400 focus:border-transparent outline-none bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-0.5 block">Description</label>
                <textarea
                  value={env.description || ''}
                  onChange={e => updateEnv(idx, 'description', e.target.value)}
                  rows={2}
                  placeholder="Atmospheric description: surface, weather, lighting, scale…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-400 focus:border-transparent outline-none resize-none bg-white"
                />
              </div>
            </div>
          ))}

          <button
            onClick={addEnv}
            className="w-full text-sm font-bold text-emerald-600 border-2 border-dashed border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50 px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Environment Manually
          </button>
        </div>
      )}
    </div>
  );
}
