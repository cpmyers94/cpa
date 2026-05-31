import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C, COLORS, FONTS } from '@/constants/theme';

const TABS = [
  { name: 'bills',    icon: '📋', label: 'Bills'    },
  { name: 'bnpl',     icon: '💳', label: 'BNPL'     },
  { name: 'snowball', icon: '❄️', label: 'Snowball' },
  { name: 'advice',   icon: '💡', label: 'Advice'   },
  { name: 'settings', icon: '⚙️', label: 'Settings' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.bgSecondary,
          borderTopColor: COLORS.border,
          borderTopWidth: 0.5,
          height: 70,
          paddingBottom: 12,
        },
        tabBarActiveTintColor: C.amber,
        tabBarInactiveTintColor: COLORS.textTertiary,
        tabBarLabelStyle: { fontFamily: FONTS.mono, fontSize: 9, letterSpacing: 0.5 },
      }}
    >
      {TABS.map(t => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            tabBarLabel: t.label,
            tabBarIcon: ({ focused }) => (
              <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>{t.icon}</Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
