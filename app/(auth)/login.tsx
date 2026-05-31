import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { C, COLORS, FONTS } from '@/constants/theme';

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) return;
    setLoading(true);
    const { error } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logoMain}>LTD.</Text>
          <Text style={styles.logoSub}> Financial</Text>
        </View>
        <Text style={styles.tagline}>Family budget, one place.</Text>

        {/* Mode toggle */}
        <View style={styles.toggle}>
          {(['login', 'signup'] as Mode[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.toggleBtn, mode === m && styles.toggleActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.toggleLabel, mode === m && styles.toggleLabelActive]}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Fields */}
        <View style={styles.fields}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.textTertiary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={COLORS.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.submitLabel}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Text>
          }
        </TouchableOpacity>

        <Text style={styles.hint}>
          {mode === 'login'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <Text style={{ color: C.amber }} onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: { flex: 1, padding: 28, justifyContent: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 },
  logoMain: { fontFamily: FONTS.serif, fontSize: 32, fontWeight: '700', color: COLORS.text },
  logoSub: { fontFamily: FONTS.mono, fontSize: 16, color: COLORS.textTertiary },
  tagline: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textSecondary, marginBottom: 40 },
  toggle: { flexDirection: 'row', backgroundColor: COLORS.bgSecondary, borderRadius: 10, padding: 4, marginBottom: 24 },
  toggleBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center' },
  toggleActive: { backgroundColor: C.amber },
  toggleLabel: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textTertiary, fontWeight: '600' },
  toggleLabelActive: { color: '#000' },
  fields: { gap: 12, marginBottom: 20 },
  input: {
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, padding: 14,
    color: COLORS.text, fontSize: 14,
    fontFamily: FONTS.mono,
  },
  submitBtn: {
    backgroundColor: C.amber, borderRadius: 10,
    padding: 15, alignItems: 'center', marginBottom: 16,
  },
  submitLabel: { fontFamily: FONTS.mono, fontSize: 14, fontWeight: '700', color: '#000' },
  hint: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textTertiary, textAlign: 'center' },
});
