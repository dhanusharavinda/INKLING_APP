import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Entry, GameState, Settings } from './types';

// A self-contained snapshot of the journal. The OpenAI API key is deliberately
// excluded so an export never leaks the device secret.
export function buildExportPayload(entries: Entry[], game: GameState, settings: Settings) {
  return {
    app: 'Inkling',
    schema: 1,
    exportedAt: new Date().toISOString(),
    profile: { name: settings.name },
    game,
    entryCount: entries.length,
    entries,
  };
}

export async function exportJournal(
  entries: Entry[],
  game: GameState,
  settings: Settings
): Promise<void> {
  const json = JSON.stringify(buildExportPayload(entries, game, settings), null, 2);

  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inkling-journal.json';
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, 'inkling-journal.json');
  try {
    file.create({ overwrite: true });
  } catch {
    // file may already exist from a prior export; writing still overwrites it
  }
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export your Inkling journal',
      UTI: 'public.json',
    });
  }
}
