// Pure financial calculation functions — no React, no side effects.

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export type PaySchedule = {
  income: number; scheduleType: string;
  semiDay1: number; semiDay2: number;
  biAnchor?: string;
  custWeekdays?: string[]; custFreq?: string; custAnchor?: string;
};

export type Paycheck = { date: Date; amount: number };

const WD_IDX: Record<string, number> = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

export function fmtDate(d: Date): string {
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function fmt(n: number): string {
  return (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtK(n: number): string {
  return '$' + Math.round(n || 0).toLocaleString();
}

export function mk(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function getMonthPaychecks(s: PaySchedule, y: number, m: number): Paycheck[] {
  const dim = daysInMonth(y, m);

  if (s.scheduleType === 'semi_monthly') return [
    { date: new Date(y, m, Math.min(+s.semiDay1, dim)), amount: s.income / 2 },
    { date: new Date(y, m, Math.min(+s.semiDay2, dim)), amount: s.income / 2 },
  ].sort((a, b) => +a.date - +b.date);

  if (s.scheduleType === 'bi_weekly' || s.scheduleType === 'weekly') {
    const iv = s.scheduleType === 'bi_weekly' ? 14 : 7;
    const perPc = (s.income * 12) / (s.scheduleType === 'bi_weekly' ? 26 : 52);
    const ms = iv * 864e5;
    const start = new Date(y, m, 1), end = new Date(y, m + 1, 0);
    let cur = new Date(s.biAnchor || '2026-06-10');
    while (cur > start) cur = new Date(+cur - ms);
    while (cur < start) cur = new Date(+cur + ms);
    const r: Paycheck[] = [];
    while (cur <= end) { r.push({ date: new Date(cur), amount: Math.round(perPc) }); cur = new Date(+cur + ms); }
    return r;
  }

  if (s.scheduleType === 'custom') {
    const tgts = (s.custWeekdays || ['FR']).map(d => WD_IDX[d]).filter(x => x != null);
    const freq = s.custFreq || 'every_other';
    const perPc = (s.income * 12) / (freq === 'every' ? 52 : 26);
    const anchor = new Date(s.custAnchor || s.biAnchor || '2026-06-06');
    const start = new Date(y, m, 1), end = new Date(y, m + 1, 0);
    const r: Paycheck[] = [];
    let cur = new Date(start);
    while (cur <= end) {
      if (tgts.includes(cur.getDay())) {
        if (freq === 'every') {
          r.push({ date: new Date(cur), amount: Math.round(perPc) });
        } else {
          const dw = Math.round((+cur - +anchor) / 604800000);
          if (Math.abs(dw % 2) === 0) r.push({ date: new Date(cur), amount: Math.round(perPc) });
        }
      }
      cur = new Date(+cur + 864e5);
    }
    return r;
  }

  return [];
}

export function getNextNPaychecks(s: PaySchedule, from: Date, n = 6): Paycheck[] {
  const r: Paycheck[] = [];
  let y = from.getFullYear(), m = from.getMonth();
  while (r.length < n) {
    getMonthPaychecks(s, y, m).forEach(pc => { if (pc.date >= from && r.length < n) r.push(pc); });
    m++; if (m > 11) { m = 0; y++; }
  }
  return r;
}

export function assignBills(
  bills: { id: string; dueDay: number | null; pcIdx: number }[],
  pcs: Paycheck[], y: number, m: number
): Record<string, number> {
  const map: Record<string, number> = {};
  bills.forEach(b => {
    if (!b.dueDay || !pcs.length) { map[b.id] = Math.min(b.pcIdx || 0, pcs.length - 1); return; }
    const due = new Date(y, m, b.dueDay);
    let idx = -1;
    pcs.forEach((pc, i) => { if (pc.date <= due) idx = i; });
    map[b.id] = idx >= 0 ? idx : Math.min(b.pcIdx || 0, pcs.length - 1);
  });
  return map;
}

export type DebtInput = { id: string; balance: number; apr: number; min: number };

export function calcSnowball(
  debts: DebtInput[], extra: number,
  windfalls: { amount: number }[] = [],
  sy = 2026, sm = 5
): Record<string, string> {
  const live = [...debts].filter(d => (d.balance || 0) > 0.01).sort((a, b) => a.balance - b.balance);
  if (!live.length) return {};
  const bs = live.map(d => ({ ...d, bal: d.balance }));
  let ex = extra || 0;
  const wt = windfalls.reduce((s, w) => s + (w.amount || 0), 0);
  if (wt > 0 && bs[0]) bs[0].bal = Math.max(0, bs[0].bal - wt);
  const out: Record<string, string> = {};
  const start = new Date(sy, sm, 1);
  let mo = 0;
  while (bs.some(d => d.bal > 0.01) && mo < 360) {
    mo++;
    const tgt = bs.find(d => d.bal > 0.01);
    let roll = ex;
    for (const d of bs) {
      if (d.bal <= 0.01) { d.bal = 0; continue; }
      d.bal *= 1 + ((d.apr || 0) / 100 / 12);
      d.bal -= Math.min(d.min || 0, d.bal);
      if (d === tgt && roll > 0) { const p = Math.min(roll, d.bal); d.bal -= p; roll -= p; }
      if (d.bal <= 0.01 && !out[d.id]) {
        d.bal = 0;
        const dt = addMonths(start, mo);
        out[d.id] = `${MONTHS[dt.getMonth()].slice(0, 3)} ${dt.getFullYear()}`;
        ex += d.min || 0;
      }
    }
  }
  return out;
}

export type BNPLPlan = { id: string; balance: number; payment: number; apr: number; familyCovered?: boolean };

export function calcBNPLPayoff(plan: BNPLPlan, extraMo: number, startDate: Date) {
  let bal = plan.balance;
  let mo = 0;
  const pmt = plan.payment + (extraMo || 0);
  while (bal > 0.01 && mo < 500) {
    mo++;
    bal *= 1 + ((plan.apr || 0) / 100 / 12);
    bal -= Math.min(pmt, bal);
  }
  return { mo, date: addMonths(startDate, mo) };
}

export function calcBNPLCascade(
  plans: BNPLPlan[], extraMo: number, startDate: Date
): Record<string, string> {
  const live = plans
    .filter(p => (p.balance || 0) > 0.01 && !p.familyCovered)
    .sort((a, b) => a.balance - b.balance);
  if (!live.length) return {};
  const bs = live.map(p => ({ ...p, bal: p.balance }));
  let ex = extraMo || 0;
  const out: Record<string, string> = {};
  const start = new Date(startDate);
  let mo = 0;
  while (bs.some(b => b.bal > 0.01) && mo < 300) {
    mo++;
    const tgt = bs.find(b => b.bal > 0.01);
    for (const p of bs) {
      if (p.bal <= 0.01) { p.bal = 0; continue; }
      p.bal *= 1 + ((p.apr || 0) / 100 / 12);
      p.bal -= Math.min(p.payment, p.bal);
      if (p === tgt && ex > 0) { const ep = Math.min(ex, p.bal); p.bal -= ep; }
      if (p.bal <= 0.01 && !out[p.id]) {
        p.bal = 0;
        const d = addMonths(start, mo);
        out[p.id] = `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
        ex += p.payment;
      }
    }
  }
  return out;
}
