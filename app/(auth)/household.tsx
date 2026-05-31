import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { C, COLORS, FONTS } from '@/constants/theme';

type Mode = 'create' | 'join';

export default function HouseholdScreen() {
  const [mode, setMode] = useState<Mode>('create');
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const createHousehold = async () => {
    setLoading(true);
    const { error } = await supabase.rpc('create_household', {
      household_name: householdName.trim() || 'My Household',
    });
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
    // _layout.tsx will redirect to tabs once household_members row exists
  };

  const joinHousehold = async () => {
    if (!inviteCode.trim()) return;
    setLoading(true);
    const { error } = await supabase.rpc('join_household', { code: inviteCode.trim() });
    setLoading(false);
    if (error) Alert.alert('Invalid code', 'Double-check the invite code and try again.');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.heading}>Set up your household</Text>
        <Text style={styles.sub}>Create a new household or join your partner's with their invite code.</Text>

        <View style={styles.toggle}>
          {(['create', 'join'] as Mode[]).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.toggleBtn, mode === m && styles.toggleActive]}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.toggleLabel, mode === m && styles.toggleLabelActive]}>
                {m === 'create' ? '✦ Create' : '↩ Join'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'create' ? (
          <>
            <Text style={styles.label}>Household name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Myers Household"
              placeholderTextColor={COLORS.textTertiary}
              value={householdName}
              onChangeText={setHouseholdName}
            />
            <Text style={styles.hint}>You'll get an invite code to share with your partner.</Text>
            <TouchableOpacity style={styles.btn} onPress={createHousehold} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.btnLabel}>Create Household</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.label}>Invite code</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="XXXXXXXX"
              placeholderTextColor={COLORS.textTertiary}
              value={inviteCode}
              onChangeText={v => setInviteCode(v.toUpperCase())}
              autoCapitalize="characters"
              maxLength={8}
            />
            <Text style={styles.hint}>Ask your partner for the 8-character code from their Settings tab.</Text>
            <TouchableOpacity style={styles.btn} onPress={joinHousehold} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.btnLabel}>Join Household</Text>
              }
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => supabase.auth.signOut()} style={styles.signOut}>
          <Text style={styles.signOutLabel}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: { flex: 1, padding: 28, justifyContent: 'center' },
  heading: { fontFamily: FONTS.serif, fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  sub: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textSecondary, marginBottom: 36, lineHeight: 20 },
  toggle: { flexDirection: 'row', backgroundColor: COLORS.bgSecondary, borderRadius: 10, padding: 4, marginBottom: 28 },
  toggleBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center' },
  toggleActive: { backgroundColor: C.amber },
  toggleLabel: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textTertiary, fontWeight: '600' },
  toggleLabelActive: { color: '#000' },
  label: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  input: {
    backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, padding: 14, color: COLORS.text, fontSize: 14,
    fontFamily: FONTS.mono, marginBottom: 10,
  },
  codeInput: { fontSize: 24, fontWeight: '700', letterSpacing: 8, textAlign: 'center', color: C.amber },
  hint: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textTertiary, marginBottom: 24, lineHeight: 18 },
  btn: { backgroundColor: C.amber, borderRadius: 10, padding: 15, alignItems: 'center' },
  btnLabel: { fontFamily: FONTS.mono, fontSize: 14, fontWeight: '700', color: '#000' },
  signOut: { marginTop: 32, alignItems: 'center' },
  signOutLabel: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textTertiary },
});
