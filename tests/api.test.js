import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'project-finance-'));process.env.DB_PATH=path.join(tmp,'test.sqlite');
const {createServer}=await import('../src/server.js');const {db}=await import('../src/db.js');let server,base;
test.before(async()=>{server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`});
test.after(async()=>{await new Promise(r=>server.close(r));db.close();fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100})});
async function post(url,body){return fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}

test('production financial model and cumulative receivable',async()=>{
 let r=await post('/api/employees',{name:'Manager',role:'Менеджер'});const manager=await r.json();
 r=await post('/api/projects',{name:'Production project',client:'Client',deal_amount:1000000,deal_date:'2026-08-15',manager_employee_id:manager.id});assert.equal(r.status,201);const p=await r.json();
 const cats=await (await fetch(base+'/api/categories')).json();const income=cats.find(x=>x.type==='income'),expense=cats.find(x=>x.name==='Расходы на ИИ');
 await post('/api/completions',{project_id:p.id,amount:300000,completion_date:'2026-08-20',document:'Акт 1'});
 await post('/api/completions',{project_id:p.id,amount:200000,completion_date:'2026-09-05',document:'Акт 2'});
 await post('/api/transactions',{project_id:p.id,category_id:income.id,amount:250000,transaction_date:'2026-08-25'});
 await post('/api/transactions',{project_id:p.id,category_id:income.id,amount:100000,transaction_date:'2026-09-06'});
 await post('/api/transactions',{project_id:p.id,category_id:expense.id,amount:50000,transaction_date:'2026-09-06'});
 const d=await (await fetch(base+`/api/dashboard?date_from=2026-09-01&date_to=2026-09-30`)).json();const row=d.projects.find(x=>x.id===p.id);
 assert.equal(row.completed,200000);assert.equal(row.received,100000);assert.equal(row.expenses,50000);assert.equal(row.profit,150000);assert.equal(row.profitability,75);assert.equal(row.receivable,150000);assert.equal(row.new_receivable,100000);
});

test('deal sum on overview depends on selected period',async()=>{
 await post('/api/projects',{name:'September deal',deal_amount:400000,deal_date:'2026-09-03'});
 let d=await (await fetch(base+'/api/dashboard?date_from=2026-09-01&date_to=2026-09-30')).json();assert.equal(d.totals.deal_amount,400000);
 d=await (await fetch(base+'/api/dashboard?date_from=2026-08-01&date_to=2026-08-31')).json();assert.equal(d.totals.deal_amount,1000000);
});

test('multiple members do not duplicate project financial totals',async()=>{
 const projects=await (await fetch(base+'/api/projects?date_from=2026-09-01&date_to=2026-09-30')).json();const p=projects.find(x=>x.name==='Production project');
 for(const name of ['A','B']){const e=await (await post('/api/employees',{name})).json();const r=await post(`/api/projects/${p.id}/members`,{employee_id:e.id});assert.equal(r.status,201)}
 const d=await (await fetch(base+'/api/dashboard?date_from=2026-09-01&date_to=2026-09-30')).json();const row=d.projects.find(x=>x.id===p.id);assert.equal(row.completed,200000);assert.equal(row.expenses,50000);assert.equal(row.members_count,2);
});

test('transactions and documents support period filters',async()=>{
 const projects=await (await fetch(base+'/api/projects')).json();const p=projects[0];const cats=await (await fetch(base+'/api/categories')).json();const expense=cats.find(x=>x.type==='expense');
 await post('/api/transactions',{project_id:p.id,category_id:expense.id,amount:1234.56,transaction_date:'2026-07-01',counterparty:'Vendor'});
 await post('/api/documents',{project_id:p.id,document_type:'Акт',document_date:'2026-09-07',amount:10000,sync_status:'pending'});
 const tx=await (await fetch(base+'/api/transactions?date_from=2026-09-01&date_to=2026-09-30')).json();assert.equal(tx.some(x=>x.transaction_date==='2026-07-01'),false);
 const docs=await (await fetch(base+'/api/documents?date_from=2026-09-01&date_to=2026-09-30')).json();assert.equal(docs.length,1);assert.equal(docs[0].sync_status,'pending');
});
