import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { EmotionKey, Entry, GameState, Settings } from './src/types';
import { palette, serif } from './src/theme';
import {
  defaultSettings,
  eraseScope,
  loadDailyCount,
  loadEntries,
  loadGame,
  loadSettings,
  saveDailyCount,
  saveEntries,
  saveGame,
  saveSettings,
  seedIfFirstRun,
} from './src/storage';
import { applyEntryToGame, dayKey, DAILY_ENTRY_LIMIT, defaultGame } from './src/gamification';
import { supabaseConfigured } from './src/supabase';
import {
  CloudSession,
  deleteAccount,
  deleteAllData,
  deleteEntry,
  deleteSampleEntries,
  fetchEntries,
  fetchGame,
  fetchSettings,
  friendlyCloudError,
  getSession,
  insertEntry,
  onAuthChange,
  signOut,
  upsertGame,
  upsertSettings,
} from './src/cloud';
import { exportJournal } from './src/exporter';
import {
  fetchLatestMoods,
  fetchMyPair,
  fetchPairGame,
  onPairEvent,
} from './src/cloud';
import { ensureStreakReminder, initNotifications, notifyPairEvent } from './src/notifications';
import HomeScreen from './src/screens/HomeScreen';
import ComposeScreen from './src/screens/ComposeScreen';
import EntryDetail from './src/screens/EntryDetail';
import InsightsScreen from './src/screens/InsightsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import UsScreen from './src/screens/UsScreen';

type Tab = 'home' | 'us' | 'insights' | 'settings';

interface Toast {
  text: string;
}

export default function App() {
  const cloudEnabled = supabaseConfigured;
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<CloudSession | null>(null);
  const [scope, setScope] = useState('guest');

  const [tab, setTab] = useState<Tab>('home');
  const [composing, setComposing] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [game, setGame] = useState<GameState>(defaultGame());
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the most recent loadScope is allowed to commit state, so overlapping
  // auth events (sign-in, token refresh) can never interleave two users' data.
  const loadToken = useRef(0);
  // Per-day creation counter for the rate limit (kept in a ref to avoid stale
  // reads inside callbacks; mirrored to state for rendering).
  const dailyRef = useRef<{ day: string; count: number }>({ day: '', count: 0 });
  const [, forceDaily] = useState(0);
  const bumpDailyRender = () => forceDaily((n) => n + 1);

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

  // Load one account's data: local cache first, then reconcile with the cloud.
  const loadScope = useCallback(async (sc: string) => {
    const token = ++loadToken.current;
    const [le, lg, ls] = await Promise.all([loadEntries(sc), loadGame(sc), loadSettings(sc)]);
    let e = le;
    let g = lg;
    let s = ls;

    if (sc === 'guest') {
      const seeded = await seedIfFirstRun(sc, le);
      if (seeded) e = seeded;
    } else {
      try {
        const [ce, cg, cs] = await Promise.all([fetchEntries(sc), fetchGame(sc), fetchSettings(sc)]);
        e = ce;
        await saveEntries(sc, ce);
        if (cg) {
          g = cg;
          await saveGame(sc, cg);
        } else {
          await upsertGame(g, sc);
        }
        if (cs) {
          s = { ...ls, name: cs.name, autoTailor: cs.autoTailor, onboarded: cs.onboarded };
        } else {
          await upsertSettings({ name: s.name, autoTailor: s.autoTailor, onboarded: s.onboarded }, sc);
        }
        await saveSettings(sc, s);
      } catch {
        // offline or transient: fall back to the local cache we already have
      }
    }

    const today = dayKey(Date.now());
    const used = await loadDailyCount(sc, today);

    // A newer load started while we were awaiting: drop this stale result.
    if (loadToken.current !== token) return;
    dailyRef.current = { day: today, count: used };
    setEntries(e);
    setGame(g);
    setSettings(s);
    setScope(sc);
    bumpDailyRender();
  }, []);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      if (!cloudEnabled) {
        await loadScope('guest');
        setBooting(false);
        return;
      }
      const s = await getSession();
      setSession(s);
      if (s) await loadScope(s.userId);
      setBooting(false);
      unsub = onAuthChange(async (ns) => {
        setSession(ns);
        if (ns) {
          await loadScope(ns.userId);
        } else {
          loadToken.current++; // cancel any in-flight load from a prior session
          setEntries([]);
          setGame(defaultGame());
          setSettings(defaultSettings());
          setDetailId(null);
          setComposing(false);
          setTab('home');
        }
      });
    })();
    return () => unsub();
  }, [cloudEnabled, loadScope]);

  const cloud = scope !== 'guest';

  // Coming back to the app re-pulls cloud data, so an entry written on the
  // website appears on the phone the moment it opens (and vice versa).
  useEffect(() => {
    if (!cloud) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') loadScope(scope).catch(() => {});
    });
    return () => sub.remove();
  }, [cloud, scope, loadScope]);

  // Notifications: a gentle streak reminder, and partner moods/reactions that
  // arrive while the app is backgrounded (the realtime socket stays warm for a
  // while; with the app killed, notifications resume on next open).
  useEffect(() => {
    if (!cloud) return;
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      try {
        await initNotifications();
        const pair = await fetchMyPair();
        if (cancelled || !pair || !pair.userB) return;
        const partnerName =
          (pair.userA === scope ? pair.nameB : pair.nameA).trim() || 'your person';
        const myMoodRef = { current: undefined as string | undefined };
        const [moods, pairGame] = await Promise.all([
          fetchLatestMoods(pair.id, [scope]),
          fetchPairGame(pair.id),
        ]);
        myMoodRef.current = moods[0]?.value;
        await ensureStreakReminder(pairGame, true);
        unsub = onPairEvent(pair.id, (e) => {
          if (e.author === scope) {
            if (e.kind === 'mood') myMoodRef.current = e.value;
            return;
          }
          if (AppState.currentState !== 'active') {
            notifyPairEvent(e, partnerName, myMoodRef.current).catch(() => {});
          }
        });
      } catch {
        // offline or unpaired; nothing to schedule
      }
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [cloud, scope]);

  const handleSaveEntry = useCallback(
    (entry: Entry) => {
      const today = dayKey(Date.now());
      const used = dailyRef.current.day === today ? dailyRef.current.count : 0;
      if (used >= DAILY_ENTRY_LIMIT) {
        showToast(`Daily limit reached: ${DAILY_ENTRY_LIMIT} entries a day`);
        setComposing(false);
        return;
      }

      setEntries((prev) => {
        const next = [entry, ...prev];
        saveEntries(scope, next);
        if (cloud)
          insertEntry(entry, scope).catch((e) => showToast(`Sync failed: ${friendlyCloudError(e)}`));
        setGame((g) => {
          const update = applyEntryToGame(g, entry, next);
          saveGame(scope, update.game);
          if (cloud) upsertGame(update.game, scope).catch(() => {});
          const badgeNote = update.newBadges.length
            ? `  ·  🏅 ${update.newBadges.map((b) => b.title).join(', ')}`
            : '';
          showToast(`+${update.earnedXp} xp${badgeNote}`);
          return update.game;
        });
        return next;
      });

      const nextCount = used + 1;
      dailyRef.current = { day: today, count: nextCount };
      saveDailyCount(scope, today, nextCount);
      bumpDailyRender();

      setComposing(false);
      setTab('home');
      setDetailId(entry.id);
    },
    [scope, cloud, showToast]
  );

  const handleDeleteEntry = useCallback(
    (id: string) => {
      setDetailId(null);
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== id);
        saveEntries(scope, next);
        if (cloud) deleteEntry(id, scope).catch(() => {});
        return next;
      });
    },
    [scope, cloud]
  );

  const handleSettingsChange = useCallback(
    (s: Settings) => {
      setSettings(s);
      saveSettings(scope, s);
      if (cloud)
        upsertSettings({ name: s.name, autoTailor: s.autoTailor, onboarded: s.onboarded }, scope).catch(
          () => {}
        );
    },
    [scope, cloud]
  );

  const handleExport = useCallback(() => {
    exportJournal(entries, game, settings).catch((e) =>
      showToast(`Export failed: ${e.message ?? e}`)
    );
  }, [entries, game, settings, showToast]);

  const handleDeleteAllData = useCallback(async () => {
    await eraseScope(scope);
    if (cloud) await deleteAllData(scope).catch(() => {});
    setEntries([]);
    setGame(defaultGame());
    await saveGame(scope, defaultGame());
    dailyRef.current = { day: '', count: 0 };
    bumpDailyRender();
    setDetailId(null);
    setComposing(false);
    setTab('home');
    showToast('All your data was deleted.');
  }, [scope, cloud, showToast]);

  const handleRemoveSamples = useCallback(() => {
    setEntries((prev) => {
      const next = prev.filter((e) => !e.sample);
      saveEntries(scope, next);
      if (cloud) deleteSampleEntries(scope).catch(() => {});
      return next;
    });
  }, [scope, cloud]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setSession(null);
    setEntries([]);
    setGame(defaultGame());
    setSettings(defaultSettings());
    dailyRef.current = { day: '', count: 0 };
    setDetailId(null);
    setComposing(false);
    setTab('home');
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    await eraseScope(scope);
    try {
      await deleteAccount();
    } catch (e) {
      showToast(`Could not delete account: ${e instanceof Error ? e.message : e}`);
      return;
    }
    setSession(null);
    setEntries([]);
    setGame(defaultGame());
    setSettings(defaultSettings());
    dailyRef.current = { day: '', count: 0 };
    setDetailId(null);
    setComposing(false);
    setTab('home');
  }, [scope, showToast]);

  const refreshSession = useCallback(async () => {
    const s = await getSession();
    setSession(s);
    if (s) await loadScope(s.userId);
  }, [loadScope]);

  // ---------- gates ----------

  if (booting) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.loaderBrand}>Inkling</Text>
        <ActivityIndicator color={palette.accent} style={{ marginTop: 14 }} />
        <Text style={styles.loaderText}>warming the ink…</Text>
      </View>
    );
  }

  const frame = (child: React.ReactNode) => (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.appFrame}>{child}</View>
    </SafeAreaView>
  );

  if (cloudEnabled && !session) {
    return frame(<AuthScreen onAuthed={refreshSession} />);
  }

  if (!settings.onboarded) {
    return frame(
      <OnboardingScreen
        initialName={settings.name}
        initialApiKey={settings.apiKey}
        onComplete={(name, apiKey) =>
          handleSettingsChange({ ...settings, name, apiKey, onboarded: true })
        }
      />
    );
  }

  const detailEntry = detailId ? entries.find((e) => e.id === detailId) ?? null : null;
  const hasSamples = entries.some((e) => e.sample);
  const showNav = !composing && !detailEntry;

  const todayKey = dayKey(Date.now());
  const usedToday = dailyRef.current.day === todayKey ? dailyRef.current.count : 0;
  const remainingToday = Math.max(0, DAILY_ENTRY_LIMIT - usedToday);

  const tabs: { key: Tab; icon: string; label: string }[] = [
    { key: 'home', icon: '🏡', label: 'Journal' },
    { key: 'us', icon: '💌', label: 'Us' },
    { key: 'insights', icon: '🌗', label: 'Insights' },
    { key: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.appFrame}>
        <View style={{ flex: 1 }}>
          {composing ? (
            <ComposeScreen
              settings={settings}
              remainingToday={remainingToday}
              dailyLimit={DAILY_ENTRY_LIMIT}
              onToggleAutoTailor={(v) => handleSettingsChange({ ...settings, autoTailor: v })}
              onSave={handleSaveEntry}
              onCancel={() => setComposing(false)}
            />
          ) : (
            <>
              {tab === 'home' && (
                <HomeScreen
                  entries={entries}
                  game={game}
                  settings={settings}
                  remainingToday={remainingToday}
                  dailyLimit={DAILY_ENTRY_LIMIT}
                  onOpenEntry={setDetailId}
                  onCompose={() => remainingToday > 0 && setComposing(true)}
                />
              )}
              {tab === 'us' && (
                <UsScreen
                  userId={session?.userId ?? scope}
                  myName={settings.name}
                  apiKey={settings.apiKey}
                  cloudEnabled={cloudEnabled && !!session}
                />
              )}
              {tab === 'insights' && (
                <InsightsScreen
                  entries={entries}
                  game={game}
                  apiKey={settings.apiKey}
                  onOpenEntry={setDetailId}
                />
              )}
              {tab === 'settings' && (
                <SettingsScreen
                  settings={settings}
                  email={session?.email ?? null}
                  cloudEnabled={cloudEnabled}
                  onChange={handleSettingsChange}
                  onExport={handleExport}
                  onDeleteAllData={handleDeleteAllData}
                  onRemoveSamples={handleRemoveSamples}
                  onSignOut={handleSignOut}
                  onDeleteAccount={handleDeleteAccount}
                  hasSamples={hasSamples}
                />
              )}
            </>
          )}
        </View>

        {/* bottom tab bar (hidden during compose and entry detail) */}
        {showNav && (
          <View style={styles.tabBar}>
            {tabs.map((t) => (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tabBtn}>
                <Text style={[styles.tabIcon, tab === t.key && styles.tabIconActive]}>{t.icon}</Text>
                <Text style={[styles.tabLabel, tab === t.key && styles.tabLabelActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* full-screen entry detail (swipeable) */}
        {detailEntry && (
          <EntryDetail
            entries={entries}
            initialId={detailEntry.id}
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
  center: { alignItems: 'center', justifyContent: 'center' },
  loaderBrand: { fontFamily: serif, fontSize: 36, color: palette.ink, fontWeight: '700' },
  loaderText: { color: palette.inkSoft, fontStyle: 'italic', marginTop: 10 },
  appFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
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
    paddingVertical: 12,
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
  tabBtn: { alignItems: 'center', paddingHorizontal: 18, paddingVertical: 2 },
  tabIcon: { fontSize: 22, opacity: 0.45 },
  tabIconActive: { opacity: 1 },
  tabLabel: { fontSize: 10, fontWeight: '700', color: palette.inkFaint, marginTop: 2 },
  tabLabelActive: { color: palette.ink },
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
