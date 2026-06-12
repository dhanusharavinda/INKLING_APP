# Inkling 🪶

*A personal AI journal that remembers how you felt — not just what you wrote.*

Speak or type a note. Inkling captures your **emotion, tone, current mindset, and way of
thinking**, gives every feeling an Inside Out–style avatar, tracks how your perspective
evolves over time, and tells you which **philosopher your thought pattern resembles**.

## Run it

```bash
npm install
npm run web        # browser preview
npm start          # then scan the QR with Expo Go for iOS/Android
```

## Connect the AI

Open **Settings → AI connection** inside the app and paste your OpenAI API key
(get one at platform.openai.com). It is stored only on your device.

- **Voice → text**: OpenAI Whisper (`whisper-1`)
- **Emotion / mindset / philosopher analysis + auto-tailoring**: `gpt-4o-mini`
- **No key?** The app runs in demo mode with a lighter local analysis so everything
  is still explorable (voice transcription requires the key).

## Features

| | |
|---|---|
| 🎙 Voice or text entries | "Auto-tailor with AI" toggle cleans spoken rambles, keeps your voice |
| 😊 8 emotion avatars | Joy, Sadness, Anger, Fear, Calm, Love, Wonder, Disgust — drawn in pure code |
| 🧠 Feeling capture | Tone, mindset, way of thinking, one-line essence, gentle reflection |
| 🏛 Philosopher resemblance | Per-entry match + your overall "inner philosopher" |
| 📈 Insights | 14-day mood timeline, emotion mix, intensity, **Then → Now** mindset evolution |
| 🔥 Gamification | Streaks, XP, levels (Wanderer → Philosopher), 8 badges |
| 🔒 Private | Entries live in on-device storage; the only network calls are to OpenAI |

## Structure

```
App.tsx                     root state + custom tab navigation + toasts
src/
  ai.ts                     Whisper + GPT calls, local demo fallback
  emotions.ts               avatar/emotion metadata
  gamification.ts           streaks, XP, levels, badges
  storage.ts                AsyncStorage persistence + sample entries
  components/               EmotionAvatar, charts, UI primitives
  screens/                  Home, Compose, EntryDetail, Insights, Settings
```
