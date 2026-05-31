import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, C } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useHousehold } from '@/hooks/useHousehold';

export default function SettingsScreen() {
  const { household } = useHousehold();

  const signOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>Settings</Text>

        {household && (
          <View style={s.card}>
            <Text style={s.cardLabel}>Household</Text>
            <Text style={s.cardValue}>{household.name}</Text>
            <View style={s.divider} />
            <Text style={s.cardLabel}>Invite code</Text>
            <Text style={s.inviteCode}>{household.invite_code}</Text>
            <Text style={s.inviteHint}>Share this code with your partner to join your household.</Text>
          </View>
        )}

        <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
          <Text style={s.signOutLabel}>Sign out</Text>
        </TouchableOpacity>

        <Text style={s.note}>More settings (schedule, debts, bills) coming next.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 20 },
  heading: { fontFamily: FONTS.serif, fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 24 },
  card: { backgroundColor: COLORS.bgSecondary, borderRadius: 14, padding: 16, marginBottom: 16 },
  cardLabel: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  cardValue: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.text, marginBottom: 12 },
  divider: { height: 0.5, backgroundColor: COLORS.border, marginBottom: 12 },
  inviteCode: { fontFamily: FONTS.mono, fontSize: 28, fontWeight: '700', color: C.amber, letterSpacing: 8, marginBottom: 6 },
  inviteHint: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textTertiary, lineHeight: 18 },
  signOutBtn: { backgroundColor: COLORS.bgSecondary, borderRadius: 10, padding: 15, alignItems: 'center', marginBottom: 16 },
  signOutLabel: { fontFamily: FONTS.mono, fontSize: 14, color: C.red, fontWeight: '600' },
  note: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textTertiary, textAlign: 'center' },
});
