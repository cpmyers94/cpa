import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Switch, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useHousehold } from '@/hooks/useHousehold';
import { C, COLORS, FONTS } from '@/constants/theme';

// ── Providers ─────────────────────────────────────────────────────────
const PROVIDERS = [
  { name: 'Affirm',          color: C.orange,  emoji: '🟠' },
  { name: 'Klarna',          color: C.pink,    emoji: '🩷' },
  { name: 'Afterpay',        color: C.green,   emoji: '🟢' },
  { name: 'PayPal Pay Later',color: C.blue,    emoji: '🔵' },
  { name: 'Apple Pay Later', color: '#a3a3a3', emoji: '⚪' },
  { name: 'Other',           color: '#888',    emoji: '💳' },
];

const PLAN_NAME_HINTS = ['Wedding venue', 'Golf clubs', 'New laptop', 'Furniture', 'Engagement ring'];

type Step = 'intro' | 'provider' | 'details' | 'added' | 'snowball' | 'saving';

type PlanDraft = {
  provider: string;
  providerColor: string;
  name: string;
  balance: string;
  payment: string;
  made: string;
  total: string;
  dueDay: string;
  familyCovered: boolean;
};

const emptyDraft = (): PlanDraft => ({
  provider: '', providerColor: '', name: '',
  balance: '', payment: '', made: '', total: '',
  dueDay: '', familyCovered: false,
});

// ── Helpers ───────────────────────────────────────────────────────────
function estimateTotal(balance: string, payment: string): string {
  const b = parseFloat(balance), p = parseFloat(payment);
  if (!b || !p || p <= 0) return '';
  return String(Math.ceil(b / p));
}

// ── Sub-components ────────────────────────────────────────────────────
function ProgressBar({ step }: { step: Step }) {
  const steps: Step[] = ['intro', 'provider', 'details', 'added', 'snowball'];
  const idx = steps.indexOf(step);
  const pct = idx < 0 ? 100 : Math.round(((idx + 1) / steps.length) * 100);
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${pct}%` }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 3, backgroundColor: COLORS.bgTertiary, borderRadius: 2, marginHorizontal: 20, marginBottom: 4 },
  fill: { height: '100%', backgroundColor: C.amber, borderRadius: 2 },
});

function PlanPreviewCard({ plan }: { plan: PlanDraft }) {
  const bal = parseFloat(plan.balance) || 0;
  const pmt = parseFloat(plan.payment) || 0;
  const made = parseInt(plan.made) || 0;
  const total = parseInt(plan.total) || 0;
  const pct = total > 0 ? Math.round((made / total) * 100) : 0;
  return (
    <View style={[prev.card, { borderColor: plan.providerColor + '44' }]}>
      <View style={prev.row}>
        <View style={{ flex: 1 }}>
          <Text style={prev.name}>{plan.name || 'Unnamed plan'}</Text>
          <Text style={[prev.provider, { color: plan.providerColor }]}>{plan.provider}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={prev.balance}>${bal.toFixed(2)}</Text>
          <Text style={prev.payment}>${pmt.toFixed(2)}/mo</Text>
        </View>
      </View>
      {total > 0 && (
        <View style={prev.progressRow}>
          <Text style={prev.progressLabel}>{made} of {total} payments · {pct}% done</Text>
          <View style={prev.track}>
            <View style={[prev.fill, { width: `${pct}%`, backgroundColor: plan.providerColor }]} />
          </View>
        </View>
      )}
      {plan.familyCovered && (
        <View style={prev.familyBadge}>
          <Text style={prev.familyText}>👨‍👩‍👧 Family covered</Text>
        </View>
      )}
    </View>
  );
}
const prev = StyleSheet.create({
  card: { backgroundColor: COLORS.bgTertiary, borderRadius: 12, padding: 14, borderWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  provider: { fontFamily: FONTS.mono, fontSize: 11, fontWeight: '600' },
  balance: { fontFamily: FONTS.mono, fontSize: 18, fontWeight: '700', color: COLORS.text },
  payment: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  progressRow: { gap: 5 },
  progressLabel: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary },
  track: { height: 4, backgroundColor: COLORS.bg, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  familyBadge: { marginTop: 8, alignSelf: 'flex-start' },
  familyText: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textSecondary },
});

function Field({
  label, value, onChange, placeholder, keyboardType = 'default', prefix, autoFocus = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: any; prefix?: string; autoFocus?: boolean;
}) {
  return (
    <View style={fld.wrap}>
      <Text style={fld.label}>{label}</Text>
      <View style={fld.inputRow}>
        {prefix && <Text style={fld.prefix}>{prefix}</Text>}
        <TextInput
          style={[fld.input, prefix && { paddingLeft: 4 }]}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textTertiary}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
        />
      </View>
    </View>
  );
}
const fld = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgTertiary, borderRadius: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  prefix: { fontFamily: FONTS.mono, fontSize: 16, color: COLORS.textSecondary, paddingRight: 2 },
  input: { flex: 1, paddingVertical: 13, color: COLORS.text, fontSize: 15, fontFamily: FONTS.mono },
});

// ── Main Wizard ───────────────────────────────────────────────────────
function suggestSnowball(income: number, bnplTotal: number): number {
  // 15% of income, rounded to nearest $25, min $50
  const raw = Math.max(50, (income * 0.15) - bnplTotal * 0.25);
  return Math.round(raw / 25) * 25;
}

const QUICK_PICKS = [50, 100, 200, 300, 500];

export default function BNPLWizard() {
  const { household } = useHousehold();
  const [step, setStep] = useState<Step>('intro');
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft());
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const hintIdx = useRef(Math.floor(Math.random() * PLAN_NAME_HINTS.length));
  const [income, setIncome] = useState('');
  const [snowball, setSnowball] = useState(0);
  const [snowballSet, setSnowballSet] = useState(false); // true once auto-suggested

  const upd = (k: keyof PlanDraft) => (v: any) => setDraft(d => ({ ...d, [k]: v }));

  const selectProvider = (p: typeof PROVIDERS[number]) => {
    setDraft(d => ({ ...d, provider: p.name, providerColor: p.color }));
    setStep('details');
  };

  const addPlan = () => {
    if (!draft.balance || !draft.payment) {
      Alert.alert('Missing info', 'Balance and monthly payment are required.');
      return;
    }
    // Auto-estimate total if blank
    const finalDraft = {
      ...draft,
      total: draft.total || estimateTotal(draft.balance, draft.payment),
    };
    setPlans(p => [...p, finalDraft]);
    setStep('added');
  };

  const addAnother = () => {
    setDraft(emptyDraft());
    setStep('provider');
    hintIdx.current = Math.floor(Math.random() * PLAN_NAME_HINTS.length);
  };

  const goToSnowball = () => setStep('snowball');

  const onIncomeChange = (v: string) => {
    setIncome(v);
    // Auto-suggest once they type a valid income, but don't override manual changes
    if (!snowballSet) {
      const inc = parseFloat(v) || 0;
      if (inc > 0) {
        const bnplTotal = plans.reduce((a, p) => a + (parseFloat(p.payment) || 0), 0);
        setSnowball(suggestSnowball(inc, bnplTotal));
      }
    }
  };

  const adjustSnowball = (delta: number) => {
    setSnowballSet(true);
    setSnowball(prev => Math.max(0, prev + delta));
  };

  const saveAll = async () => {
    if (!household) return;
    setStep('saving');

    if (plans.length > 0) {
      const rows = plans.map(p => ({
        household_id: household.id,
        name: p.name || p.provider + ' plan',
        provider: p.provider,
        balance: parseFloat(p.balance) || 0,
        payment: parseFloat(p.payment) || 0,
        made: parseInt(p.made) || 0,
        total: parseInt(p.total) || 0,
        due_day: p.dueDay ? parseInt(p.dueDay) : null,
        apr: 0,
        color: p.providerColor,
        note: '',
        family_covered: p.familyCovered,
      }));
      await supabase.from('bnpl_plans').insert(rows);
    }

    const inc = parseFloat(income) || 0;
    await supabase.from('settings')
      .update({
        onboarding_done: true,
        ...(inc > 0 ? { income: inc } : {}),
        ...(snowball > 0 ? { snowball_extra: snowball } : {}),
      } as any)
      .eq('household_id', household.id);

    router.replace('/(tabs)/bills');
  };

  const skip = () => goToSnowball();

  // ── Step: Saving ──
  if (step === 'saving') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <ActivityIndicator color={C.amber} size="large" />
          <Text style={s.savingLabel}>Saving your plans…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ProgressBar step={step} />

      {/* ── Step: Intro ── */}
      {step === 'intro' && (
        <View style={s.stepWrap}>
          <View style={s.center}>
            <Text style={s.bigEmoji}>💳</Text>
            <Text style={s.heading}>Do you have any{'\n'}BNPL plans?</Text>
            <Text style={s.sub}>
              Buy Now Pay Later — Affirm, Klarna, Afterpay, etc.{'\n'}
              We'll track them alongside your bills and show you exactly when you'll be free.
            </Text>
          </View>
          <View style={s.btnStack}>
            <TouchableOpacity style={s.primaryBtn} onPress={() => setStep('provider')}>
              <Text style={s.primaryBtnLabel}>Yes, let's add them →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={skip}>
              <Text style={s.ghostBtnLabel}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Step: Provider ── */}
      {step === 'provider' && (
        <View style={s.stepWrap}>
          <View style={{ paddingHorizontal: 20, paddingTop: 16, marginBottom: 28 }}>
            <Text style={s.stepTag}>{plans.length > 0 ? `Plan ${plans.length + 1}` : 'First plan'}</Text>
            <Text style={s.heading}>Who's your provider?</Text>
          </View>
          <View style={grid.wrap}>
            {PROVIDERS.map(p => (
              <TouchableOpacity key={p.name} style={[grid.card, { borderColor: p.color + '55' }]} onPress={() => selectProvider(p)} activeOpacity={0.75}>
                <Text style={grid.emoji}>{p.emoji}</Text>
                <Text style={[grid.name, { color: p.color }]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {plans.length > 0 && (
            <TouchableOpacity style={[s.ghostBtn, { marginHorizontal: 20, marginTop: 16 }]} onPress={() => setStep('added')}>
              <Text style={s.ghostBtnLabel}>← Back to summary</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Step: Details ── */}
      {step === 'details' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.detailsScroll} keyboardShouldPersistTaps="handled">
            <View style={{ marginBottom: 20 }}>
              <View style={[chip.wrap, { backgroundColor: draft.providerColor + '22', alignSelf: 'flex-start' }]}>
                <Text style={[chip.label, { color: draft.providerColor }]}>{draft.provider}</Text>
              </View>
              <Text style={s.heading}>Plan details</Text>
            </View>

            <Field
              label="What did you buy?"
              value={draft.name}
              onChange={upd('name')}
              placeholder={PLAN_NAME_HINTS[hintIdx.current]}
              autoFocus
            />

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Field label="Remaining balance" value={draft.balance} onChange={upd('balance')} keyboardType="decimal-pad" prefix="$" />
              </View>
              <View style={{ width: 14 }} />
              <View style={{ flex: 1 }}>
                <Field label="Monthly payment" value={draft.payment} onChange={upd('payment')} keyboardType="decimal-pad" prefix="$" />
              </View>
            </View>

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Field label="Payments made" value={draft.made} onChange={upd('made')} keyboardType="number-pad" placeholder="e.g. 3" />
              </View>
              <View style={{ width: 14 }} />
              <View style={{ flex: 1 }}>
                <Field
                  label={draft.balance && draft.payment && !draft.total ? `Total  (est. ${estimateTotal(draft.balance, draft.payment)})` : 'Total payments'}
                  value={draft.total}
                  onChange={upd('total')}
                  keyboardType="number-pad"
                  placeholder={estimateTotal(draft.balance, draft.payment) || 'e.g. 12'}
                />
              </View>
            </View>

            <Field label="Due day of month" value={draft.dueDay} onChange={upd('dueDay')} keyboardType="number-pad" placeholder="e.g. 15 (or leave blank)" />

            <View style={toggle.row}>
              <View style={{ flex: 1 }}>
                <Text style={toggle.label}>Family is covering this</Text>
                <Text style={toggle.sub}>Exclude from your cascade calculations</Text>
              </View>
              <Switch
                value={draft.familyCovered}
                onValueChange={upd('familyCovered')}
                trackColor={{ false: COLORS.bgTertiary, true: C.amber + '88' }}
                thumbColor={draft.familyCovered ? C.amber : COLORS.textTertiary}
              />
            </View>

            <TouchableOpacity style={[s.primaryBtn, { marginTop: 8 }]} onPress={addPlan}>
              <Text style={s.primaryBtnLabel}>Add Plan →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={() => setStep('provider')}>
              <Text style={s.ghostBtnLabel}>← Change provider</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Step: Added ── */}
      {step === 'added' && (
        <ScrollView contentContainerStyle={s.addedScroll}>
          <Text style={s.stepTag}>{plans.length} plan{plans.length !== 1 ? 's' : ''} added</Text>
          <Text style={s.heading}>Looking good 🎯</Text>
          <Text style={s.sub}>Here's what you've added so far. Add more or finish up.</Text>

          <View style={{ gap: 10, marginBottom: 28 }}>
            {plans.map((p, i) => <PlanPreviewCard key={i} plan={p} />)}
          </View>

          <TouchableOpacity style={s.primaryBtn} onPress={addAnother}>
            <Text style={s.primaryBtnLabel}>+ Add another plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: C.green, marginTop: 10 }]}
            onPress={goToSnowball}
          >
            <Text style={s.primaryBtnLabel}>Done — set my snowball →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={goToSnowball}>
            <Text style={s.ghostBtnLabel}>Skip remaining setup</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      {/* ── Step: Snowball ── */}
      {step === 'snowball' && (() => {
        const bnplTotal = plans.reduce((a, p) => a + (parseFloat(p.payment) || 0), 0);
        const inc = parseFloat(income) || 0;
        const available = inc > 0 ? Math.max(0, inc - bnplTotal) : 0;
        return (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={s.addedScroll} keyboardShouldPersistTaps="handled">
              <Text style={s.stepTag}>Almost done</Text>
              <Text style={s.heading}>Set your snowball</Text>
              <Text style={[s.sub, { textAlign: 'left', marginBottom: 24 }]}>
                The snowball method throws extra money at your smallest debt first. Once it's gone, that payment rolls into the next one. Pick an amount you can commit to every month.
              </Text>

              {/* Income input */}
              <Field
                label="Monthly take-home income"
                value={income}
                onChange={onIncomeChange}
                keyboardType="decimal-pad"
                prefix="$"
                placeholder="e.g. 5000"
                autoFocus
              />

              {/* Math breakdown — only when income is entered */}
              {inc > 0 && (
                <View style={sb.breakdown}>
                  <View style={sb.row}>
                    <Text style={sb.rowLabel}>Monthly income</Text>
                    <Text style={sb.rowValue}>${inc.toLocaleString()}</Text>
                  </View>
                  {bnplTotal > 0 && (
                    <View style={sb.row}>
                      <Text style={sb.rowLabel}>BNPL commitment ({plans.length} plan{plans.length !== 1 ? 's' : ''})</Text>
                      <Text style={[sb.rowValue, { color: C.orange }]}>−${bnplTotal.toFixed(0)}</Text>
                    </View>
                  )}
                  <View style={[sb.row, sb.totalRow]}>
                    <Text style={[sb.rowLabel, { color: COLORS.text, fontWeight: '700' }]}>Available for snowball</Text>
                    <Text style={[sb.rowValue, { color: C.green, fontWeight: '700' }]}>${available.toFixed(0)}</Text>
                  </View>
                </View>
              )}

              {/* Stepper */}
              <Text style={fld.label}>Your snowball extra / month</Text>
              <View style={sb.stepper}>
                <TouchableOpacity style={sb.stepBtn} onPress={() => adjustSnowball(-25)}>
                  <Text style={sb.stepBtnLabel}>−</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={sb.stepValue}>${snowball.toLocaleString()}</Text>
                  <Text style={sb.stepSub}>/month</Text>
                </View>
                <TouchableOpacity style={sb.stepBtn} onPress={() => adjustSnowball(25)}>
                  <Text style={sb.stepBtnLabel}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Quick picks */}
              <View style={sb.quickRow}>
                {QUICK_PICKS.map(v => (
                  <TouchableOpacity
                    key={v}
                    style={[sb.quickChip, snowball === v && { backgroundColor: C.amber, borderColor: C.amber }]}
                    onPress={() => { setSnowball(v); setSnowballSet(true); }}
                  >
                    <Text style={[sb.quickLabel, snowball === v && { color: '#000' }]}>${v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {inc > 0 && snowball > available && (
                <View style={sb.warning}>
                  <Text style={sb.warningText}>⚠️ That's more than your estimated available income. Start lower — you can always increase it later.</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.primaryBtn, { marginTop: 24 }]}
                onPress={saveAll}
              >
                <Text style={s.primaryBtnLabel}>
                  {snowball > 0 ? `Lock in $${snowball}/mo → Let's go` : 'Skip snowball for now →'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        );
      })()}

    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  stepWrap: { flex: 1, paddingHorizontal: 20, paddingTop: 16, justifyContent: 'space-between', paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bigEmoji: { fontSize: 64, marginBottom: 20 },
  stepTag: { fontFamily: FONTS.mono, fontSize: 11, color: C.amber, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  heading: { fontFamily: FONTS.serif, fontSize: 28, fontWeight: '700', color: COLORS.text, lineHeight: 36, marginBottom: 14 },
  sub: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textSecondary, lineHeight: 20, textAlign: 'center' },
  btnStack: { gap: 10 },
  primaryBtn: { backgroundColor: C.amber, borderRadius: 12, padding: 16, alignItems: 'center' },
  primaryBtnLabel: { fontFamily: FONTS.mono, fontSize: 14, fontWeight: '700', color: '#000' },
  ghostBtn: { borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  ghostBtnLabel: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textSecondary },
  detailsScroll: { padding: 20, paddingBottom: 40 },
  addedScroll: { padding: 20, paddingBottom: 40 },
  row: { flexDirection: 'row' },
  savingLabel: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textTertiary, marginTop: 16 },
});

const grid = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  card: {
    width: '30%', flexGrow: 1,
    backgroundColor: COLORS.bgSecondary, borderRadius: 12, padding: 14,
    alignItems: 'center', gap: 6, borderWidth: 1,
  },
  emoji: { fontSize: 28 },
  name: { fontFamily: FONTS.mono, fontSize: 11, fontWeight: '700', textAlign: 'center' },
});

const chip = StyleSheet.create({
  wrap: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 10 },
  label: { fontFamily: FONTS.mono, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});

const toggle = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.bgTertiary, borderRadius: 12, padding: 14, marginBottom: 14 },
  label: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.text, fontWeight: '600', marginBottom: 2 },
  sub: { fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary },
});

const sb = StyleSheet.create({
  breakdown: {
    backgroundColor: COLORS.bgTertiary, borderRadius: 12, padding: 14,
    marginBottom: 20, gap: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalRow: {
    paddingTop: 8, marginTop: 4,
    borderTopWidth: 0.5, borderTopColor: COLORS.border,
  },
  rowLabel: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textSecondary },
  rowValue: { fontFamily: FONTS.mono, fontSize: 13, fontWeight: '600', color: COLORS.text },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bgTertiary, borderRadius: 14, padding: 8,
    marginBottom: 14, borderWidth: 1.5, borderColor: C.amberMid,
  },
  stepBtn: {
    width: 48, height: 48, borderRadius: 10,
    backgroundColor: C.amberDim, alignItems: 'center', justifyContent: 'center',
  },
  stepBtnLabel: { fontSize: 24, color: C.amber, fontWeight: '700', lineHeight: 28 },
  stepValue: { fontFamily: FONTS.mono, fontSize: 32, fontWeight: '700', color: C.amber },
  stepSub: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textTertiary, marginTop: 2 },
  quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  quickChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bgTertiary,
  },
  quickLabel: { fontFamily: FONTS.mono, fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  warning: {
    backgroundColor: C.amberDim, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: C.amberMid, marginTop: 8,
  },
  warningText: { fontFamily: FONTS.mono, fontSize: 11, color: C.amber, lineHeight: 18 },
});
