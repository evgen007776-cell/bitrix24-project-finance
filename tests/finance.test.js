import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProjectMetricsFromCents, moneyToCents } from '../src/finance.js';

test('profit is based on completed work, not received cash',()=>{
 const m=calculateProjectMetricsFromCents({dealCents:1_000_000_00,completedCents:300_000_00,receivedCents:100_000_00,expenseCents:120_000_00,completedCumulativeCents:500_000_00,receivedCumulativeCents:350_000_00});
 assert.equal(m.profit,180000);assert.equal(m.profitability,60);assert.equal(m.receivable,150000);assert.equal(m.new_receivable,200000);
});
test('advance is separated from receivable',()=>{const m=calculateProjectMetricsFromCents({completedCumulativeCents:10000,receivedCumulativeCents:15000});assert.equal(m.receivable,0);assert.equal(m.advance,50)});
test('parses rubles into integer kopecks exactly',()=>{assert.equal(moneyToCents('1250.50'),125050);assert.equal(moneyToCents('0,01'),1);assert.equal(moneyToCents(99.99),9999)});
test('rejects over-precise values',()=>{assert.equal(moneyToCents('100.105'),null);assert.equal(moneyToCents(100.105),null)});
