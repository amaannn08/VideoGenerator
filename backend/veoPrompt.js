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

export function buildVeoDialogueLine(dialogue) {
  const dlg = dialogue || {};
  const raw = (dlg.text || '').trim();
  if (!raw) return null;
  const text = (dlg.phonetic || '').trim() || raw;
  const tone = dlg.tone || 'calm and deliberate';
  const pacing = dlg.pacing || 'slow with natural pauses';
  const mode = dlg.mode === 'narration' ? 'narration' : 'character';
  if (mode === 'narration') {
    return `Voice-over narration, ${tone} delivery, ${pacing}: "${text}"`;
  }
  return `The character speaks in a ${tone} voice, ${pacing}: "${text}"`;
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

  const dialogueLine = buildVeoDialogueLine(dialogue);
  if (dialogueLine) {
    parts.push(dialogueLine);
  } else {
    parts.push(
      `The character remains silent — all emotion conveyed through ${expressionArc || 'subtle expression and posture'}`
    );
  }

  if (camera) parts.push(`The camera ${camera}`);
  if (environment) parts.push(environment);
  if (lighting) parts.push(lighting);

  parts.push('No subtitles. No text overlay. No captions.');
  parts.push(
    'Cinematic quality, realistic motion, depth of field, character always in sharp focus.'
  );

  if (negative) {
    parts.push(`Avoid or exclude: ${negative}.`);
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
