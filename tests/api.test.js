import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'project-finance-'));
process.env.DB_PATH=path.join(tmp,'test.sqlite');
const {createServer}=await import('../src/server.js');
const {db}=await import('../src/db.js');
let server,base;

test.before(async()=>{
  server=createServer();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base=`http://127.0.0.1:${server.address().port}`;
});

test.after(async()=>{
  await new Promise(r=>server.close(r));
  db.close();
  fs.rmSync(tmp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
});

async function post(url,body){
  return fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}

async function createProject(name='Test project'){
  const r=await post('/api/projects',{name,client:'ООО Клиент',description:'Тестовый проект',deal_amount:100000,deal_date:'2026-09-05'});
  assert.equal(r.status,201);
  return r.json();
}

test('production financial model and cumulative receivable',async()=>{
  let r=await post('/api/employees',{name:'Manager',role:'Менеджер'});
  const manager=await r.json();
  r=await post('/api/projects',{name:'Production project',client:'Client',deal_amount:1000000,deal_date:'2026-08-15',manager_employee_id:manager.id});
  assert.equal(r.status,201);
  const p=await r.json();
  const cats=await (await fetch(base+'/api/categories')).json();
  const income=cats.find(x=>x.type==='income');
  const expense=cats.find(x=>x.name==='Расходы на ИИ');

  await post('/api/completions',{project_id:p.id,amount:300000,completion_date:'2026-08-20',document:'Акт 1'});
  await post('/api/completions',{project_id:p.id,amount:200000,completion_date:'2026-09-05',document:'Акт 2'});
  await post('/api/transactions',{project_id:p.id,category_id:income.id,amount:250000,transaction_date:'2026-08-25',counterparty:'ООО Клиент'});
  await post('/api/transactions',{project_id:p.id,category_id:income.id,amount:100000,transaction_date:'2026-09-06',counterparty:'ООО Клиент'});
  await post('/api/transactions',{project_id:p.id,category_id:expense.id,amount:50000,transaction_date:'2026-09-06',counterparty:'OpenAI'});

  const d=await (await fetch(base+'/api/dashboard?date_from=2026-09-01&date_to=2026-09-30')).json();
  const row=d.projects.find(x=>x.id===p.id);
  assert.equal(row.completed,200000);
  assert.equal(row.received,100000);
  assert.equal(row.expenses,50000);
  assert.equal(row.profit,150000);
  assert.equal(row.profitability,75);
  assert.equal(row.receivable,150000);
  assert.equal(row.new_receivable,100000);
});

test('deal sum on overview depends on selected period',async()=>{
  await post('/api/projects',{name:'September deal',deal_amount:400000,deal_date:'2026-09-03'});
  let d=await (await fetch(base+'/api/dashboard?date_from=2026-09-01&date_to=2026-09-30')).json();
  assert.equal(d.totals.deal_amount,400000);
  d=await (await fetch(base+'/api/dashboard?date_from=2026-08-01&date_to=2026-08-31')).json();
  assert.equal(d.totals.deal_amount,1000000);
});

test('multiple members do not duplicate project financial totals',async()=>{
  const projects=await (await fetch(base+'/api/projects?date_from=2026-09-01&date_to=2026-09-30')).json();
  const p=projects.find(x=>x.name==='Production project');
  for(const name of ['A','B']){
    const e=await (await post('/api/employees',{name})).json();
    const r=await post(`/api/projects/${p.id}/members`,{employee_id:e.id});
    assert.equal(r.status,201);
  }
  const d=await (await fetch(base+'/api/dashboard?date_from=2026-09-01&date_to=2026-09-30')).json();
  const row=d.projects.find(x=>x.id===p.id);
  assert.equal(row.completed,200000);
  assert.equal(row.expenses,50000);
  assert.equal(row.members_count,2);
});

test('transactions and documents support period filters',async()=>{
  const projects=await (await fetch(base+'/api/projects')).json();
  const p=projects[0];
  const cats=await (await fetch(base+'/api/categories')).json();
  const expense=cats.find(x=>x.type==='expense');
  await post('/api/transactions',{project_id:p.id,category_id:expense.id,amount:1234.56,transaction_date:'2026-07-01',counterparty:'Vendor'});
  await post('/api/documents',{project_id:p.id,document_type:'Акт',document_date:'2026-09-07',amount:10000,sync_status:'pending'});
  const tx=await (await fetch(base+'/api/transactions?date_from=2026-09-01&date_to=2026-09-30')).json();
  assert.equal(tx.some(x=>x.transaction_date==='2026-07-01'),false);
  const docs=await (await fetch(base+'/api/documents?date_from=2026-09-01&date_to=2026-09-30')).json();
  assert.equal(docs.length,1);
  assert.equal(docs[0].sync_status,'pending');
});

test('employee can be edited after creation',async()=>{
  let r=await post('/api/employees',{name:'Анна Смирнова',email:'anna@example.ru'});
  assert.equal(r.status,201);
  const employee=await r.json();
  r=await fetch(`${base}/api/employees/${employee.id}`,{
    method:'PATCH',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'Анна Смирнова',email:'anna@example.ru',role:'Менеджер проекта',bitrix_user_id:'42'})
  });
  assert.equal(r.status,200);
  const updated=await r.json();
  assert.equal(updated.role,'Менеджер проекта');
  assert.equal(updated.bitrix_user_id,'42');
});

test('income requires a payer and preserves multiple payers per project',async()=>{
  const project=await createProject('Multi payer project');
  const categories=await (await fetch(base+'/api/categories')).json();
  const income=categories.find(c=>c.type==='income');

  let r=await post('/api/transactions',{project_id:project.id,category_id:income.id,amount:1000,transaction_date:'2026-09-06',comment:'Без плательщика'});
  assert.equal(r.status,400);
  assert.match((await r.json()).error,/плательщика/i);

  for(const [counterparty,amount] of [['ООО Альфа',40000],['ООО Бета',60000]]){
    r=await post('/api/transactions',{project_id:project.id,category_id:income.id,amount,transaction_date:'2026-09-07',counterparty,comment:'Оплата этапа'});
    assert.equal(r.status,201);
  }

  const rows=await (await fetch(base+`/api/transactions?date_from=2026-09-01&date_to=2026-09-08&project_id=${project.id}`)).json();
  assert.deepEqual(rows.map(x=>x.counterparty).sort(),['ООО Альфа','ООО Бета']);
  assert.equal(rows.reduce((sum,x)=>sum+x.amount,0),100000);
});

test('external expense requires counterparty while employee-linked expense is allowed',async()=>{
  const project=await createProject('Expense validation project');
  const categories=await (await fetch(base+'/api/categories')).json();
  const serverExpense=categories.find(c=>c.name==='Аренда сервера');
  const internalExpense=categories.find(c=>c.name==='Внутренние программисты');

  let r=await post('/api/transactions',{project_id:project.id,category_id:serverExpense.id,amount:5000,transaction_date:'2026-09-07',comment:'Сервер'});
  assert.equal(r.status,400);

  r=await post('/api/transactions',{project_id:project.id,category_id:serverExpense.id,amount:5000,transaction_date:'2026-09-07',counterparty:'Selectel',comment:'Сервер'});
  assert.equal(r.status,201);

  const employee=await (await post('/api/employees',{name:'Иван Петров',role:'Внутренний программист'})).json();
  r=await post('/api/transactions',{project_id:project.id,category_id:internalExpense.id,amount:15000,transaction_date:'2026-09-07',employee_id:employee.id,comment:'Разработка'});
  assert.equal(r.status,201);
});

test('production shell exposes payer field and favicon',async()=>{
  const html=await (await fetch(base+'/')).text();
  assert.match(html,/id="counterpartyField"/);
  assert.match(html,/Плательщик \/ контрагент/);
  assert.match(html,/favicon\.svg\?v=1\.0\.0/);
  assert.match(html,/Precision SaaS · Production</);
  assert.doesNotMatch(html,/Production 7\./);
});


test('expense category can be linked to an employee role and enforces that role',async()=>{
  const categories=await (await fetch(base+'/api/categories')).json();
  const internal=categories.find(c=>c.name==='Внутренние программисты');
  assert.equal(internal.party_mode,'employee');
  assert.equal(internal.employee_role,'Внутренний программист');

  let r=await post('/api/categories',{
    name:'QA проекта',
    type:'expense',
    party_mode:'employee',
    employee_role:'QA-инженер'
  });
  assert.equal(r.status,201);
  const qaCategory=await r.json();
  assert.equal(qaCategory.party_mode,'employee');
  assert.equal(qaCategory.employee_role,'QA-инженер');

  const project=await createProject('Role filtered expense');
  const qa=await (await post('/api/employees',{name:'QA User',role:'QA-инженер'})).json();
  const developer=await (await post('/api/employees',{name:'Developer User',role:'Внутренний программист'})).json();

  r=await post('/api/transactions',{
    project_id:project.id,
    category_id:qaCategory.id,
    employee_id:developer.id,
    amount:10000,
    transaction_date:'2026-09-08',
    comment:'Неверная роль'
  });
  assert.equal(r.status,400);
  assert.match((await r.json()).error,/QA-инженер/);

  r=await post('/api/transactions',{
    project_id:project.id,
    category_id:qaCategory.id,
    employee_id:qa.id,
    amount:10000,
    transaction_date:'2026-09-08',
    comment:'QA'
  });
  assert.equal(r.status,201);
});

test('employee-linked expense category requires a role',async()=>{
  const r=await post('/api/categories',{
    name:'Некорректная кадровая статья',
    type:'expense',
    party_mode:'employee',
    employee_role:''
  });
  assert.equal(r.status,400);
  assert.match((await r.json()).error,/роль/i);
});

test('project tabs synchronize active state and operation picker uses category role metadata',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(app,/classList\.toggle\('active',b\.dataset\.tab===state\.projectTab\)/);
  assert.match(app,/category\?\.party_mode==='employee'/);
  assert.match(app,/category\.employee_role/);
  assert.doesNotMatch(app,/\/внутренние программисты\/i\.test/);
  assert.match(html,/name="party_mode"/);
  assert.match(html,/name="employee_role"/);
});


test('dashboard financial block exposes portfolio drilldowns',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/data-portfolio-metric/);
  assert.match(app,/function dashboardDynamics/);
  assert.match(app,/data-health-drill/);
  assert.match(app,/function openPortfolioMetric/);
  assert.match(app,/function openHealthDrill/);
  assert.match(app,/Сумма сделок за период/);
  assert.match(app,/Плательщик \/ контрагент/);
  assert.match(app,/function renderHealthDrill/);
});






test('employee transaction filter returns only expenses linked to that employee',async()=>{
  const project=await createProject('Personal expense project');
  const categories=await (await fetch(base+'/api/categories')).json();
  const internal=categories.find(c=>c.name==='Внутренние программисты');
  const first=await (await post('/api/employees',{name:'Personal A',role:'Внутренний программист'})).json();
  const second=await (await post('/api/employees',{name:'Personal B',role:'Внутренний программист'})).json();

  let r=await post('/api/transactions',{
    project_id:project.id,
    category_id:internal.id,
    employee_id:first.id,
    amount:15000,
    transaction_date:'2026-09-08',
    comment:'A'
  });
  assert.equal(r.status,201);

  r=await post('/api/transactions',{
    project_id:project.id,
    category_id:internal.id,
    employee_id:second.id,
    amount:25000,
    transaction_date:'2026-09-08',
    comment:'B'
  });
  assert.equal(r.status,201);

  const rows=await (await fetch(base+`/api/transactions?date_from=2026-09-01&date_to=2026-09-30&employee_id=${first.id}`)).json();
  assert.equal(rows.length,1);
  assert.equal(rows[0].employee_id,first.id);
  assert.equal(rows[0].amount,15000);
});





test('category directory does not expose internal database ids in the UI',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const start=app.indexOf('function categoryRows(rows,stats)');
  const end=app.indexOf('function categoryPartyName',start);
  assert.ok(start>=0&&end>start,'categoryRows renderer must exist');
  const renderer=app.slice(start,end);
  assert.match(renderer,/stats\[c\.id\]/);
  assert.doesNotMatch(renderer,/fmt\.format\(c\.id\)/);
});


test('all creation and edit forms keep submit disabled until required fields are ready',()=>{
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const formIds=['projectForm','operationForm','completionForm','documentForm','employeeForm','employeeEditForm','memberForm','newCategoryForm'];
  for(const id of formIds){
    const match=html.match(new RegExp(`<form[^>]*id="${id}"[\\s\\S]*?<\\/form>`));
    assert.ok(match,`${id} must exist`);
    assert.match(match[0],/button[^>]*type="submit"[^>]*disabled/);
  }
  const documentForm=html.match(/<form[^>]*id="documentForm"[\s\S]*?<\/form>/)[0];
  assert.match(documentForm,/name="amount"[^>]*min="0\.01"[^>]*required/);
  assert.doesNotMatch(documentForm,/name="amount"[^>]*value="0"/);
});

test('form readiness uses one strict validation engine for every modal',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
  assert.match(app,/function requiredControlReady\(control\)/);
  assert.match(app,/String\(control\.value\?\?''\)\.trim\(\)/);
  assert.match(app,/function isFormReady\(form\)/);
  assert.match(app,/btn\.disabled=!ready/);
  assert.match(app,/btn\.setAttribute\('aria-disabled',String\(!ready\)\)/);
  assert.equal((app.match(/if\(!isFormReady\(e\.currentTarget\)\)/g)||[]).length,8);
  assert.match(app,/Выберите сотрудника/);
  assert.match(css,/\.btn:disabled/);
  assert.match(css,/cursor:not-allowed/);
});


test('employees page matches the prototype KPI model and keeps role-aware semantics',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/Средняя успешность/);
  assert.match(app,/employeeSuccess\(projects\)/);
  assert.match(app,/data-employee-summary="success"/);
  assert.match(app,/Успешность проектов участия/);
  assert.match(app,/Финансовая экономика всего проекта сотруднику не приписывается/);
  assert.match(app,/Прибыль управляемого портфеля/);
});

test('employee analytics is a full page with prototype-style manager dashboard',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(app,/state\.view='employeeDetail'/);
  assert.match(app,/function renderEmployeeDetail\(\)/);
  assert.match(app,/Место по прибыли/);
  assert.match(app,/Место по успешности/);
  assert.match(app,/Место по рентабельности/);
  assert.match(app,/Финансовая динамика портфеля/);
  assert.match(app,/Финансовое состояние проектов/);
  assert.match(app,/employeeManagerProjectTable/);
  assert.match(app,/managerMonthlySeries/);
  assert.match(css,/\.portfolio-chart/);
  assert.doesNotMatch(html,/employeeAnalyticsDialog/);
});

test('participant employee page preserves personal-cost semantics and drilldowns',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/Аналитика участника проекта/);
  assert.match(app,/Динамика персональных расходов/);
  assert.match(app,/employeeParticipantProjectTable/);
  assert.match(app,/personalMonthlySeries/);
  assert.match(app,/data-employee-metric="personal"/);
  assert.match(app,/data-employee-detail-metric="success"/);
});


test('employee detail no longer depends on the obsolete analytics modal',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(app,/employeeAnalyticsDialog/);
  assert.doesNotMatch(html,/employeeAnalyticsDialog/);
  assert.match(app,/data-edit-employee/);
  assert.match(app,/statusPill\(p\)/);
});


test('live filters preserve typing focus instead of rerendering on every keystroke',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/const liveFilterTimers=new Map\(\)/);
  assert.match(app,/function bindLiveFilter\(input,onValue,renderer,delay=140\)/);
  assert.match(app,/next\.focus\(\{preventScroll:true\}\)/);
  assert.match(app,/next\.setSelectionRange\(safeStart,safeEnd\)/);
  assert.match(app,/bindLiveFilter\(e,v=>state\.filters\[k\]=v,renderDashboard\)/);
  assert.match(app,/bindLiveFilter\(e,v=>state\.op\[k\]=v,renderOperations\)/);
  assert.match(app,/bindLiveFilter\(e,v=>state\.doc\[k\]=v,renderDocuments\)/);
  assert.match(app,/bindLiveFilter\(\$\('#empQ'\),v=>state\.emp\.q=v,renderEmployees\)/);
  assert.doesNotMatch(app,/\$\('#empQ'\)\.oninput=/);
});


test('numeric filters do not rerender while typing and therefore keep digit order',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/function bindNumericFilter\(input,onValue,renderer\)/);
  assert.match(app,/input\.addEventListener\('input',\(\)=>onValue\(input\.value\)\)/);
  assert.match(app,/input\.addEventListener\('change',\(\)=>renderer\(\)\.catch\(showError\)\)/);
  assert.match(app,/if\(e\.key==='Enter'\)/);
  assert.match(app,/bindNumericFilter\(e,v=>state\.filters\[k\]=v,renderDashboard\)/);
  assert.match(app,/bindNumericFilter\(e,v=>state\.op\[k\]=v,renderOperations\)/);
  assert.match(app,/bindNumericFilter\(e,v=>state\.doc\[k\]=v,renderDocuments\)/);
  assert.doesNotMatch(app,/id==='fQ'\|\|id==='fRent'\)bindLiveFilter/);
});


test('financial health drilldown uses prototype card modal',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
  assert.match(app,/function renderHealthDrill/);
  assert.match(app,/function healthProjectCard/);
  assert.match(app,/data-apply-health-filter/);
  assert.match(app,/Расшифровать дебиторку/);
  assert.match(app,/Показать только \$\{healthText\(key\)\.toLowerCase\(\)\}/);
  assert.doesNotMatch(app,/Почему этот статус/);
  assert.match(css,/\.health-drill\{/);
  assert.match(css,/\.health-project-card\{/);
  assert.match(css,/\.health-metric-card\.good/);
});


test('overview matches the approved V7 prototype structure',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
  assert.match(app,/Финансовая динамика портфеля/);
  assert.match(app,/function dashboardMonthlySeries/);
  assert.match(app,/function dashboardViewToggle/);
  assert.match(app,/data-dashboard-view="table"/);
  assert.match(app,/data-dashboard-view="cards"/);
  assert.match(app,/id="fClient"/);
  assert.match(app,/id="fMovement"/);
  assert.match(app,/data-reset-dashboard/);
  assert.match(app,/function dashboardProjectCards/);
  assert.match(app,/dashboard-health-row/);
  assert.match(app,/state\.filters\.view==='cards'\?dashboardProjectCards\(list\):dashboardTable\(list\)/);
  assert.match(css,/\.overview-insights/);
  assert.match(css,/\.dashboard-view-toggle/);
});

test('overview extra filters keep business semantics explicit',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/function hasProjectMovement/);
  assert.match(app,/f\.client/);
  assert.match(app,/f\.movement/);
  assert.match(app,/Есть движение/);
  assert.match(app,/Без движения/);
});


test('overview KPI cards are semantic and use delegated drilldown clicks',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
  assert.match(app,/return attrs\?`<button type="button" class="kpi/);
  assert.match(app,/const content=\$\('#content'\);content\.onclick=ev=>/);
  assert.match(app,/closest\('\[data-portfolio-metric\]'\)/);
  assert.match(css,/button\.kpi\{/);
});

test('all overview financial metrics use prototype-style detail modals',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
  for(const token of ['function metricHeroCard','function metricHero(','function metricExplain','function metricSection','function metricProjectTable','Структура расходов по статьям','Формула прибыли','Рентабельность портфеля','Дебиторка по проектам'])assert.ok(app.includes(token),`missing ${token}`);
  assert.match(css,/\.metric-hero-grid\{/);
  assert.match(css,/\.metric-detail-section\{/);
});

test('project receivable modal matches cumulative prototype logic',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  for(const token of ['Как сформировалась общая дебиторка','Разница месяца','Выполнено накопительно','Получено накопительно','Новая дебиторка за период','Общая дебиторка проекта'])assert.match(app,new RegExp(token));
  assert.match(app,/max\(0, Выполнено накопительно − Получено накопительно\)/);
});


test('project manager role helpers are present for project form bootstrap',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/function roleOptions\(\)/);
  assert.match(app,/function syncProjectManagers\(\)/);
  assert.match(app,/manager_role\.onchange=syncProjectManagers/);
});


test('all portfolio KPI branches have their runtime helpers and click bindings',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  for(const metric of ['deal','completed','received','expenses','profit','profitability','receivable']){
    assert.match(app,new RegExp(`data-portfolio-metric=\\"\\$\\{m\\}\\"|a\\('${metric}'\\)`));
  }
  assert.match(app,/function projectOpenButton\(id,label='Открыть проект'\)/);
  assert.match(app,/bindMetricLinks\(\$\('#content'\)\)/);
  assert.match(app,/else if\(type==='profit'\)/);
  assert.match(app,/else if\(type==='profitability'\)/);
  assert.match(app,/else if\(type==='receivable'\)/);
});

test('portfolio KPI modals use the approved compact prototype shell',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
  assert.match(app,/metric-modal-shell metric-prototype/);
  assert.match(css,/KPI prototype modal v2/);
  assert.match(css,/\.metric-prototype \.metric-hero-grid/);
  assert.match(css,/\.pipeline-kpis \.kpi\.warn \.value/);
});


test('project table shows full deal amount and uses cumulative completion as deal progress',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/fullDealTotal=list\.reduce\(\(sum,p\)=>sum\+\(p\.deal_amount\|\|0\),0\)/);
  assert.match(app,/const completionPct=progress\(p\.completed_cumulative\|\|0,p\.deal_amount\|\|0\)/);
  assert.match(app,/fmt\.format\(p\.deal_amount\|\|0\)/);
  assert.match(app,/title="Выполнено накопительно: \$\{completionPct\.toFixed\(1\)\}%"/);
  assert.match(app,/fmt\.format\(fullDealTotal\)/);
  assert.match(app,/f\.sort==='deal'\?b\.deal_amount-a\.deal_amount/);
  assert.doesNotMatch(app,/progress\(p\.deal_amount_period\|\|0,maxDeal\)/);
});


test('category directory exposes prototype-style drilldowns for every article',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/app.css',import.meta.url),'utf8');
  assert.match(app,/data-category-drill="\$\{c\.id\}"/);
  assert.match(app,/function openCategoryDrill\(id\)/);
  assert.match(app,/function categoryPartyName\(category,op\)/);
  assert.match(app,/Кто сформировал сумму/);
  assert.match(app,/Кто сформировал расходы/);
  assert.match(app,/По проектам/);
  assert.match(app,/Журнал операций/);
  assert.match(app,/category\.party_mode==='employee'/);
  assert.match(app,/data-category-project/);
  assert.match(css,/\.category-drill-card/);
  assert.match(css,/\.category-analytics-grid/);
  assert.match(css,/\.category-breakdown-item/);
});

test('category drilldown semantics distinguish payer, employee and external counterparty',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/category\.type==='income'\)return op\.counterparty/);
  assert.match(app,/category\.party_mode==='employee'\)return op\.employee_name/);
  assert.match(app,/return op\.counterparty\|\|'Контрагент не указан'/);
  assert.match(app,/Плательщиков/);
  assert.match(app,/Сотрудников/);
  assert.match(app,/Контрагентов/);
});
