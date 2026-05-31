import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type Bill = Database['public']['Tables']['bills']['Row'];
type Debt = Database['public']['Tables']['debts']['Row'];
type BNPLPlan = Database['public']['Tables']['bnpl_plans']['Row'];
type PaidStatus = Database['public']['Tables']['paid_status']['Row'];
type Settings = Database['public']['Tables']['settings']['Row'];
type Windfall = Database['public']['Tables']['windfalls']['Row'];

export type { Bill, Debt, BNPLPlan, PaidStatus, Settings, Windfall };

export function useBudget(householdId: string | null) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [bnpl, setBnpl] = useState<BNPLPlan[]>([]);
  const [paidMap, setPaidMap] = useState<Record<string, boolean>>({});
  const [windfalls, setWindfalls] = useState<Windfall[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    const [s, b, d, p, ps, w] = await Promise.all([
      supabase.from('settings').select('*').eq('household_id', householdId).maybeSingle(),
      supabase.from('bills').select('*').eq('household_id', householdId).order('sort_order'),
      supabase.from('debts').select('*').eq('household_id', householdId).order('created_at'),
      supabase.from('bnpl_plans').select('*').eq('household_id', householdId).order('created_at'),
      supabase.from('paid_status').select('*').eq('household_id', householdId),
      supabase.from('windfalls').select('*').eq('household_id', householdId).order('created_at'),
    ]);
    if (s.data) setSettings(s.data);
    if (b.data) setBills(b.data);
    if (d.data) setDebts(d.data);
    if (p.data) setBnpl(p.data);
    if (ps.data) {
      const m: Record<string, boolean> = {};
      ps.data.forEach(r => { m[`${r.month_key}:${r.item_id}`] = r.paid; });
      setPaidMap(m);
    }
    if (w.data) setWindfalls(w.data);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    load();

    // Real-time subscriptions — partner's changes arrive instantly
    const channel = supabase.channel(`household:${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `household_id=eq.${householdId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts', filter: `household_id=eq.${householdId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bnpl_plans', filter: `household_id=eq.${householdId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paid_status', filter: `household_id=eq.${householdId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `household_id=eq.${householdId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'windfalls', filter: `household_id=eq.${householdId}` }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [householdId, load]);

  const togglePaid = useCallback(async (monthKey: string, itemId: string) => {
    if (!householdId) return;
    const key = `${monthKey}:${itemId}`;
    const current = !!paidMap[key];
    // Optimistic update
    setPaidMap(prev => ({ ...prev, [key]: !current }));
    if (!current) {
      await supabase.from('paid_status').upsert(
        { household_id: householdId, month_key: monthKey, item_id: itemId, paid: true },
        { onConflict: 'household_id,month_key,item_id' }
      );
    } else {
      await supabase.from('paid_status')
        .delete()
        .eq('household_id', householdId)
        .eq('month_key', monthKey)
        .eq('item_id', itemId);
    }
  }, [householdId, paidMap]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    if (!householdId) return;
    setSettings(prev => prev ? { ...prev, ...patch } : prev);
    await supabase.from('settings').update(patch).eq('household_id', householdId);
  }, [householdId]);

  const addBill = useCallback(async (bill: Omit<Bill, 'id' | 'created_at'>) => {
    const { data } = await supabase.from('bills').insert(bill).select().single();
    if (data) setBills(prev => [...prev, data]);
  }, []);

  const deleteBill = useCallback(async (id: string) => {
    setBills(prev => prev.filter(b => b.id !== id));
    await supabase.from('bills').delete().eq('id', id);
  }, []);

  const updateDebtBalance = useCallback(async (id: string, balance: number) => {
    setDebts(prev => prev.map(d => d.id === id ? { ...d, balance } : d));
    await supabase.from('debts').update({ balance }).eq('id', id);
  }, []);

  const addDebt = useCallback(async (debt: Omit<Debt, 'id' | 'created_at'>) => {
    const { data } = await supabase.from('debts').insert(debt).select().single();
    if (data) setDebts(prev => [...prev, data]);
  }, []);

  const deleteDebt = useCallback(async (id: string) => {
    setDebts(prev => prev.filter(d => d.id !== id));
    await supabase.from('debts').delete().eq('id', id);
  }, []);

  const addBNPL = useCallback(async (plan: Omit<BNPLPlan, 'id' | 'created_at'>) => {
    const { data } = await supabase.from('bnpl_plans').insert(plan).select().single();
    if (data) setBnpl(prev => [...prev, data]);
  }, []);

  const deleteBNPL = useCallback(async (id: string) => {
    setBnpl(prev => prev.filter(p => p.id !== id));
    await supabase.from('bnpl_plans').delete().eq('id', id);
  }, []);

  const addWindfall = useCallback(async (wf: Omit<Windfall, 'id' | 'created_at'>) => {
    const { data } = await supabase.from('windfalls').insert(wf).select().single();
    if (data) setWindfalls(prev => [...prev, data]);
  }, []);

  const deleteWindfall = useCallback(async (id: string) => {
    setWindfalls(prev => prev.filter(w => w.id !== id));
    await supabase.from('windfalls').delete().eq('id', id);
  }, []);

  return {
    settings, bills, debts, bnpl, paidMap, windfalls, loading,
    togglePaid, updateSettings,
    addBill, deleteBill,
    updateDebtBalance, addDebt, deleteDebt,
    addBNPL, deleteBNPL,
    addWindfall, deleteWindfall,
  };
}
