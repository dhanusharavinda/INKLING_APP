import { Platform } from 'react-native';
import { Analysis, EmotionKey, PhilosopherMatch } from './types';
import { EMOTION_KEYS } from './emotions';

const API_BASE = 'https://api.openai.com/v1';
const CHAT_MODEL = 'gpt-4o-mini';

// ---------- Whisper speech-to-text ----------

export async function transcribeAudio(uri: string, apiKey: string): Promise<string> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    form.append('file', blob, `note.${ext}`);
  } else {
    form.append('file', {
      uri,
      name: 'note.m4a',
      type: 'audio/m4a',
    } as unknown as Blob);
  }
  form.append('model', 'whisper-1');

  const r = await fetch(`${API_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Whisper error ${r.status}: ${body.slice(0, 200)}`);
  }
  const json = (await r.json()) as { text?: string };
  return (json.text ?? '').trim();
}

// ---------- GPT analysis (+ optional tailoring) ----------

export interface AnalyzeResult {
  analysis: Analysis;
  tailoredText: string | null;
}

const SYSTEM_PROMPT = `You are the quiet, philosophical heart of a personal journal app called Inkling.
The user speaks or writes raw journal notes. Your job is to capture not just WHAT they said,
but HOW they were — their tone, current mindset, and way of thinking — so that years later
they can reread the entry and remember exactly how it felt to be them in that moment.

Respond ONLY with a JSON object with these exact keys:
{
  "emotion": one of ["joy","sadness","anger","fear","calm","love","wonder","disgust"] — the dominant emotion,
  "secondary": one of the same list or null — a quieter second emotion if present,
  "intensity": integer 0-100 — how strongly the emotion is felt,
  "tone": short phrase (3-6 words) describing the voice of the entry, e.g. "quietly hopeful, a little tired",
  "mindset": 1-2 sentences capturing their current mindset and beliefs as expressed here. Write in second person ("You believe..."). Simple but philosophical.
  "thinkingStyle": 1 sentence on HOW they are thinking (e.g. comparing past and present self, weighing trade-offs, catastrophizing, savoring). Second person.
  "essence": ONE short line distilling the entry's core thought, like a tiny aphorism in their own spirit,
  "reflection": 1-2 gentle, simple-but-philosophical sentences a kind friend might say back. No advice-dumping, no clichés.
  "philosopher": { "name": string, "school": string, "why": 1 sentence on why their thought pattern in THIS entry resembles that philosopher } — pick honestly from any tradition (Stoics, Epicurus, Socrates, Laozi, Buddha, Kierkegaard, Camus, Simone Weil, Nietzsche, etc.),
  "tailoredText": ${'`'}null${'`'} unless asked to tailor (see user message). When tailoring: lightly clean the raw spoken transcript into a readable journal entry — fix filler words and rambling, keep their voice, their phrases, their feelings. Never invent content. First person, same language they used.
}
Keep everything warm, minimal, and human. Never moralize.`;

function isEmotionKey(v: unknown): v is EmotionKey {
  return typeof v === 'string' && (EMOTION_KEYS as string[]).includes(v);
}

export async function analyzeWithAI(
  text: string,
  tailor: boolean,
  apiKey: string
): Promise<AnalyzeResult> {
  const userMsg = tailor
    ? `Tailor this raw spoken transcript into a clean journal entry (set "tailoredText"), then analyze the TAILORED version:\n\n${text}`
    : `Analyze this journal entry (leave "tailoredText" as null):\n\n${text}`;

  const r = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`OpenAI error ${r.status}: ${body.slice(0, 200)}`);
  }
  const json = await r.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '{}';
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI returned malformed JSON');
  }

  const phil = parsed.philosopher as PhilosopherMatch | null | undefined;
  const analysis: Analysis = {
    emotion: isEmotionKey(parsed.emotion) ? parsed.emotion : 'calm',
    secondary: isEmotionKey(parsed.secondary) ? parsed.secondary : null,
    intensity: Math.max(0, Math.min(100, Number(parsed.intensity) || 50)),
    tone: String(parsed.tone ?? 'quiet and steady'),
    mindset: String(parsed.mindset ?? ''),
    thinkingStyle: String(parsed.thinkingStyle ?? ''),
    essence: String(parsed.essence ?? ''),
    reflection: String(parsed.reflection ?? ''),
    philosopher:
      phil && typeof phil === 'object' && phil.name
        ? { name: String(phil.name), school: String(phil.school ?? ''), why: String(phil.why ?? '') }
        : null,
    source: 'ai',
  };
  const tailoredText =
    tailor && typeof parsed.tailoredText === 'string' && parsed.tailoredText.trim().length > 0
      ? parsed.tailoredText.trim()
      : null;
  return { analysis, tailoredText };
}

// ---------- Local fallback analysis (demo mode / offline) ----------

const KEYWORDS: Record<EmotionKey, string[]> = {
  joy: ['happy', 'great', 'amazing', 'excited', 'fun', 'won', 'laugh', 'grateful', 'good day', 'proud'],
  sadness: ['sad', 'miss', 'lost', 'cry', 'lonely', 'tired of', 'empty', 'gone', 'hurt', 'heavy'],
  anger: ['angry', 'furious', 'unfair', 'hate', 'annoyed', 'frustrated', 'mad', 'rage', 'sick of'],
  fear: ['afraid', 'scared', 'anxious', 'worried', 'nervous', 'what if', 'panic', 'uncertain', 'risk'],
  calm: ['calm', 'peace', 'quiet', 'slow', 'breathe', 'settled', 'okay with', 'accept', 'content'],
  love: ['love', 'family', 'friend', 'together', 'warm', 'care', 'home', 'heart', 'thankful for'],
  wonder: ['wonder', 'curious', 'why', 'realized', 'idea', 'maybe', 'perspective', 'changed my mind', 'learn'],
  disgust: ['disgust', 'gross', 'fake', 'cringe', 'cannot stand', "can't stand", 'shallow', 'pointless'],
};

const PHILOSOPHERS: { match: string[]; p: PhilosopherMatch }[] = [
  {
    match: ['money', 'work', 'career', 'success', 'ambition', 'wealth'],
    p: { name: 'Seneca', school: 'Stoicism', why: 'You are weighing what wealth is actually for — Seneca wrote letters about exactly this.' },
  },
  {
    match: ['change', 'changed', 'used to', 'before', 'now i', 'different person', 'growing'],
    p: { name: 'Heraclitus', school: 'Pre-Socratic', why: 'You notice that you are not the same person stepping into the same river — pure Heraclitus.' },
  },
  {
    match: ['simple', 'enough', 'small things', 'tea', 'walk', 'sunset', 'little'],
    p: { name: 'Epicurus', school: 'Epicureanism', why: 'You find richness in simple pleasures — Epicurus built a whole garden on that idea.' },
  },
  {
    match: ['should i', 'why do', 'question', 'really true', 'do i actually'],
    p: { name: 'Socrates', school: 'Classical Greek', why: 'You are examining your own beliefs instead of accepting them — the Socratic move.' },
  },
  {
    match: ['flow', 'let go', 'nature', 'force', 'effortless', 'accept'],
    p: { name: 'Laozi', school: 'Taoism', why: 'You lean toward flowing with events rather than forcing them — very Tao Te Ching.' },
  },
  {
    match: ['meaning', 'absurd', 'pointless but', 'keep going', 'anyway'],
    p: { name: 'Albert Camus', school: 'Absurdism', why: 'You choose to keep going without a guaranteed meaning — Camus would call that rebellion.' },
  },
  {
    match: ['discipline', 'control', 'duty', 'morning', 'routine', 'responsibility'],
    p: { name: 'Marcus Aurelius', school: 'Stoicism', why: 'You focus on what is in your control and your duty to it — straight from the Meditations.' },
  },
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

export function analyzeLocally(text: string): Analysis {
  const lower = text.toLowerCase();
  const scores = EMOTION_KEYS.map((k) => ({
    k,
    score: KEYWORDS[k].reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);

  const top = scores[0].score > 0 ? scores[0].k : 'wonder';
  const second = scores[1].score > 0 ? scores[1].k : null;
  const exclaims = (text.match(/!/g) ?? []).length;
  const intensity = Math.max(
    25,
    Math.min(95, 40 + scores[0].score * 12 + exclaims * 8 + Math.min(15, Math.floor(text.length / 80)))
  );

  const philosopher =
    PHILOSOPHERS.find((c) => c.match.some((m) => lower.includes(m)))?.p ??
    pick(PHILOSOPHERS, text.length).p;

  const firstSentence = (text.split(/[.!?]/)[0] || text).slice(0, 120);

  const toneByEmotion: Record<EmotionKey, string> = {
    joy: 'bright and unguarded',
    sadness: 'soft, a little heavy',
    anger: 'sharp-edged but honest',
    fear: 'careful, scanning ahead',
    calm: 'slow and settled',
    love: 'warm at the center',
    wonder: 'curious, turning things over',
    disgust: 'dry and unimpressed',
  };

  return {
    emotion: top,
    secondary: second,
    intensity,
    tone: toneByEmotion[top],
    mindset: `You are working something out by putting it into words — right now "${firstSentence.trim()}" is the thought taking up the most room.`,
    thinkingStyle: 'You are thinking by comparing how things feel now against how you expected them to feel.',
    essence: firstSentence.trim(),
    reflection: 'A thought written down is a thought you can return to — most people lose theirs to the wind.',
    philosopher,
    source: 'local',
  };
}

export function tailorLocally(text: string): string {
  // Light cleanup of spoken filler when no API key is available.
  return text
    .replace(/\b(um+|uh+|erm+|like,|you know,|i mean,)\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
