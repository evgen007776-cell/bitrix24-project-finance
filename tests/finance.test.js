import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetricsFromCents, moneyToCents } from '../src/finance.js';

test('calculates profit and profitability from integer kopecks', () => {
  assert.deepEqual(calculateMetricsFromCents(50_000_000, 20_000_000), {
    income: 500000,
    expense: 200000,
    profit: 300000,
    profitability: 60,
  });
});

test('returns zero profitability when income is zero', () => {
  assert.deepEqual(calculateMetricsFromCents(0, 1_500_000), {
    income: 0,
    expense: 15000,
    profit: -15000,
    profitability: 0,
  });
});

test('parses rubles into integer kopecks exactly', () => {
  assert.equal(moneyToCents('1250.50'), 125050);
  assert.equal(moneyToCents('0,01'), 1);
  assert.equal(moneyToCents(99.99), 9999);
});

test('rejects more than two decimal places', () => {
  assert.equal(moneyToCents('100.105'), null);
  assert.equal(moneyToCents(100.105), null);
});
