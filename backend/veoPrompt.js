/**
 * Turns labeled video prompt blocks + structured dialogue into natural-language text for Veo.
 */

const BLOCK_LINE = /^([A-Z][A-Z0-9_]*):\s*(.*)$/;

export function parseVideoPromptBlocks(videoPrompt) {
  if (!videoPrompt || typeof videoPrompt !== 'string') return {};
  const blocks = {};
  for (const line of videoPrompt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = BLOCK_LINE.exec(trimmed);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (blocks[key]) blocks[key] = `${blocks[key]} ${val}`.trim();
    else blocks[key] = val;
  }
  return blocks;
}

function spokenLanguagePrefix(dlg) {
  const lang = (dlg.language || '').trim();
  if (!lang || /^english$/i.test(lang)) return '';
  return `The voice performance must be in ${lang} only — do not translate or dub into English. Natural native pronunciation and intonation. `;
}

/** Prefer script + roman guide for non-English when both exist (helps native-audio models). */
function dialogueQuotedLine(dlg) {
  const raw = (dlg.text || '').trim();
  const phon = (dlg.phonetic || '').trim();
  const lang = (dlg.language || '').trim();
  const nonEnglish = lang && !/^english$/i.test(lang);

  if (!raw && !phon) return null;
  if (nonEnglish && raw && phon && phon !== raw) {
    return `${raw} — romanized ${lang}: ${phon}`;
  }
  if (phon) return phon;
  return raw;
}

/**
 * Parses the labeled DIALOGUE block when structured dialogue JSON is missing.
 * Expected shape: `"script" | phonetic: "..." | mode: ...` or `None.`
 */
export function extractDialogueFromLabeledBlock(dialogueBlockVal) {
  if (!dialogueBlockVal || typeof dialogueBlockVal !== 'string') return null;
  const s = dialogueBlockVal.trim();
  if (!s || /^none\.?$/i.test(s)) return null;
  const main = /^\s*"((?:\\.|[^"\\])*)"/.exec(s);
  if (!main) return null;
  const text = main[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const phonM = /\|\s*phonetic:\s*"((?:\\.|[^"\\])*)"/i.exec(s);
  const phonetic = phonM ? phonM[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : '';
  return { text, phonetic: phonetic || undefined };
}

export function buildVeoDialogueLine(dialogue) {
  const dlg = dialogue || {};
  const text = dialogueQuotedLine(dlg);
  if (!text) return null;
  const tone = dlg.tone || 'calm and deliberate';
  const pacing = dlg.pacing || 'slow with natural pauses';
  const mode = dlg.mode === 'narration' ? 'narration' : 'character';
  const langLead = spokenLanguagePrefix(dlg);
  const verbatim =
    'Exact scripted wording only — reproduce the quoted text word-for-word in the same order with no paraphrase, synonym substitution, translation to another language, summary, extra sentences, or improvised dialogue. ';
  if (mode === 'narration') {
    return `${langLead}${verbatim}Voice-over narration, ${tone} delivery, ${pacing}: "${text}"`;
  }
  return `${langLead}${verbatim}The character speaks in a ${tone} voice, ${pacing}: "${text}"`;
}

export function assembleVeoPrompt(blocks, dialogue) {
  const parts = [];
  const character = blocks.CHARACTER || '';
  const actionStart = blocks.ACTION_START || '';
  const actionEnd = blocks.ACTION_END || '';
  const expressionArc = blocks.EXPRESSION_ARC || '';
  const camera = blocks.CAMERA || '';
  const environment = blocks.ENVIRONMENT || '';
  const lighting = blocks.LIGHTING || '';
  const negative = blocks.NEGATIVE || '';

  if (character) parts.push(character);
  if (actionStart && actionEnd) {
    parts.push(`${actionStart}, progressing to: ${actionEnd}`);
  } else if (actionStart) {
    parts.push(actionStart);
  }

  const dlgResolved =
    dialogue && ((dialogue.text || '').trim() || (dialogue.phonetic || '').trim())
      ? dialogue
      : extractDialogueFromLabeledBlock(blocks.DIALOGUE);
  const dialogueLine = buildVeoDialogueLine(dlgResolved);
  if (dialogueLine) {
    parts.push(`Sound and audio: ${dialogueLine}`);
    parts.push(
      'Treat the quoted dialogue as the sole authorized spoken script for this clip. Ignore any other suggested lines elsewhere in the prompt (action descriptions, characterization). Audible speech must match it exactly — same words, same order; ambient sound and music only as background, never replacing or rewriting the line.'
    );
  }

  if (camera) parts.push(`Cinematography: The camera ${camera}`);
  if (environment) parts.push(`Environment: ${environment}`);
  if (lighting) parts.push(`Lighting: ${lighting}`);

  parts.push('Style: Cinematic quality, realistic motion, depth of field, character always in sharp focus. No subtitles, no text, no captions.');

  if (negative) {
    parts.push(`Constraints: Avoid ${negative}.`);
  }

  return parts.filter(Boolean).join(' ');
}

export function toVeoPrompt(videoPromptString, dialogue) {
  const blocks = parseVideoPromptBlocks(videoPromptString);
  const hasCore =
    blocks.CHARACTER && blocks.ACTION_START && blocks.ACTION_END;
  if (!hasCore) return videoPromptString;
  return assembleVeoPrompt(blocks, dialogue);
}
