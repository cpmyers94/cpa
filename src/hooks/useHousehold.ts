import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type Household = { id: string; name: string; invite_code: string };

export function useHousehold() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from('household_members')
        .select('household_id, households(id, name, invite_code)')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.households) {
        const hh = data.households as unknown as Household;
        setHousehold(hh);
      }
      setLoading(false);
    });
  }, []);

  return { household, loading };
}
