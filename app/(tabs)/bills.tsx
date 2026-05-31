import { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, CAT_CLR, COLORS, FONTS } from '@/constants/theme';
import { useHousehold } from '@/hooks/useHousehold';
import { useBudget } from '@/hooks/useBudget';
import { getMonthPaychecks, assignBills, fmt, fmtDate, mk, MONTHS } from '@/lib/finance';

const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[chipS.wrap, { backgroundColor: color + '22' }]}>
      <Text style={[chipS.label, { color }]}>{label}</Text>
    </View>
  );
}
const chipS = StyleSheet.create({
  wrap: { borderRadius: 20, paddingHorizontal: 6, paddingVertical: 2 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: FONTS.mono },
});

function ThinBar({ pct, color, height = 4 }: { pct: number; color: string; height?: number }) {
  return (
    <View style={{ height, backgroundColor: COLORS.bg, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.max(Math.min(pct, 100), 0.5)}%`, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export default function BillsScreen() {
  const { household, loading: hhLoading } = useHousehold();
  const {
    settings, bills, bnpl, paidMap, loading,
    togglePaid,
  } = useBudget(household?.id ?? null);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const mkey = mk(year, month);

  const schedule = useMemo(() => ({
    income: settings?.income ?? 5124,
    scheduleType: settings?.schedule_type ?? 'semi_monthly',
    semiDay1: settings?.semi_day1 ?? 10,
    semiDay2: settings?.semi_day2 ?? 24,
    biAnchor: settings?.bi_anchor ?? undefined,
    custWeekdays: settings?.cust_weekdays ?? ['FR'],
    custFreq: settings?.cust_freq ?? 'every_other',
    custAnchor: settings?.cust_anchor ?? undefined,
  }), [settings]);

  const paychecks = useMemo(() => getMonthPaychecks(schedule, year, month), [schedule, year, month]);

  const billMap = useMemo(() =>
    assignBills(
      bills.map(b => ({ id: b.id, dueDay: b.due_day, pcIdx: b.pc_idx })),
      paychecks, year, month
    ),
    [bills, paychecks, year, month]
  );

  const isPaid = (itemId: string) => !!paidMap[`${mkey}:${itemId}`];

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  if (hhLoading || loading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.center}>
          <ActivityIndicator color={C.amber} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const totalDue = bills.reduce((a, b) => a + (b.amount || 0), 0);
  const totalPaid = bills.filter(b => isPaid(b.id)).reduce((a, b) => a + (b.amount || 0), 0);
  const pct = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  return (
    <SafeAreaView style={s.safeArea} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>LTD. <Text style={s.headerSub}>Financial</Text></Text>
          <Text style={s.headerMeta}>{fmt(settings?.income ?? 0)}/mo · {settings?.schedule_type ?? '—'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.householdName}>{household?.name ?? ''}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Month nav */}
        <View style={s.monthNav}>
          <TouchableOpacity style={s.navBtn} onPress={prevMonth}><Text style={s.navArrow}>‹</Text></TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={s.monthTitle}>{MONTHS[month]} {year}</Text>
            <Text style={s.monthMeta}>{paychecks.length} paycheck{paychecks.length !== 1 ? 's' : ''}</Text>
          </View>
          <TouchableOpacity style={s.navBtn} onPress={nextMonth}><Text style={s.navArrow}>›</Text></TouchableOpacity>
        </View>

        {/* Summary card */}
        <View style={s.card}>
          <View style={s.summaryRow}>
            <View>
              <Text style={s.summaryAmt}>{fmt(totalDue)}</Text>
              <Text style={s.summaryLabel}>total due</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.summaryAmt, { color: C.green }]}>{fmt(totalPaid)}</Text>
              <Text style={s.summaryLabel}>cleared</Text>
            </View>
          </View>
          <ThinBar pct={pct} color={C.green} height={5} />
          <Text style={s.pctLabel}>{pct}% paid this month</Text>
        </View>

        {/* Paycheck sections */}
        {paychecks.map((pc, idx) => {
          const pcBills = bills
            .filter(b => billMap[b.id] === idx)
            .sort((a, b) => (a.due_day ?? 99) - (b.due_day ?? 99));

          const pcBNPL = bnpl
            .filter(p => !p.family_covered && (p.balance || 0) > 0.01)
            .filter(p => {
              if (!p.due_day || !paychecks.length) return idx === paychecks.length - 1;
              const due = new Date(year, month, p.due_day);
              let ai = -1;
              paychecks.forEach((c, i) => { if (c.date <= due) ai = i; });
              return (ai >= 0 ? ai : paychecks.length - 1) === idx;
            })
            .sort((a, b) => (a.due_day ?? 99) - (b.due_day ?? 99));

          const total = pcBills.reduce((a, b) => a + (b.amount || 0), 0)
            + pcBNPL.reduce((a, p) => a + (p.payment || 0), 0);
          const paidAmt = pcBills.filter(b => isPaid(b.id)).reduce((a, b) => a + (b.amount || 0), 0)
            + pcBNPL.filter(p => isPaid(`bnpl_${p.id}`)).reduce((a, p) => a + (p.payment || 0), 0);
          const rem = pc.amount - total;
          const pcPct = total > 0 ? Math.round((paidAmt / total) * 100) : 0;

          return (
            <View key={idx} style={s.card}>
              {/* PC header */}
              <View style={[s.pcHeader, { backgroundColor: C.amberDim }]}>
                <View>
                  <Text style={s.pcNum}>Paycheck {idx + 1}</Text>
                  <Text style={s.pcDate}>{fmtDate(pc.date)}, {year}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.pcAmt}>{fmt(pc.amount)}</Text>
                  <Text style={[s.pcRem, { color: rem >= 0 ? C.green : C.red }]}>
                    {rem >= 0 ? '+' : ''}{fmt(rem)} left
                  </Text>
                </View>
              </View>
              <ThinBar pct={pcPct} color={C.amber} height={2} />

              {pcBills.length === 0 && pcBNPL.length === 0 && (
                <View style={s.emptyRow}>
                  <Text style={s.emptyText}>No bills assigned.</Text>
                </View>
              )}

              {/* Bills */}
              {pcBills.map(b => {
                const paid = isPaid(b.id);
                const col = CAT_CLR[b.cat] ?? '#888';
                const isZero = !b.amount;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[s.billRow, { opacity: isZero ? 0.3 : 1 }]}
                    onPress={() => togglePaid(mkey, b.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[s.checkbox, paid && { backgroundColor: C.green, borderColor: C.green }]}>
                      {paid && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
                    </View>
                    <View style={s.billMid}>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={[s.billName, paid && s.billNamePaid]}>{b.name}</Text>
                        <Chip label={b.cat} color={col} />
                      </View>
                      {!!b.note && <Text style={s.billNote}>{b.note}</Text>}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.billAmt, paid && { color: COLORS.textTertiary }]}>
                        {b.amount ? fmt(b.amount) : '–'}
                      </Text>
                      {!!b.due_day && (
                        <Text style={s.billDue}>Due {MONTHS_SHORT[month]} {b.due_day}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* BNPL rows */}
              {pcBNPL.length > 0 && (
                <>
                  <View style={s.bnplHeader}>
                    <Text style={s.bnplHeaderLabel}>BNPL Payments</Text>
                    <Text style={s.bnplHeaderCount}>{pcBNPL.length} plan{pcBNPL.length > 1 ? 's' : ''}</Text>
                  </View>
                  {pcBNPL.map(p => {
                    const paid = isPaid(`bnpl_${p.id}`);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={s.billRow}
                        onPress={() => togglePaid(mkey, `bnpl_${p.id}`)}
                        activeOpacity={0.7}
                      >
                        <View style={[s.checkbox, paid && { backgroundColor: C.green, borderColor: C.green }, { borderColor: C.orange }]}>
                          {paid && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
                        </View>
                        <View style={s.billMid}>
                          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Text style={[s.billName, paid && s.billNamePaid]}>{p.name}</Text>
                            <Chip label="BNPL" color={C.orange} />
                          </View>
                          <Text style={s.billNote}>
                            {p.provider} · {p.total - p.made} left{p.due_day ? ` · Due ${MONTHS_SHORT[month]} ${p.due_day}` : ''}
                          </Text>
                        </View>
                        <Text style={[s.billAmt, paid && { color: COLORS.textTertiary }, { color: paid ? COLORS.textTertiary : C.orange }]}>
                          {fmt(p.payment)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {/* Footer */}
              <View style={s.pcFooter}>
                <Text style={s.pcFooterText}>{fmt(paidAmt)} / {fmt(total)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontFamily: FONTS.serif, fontSize: 20, fontWeight: '700', color: COLORS.text },
  headerSub: { fontFamily: FONTS.mono, fontSize: 13, fontWeight: '400', color: COLORS.textTertiary },
  headerMeta: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary, marginTop: 1 },
  householdName: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textSecondary },
  scroll: { flex: 1 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bgSecondary, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 20, color: COLORS.text },
  monthTitle: { fontFamily: FONTS.serif, fontSize: 18, fontWeight: '700', color: COLORS.text },
  monthMeta: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary },
  card: { backgroundColor: COLORS.bgSecondary, borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', padding: 14, paddingBottom: 10 },
  summaryAmt: { fontFamily: FONTS.mono, fontSize: 24, fontWeight: '700', color: COLORS.text },
  summaryLabel: { fontFamily: FONTS.mono, fontSize: 9, color: COLORS.textTertiary, marginTop: 2 },
  pctLabel: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary, textAlign: 'center', paddingBottom: 10 },
  pcHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 16 },
  pcNum: { fontFamily: FONTS.mono, fontSize: 9, color: C.amber, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  pcDate: { fontFamily: FONTS.serif, fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  pcAmt: { fontFamily: FONTS.mono, fontSize: 18, fontWeight: '700', color: C.amber },
  pcRem: { fontFamily: FONTS.mono, fontSize: 9, fontWeight: '700', marginTop: 1 },
  emptyRow: { padding: 14, paddingHorizontal: 16 },
  emptyText: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textTertiary },
  billRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 13, paddingHorizontal: 16,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 7, flexShrink: 0,
    borderWidth: 1.5, borderColor: COLORS.borderSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  billMid: { flex: 1, minWidth: 0 },
  billName: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  billNamePaid: { textDecorationLine: 'line-through', color: COLORS.textTertiary, fontWeight: '400' },
  billNote: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary, marginTop: 2 },
  billAmt: { fontFamily: FONTS.mono, fontSize: 14, fontWeight: '600', color: COLORS.text },
  billDue: { fontFamily: FONTS.mono, fontSize: 9, color: COLORS.textTertiary, marginTop: 2 },
  bnplHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 5, paddingHorizontal: 16,
    backgroundColor: COLORS.bg,
    borderTopWidth: 0.5, borderTopColor: COLORS.border,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  bnplHeaderLabel: { fontFamily: FONTS.mono, fontSize: 9, fontWeight: '700', color: C.orange, letterSpacing: 1, textTransform: 'uppercase' },
  bnplHeaderCount: { fontFamily: FONTS.mono, fontSize: 9, color: COLORS.textTertiary },
  pcFooter: { padding: 10, paddingHorizontal: 16 },
  pcFooterText: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary },
});
