export function moneyToCents(value, { allowZero = false } = {}) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) return null;
    const scaled = value * 100;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-8) return null;
    return Math.round(scaled);
  }

  const normalized = String(value ?? '').trim().replace(',', '.');
  const pattern = allowZero ? /^\d+(?:\.\d{1,2})?$/ : /^(?:0*[1-9]\d*|0*\.\d*[1-9]\d*)(?:\.\d{1,2})?$/;
  // Simpler exact parser after structural validation.
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [rubles, kopecks = ''] = normalized.split('.');
  const cents = Number(rubles) * 100 + Number(kopecks.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0)) return null;
  return cents;
}

export function centsToMoney(cents = 0) {
  return (Number(cents) || 0) / 100;
}

export function roundPercent(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

export function calculateProjectMetricsFromCents({
  dealCents = 0,
  completedCents = 0,
  receivedCents = 0,
  expenseCents = 0,
  completedCumulativeCents = completedCents,
  receivedCumulativeCents = receivedCents,
} = {}) {
  const deal = Math.trunc(Number(dealCents) || 0);
  const completed = Math.trunc(Number(completedCents) || 0);
  const received = Math.trunc(Number(receivedCents) || 0);
  const expense = Math.trunc(Number(expenseCents) || 0);
  const completedCumulative = Math.trunc(Number(completedCumulativeCents) || 0);
  const receivedCumulative = Math.trunc(Number(receivedCumulativeCents) || 0);

  const profit = completed - expense;
  const profitability = completed > 0 ? (profit / completed) * 100 : 0;
  const debtChange = completed - received;
  const balance = completedCumulative - receivedCumulative;
  const receivable = Math.max(0, balance);
  const advance = Math.max(0, -balance);
  const debtRatio = completedCumulative > 0 ? (receivable / completedCumulative) * 100 : 0;

  const riskReasons = [];
  if (profit < 0) riskReasons.push('Отрицательная прибыль');
  if (completed > 0 && profitability < 20) riskReasons.push('Рентабельность ниже 20%');
  if (debtRatio > 35) riskReasons.push('Общая дебиторка выше 35% выполненных работ');

  let financialHealth = 'stable';
  if (riskReasons.length) financialHealth = 'risk';
  else if (completed > 0 && profitability >= 50 && debtRatio <= 25) financialHealth = 'excellent';

  return {
    deal_amount: centsToMoney(deal),
    completed: centsToMoney(completed),
    received: centsToMoney(received),
    income: centsToMoney(received), // backward compatibility with the first prototype API
    expense: centsToMoney(expense),
    expenses: centsToMoney(expense),
    profit: centsToMoney(profit),
    profitability: roundPercent(profitability),
    completed_cumulative: centsToMoney(completedCumulative),
    received_cumulative: centsToMoney(receivedCumulative),
    receivable: centsToMoney(receivable),
    advance: centsToMoney(advance),
    debt_change: centsToMoney(debtChange),
    new_receivable: centsToMoney(Math.max(0, debtChange)),
    debt_ratio: roundPercent(debtRatio),
    financial_health: financialHealth,
    financial_health_reasons: riskReasons,
  };
}

// Kept for compatibility with existing imports/tests while the frontend is migrated.
export function calculateMetricsFromCents(incomeCents = 0, expenseCents = 0) {
  const income = Math.trunc(Number(incomeCents) || 0);
  const expense = Math.trunc(Number(expenseCents) || 0);
  const profit = income - expense;
  const profitability = income > 0 ? (profit / income) * 100 : 0;
  return {
    income: centsToMoney(income),
    expense: centsToMoney(expense),
    profit: centsToMoney(profit),
    profitability: roundPercent(profitability),
  };
}
