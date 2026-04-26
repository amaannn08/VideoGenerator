// ─────────────────────────────────────────────────────────────────────────────
// SHARED STYLE ANCHORS — used across all three generators
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_QUALITY_TAIL = `portrait composition (9:16), cinematic, ultra realistic, 4k, volumetric lighting, extreme shallow depth of field, character in sharp focus, background blurred, film still`;

const VIDEO_QUALITY_TAIL = `cinematic quality, realistic motion, precise lip sync, depth of field, character always in sharp focus at all times`;

// ─────────────────────────────────────────────────────────────────────────────
// SCENE SPLITTER PROMPT
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
2. EXTRACT DIALOGUE DIRECTLY from the script — do not invent lines. If the script has spoken words, they belong in the "dialogue.text" field verbatim. IMPORTANT: If the dialogue is in Hindi or Hinglish, you MUST write the dialogue in the Devanagari script (e.g., 'नमस्ते' instead of 'namaste') in the "dialogue.text" field to ensure proper text-to-speech pronunciation.
3. Maintain VISUAL CONTINUITY: describe how each scene flows from the previous one. The character must look identical in all scenes (same face, same attire, same build).
4. The "character" field is the SINGLE SOURCE OF TRUTH for the character's appearance — it will be copy-pasted into every image and video prompt. Make it extremely detailed.
5. "narrativeArc" is a one-sentence summary of the entire emotional journey across ALL scenes combined.
6. "transitionFrom" describes what the character has JUST experienced before this scene starts (empty string for scene 1).
7. "transitionTo" describes what emotionally carries forward INTO the next scene (empty string for last scene).
8. "emotionalTone" must be precise — not just "sad" but "quiet devastation and shock, eyes hollow, jaw tight".
9. "cameraWork" should be one of: "slow push-in", "static wide", "tracking shot from side-back angle", "extreme close-up static", "crane down", "handheld with tension shake".
10. "dialogue.tone" must be one of: "commanding and calm", "heavy and burdened", "whisper-like and introspective", "broken and raw", "quiet and resolute".
11. "dialogue.pacing" describes delivery rhythm: e.g. "slow with long pauses between words", "clipped and intense", "breathless", "each word deliberate".
12. BE EXTREMELY DESCRIPTIVE: Write vivid, highly detailed, and cinematic descriptions for 'summary', 'location', and 'emotionalTone'. Use sensory details and dense atmospheric language.

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
        "language": "e.g. Hindi, English, Sanskrit",
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
// IMAGE PROMPT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function getImagePromptGenerationPrompt(scene, character, previousSceneImageDesc, sceneIndex, totalScenes, customInstruction) {
  const isFirstScene = sceneIndex === 0;
  const continuityNote = isFirstScene
    ? `This is scene 1 of ${totalScenes}. Establish the character clearly from scratch.`
    : `This is scene ${sceneIndex + 1} of ${totalScenes}. The character's face, skin tone, build, and attire MUST be identical to scene ${sceneIndex}. Do not change anything about the character's physical appearance. Only the expression, posture, and environment differ.`;

  const prevNote = previousSceneImageDesc
    ? `PREVIOUS SCENE VISUAL REFERENCE: "${previousSceneImageDesc}" — match the character's appearance exactly.`
    : '';

  return `You are an expert cinematic image prompt engineer specializing in portrait (9:16) film-still quality prompts for AI image generators (Gemini, Flux, DALL-E, Stable Diffusion).

Your ONLY job: produce one dense, comma-separated image generation prompt that is ready to paste into an image tool.

⚠️ CRITICAL CONTENT POLICY — MUST FOLLOW:
- NEVER use any real person's name, historical figure's name, or celebrity name in the imagePrompt output.
- DO NOT write "Emperor Ashoka", "Napoleon", "Gandhi", or ANY real person's name.
- ALWAYS describe the character by physical appearance only: "a battle-worn ancient warrior king", "a middle-aged man with brown skin in simple undyed robes", etc.
- This rule is non-negotiable. Real names will cause the generation to be blocked.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE CONTEXT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scene Title: ${scene.title || `Scene ${sceneIndex + 1}`}
Action: ${scene.summary}
Location: ${scene.location}
Time of Day: ${scene.timeOfDay}
Emotional Tone: ${scene.emotionalTone}
Camera Work: ${scene.cameraWork}
Transition Into This Scene: ${scene.transitionFrom || 'Opening scene'}
${prevNote}

${customInstruction ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nUSER CUSTOM INSTRUCTION:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${customInstruction}\nMake sure to incorporate this specific instruction into the final prompt.\n` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHARACTER ANCHOR (copy these descriptors VERBATIM into the prompt — never deviate):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${character || 'Character not specified'}

CONTINUITY NOTE: ${continuityNote}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT STRUCTURE — weave ALL of these layers into one flowing paragraph:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. SHOT + COMPOSITION: Open with shot type (full body / medium portrait / tight close-up), camera angle, and where the character sits in the 9:16 frame (center foreground / slightly off-center / dominant foreground).

2. CHARACTER ANCHOR (MANDATORY — copy verbatim from above): All physical descriptors — skin tone, build, exact attire with condition (dusty / worn / clean), no crown unless the character description says so.

3. FACIAL EXPRESSION + EYES: Describe with surgical precision based on emotionalTone. Not just "sad" — describe jaw tension, moisture in eyes, specific eye communication, lip position.

4. BODY LANGUAGE + POSTURE: Standing still / walking with heavy pace / crouching — describe physical weight and intent. How do clothes respond to wind or motion?

5. BACKGROUND (always shallow DOF blur): Atmospheric strokes only — silhouettes, scattered weapons, rubble, fog, smoke. Never competes with character. Background should suggest the location without being sharp.

6. LIGHTING: Name the source (setting sun / diffused overcast light / torchlight). Specify tone (warm orange + dark shadows / muted desaturated earthy / soft diffused blue-grey). Shadow direction on the character's face.

7. ATMOSPHERE: Dust particles drifting through frame, fog density, wind effect on hair and fabric, sky condition (dark clouds / hazy horizon / weak sunlight through smoke).

8. END EVERY PROMPT WITH EXACTLY: ${IMAGE_QUALITY_TAIL}

Output ONLY valid JSON. Nothing else.
{
  "imagePrompt": "..."
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO PROMPT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function getVideoPromptGenerationPrompt(scene, character, sceneIndex, totalScenes, customInstruction) {
  // Normalise dialogue — handle both nested object and flat fields (for backward compat)
  const dlg = scene.dialogue || {};
  const dialogueText = (dlg.text || scene.dialogueText || '').trim();
  const dialogueLang = dlg.language || scene.language || 'Hindi';
  const dialogueTone = dlg.tone || scene.dialogueTone || 'calm and deliberate';
  const dialoguePacing = dlg.pacing || scene.dialoguePacing || 'slow with natural pauses';
  const hasDialogue = dialogueText.length > 0;

  const dialogueBlock = hasDialogue
    ? `The character should speak in a ${dialogueTone} voice in ${dialogueLang}:
"${dialogueText}"
Delivery pacing: ${dialoguePacing}.
Ensure precise lip sync, natural breathing pauses between phrases, and micro-expressions matching the emotional tone during and between spoken words.`
    : `This scene has no spoken dialogue. The character should remain silent. Convey all emotion through micro-expressions, body language, and subtle physical reactions only.`;

  return `You are an expert cinematic video motion prompt engineer for AI video generators (Veo 3, Kling, Runway, Pika). You specialize in portrait (9:16) short-form cinematic video prompts.

Generate ONE flowing, dense video prompt — written as if you are directing both the cinematographer and the actor simultaneously. Do NOT use bullet points.

⚠️ CRITICAL CONTENT POLICY — MUST FOLLOW OR THE VIDEO WILL BE BLOCKED:
- NEVER use any real person's name, historical figure's name, celebrity name, or public figure's name anywhere in the videoPrompt output.
- DO NOT write "Emperor Ashoka", "Napoleon", "Gandhi", "Caesar", or ANY other real person's name.
- ALWAYS substitute names with purely physical descriptions: "a battle-worn ancient warrior king", "a middle-aged man with brown skin", "an ancient ruler in simple undyed robes", etc.
- The character is FICTIONAL for the purposes of this prompt — describe them only by appearance, attire, and emotional state.
- This rule applies to the opening sentence, dialogue attribution, and every other part of the prompt.
- Violation of this rule will cause the video generation to be blocked entirely.

⚠️ VERTEX AI RAI SAFETY RULES — MANDATORY TO AVOID CONTENT FILTER:
- NEVER use the word "mature" to describe a person. Use "adult" or describe age through context only (e.g. "a young adult woman in her early twenties").
- NEVER use phrases like "trembling lips", "quivering", "breath catching", "heaving", or any phrasing that could be interpreted as sexually suggestive — even in a completely non-sexual context.
- NEVER over-describe a female character's body parts, build, or physical form beyond what is necessary for costume/attire context.
- For physical reactions, use neutral language: "lips part slightly", "exhale visible", "a slow blink", "jaw relaxes", "gaze sharpens", "posture tightens".
- NEVER describe a character as "sensual", "vulnerable", "soft", "fragile", or any term with physical-emotional ambiguity.
- Keep ALL physical descriptions anchored to action, costume, and storytelling — not the body itself.
- When in doubt, describe what the CHARACTER DOES, not what their body looks like.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCENE CONTEXT:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scene ${sceneIndex + 1} of ${totalScenes}: ${scene.title || scene.summary}
Action: ${scene.summary}
Location: ${scene.location}
Time of Day: ${scene.timeOfDay}
Emotional Tone: ${scene.emotionalTone}
Camera Work: ${scene.cameraWork}
Duration: ${scene.duration} seconds
Transition From Previous: ${scene.transitionFrom || 'Opening scene — establish character and world'}
Transition Into Next: ${scene.transitionTo || 'Final scene — resolve the emotional arc'}

${customInstruction ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nUSER CUSTOM INSTRUCTION:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${customInstruction}\nMake sure to incorporate this specific instruction into the final prompt.\n` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHARACTER (reference image is attached — match exactly):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${character || 'Character not specified'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIALOGUE & VOICE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${dialogueBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WEAVE ALL OF THESE LAYERS into the single flowing paragraph:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. OPENING STATEMENT: "I have attached an image of [PHYSICAL description only — NO names, NO 'mature', e.g. 'a young adult woman with warm brown skin in a patched earth-tone tunic']. Create a cinematic video in portrait (9:16) format where..." — NEVER use any real person's name. NEVER use the word 'mature'. Use neutral, action-focused language throughout.

2. SHOT FRAMING: Specify the shot type (${scene.cameraWork}), where the character sits in frame (foreground / center), and depth of field separation.

3. CAMERA MOVEMENT: Describe the exact movement — speed (very slow / subtle / moderate), feel (smooth / slight handheld shake for tension / fluid tracking), direction.

4. CHARACTER ANIMATION ARC: Describe the facial expression at the START of the clip and how it EVOLVES toward the END. Include micro-expressions: jaw tension, eye moisture, slow blinking, exhale, slight head movement, subtle trembling.

5. BODY LANGUAGE: Posture, weight, pace if walking. How clothing and hair respond to wind. Dust or particles passing through frame.

6. BACKGROUND ACTIVITY: Level of motion (chaotic / subdued / nearly still). Blur intensity ("slightly blurred but alive" / "heavily blurred"). 2–3 specific subtle motions (cloth fluttering, dust drifting, distant silhouettes).

7. LIGHTING & COLOR: Light source, dominant color tone, shadow direction. If there is an emotional shift, describe a color temperature transition (warm → cool during the clip).

8. ENVIRONMENT: Particle effects (dust density + direction), wind intensity, ambient elements (rising dust, drifting embers).

9. DIALOGUE DELIVERY (already specified above — reinforce it in the prompt naturally).

10. END WITH: ${VIDEO_QUALITY_TAIL}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DURATION RULE: Return an integer that MUST be exactly 4, 6, or 8 — the ideal clip length for this scene.
${scene.duration === 4 ? 'Lean toward 4 for this tight, punchy scene.' : scene.duration === 6 ? 'Lean toward 6 for this scene.' : 'Lean toward 8 for this emotionally expansive scene.'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output ONLY valid JSON. Nothing else.
{
  "videoPrompt": "...",
  "duration": 8
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_PROMPTS = {
  getSceneSplitPrompt,
  getImagePromptGenerationPrompt,
  getVideoPromptGenerationPrompt,
};
