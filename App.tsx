import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Entry, GameState, Settings, TabKey } from './src/types';
import { palette } from './src/theme';
import {
  defaultSettings,
  eraseAll,
  loadEntries,
  loadGame,
  loadSettings,
  saveEntries,
  saveGame,
  saveSettings,
  seedIfFirstRun,
} from './src/storage';
import { applyEntryToGame, defaultGame } from './src/gamification';
import HomeScreen from './src/screens/HomeScreen';
import ComposeScreen from './src/screens/ComposeScreen';
import EntryDetail from './src/screens/EntryDetail';
import InsightsScreen from './src/screens/InsightsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

interface Toast {
  text: string;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabKey>('home');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [game, setGame] = useState<GameState>(defaultGame());
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const [e, g, s] = await Promise.all([loadEntries(), loadGame(), loadSettings()]);
      const seeded = await seedIfFirstRun(e);
      setEntries(seeded ?? e);
      setGame(g);
      setSettings(s);
      setReady(true);
    })();
  }, []);

  const showToast = useCallback(
    (text: string) => {
      setToast({ text });
      toastAnim.setValue(0);
      Animated.spring(toastAnim, {
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
        friction: 7,
      }).start();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: Platform.OS !== 'web',
        }).start(() => setToast(null));
      }, 3200);
    },
    [toastAnim]
  );

  const handleSaveEntry = useCallback(
    (entry: Entry) => {
      setEntries((prev) => {
        const next = [entry, ...prev];
        saveEntries(next);
        setGame((g) => {
          const update = applyEntryToGame(g, entry, next);
          saveGame(update.game);
          const badgeNote = update.newBadges.length
            ? `  ·  🏅 ${update.newBadges.map((b) => b.title).join(', ')}`
            : '';
          showToast(`+${update.earnedXp} xp${badgeNote}`);
          return update.game;
        });
        return next;
      });
      setTab('home');
      setDetailId(entry.id);
    },
    [showToast]
  );

  const handleDeleteEntry = useCallback((id: string) => {
    setDetailId(null);
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveEntries(next);
      return next;
    });
  }, []);

  const handleSettingsChange = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  const handleEraseAll = useCallback(async () => {
    await eraseAll();
    setEntries([]);
    setGame(defaultGame());
    setSettings(defaultSettings());
    setDetailId(null);
    setTab('home');
  }, []);

  const handleRemoveSamples = useCallback(() => {
    setEntries((prev) => {
      const next = prev.filter((e) => !e.sample);
      saveEntries(next);
      return next;
    });
  }, []);

  if (!ready) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: palette.inkSoft, fontStyle: 'italic' }}>warming the ink…</Text>
      </View>
    );
  }

  const detailEntry = detailId ? entries.find((e) => e.id === detailId) ?? null : null;
  const hasSamples = entries.some((e) => e.sample);

  const tabs: { key: TabKey; icon: string; label: string }[] = [
    { key: 'home', icon: '🏡', label: 'Journal' },
    { key: 'compose', icon: '✚', label: 'New' },
    { key: 'insights', icon: '🌗', label: 'Insights' },
    { key: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.appFrame}>
        <View style={{ flex: 1 }}>
          {tab === 'home' && (
            <HomeScreen
              entries={entries}
              game={game}
              settings={settings}
              onOpenEntry={setDetailId}
              onCompose={() => setTab('compose')}
            />
          )}
          {tab === 'compose' && (
            <ComposeScreen
              settings={settings}
              onToggleAutoTailor={(v) => handleSettingsChange({ ...settings, autoTailor: v })}
              onSave={handleSaveEntry}
              onCancel={() => setTab('home')}
            />
          )}
          {tab === 'insights' && <InsightsScreen entries={entries} game={game} />}
          {tab === 'settings' && (
            <SettingsScreen
              settings={settings}
              onChange={handleSettingsChange}
              onEraseAll={handleEraseAll}
              onRemoveSamples={handleRemoveSamples}
              hasSamples={hasSamples}
            />
          )}
        </View>

        {/* bottom tab bar */}
        {tab !== 'compose' && (
          <View style={styles.tabBar}>
            {tabs.map((t) =>
              t.key === 'compose' ? (
                <Pressable key={t.key} onPress={() => setTab('compose')} style={styles.fab}>
                  <Text style={styles.fabIcon}>✚</Text>
                </Pressable>
              ) : (
                <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tabBtn}>
                  <Text style={[styles.tabIcon, tab === t.key && styles.tabIconActive]}>
                    {t.icon}
                  </Text>
                  <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              )
            )}
          </View>
        )}

        {/* entry detail modal */}
        {detailEntry && (
          <EntryDetail
            entry={detailEntry}
            onClose={() => setDetailId(null)}
            onDelete={handleDeleteEntry}
          />
        )}

        {/* xp toast */}
        {toast && (
          <Animated.View
            style={[
              styles.toast,
              {
                opacity: toastAnim,
                transform: [
                  {
                    translateY: toastAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [40, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.toastText}>{toast.text}</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const webShadow = (shadow: string, fallback: object) =>
  Platform.OS === 'web' ? ({ boxShadow: shadow } as object) : fallback;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0,
  },
  appFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 480, // phone-like frame on web
    alignSelf: 'center',
  },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    flexDirection: 'row',
    backgroundColor: palette.card,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
    ...webShadow('0 8px 30px rgba(58,51,64,0.16)', {
      shadowColor: '#3A3340',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 8,
    }),
  },
  tabBtn: { alignItems: 'center', paddingHorizontal: 12 },
  tabIcon: { fontSize: 20, opacity: 0.45 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 10, fontWeight: '700', color: palette.inkFaint, marginTop: 2 },
  tabLabelActive: { color: palette.ink },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    ...webShadow('0 8px 20px rgba(124,108,240,0.45)', {
      shadowColor: palette.accent,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.45,
      shadowRadius: 10,
      elevation: 9,
    }),
  },
  fabIcon: { color: '#fff', fontSize: 24, fontWeight: '800' },
  toast: {
    position: 'absolute',
    bottom: 92,
    alignSelf: 'center',
    backgroundColor: palette.ink,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  toastText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
