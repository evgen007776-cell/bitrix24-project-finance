export function moneyToCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const scaled = value * 100;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-8) return null;
    return Math.round(scaled);
  }

  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [rubles, kopecks = ''] = normalized.split('.');
  const cents = Number(rubles) * 100 + Number(kopecks.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function centsToMoney(cents = 0) {
  const normalized = Number(cents) || 0;
  return normalized / 100;
}

export function calculateMetricsFromCents(incomeCents = 0, expenseCents = 0) {
  const normalizedIncome = Math.trunc(Number(incomeCents) || 0);
  const normalizedExpense = Math.trunc(Number(expenseCents) || 0);
  const profitCents = normalizedIncome - normalizedExpense;
  const profitability = normalizedIncome > 0 ? (profitCents / normalizedIncome) * 100 : 0;

  return {
    income: centsToMoney(normalizedIncome),
    expense: centsToMoney(normalizedExpense),
    profit: centsToMoney(profitCents),
    profitability: roundPercent(profitability),
  };
}

export function roundPercent(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}
