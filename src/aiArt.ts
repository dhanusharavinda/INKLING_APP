// AI Van Gogh mode (native): the rendered canvas view is captured as a PNG
// with react-native-view-shot, then OpenAI's image-edit model repaints it.
// The web build resolves aiArt.web.ts instead.
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import { CanvasItem } from './types';

export const VAN_GOGH_PROMPT =
  "Repaint this rough couple's doodle as one cohesive, charming artwork in Van Gogh's style: " +
  'expressive swirling brushstrokes, thick impasto texture, a warm dreamy palette. Keep the ' +
  'subjects, text and composition of the sketch recognizable. Cute, whimsical, gallery-worthy.';

export interface VanGoghOpts {
  apiKey: string;
  items: CanvasItem[]; // used by the web implementation
  viewRef: unknown; // the native view wrapping the canvas render
}

// Returns a data URI of the repainted artwork.
export async function vanGoghify({ apiKey, viewRef }: VanGoghOpts): Promise<string> {
  const uri = await captureRef(viewRef as never, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    width: 1024,
    height: 1024,
  });

  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', VAN_GOGH_PROMPT);
  form.append('size', '1024x1024');
  form.append('quality', 'medium');
  form.append('image', new File(uri) as unknown as Blob);

  const r = await expoFetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`AI art error ${r.status}: ${body.slice(0, 180)}`);
  }
  const json = (await r.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('The AI returned no image. Try again.');
  return `data:image/png;base64,${b64}`;
}
