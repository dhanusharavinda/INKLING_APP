// AI Van Gogh mode (web): the doodle's SVG is rasterized in a hidden canvas,
// then OpenAI's image-edit model repaints it. Picked only for web builds.
// (Self-contained: importing './aiArt' from here would resolve to this very
// file on web, so the prompt/types are duplicated rather than imported.)
import { CanvasItem } from './types';
import { itemsToSvg } from './drawing';

export const VAN_GOGH_PROMPT =
  "Repaint this rough couple's doodle as one cohesive, charming artwork in Van Gogh's style: " +
  'expressive swirling brushstrokes, thick impasto texture, a warm dreamy palette. Keep the ' +
  'subjects, text and composition of the sketch recognizable. Cute, whimsical, gallery-worthy.';

export interface VanGoghOpts {
  apiKey: string;
  items: CanvasItem[];
  viewRef: unknown;
}

function svgToPngBlob(items: CanvasItem[], size = 1024): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svg = itemsToSvg(items);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas unavailable in this browser.'));
        return;
      }
      ctx.fillStyle = '#FFF7FA';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not rasterize the doodle.'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load the doodle for AI.'));
    };
    img.src = url;
  });
}

export async function vanGoghify({ apiKey, items }: VanGoghOpts): Promise<string> {
  const png = await svgToPngBlob(items);
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('prompt', VAN_GOGH_PROMPT);
  form.append('size', '1024x1024');
  form.append('quality', 'medium');
  form.append('image', png, 'doodle.png');

  const r = await fetch('https://api.openai.com/v1/images/edits', {
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
