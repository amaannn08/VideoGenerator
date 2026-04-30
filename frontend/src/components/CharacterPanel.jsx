import React, { useState } from 'react';
import { User, Sparkles, Image as ImageIcon, X, ChevronDown, ChevronUp, Plus, Crown } from 'lucide-react';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').trim();

function Spinner({ size = 14, color = 'border-indigo-600' }) {
  return <div style={{ width: size, height: size }} className={`rounded-full border-2 ${color} border-t-transparent animate-spin flex-shrink-0`} />;
}

const createCharacter = () => ({
  id: Math.random().toString(36).substr(2, 9),
  name: '',
  description: '',
  keyFeature: '',
  referenceImageUrl: null,
});

export default function CharacterPanel({ characters, onUpdate, script, primaryCharacterId, onSetPrimary }) {
  const [open, setOpen] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [generatingRefId, setGeneratingRefId] = useState('');
  const chars = characters || [];

  const updateChar = (idx, field, value) => {
    const next = chars.map((c, i) => (i === idx ? { ...c, [field]: value } : c));
    onUpdate(next);
  };

  const removeChar = (idx) => {
    const removed = chars[idx];
    const next = chars.filter((_, i) => i !== idx);
    onUpdate(next);
    if (removed?.id === primaryCharacterId) onSetPrimary(next[0]?.id || '');
  };

  const addChar = () => {
    const next = [...chars, createCharacter()];
    onUpdate(next);
    if (!primaryCharacterId && next[0]) onSetPrimary(next[0].id);
  };

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
      const extracted = Array.isArray(d.characters)
        ? d.characters
        : d.character
          ? [d.character]
          : [];
      const normalized = extracted
        .filter(c => c && typeof c === 'object')
        .map((c, idx) => ({
          id: c.id || `char_${idx + 1}`,
          name: c.name || '',
          description: c.description || '',
          keyFeature: c.keyFeature || '',
          referenceImageUrl: c.referenceImageUrl || null,
        }))
        .filter(c => c.name || c.description || c.keyFeature);
      onUpdate(normalized);
      onSetPrimary(normalized[0]?.id || '');
    } catch (e) {
      alert(`Character extraction failed: ${e.message}`);
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerateRefImage = async (char) => {
    if (!char.description) return alert('Add a character description first.');
    setGeneratingRefId(char.id);
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
      onUpdate(chars.map((c) => (c.id === char.id ? { ...c, referenceImageUrl: d.imageUrl } : c)));
    } catch (e) {
      alert(`Reference image generation failed: ${e.message}`);
    } finally {
      setGeneratingRefId('');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${chars.length ? 'bg-indigo-600' : 'bg-gray-200'}`}>
            <User className={`w-4 h-4 ${chars.length ? 'text-white' : 'text-gray-400'}`} />
          </div>
          <span className="font-bold text-sm text-gray-800">
            Characters
            {chars.length > 0 && <span className="ml-1.5 text-xs font-semibold text-gray-400">({chars.length})</span>}
          </span>
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
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 space-y-3">
          {chars.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              No characters yet. Click "Extract from Script" or add one manually.
            </p>
          )}

          {chars.map((char, idx) => (
            <div key={char.id || idx} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3 relative">
              <button
                onClick={() => removeChar(idx)}
                className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>

              <div className="flex items-center gap-2 pr-6">
                <button
                  onClick={() => onSetPrimary(char.id)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1 ${
                    primaryCharacterId === char.id
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-amber-200 hover:text-amber-600'
                  }`}
                >
                  <Crown className="w-3 h-3" />
                  {primaryCharacterId === char.id ? 'Primary' : 'Set Primary'}
                </button>
                <span className="text-xs text-gray-500 font-medium">Character {idx + 1}</span>
              </div>

              <div>
                <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-1 block">Name</label>
                <input
                  value={char.name || ''}
                  onChange={e => updateChar(idx, 'name', e.target.value)}
                  placeholder="e.g. Ashoka"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-1 block">
                  Physical Description
                </label>
                <textarea
                  value={char.description || ''}
                  onChange={e => updateChar(idx, 'description', e.target.value)}
                  rows={3}
                  placeholder="Full physical description: skin tone, build, age, exact attire, hair, distinguishing features…"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none resize-none leading-relaxed bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-1 block">
                  Key Feature
                </label>
                <input
                  value={char.keyFeature || ''}
                  onChange={e => updateChar(idx, 'keyFeature', e.target.value)}
                  placeholder="e.g. deep battle scar across left jaw, hollow dark eyes"
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none bg-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-indigo-800 uppercase tracking-widest block">Reference Image</label>
                <div className="border-2 border-dashed border-indigo-200 rounded-xl overflow-hidden flex items-center justify-center bg-indigo-50/30 min-h-[120px] relative">
                  {char.referenceImageUrl ? (
                    <>
                      <img src={char.referenceImageUrl} alt="Character reference" className="w-full h-full object-cover" />
                      <button
                        onClick={() => updateChar(idx, 'referenceImageUrl', null)}
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
                  onClick={() => handleGenerateRefImage(char)}
                  disabled={generatingRefId === char.id || !char.description}
                  className="text-[11px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1.5 rounded-lg hover:bg-indigo-100 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                >
                  {generatingRefId === char.id ? <Spinner size={11} color="border-indigo-600" /> : <Sparkles className="w-3 h-3" />}
                  Generate Ref Image
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addChar}
            className="w-full text-sm font-bold text-indigo-600 border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Character Manually
          </button>
        </div>
      )}
    </div>
  );
}
