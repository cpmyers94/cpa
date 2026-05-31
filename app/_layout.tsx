import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [householdId, setHouseholdId] = useState<string | null | undefined>(undefined);
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
    if (!session) { setHouseholdId(undefined); return; }
    supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setHouseholdId(data?.household_id ?? null));
  }, [session]);

  useEffect(() => {
    if (householdId === undefined) return; // still loading
    const inAuth = segments[0] === '(auth)';
    const inTabs = segments[0] === '(tabs)';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/login');
    } else if (householdId === null) {
      router.replace('/(auth)/household');
    } else {
      if (!inTabs) router.replace('/(tabs)/bills');
    }
  }, [session, householdId, segments]);

  return <Slot />;
}
