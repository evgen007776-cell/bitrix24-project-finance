export function calculateMetrics(income = 0, expense = 0) {
  const normalizedIncome = Number(income) || 0;
  const normalizedExpense = Number(expense) || 0;
  const profit = normalizedIncome - normalizedExpense;
  const profitability = normalizedIncome > 0 ? (profit / normalizedIncome) * 100 : 0;

  return {
    income: roundMoney(normalizedIncome),
    expense: roundMoney(normalizedExpense),
    profit: roundMoney(profit),
    profitability: roundPercent(profitability),
  };
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function roundPercent(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}
