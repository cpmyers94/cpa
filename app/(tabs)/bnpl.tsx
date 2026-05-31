import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, C } from '@/constants/theme';

export default function BNPLScreen() {
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.center}>
        <Text style={s.emoji}>💳</Text>
        <Text style={s.label}>BNPL — coming next</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emoji: { fontSize: 40 },
  label: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textTertiary },
});
