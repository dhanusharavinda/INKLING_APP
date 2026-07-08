import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { palette, serif, radius } from '../theme';
import { Button } from '../components/ui';
import EmotionAvatar from '../components/EmotionAvatar';
import { confirmPasswordReset, friendlyCloudError, requestPasswordReset, signIn, signUp } from '../cloud';

interface Props {
  onAuthed: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

export default function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const valid =
    mode === 'forgot'
      ? emailOk
      : mode === 'reset'
      ? emailOk && resetCode.trim().length >= 6 && password.length >= 6
      : emailOk && password.length >= 6;

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError(null);
    setInfo(null);
    if (m !== 'reset') setResetCode('');
    if (m === 'forgot' || m === 'reset') setPassword('');
  };

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signup') {
        const res = await signUp(email, password);
        if (res.needsConfirmation) {
          setInfo('Check your email to confirm your account, then sign in.');
          setMode('signin');
          setBusy(false);
          return;
        }
      } else if (mode === 'signin') {
        await signIn(email, password);
      } else if (mode === 'forgot') {
        await requestPasswordReset(email);
        switchMode('reset');
        setInfo('Check your email for a 6-digit reset code, then enter it below with a new password.');
        setBusy(false);
        return;
      } else {
        await confirmPasswordReset(email, resetCode, password);
        onAuthed();
        return;
      }
      onAuthed();
    } catch (e) {
      setError(friendlyCloudError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <EmotionAvatar emotion="wonder" size={96} animated />
          <Text style={styles.brand}>Inkling</Text>
          <Text style={styles.tagline}>a journal that remembers how you felt</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {mode === 'signup'
              ? 'Create your account'
              : mode === 'signin'
              ? 'Welcome back'
              : mode === 'forgot'
              ? 'Reset your password'
              : 'Enter your reset code'}
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={palette.inkFaint}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
          />

          {mode === 'reset' && (
            <>
              <Text style={styles.label}>6-digit code from the email</Text>
              <TextInput
                style={[styles.input, { letterSpacing: 6, textAlign: 'center' }]}
                placeholder="123456"
                placeholderTextColor={palette.inkFaint}
                value={resetCode}
                onChangeText={setResetCode}
                keyboardType="number-pad"
                maxLength={6}
                editable={!busy}
              />
            </>
          )}

          {mode !== 'forgot' && (
            <>
              <Text style={styles.label}>{mode === 'reset' ? 'New password' : 'Password'}</Text>
              <TextInput
                style={styles.input}
                placeholder="at least 6 characters"
                placeholderTextColor={palette.inkFaint}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
          {info && <Text style={styles.info}>{info}</Text>}

          <View style={{ marginTop: 16 }}>
            {busy ? (
              <View style={styles.busy}>
                <ActivityIndicator color={palette.accent} />
              </View>
            ) : (
              <Button
                label={
                  mode === 'signup'
                    ? 'Create account'
                    : mode === 'signin'
                    ? 'Sign in'
                    : mode === 'forgot'
                    ? 'Email me a reset code'
                    : 'Set new password'
                }
                onPress={submit}
                disabled={!valid}
              />
            )}
          </View>

          {mode === 'signin' && (
            <Pressable
              onPress={() => switchMode('forgot')}
              style={{ marginTop: 14, alignItems: 'center' }}
              hitSlop={8}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            style={{ marginTop: 14, alignItems: 'center' }}
            hitSlop={8}
          >
            <Text style={styles.switchText}>
              {mode === 'signup'
                ? 'Already have an account? Sign in'
                : mode === 'signin'
                ? 'New here? Create an account'
                : 'Back to sign in'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          Your entries are private to your account and protected by row-level security.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  container: { padding: 24, paddingTop: 60, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: 28 },
  brand: { fontFamily: serif, fontSize: 40, color: palette.ink, fontWeight: '700', marginTop: 10 },
  tagline: { fontSize: 14, color: palette.inkSoft, fontStyle: 'italic', marginTop: 2 },
  card: {
    backgroundColor: palette.card,
    borderRadius: radius.card,
    padding: 22,
    shadowColor: '#3A3340',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cardTitle: {
    fontFamily: serif,
    fontSize: 22,
    fontWeight: '700',
    color: palette.ink,
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: palette.inkSoft,
    marginTop: 12,
  },
  input: {
    backgroundColor: palette.bg,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: palette.ink,
    marginTop: 6,
  },
  error: { color: palette.danger, fontSize: 13, fontWeight: '600', marginTop: 12, lineHeight: 18 },
  info: { color: palette.mint, fontSize: 13, fontWeight: '700', marginTop: 12, lineHeight: 18 },
  busy: { paddingVertical: 14, alignItems: 'center' },
  switchText: { color: palette.accent, fontWeight: '700', fontSize: 14 },
  forgotText: { color: palette.inkSoft, fontWeight: '700', fontSize: 13 },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: palette.inkFaint,
    marginTop: 24,
    lineHeight: 18,
    paddingHorizontal: 10,
  },
});
