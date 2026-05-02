// ─────────────────────────────────────────────────────────────────────────────
// SHARED STYLE ANCHORS
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_QUALITY_TAIL = `portrait composition (9:16), cinematic, ultra realistic, 4k, volumetric lighting, extreme shallow depth of field, character in sharp focus, background blurred, film still`;

const VIDEO_QUALITY_TAIL = `cinematic quality, realistic motion, depth of field, character always in sharp focus. No subtitles. No text overlay. No captions. No watermark.`;

// ─────────────────────────────────────────────────────────────────────────────
// SCENE SPLITTER PROMPT (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function getSceneSplitPrompt(script, sceneCount = 0) {
  const countInstruction = sceneCount && sceneCount > 0
    ? `Your job is to break the script into exactly ${sceneCount} scenes`
    : `Your job is to break the script into as many scenes as you think is necessary (usually 3 to 6)`;

  return `You are a cinematic director adapting a written script into a short-form vertical video (9:16 portrait). 
${countInstruction} that form a CONTINUOUS, EMOTIONALLY LINKED narrative — like scenes in a film, not random clips.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Each scene must represent exactly 4, 6, or 8 seconds of screen time.
2. EXTRACT DIALOGUE DIRECTLY from the script — do not invent lines. If the script has spoken words, they belong in the "dialogue.text" field verbatim. IMPORTANT: If the dialogue is in Hindi or Hinglish, you MUST write the dialogue in the Devanagari script (e.g., 'नमस्ते' instead of 'namaste') in the "dialogue.text" field for records and TTS. Additionally: if dialogue.language is Hindi or Sanskrit, populate "dialogue.phonetic" with a clean romanized transliteration of dialogue.text for English-first video generation (e.g. dialogue.text = "यह युद्ध नहीं, यह अंत है।" → dialogue.phonetic = "Yeh yudh nahin, yeh ant hai."). Leave phonetic empty string when dialogue.text is empty or when language is English/Latin script only.
3. Maintain VISUAL CONTINUITY: describe how each scene flows from the previous one. The character must look identical in all scenes (same face, same attire, same build).
4. The "character" field is the SINGLE SOURCE OF TRUTH for the character's appearance — it will be copy-pasted into every image and video prompt. Make it extremely detailed.
5. "narrativeArc" is a one-sentence summary of the entire emotional journey across ALL scenes combined.
6. "transitionFrom" describes what the character has JUST experienced before this scene starts (empty string for scene 1).
7. "transitionTo" describes what emotionally carries forward INTO the next scene (empty string for last scene).
8. "emotionalTone" must be precise — not just "sad" but "quiet devastation and shock, eyes hollow, jaw tight".
9. "cameraWork" should be one of: "slow push-in", "static wide", "tracking shot from side-back angle", "extreme close-up static", "crane down", "handheld with tension shake".
10. "dialogue.tone" must be one of: "commanding and calm", "heavy and burdened", "whisper-like and introspective", "broken and raw", "quiet and resolute".
11. "dialogue.pacing" describes delivery rhythm: e.g. "slow with long pauses between words", "clipped and intense", "breathless", "each word deliberate".
12. "dialogue.mode" MUST be either "character" (on-screen character speaks — default) or "narration" (voice-over / omniscient narrator, not lip-synced to a single visible speaker). Use "narration" when the script is clearly voice-over or narrator address; use "character" for an in-scene speaker; if ambiguous, use "character".
13. dialogue.text (and dialogue.phonetic when present) must be speakable in under ~6 seconds — maximum 12 words total. If the script line is longer, truncate to the single most emotionally essential phrase. Do NOT split one spoken line across multiple scenes.
14. BE EXTREMELY DESCRIPTIVE: Write vivid, highly detailed, and cinematic descriptions for 'summary', 'location', and 'emotionalTone'. Use sensory details and dense atmospheric language.

Output ONLY a valid JSON object. No markdown fences, no explanation, no extra text.

{
  "character": "Full physical description: skin tone, build, approximate age, exact attire (fabric, color, condition — e.g. 'simple undyed Mauryan dhoti, bare torso with a worn shawl draped over left shoulder, no crown, slightly dusty fabric'), hair, any distinguishing features. This exact text MUST appear in every image and video prompt verbatim.",
  "narrativeArc": "One sentence describing the full emotional journey from scene 1 to the final scene.",
  "scenes": [
    {
      "id": "scene_1",
      "title": "Short cinematic title (4–6 words max)",
      "summary": "Vivid, highly descriptive, and cinematic explanation of what physically happens in this scene. Describe actions, movement, and atmospheric interaction in dense detail. No dialogue.",
      "emotionalTone": "Extremely detailed emotional state of the character — describe their internal experience, micro-expressions, posture, and exactly how the emotion manifests physically (e.g., 'quiet devastation, eyes hollow and unblinking, jaw tightly clenched, shoulders slumped under an invisible weight').",
      "location": "Highly descriptive and immersive visual setting. Include atmospheric details like lighting, weather, dust, shadows, and surrounding elements.",
      "timeOfDay": "e.g. golden hour dusk, overcast post-battle morning",
      "duration": 8,
      "dialogue": {
        "text": "The exact spoken line extracted from the script. If no dialogue in this scene, use empty string.",
        "phonetic": "Romanized transliteration for Hindi/Sanskrit Devanagari lines; empty string if not applicable.",
        "language": "e.g. Hindi, English, Sanskrit",
        "mode": "character",
        "tone": "commanding and calm",
        "pacing": "slow with deliberate pauses"
      },
      "cameraWork": "slow push-in",
      "transitionFrom": "",
      "transitionTo": "Brief description of what emotional state/image carries into scene 2"
    }
  ]
}

SCRIPT TO ADAPT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${script}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER EXTRACTION PROMPT
// ─────────────────────────────────────────────────────────────────────────────

function getCharacterExtractPrompt(script) {
  return `You are a casting director and visual development artist. Read the script below and extract all DISTINCT characters who appear in the story.

Rules:
1. Return an array called "characters".
2. Include only unique characters (no duplicates).
3. "name" — the character's name as written in the script. If unknown, infer a short role label.
4. "description" — full physical description: skin tone, build, approximate age, exact attire with fabric/color/condition, hair, and any distinguishing features. Write this as a dense, single paragraph that can be copy-pasted verbatim into an image generation prompt.
5. "keyFeature" — ONE visually identifying phrase, 5–10 words max, that makes this character instantly recognisable across frames. This must be a specific physical detail, NOT an emotion. Examples: "deep battle scar across left jaw, hollow dark eyes" / "silver-streaked long hair, worn monk's robes". Do NOT use personality traits or emotional states.
6. If only one clear character exists, return a one-item array.

Output ONLY valid JSON. No markdown, no explanation.
{
  "characters": [
    {
      "name": "...",
      "description": "...",
      "keyFeature": "..."
    }
  ]
}

SCRIPT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${script}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT EXTRACTION PROMPT
// ─────────────────────────────────────────────────────────────────────────────

function getEnvironmentExtractPrompt(script) {
  return `You are a production designer. Read the script below and extract all distinct LOCATIONS / ENVIRONMENTS.

Rules:
1. Each environment must be a real physical place mentioned or implied in the script.
2. "name" — short location name (e.g. "Kalinga Battlefield", "Royal Throne Room").
3. "description" — 2–3 sentence atmospheric description: surface material, weather, lighting conditions, surrounding elements, scale.
4. "keyFeature" — ONE phrase (5–10 words) that is the single most visually distinctive atmospheric detail of this location. Examples: "blood-soaked red earth under grey overcast sky" / "torch-lit stone columns casting long shadows". Must be a visual fact, NOT an emotion.

Output ONLY valid JSON. No markdown, no explanation.
{
  "environments": [
    {
      "id": "env_1",
      "name": "...",
      "description": "...",
      "keyFeature": "..."
    }
  ]
}

SCRIPT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${script}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE PROMPT GENERATOR — Structured Block Format
// ─────────────────────────────────────────────────────────────────────────────

function getImagePromptGenerationPrompt(scene, character, previousSceneImageDesc, sceneIndex, totalScenes, customInstruction, environment) {
  // character can be object { name, description, keyFeature } or legacy string
  const charDescription = typeof character === 'object' ? (character.description || '') : (character || '');
  const charKeyFeature = typeof character === 'object' ? (character.keyFeature || '') : '';
  const envKeyFeature = environment?.keyFeature || scene.location || '';

  const dlg = scene.dialogue || {};
  const dialogueText = (dlg.text || scene.dialogueText || '').trim();
  const dialogueTone = dlg.tone || scene.dialogueTone || 'calm and deliberate';
  const dialoguePacing = dlg.pacing || scene.dialoguePacing || 'slow with natural pauses';
  const dialogueLang = dlg.language || 'Hindi';
  const dialoguePhonetic = (dlg.phonetic || '').trim();
  const dialogueMode = dlg.mode === 'narration' ? 'narration' : 'character';
  const hasDialogueLine = dialogueText.length > 0;
  const showDialogueInputs =
    hasDialogueLine || dialoguePhonetic.length > 0 || dlg.mode === 'narration';

  let dialogueInputsBlock = '';
  if (showDialogueInputs) {
    dialogueInputsBlock = `
Dialogue (for facial expression reference — never render subtitles or readable text in the image):
Spoken line: ${hasDialogueLine ? `"${dialogueText}"` : '(none)'}
Language: ${dialogueLang}
Mode: ${dialogueMode}${dialogueMode === 'narration' ? ' (voice-over — on-screen character may appear silent or listening)' : ' (on-screen speech — mouth and jaw suitable for speaking this moment)'}
Tone: ${dialogueTone}
Pacing: ${dialoguePacing}${dialoguePhonetic ? `\nRomanized reference (for downstream video/audio): ${dialoguePhonetic}` : ''}`;
  }

  let expressionGuidance = '';
  if (hasDialogueLine && dialogueMode === 'character') {
    expressionGuidance = `Expression hint: the character is delivering this line — set EXPRESSION with mouth and jaw appropriate for speech at this intensity (${dialogueTone}), consistent with the moment; never add readable text or captions in the frame.`;
  } else if (dialogueMode === 'narration' && hasDialogueLine) {
    expressionGuidance = `Expression hint: voice-over / narration — keep the character's mouth neutral, softly closed, or listening; do not show active lip-sync speaking unless Action explicitly requires speech on camera. Match emotional tone "${scene.emotionalTone}" through eyes and brow.`;
  } else if (dialogueMode === 'narration' && !hasDialogueLine) {
    expressionGuidance = `Expression hint: narration mode — prefer neutral mouth or reflective stillness unless Action contradicts.`;
  }

  const isFirstScene = sceneIndex === 0;
  const continuityNote = isFirstScene
    ? `This is scene 1 of ${totalScenes}. Establish the character clearly from scratch.`
    : `This is scene ${sceneIndex + 1} of ${totalScenes}. The character's face, skin tone, build, and attire MUST be identical to the previous scene. Only expression, posture, and environment differ.`;

  return `You are a cinematic image prompt engineer for AI image generators (Gemini, Flux, DALL-E, Stable Diffusion). You produce prompts for 9:16 portrait film stills.

⚠️ CONTENT POLICY — MANDATORY:
- NEVER use any real person's name, historical figure's name, or celebrity name in the output.
- ALWAYS describe the character by physical appearance only (e.g. "a battle-worn ancient warrior king").
- This rule is non-negotiable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE INPUTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scene: ${scene.title || `Scene ${sceneIndex + 1}`}
Action: ${scene.summary}
Location: ${scene.location}
Time of Day: ${scene.timeOfDay}
Emotional Tone: ${scene.emotionalTone}
Camera Work: ${scene.cameraWork}${dialogueInputsBlock}
${previousSceneImageDesc ? `Previous Scene Visual: ${previousSceneImageDesc}` : ''}
${customInstruction ? `Custom Instruction: ${customInstruction}` : ''}
Continuity: ${continuityNote}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${expressionGuidance ? `${expressionGuidance}\n\n` : ''}Your output is a structured image generation prompt using LABELED BLOCKS.
Each block is a discrete, self-contained instruction. Do NOT write flowing prose.
The image model reads each block separately and applies it literally.

OUTPUT FORMAT — produce EXACTLY this structure, filling each block:

CHARACTER: [Copy the character description verbatim — do NOT rephrase, summarise, or omit any detail]
CHARACTER_KEY_FEATURE: [${charKeyFeature || 'N/A — use the most visually distinct physical detail from the CHARACTER block'}]
ACTION: [One sentence: exactly what the character is doing in this frame. Be specific — not "he stands" but "he stands motionless, both hands hanging at his sides, weight shifted slightly to his left foot".]
EXPRESSION: [One sentence: exact facial state — jaw position, eye state, mouth, specific micro-expression. Map directly from emotional tone: "${scene.emotionalTone}"]
POSTURE: [One sentence: body language, weight distribution, how clothing drapes/moves]
ENVIRONMENT: [${envKeyFeature}. Background only — do NOT place the character here. 1–2 sentences of atmospheric detail.]
LIGHTING: [One sentence: light source name, direction, color temperature, shadow position on face]
CAMERA: [${scene.cameraWork}. One sentence: shot type (full body / medium / tight close-up), character position in 9:16 frame]
STYLE: ${IMAGE_QUALITY_TAIL}

Output ONLY valid JSON. Nothing else.
{
  "imagePrompt": "CHARACTER: ... \\nCHARACTER_KEY_FEATURE: ... \\nACTION: ... \\nEXPRESSION: ... \\nPOSTURE: ... \\nENVIRONMENT: ... \\nLIGHTING: ... \\nCAMERA: ... \\nSTYLE: ${IMAGE_QUALITY_TAIL}"
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO PROMPT GENERATOR — Structured Block Format
// ─────────────────────────────────────────────────────────────────────────────

function getVideoPromptGenerationPrompt(scene, character, sceneIndex, totalScenes, customInstruction, environment, targetLanguage) {
  // character can be object or legacy string
  const charDescription = typeof character === 'object' ? (character.description || '') : (character || '');
  const charKeyFeature = typeof character === 'object' ? (character.keyFeature || '') : '';
  const envKeyFeature = environment?.keyFeature || scene.location || '';

  // Resolve dialogue
  const dlg = scene.dialogue || {};
  const dialogueText = (dlg.text || scene.dialogueText || '').trim();
  const dialogueTone = dlg.tone || scene.dialogueTone || 'calm and deliberate';
  const dialoguePacing = dlg.pacing || scene.dialoguePacing || 'slow with natural pauses';
  const outputLang = targetLanguage || dlg.language || 'Hindi';
  const hasDialogue = dialogueText.length > 0;
  const dialoguePhonetic = (dlg.phonetic || '').trim() || dialogueText;
  const dialogueMode = dlg.mode === 'narration' ? 'narration' : 'character';

  const dialogueBlock = hasDialogue
    ? `DIALOGUE: "${dialogueText}" | phonetic: "${dialoguePhonetic}" | mode: ${dialogueMode} | tone: ${dialogueTone} | pacing: ${dialoguePacing}. The spoken words are fixed — do NOT alter, add to, or replace this line.`
    : `DIALOGUE: None. Character remains silent. Convey all emotion through facial micro-expressions and body language only.`;

  return `You are a cinematic video prompt engineer for AI video generators (Veo 3, Kling, Runway, Pika). You produce prompts for 9:16 portrait short-form clips.

I have attached a reference image of the character. This image is the visual ground truth — the generated video MUST match it exactly.

⚠️ CONTENT POLICY — MANDATORY:
- NEVER use any real person's name, historical figure's name, or celebrity name.
- ALWAYS describe the character by physical appearance only.
- NEVER use "mature" to describe a person. Use "adult" or age context only.
- NEVER use: "trembling lips", "quivering", "heaving", "sensual", "vulnerable", "fragile".
- For physical reactions use: "lips part slightly", "exhale visible", "jaw relaxes", "gaze sharpens", "posture tightens".
${customInstruction ? `\nCustom Instruction: ${customInstruction}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE INPUTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scene ${sceneIndex + 1} of ${totalScenes}: ${scene.title || scene.summary}
Action: ${scene.summary}
Location: ${scene.location}
Time of Day: ${scene.timeOfDay}
Emotional Tone: ${scene.emotionalTone}
Camera Work: ${scene.cameraWork}
Duration: ${scene.duration} seconds
Transition From: ${scene.transitionFrom || 'Opening scene'}
Transition Into: ${scene.transitionTo || 'Final scene'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your output is a structured video generation prompt using LABELED BLOCKS.
Each block is a discrete, self-contained instruction. Do NOT write flowing prose.
The video model reads each block separately and applies it literally.

OUTPUT FORMAT — produce EXACTLY this structure, filling each block:

CHARACTER: [Copy the character description verbatim — do NOT rephrase, summarise, or omit. Match the attached reference image exactly.]
CHARACTER_KEY_FEATURE: [${charKeyFeature || 'Most visually distinct physical detail from CHARACTER block'}]
ACTION_START: [One sentence: exactly what the character is doing at the very first frame of the clip]
ACTION_END: [One sentence: exactly what the character is doing at the very last frame of the clip — must show a clear physical progression from ACTION_START]
${dialogueBlock}
EXPRESSION_ARC: Start — [exact facial state at clip open: jaw, eyes, mouth]. End — [exact facial state at clip close, reflecting emotional progression].
CAMERA: [${scene.cameraWork}. Shot type, framing in 9:16, movement speed and direction — one sentence]
ENVIRONMENT: [${envKeyFeature}. Background motion details — 2–3 specific subtle motions (e.g. "cloth fluttering in wind, dust drifting left, distant silhouettes barely moving"). Background must be blurred, not competing with character.]
LIGHTING: [Light source, dominant color temperature, shadow direction on character's face, any temperature shift during clip]
STYLE: ${VIDEO_QUALITY_TAIL}
NEGATIVE: subtitles, captions, text overlay, watermark, blurry character, split screen, shaky unfocused background motion

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DURATION RULE: Return an integer — MUST be exactly 4, 6, or 8.
${scene.duration === 4 ? 'Lean toward 4 for this tight, punchy scene.' : scene.duration === 6 ? 'Lean toward 6 for this scene.' : 'Lean toward 8 for this emotionally expansive scene.'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output ONLY valid JSON. Nothing else.
{
  "videoPrompt": "CHARACTER: ... \\nCHARACTER_KEY_FEATURE: ... \\nACTION_START: ... \\nACTION_END: ... \\nDIALOGUE: ... \\nEXPRESSION_ARC: ... \\nCAMERA: ... \\nENVIRONMENT: ... \\nLIGHTING: ... \\nSTYLE: ${VIDEO_QUALITY_TAIL} \\nNEGATIVE: subtitles, captions, text overlay, watermark, blurry character, split screen, shaky unfocused background motion",
  "duration": 8
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SCENE GENERATOR FROM FREE-TEXT PROMPT (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function getSceneFromPromptPrompt(userPrompt, character, sceneIndex, totalScenes) {
  return `You are a cinematic director. Given a brief description, produce ONE fully-detailed scene object in JSON for a 9:16 portrait short-form video pipeline.

User description:
"${userPrompt}"

Context:
- This is scene ${sceneIndex + 1} of ${totalScenes} in the project.
- Global character anchor: ${typeof character === 'object' ? (character.description || 'Not yet defined') : (character || 'Not yet defined — infer from the description.')}

Rules:
1. "duration" MUST be exactly 4, 6, or 8 (integer).
2. "dialogue.text" — extract any spoken line from the description verbatim. If the dialogue is in Hindi/Hinglish write it in Devanagari script. If none, use empty string.
3. If dialogue uses Hindi or Sanskrit in Devanagari, set "dialogue.phonetic" to a clean romanized transliteration; otherwise use empty string.
4. "dialogue.mode" — "character" for in-scene speech, "narration" for voice-over/narrator cues inferred from the description; default "character".
5. "dialogue.text" and "dialogue.phonetic" must each be at most 12 speakable words if present (truncate to the essential phrase if longer).
6. "emotionalTone" must be granular and physical (e.g. "quiet devastation, jaw tight, eyes hollow").
7. "location" must be vivid and atmospheric.
8. "cameraWork" must be one of: "slow push-in", "static wide", "tracking shot from side-back angle", "extreme close-up static", "crane down", "handheld with tension shake".
9. "dialogue.tone" must be one of: "commanding and calm", "heavy and burdened", "whisper-like and introspective", "broken and raw", "quiet and resolute", "calm and deliberate".
10. Output ONLY valid JSON — no markdown fences, no explanation.

{
  "title": "Short cinematic title (4–6 words)",
  "summary": "Vivid cinematic description of what physically happens — dense, atmospheric, no dialogue.",
  "emotionalTone": "Granular emotional/physical state of the character.",
  "location": "Immersive atmospheric setting with lighting and weather details.",
  "timeOfDay": "e.g. golden hour dusk",
  "duration": 8,
  "dialogue": {
    "text": "",
    "phonetic": "",
    "language": "Hindi",
    "mode": "character",
    "tone": "calm and deliberate",
    "pacing": "slow with natural pauses"
  },
  "cameraWork": "slow push-in",
  "transitionFrom": "",
  "transitionTo": ""
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPTS = {
  getSceneSplitPrompt,
  getImagePromptGenerationPrompt,
  getVideoPromptGenerationPrompt,
  getSceneFromPromptPrompt,
  getCharacterExtractPrompt,
  getEnvironmentExtractPrompt,
};
