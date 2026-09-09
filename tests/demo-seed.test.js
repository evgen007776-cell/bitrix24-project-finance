import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { calculateProjectMetricsFromCents } from '../src/finance.js';

test('showcase demo seeds five months of coherent project finance data',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'project-finance-demo-'));
  const dbPath=path.join(tmp,'demo.sqlite');

  try{
    const run=spawnSync(process.execPath,['src/seed-demo.js'],{
      cwd:path.resolve('.'),
      env:{...process.env,DB_PATH:dbPath},
      encoding:'utf8'
    });
    assert.equal(run.status,0,run.stderr||run.stdout);

    const db=new DatabaseSync(dbPath);

    assert.equal(db.prepare('SELECT COUNT(*) n FROM projects').get().n,20);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM employees').get().n,16);
    assert.ok(db.prepare('SELECT COUNT(*) n FROM documents').get().n>=40);
    assert.ok(db.prepare("SELECT COUNT(*) n FROM categories WHERE is_default=0").get().n>=6);
    assert.ok(db.prepare("SELECT COUNT(*) n FROM categories WHERE name='QA проекта' AND employee_role='QA-инженер'").get().n===1);

    for(const month of ['2026-05','2026-06','2026-07','2026-08','2026-09']){
      const completed=db.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM completions WHERE completion_date LIKE ?").get(`${month}%`).n;
      const income=db.prepare(`
        SELECT COALESCE(SUM(t.amount_cents),0) n
        FROM transactions t JOIN categories c ON c.id=t.category_id
        WHERE c.type='income' AND t.transaction_date LIKE ?
      `).get(`${month}%`).n;
      const expense=db.prepare(`
        SELECT COALESCE(SUM(t.amount_cents),0) n
        FROM transactions t JOIN categories c ON c.id=t.category_id
        WHERE c.type='expense' AND t.transaction_date LIKE ?
      `).get(`${month}%`).n;
      assert.ok(completed>0,`${month} must have completions`);
      assert.ok(income>0,`${month} must have receipts`);
      assert.ok(expense>0,`${month} must have expenses`);
    }


    const completedProject=db.prepare("SELECT id FROM projects WHERE name='Модуль аналитики'").get();
    assert.ok(completedProject);

    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM completions WHERE project_id=? AND completion_date>'2026-08-31'").get(completedProject.id).n,
      0,
      'completed project must not produce new completions after production end'
    );

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) n
        FROM transactions t JOIN categories c ON c.id=t.category_id
        WHERE t.project_id=? AND c.type='expense' AND t.transaction_date>'2026-08-31'
      `).get(completedProject.id).n,
      0,
      'completed project must not incur new production expenses after production end'
    );

    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM documents WHERE project_id=? AND document_date>'2026-08-31'").get(completedProject.id).n,
      0,
      'completed project must not create new production acts after production end'
    );

    assert.ok(
      db.prepare(`
        SELECT COALESCE(SUM(t.amount_cents),0) n
        FROM transactions t JOIN categories c ON c.id=t.category_id
        WHERE t.project_id=? AND c.type='income' AND t.transaction_date BETWEEN '2026-09-01' AND '2026-09-30'
      `).get(completedProject.id).n>0,
      'completed project may still receive the final customer settlement'
    );

    const projects=db.prepare('SELECT id FROM projects ORDER BY id').all();
    const health={excellent:0,stable:0,risk:0};

    for(const p of projects){
      const period=db.prepare(`
        SELECT
          COALESCE((SELECT SUM(amount_cents) FROM completions WHERE project_id=? AND completion_date BETWEEN '2026-09-01' AND '2026-09-30'),0) completed,
          COALESCE((SELECT SUM(t.amount_cents) FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.project_id=? AND c.type='income' AND t.transaction_date BETWEEN '2026-09-01' AND '2026-09-30'),0) received,
          COALESCE((SELECT SUM(t.amount_cents) FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.project_id=? AND c.type='expense' AND t.transaction_date BETWEEN '2026-09-01' AND '2026-09-30'),0) expense,
          COALESCE((SELECT SUM(amount_cents) FROM completions WHERE project_id=? AND completion_date <= '2026-09-30'),0) completedCum,
          COALESCE((SELECT SUM(t.amount_cents) FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.project_id=? AND c.type='income' AND t.transaction_date <= '2026-09-30'),0) receivedCum
      `).get(p.id,p.id,p.id,p.id,p.id);

      const m=calculateProjectMetricsFromCents({
        completedCents:period.completed,
        receivedCents:period.received,
        expenseCents:period.expense,
        completedCumulativeCents:period.completedCum,
        receivedCumulativeCents:period.receivedCum
      });
      health[m.financial_health]++;
    }

    assert.deepEqual(health,{excellent:15,stable:4,risk:1});
    db.close();
  } finally {
    fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
