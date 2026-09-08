import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'project-finance-'));
process.env.DB_PATH = path.join(tmp, 'test.sqlite');
const { createServer } = await import('../src/server.js');
const { db } = await import('../src/db.js');

let server;
let base;

test.before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test('project + income + expense produces correct dashboard metrics', async () => {
  let response = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ name: 'Test project' })
  });
  assert.equal(response.status, 201);
  const project = await response.json();

  response = await fetch(`${base}/api/categories`);
  const categories = await response.json();
  const income = categories.find(c => c.type === 'income');
  const expense = categories.find(c => c.name === 'Расходы на ИИ');

  for (const tx of [
    { category_id: income.id, amount: 100000 },
    { category_id: expense.id, amount: 25000 },
  ]) {
    response = await fetch(`${base}/api/transactions`, {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({ project_id: project.id, transaction_date: '2026-09-08', ...tx })
    });
    assert.equal(response.status, 201);
  }

  response = await fetch(`${base}/api/dashboard`);
  const dashboard = await response.json();
  const row = dashboard.projects.find(p => p.id === project.id);
  assert.equal(row.income, 100000);
  assert.equal(row.expense, 25000);
  assert.equal(row.profit, 75000);
  assert.equal(row.profitability, 75);
});

test('stores decimal monetary amounts without floating-point drift', async () => {
  const projectResponse = await fetch(`${base}/api/projects`, {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ name: 'Kopecks project' })
  });
  const project = await projectResponse.json();
  const categories = await (await fetch(`${base}/api/categories`)).json();
  const income = categories.find(c => c.type === 'income');

  for (const amount of ['0.10', '0.20']) {
    const response = await fetch(`${base}/api/transactions`, {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({ project_id: project.id, category_id: income.id, amount, transaction_date: '2026-09-08' })
    });
    assert.equal(response.status, 201);
  }

  const details = await (await fetch(`${base}/api/projects/${project.id}`)).json();
  assert.deepEqual(details.transactions.map(tx => tx.amount).sort(), [0.1, 0.2]);
  assert.equal(details.income, 0.3);
  assert.equal(details.profit, 0.3);
});

test('rejects zero, negative and over-precise transaction amounts', async () => {
  const projects = await (await fetch(`${base}/api/projects`)).json();
  const categories = await (await fetch(`${base}/api/categories`)).json();
  for (const amount of [0, -1, '10.001']) {
    const response = await fetch(`${base}/api/transactions`, {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({ project_id: projects[0].id, category_id: categories[0].id, amount, transaction_date: '2026-09-08' })
    });
    assert.equal(response.status, 400);
  }
});

test('adding multiple project members does not duplicate financial totals', async () => {
  const projects = await (await fetch(`${base}/api/projects`)).json();
  const project = projects.find(p => p.name === 'Test project');
  for (const name of ['Employee A', 'Employee B']) {
    const created = await (await fetch(`${base}/api/employees`, {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({name})
    })).json();
    const response = await fetch(`${base}/api/projects/${project.id}/members`, {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({employee_id:created.id})
    });
    assert.equal(response.status, 201);
  }
  const dashboard = await (await fetch(`${base}/api/dashboard`)).json();
  const row = dashboard.projects.find(p => p.id === project.id);
  assert.equal(row.income, 100000);
  assert.equal(row.expense, 25000);
  assert.equal(row.members_count, 2);
});

test('creates a custom expense category', async () => {
  const response = await fetch(`${base}/api/categories`, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'Лицензии ПО', type:'expense'})
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.name, 'Лицензии ПО');
  assert.equal(created.type, 'expense');
  assert.equal(created.is_default, 0);
});
