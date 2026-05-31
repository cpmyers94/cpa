import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type HouseholdState = {
  id: string;
  onboardingDone: boolean;
} | null | undefined; // undefined = loading, null = no household

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [household, setHousehold] = useState<HouseholdState>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setHousehold(undefined); return; }

    (async () => {
      const { data: member } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!member) { setHousehold(null); return; }

      const { data: settings } = await supabase
        .from('settings')
        .select('onboarding_done')
        .eq('household_id', member.household_id)
        .maybeSingle();

      setHousehold({
        id: member.household_id,
        onboardingDone: (settings as any)?.onboarding_done ?? false,
      });
    })();
  }, [session]);

  useEffect(() => {
    if (household === undefined) return; // still loading

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inTabs = segments[0] === '(tabs)';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/login');
    } else if (household === null) {
      router.replace('/(auth)/household');
    } else if (!household.onboardingDone) {
      if (!inOnboarding) router.replace('/(onboarding)/bnpl-wizard');
    } else {
      if (!inTabs) router.replace('/(tabs)/bills');
    }
  }, [session, household, segments]);

  return <Slot />;
}
