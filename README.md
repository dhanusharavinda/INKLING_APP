# Inkling 🪶

*A personal AI journal that remembers how you felt, not just what you wrote.*

Speak or type a note. Inkling captures your **emotion, tone, current mindset, and way of
thinking**, gives every feeling an Inside Out style avatar, maps your thoughts as an
**interactive mind graph**, tracks how your perspective evolves over time, and tells you
which **philosopher your thought pattern resembles**.

## Run it locally

```bash
npm install
npm run web        # browser preview
npm start          # then scan the QR with Expo Go for iOS/Android
```

## Connect the AI

Open **Settings → AI connection** inside the app and paste your OpenAI API key
(get one at platform.openai.com). It is stored only on your device.

- **Voice to text**: OpenAI Whisper (`whisper-1`)
- **Emotion / mindset / themes / philosopher analysis and auto-tailoring**: `gpt-4o-mini`
- **No key?** The app runs in demo mode with a lighter local analysis so everything
  is still explorable (voice transcription requires the key).

## Features

| | |
|---|---|
| 🎙 Voice or text entries | "Auto-tailor with AI" toggle cleans spoken rambles, keeps your voice |
| 😊 8 emotion avatars | Joy, Sadness, Anger, Fear, Calm, Love, Wonder, Disgust, drawn in pure code |
| 🧠 Feeling capture | Tone, mindset, way of thinking, one-line essence, gentle reflection |
| 🕸 Mind graph | Interactive neural-network view of entries, emotions, themes, and philosophers. Tap to explore, drag to rearrange, open entries from nodes |
| 🏛 Philosopher resemblance | Per-entry match plus your overall "inner philosopher" |
| 📈 Insights | 14-day mood timeline, emotion mix, intensity, Then → Now mindset evolution |
| 🔥 Gamification | Streaks, XP, levels (Wanderer → Philosopher), 8 badges |
| 🔒 Private | Entries live in on-device storage; the only network calls are to OpenAI |

## Deploy

### Web (static hosting: Vercel, Netlify, GitHub Pages...)

```bash
npx expo export --platform web
```

This writes a production build to `dist/`. Deploy that folder anywhere that serves
static files, for example:

```bash
npx vercel deploy dist        # Vercel
npx netlify deploy --dir dist # Netlify
```

### Android / iOS app stores (EAS Build)

One-time setup: create a free Expo account, then:

```bash
npm install -g eas-cli
eas login
eas build:configure
```

Build and submit:

```bash
eas build -p android --profile production   # AAB for Google Play
eas build -p ios --profile production       # IPA for the App Store (needs Apple dev account)
eas submit -p android                       # upload to Google Play
eas submit -p ios                           # upload to App Store Connect
```

For a quick installable Android APK to share with friends:

```bash
eas build -p android --profile preview
```

Bundle ids are already configured (`com.dhanusharavind.inkling`), and `eas.json`
ships with development, preview, and production profiles.

**Production note:** users paste their own OpenAI key in Settings, so no secrets ship
with the app. If you later want journaling to work without users bringing a key, add a
small server proxy that holds your key and forward the OpenAI calls through it.

## Structure

```
App.tsx                     root state + custom tab navigation + toasts
src/
  ai.ts                     Whisper + GPT calls, local demo fallback, theme extraction
  emotions.ts               avatar/emotion metadata
  gamification.ts           streaks, XP, levels, badges
  graph.ts                  mind-graph builder + force-directed layout
  storage.ts                AsyncStorage persistence + sample entries
  components/               EmotionAvatar, KnowledgeGraph, charts, UI primitives
  screens/                  Home, Compose, EntryDetail, Insights, Settings
```
