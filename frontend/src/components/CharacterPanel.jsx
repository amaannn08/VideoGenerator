import React, { useState } from 'react';
import { User, Sparkles, Image as ImageIcon, X, ChevronDown, ChevronUp } from 'lucide-react';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();

function Spinner({ size = 14, color = 'border-indigo-600' }) {
  return <div style={{ width: size, height: size }} className={`rounded-full border-2 ${color} border-t-transparent animate-spin flex-shrink-0`} />;
}

export default function CharacterPanel({ character, onUpdate, script }) {
  const [open, setOpen] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [generatingRef, setGeneratingRef] = useState(false);

  const char = character || { name: '', description: '', keyFeature: '', referenceImageUrl: null };

  const update = (field, value) => onUpdate({ ...char, [field]: value });

  const handleExtract = async () => {
    if (!script?.trim()) return alert('Paste your script first before extracting character.');
    setExtracting(true);
    try {
      const r = await fetch(`${API}/api/extract/character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onUpdate({ ...char, ...d.character });
    } catch (e) {
      alert(`Character extraction failed: ${e.message}`);
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerateRefImage = async () => {
    if (!char.description) return alert('Add a character description first.');
    setGeneratingRef(true);
    try {
      const r = await fetch(`${API}/api/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePrompt: `CHARACTER: ${char.description}\nCHARACTER_KEY_FEATURE: ${char.keyFeature}\nACTION: Standing still, facing camera, neutral expression, clear reference pose\nEXPRESSION: Neutral, eyes open, mouth closed\nPOSTURE: Upright, arms at sides\nENVIRONMENT: Plain dark background, no distractions\nLIGHTING: Soft diffused front lighting, even illumination\nCAMERA: Medium portrait shot, centered in 9:16 frame\nSTYLE: portrait composition (9:16), cinematic, ultra realistic, 4k, character in sharp focus`,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onUpdate({ ...char, referenceImageUrl: d.imageUrl });
    } catch (e) {
      alert(`Reference image generation failed: ${e.message}`);
    } finally {
      setGeneratingRef(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${char.name || char.description ? 'bg-indigo-600' : 'bg-gray-200'}`}>
            <User className={`w-4 h-4 ${char.name || char.description ? 'text-white' : 'text-gray-400'}`} />
          </div>
          <span className="font-bold text-sm text-gray-800">
            Character {char.name ? `— ${char.name}` : ''}
          </span>
          {char.keyFeature && (
            <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full hidden sm:block truncate max-w-[200px]">
              {char.keyFeature}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); handleExtract(); }}
            disabled={extracting}
            className="text-[11px] font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            {extracting ? <Spinner size={11} color="border-white" /> : <Sparkles className="w-3 h-3" />}
            Extract from Script
          </button>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 grid grid-cols-1 lg:grid-cols-[1fr_160px] gap-4">
          {/* Fields */}
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-1 block">Name</label>
              <input
                value={char.name || ''}
                onChange={e => update('name', e.target.value)}
                placeholder="e.g. Ashoka"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-1 block">
                Physical Description
                <span className="ml-1 text-gray-400 normal-case font-normal">(copy-pasted verbatim into every prompt)</span>
              </label>
              <textarea
                value={char.description || ''}
                onChange={e => update('description', e.target.value)}
                rows={4}
                placeholder="Full physical description: skin tone, build, age, exact attire, hair, distinguishing features…"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none resize-none leading-relaxed"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-1 block">
                Key Feature
                <span className="ml-1 text-gray-400 normal-case font-normal">(5–10 words, most visually identifying detail)</span>
              </label>
              <input
                value={char.keyFeature || ''}
                onChange={e => update('keyFeature', e.target.value)}
                placeholder="e.g. deep battle scar across left jaw, hollow dark eyes"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Reference Image */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest block">Reference Image</label>
            <div className="flex-1 border-2 border-dashed border-indigo-200 rounded-xl overflow-hidden flex items-center justify-center bg-indigo-50/30 min-h-[120px] relative">
              {char.referenceImageUrl ? (
                <>
                  <img src={char.referenceImageUrl} alt="Character reference" className="w-full h-full object-cover" />
                  <button
                    onClick={() => update('referenceImageUrl', null)}
                    className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <div className="text-center p-3">
                  <ImageIcon className="w-6 h-6 text-indigo-300 mx-auto mb-1" />
                  <p className="text-[10px] text-gray-400">No reference image</p>
                </div>
              )}
            </div>
            <button
              onClick={handleGenerateRefImage}
              disabled={generatingRef || !char.description}
              className="text-[11px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1.5 rounded-lg hover:bg-indigo-100 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
            >
              {generatingRef ? <Spinner size={11} color="border-indigo-600" /> : <Sparkles className="w-3 h-3" />}
              Generate Ref Image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
