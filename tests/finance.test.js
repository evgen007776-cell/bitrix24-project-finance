import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMetrics } from '../src/finance.js';

test('calculates profit and profitability', () => {
  assert.deepEqual(calculateMetrics(500000, 200000), {
    income: 500000,
    expense: 200000,
    profit: 300000,
    profitability: 60,
  });
});

test('returns zero profitability when income is zero', () => {
  assert.deepEqual(calculateMetrics(0, 15000), {
    income: 0,
    expense: 15000,
    profit: -15000,
    profitability: 0,
  });
});

test('rounds financial values predictably', () => {
  assert.deepEqual(calculateMetrics(100.105, 50.104), {
    income: 100.11,
    expense: 50.1,
    profit: 50,
    profitability: 49.9,
  });
});
