import { db, initDb, resetDemoData } from './db.js';

initDb();
resetDemoData();

const rub = value => Math.round(value * 100);
const monthDates = {
  '2026-05': { completion: '2026-05-27', payment: '2026-05-29', expense: '2026-05-28', document: '2026-05-27' },
  '2026-06': { completion: '2026-06-25', payment: '2026-06-27', expense: '2026-06-26', document: '2026-06-25' },
  '2026-07': { completion: '2026-07-28', payment: '2026-07-30', expense: '2026-07-29', document: '2026-07-28' },
  '2026-08': { completion: '2026-08-27', payment: '2026-08-29', expense: '2026-08-28', document: '2026-08-27' },
  '2026-09': { completion: '2026-09-06', payment: '2026-09-07', expense: '2026-09-07', document: '2026-09-06' },
};
const months = Object.keys(monthDates);

const employees = [
  ['Анна Смирнова','anna.smirnova@demo.local','Project Manager','101'],
  ['Наталья Лебедева','natalia.lebedeva@demo.local','Project Manager','102'],
  ['Мария Белова','maria.belova@demo.local','Руководитель проекта','103'],
  ['Елена Соколова','elena.sokolova@demo.local','Account Manager','104'],
  ['Максим Орлов','maxim.orlov@demo.local','Technical Lead','105'],
  ['Иван Петров','ivan.petrov@demo.local','Внутренний программист','106'],
  ['Дмитрий Волков','dmitry.volkov@demo.local','Внутренний программист','107'],
  ['Алексей Романов','alexey.romanov@demo.local','Backend-разработчик','108'],
  ['Мария Орлова','maria.orlova@demo.local','Frontend-разработчик','109'],
  ['Артём Громов','artem.gromov@demo.local','QA-инженер','110'],
  ['Виктория Белова','viktoria.belova@demo.local','UX/UI-дизайнер','111'],
  ['Илья Кузнецов','ilya.kuznetsov@demo.local','DevOps-инженер','112'],
  ['Екатерина Соколова','ekaterina.sokolova@demo.local','Бизнес-аналитик','113'],
  ['Олег Морозов','oleg.morozov@demo.local','Системный аналитик','114'],
  ['Сергей Павлов','sergey.pavlov@demo.local','Product Manager','115'],
  ['Ольга Федорова','olga.fedorova@demo.local','Финансовый менеджер','116'],
];

const employeeInsert = db.prepare(`
  INSERT INTO employees (name,email,role,bitrix_user_id)
  VALUES (?,?,?,?)
`);
const employeeIds = employees.map(row => Number(employeeInsert.run(...row).lastInsertRowid));

const customCategories = [
  ['QA проекта','expense','employee','QA-инженер'],
  ['Backend-разработка','expense','employee','Backend-разработчик'],
  ['Frontend-разработка','expense','employee','Frontend-разработчик'],
  ['UX/UI дизайн','expense','employee','UX/UI-дизайнер'],
  ['DevOps','expense','employee','DevOps-инженер'],
  ['Бизнес-анализ','expense','employee','Бизнес-аналитик'],
];
const categoryInsert = db.prepare(`
  INSERT OR IGNORE INTO categories (name,type,party_mode,employee_role,is_default)
  VALUES (?,?,?,?,0)
`);
for (const row of customCategories) categoryInsert.run(...row);

const categoryByName = Object.fromEntries(
  db.prepare('SELECT id,name FROM categories').all().map(row => [row.name, row.id])
);

const roleCategory = {
  'Внутренний программист':'Внутренние программисты',
  'QA-инженер':'QA проекта',
  'Backend-разработчик':'Backend-разработка',
  'Frontend-разработчик':'Frontend-разработка',
  'UX/UI-дизайнер':'UX/UI дизайн',
  'DevOps-инженер':'DevOps',
  'Бизнес-аналитик':'Бизнес-анализ',
};

const projects = [
  ['Интеграционный шлюз API','LogicTech','API-шлюз и интеграция внешних сервисов',0,1600000,'2026-05-06','active','excellent'],
  ['Контроль производства','IronWorks','Контроль производственных этапов и SLA',3,1350000,'2026-05-12','active','excellent'],
  ['B2B портал дилеров','Northline','Портал партнёров и дилерская аналитика',2,1400000,'2026-05-18','active','excellent'],
  ['CRM для отдела продаж','Nova Retail','CRM, автоматизация лидов и контроль воронки',0,1200000,'2026-05-24','active','excellent'],

  ['Складской контур','Mega Parts','Управление складом и движением запасов',1,980000,'2026-06-04','active','excellent'],
  ['RPA для бухгалтерии','FinCore','Автоматизация обработки первичных документов',1,1200000,'2026-06-09','active','excellent'],
  ['AI Sales Coach','Vector Group','AI-помощник для анализа звонков отдела продаж',2,1000000,'2026-06-15','active','excellent'],
  ['Мобильный кабинет клиента','Orbit Logistics','Личный кабинет клиента и статусы заказов',3,1500000,'2026-06-22','paused','excellent'],

  ['ЭДО для подрядчиков','Build Pro','Электронный документооборот с подрядчиками',1,900000,'2026-07-03','active','excellent'],
  ['BI-панель руководителя','Atlas Development','Управленческий BI-дашборд',0,1250000,'2026-07-08','active','excellent'],
  ['Service Desk','Cloud Harbor','Сервис-деск и каталог внутренних услуг',3,1100000,'2026-07-14','active','excellent'],
  ['Data Hub','Mercury','Единое хранилище проектных данных',4,1450000,'2026-07-21','active','excellent'],

  ['HR onboarding','People First','Цифровой маршрут адаптации сотрудников',2,950000,'2026-08-02','active','excellent'],
  ['Модуль аналитики','Retail Lab','Аналитика продаж и когорт',0,1050000,'2026-08-07','done','excellent','2026-08'],
  ['Маркетинговая автоматизация','Bright Media','Сценарии лидогенерации и сквозная аналитика',3,1300000,'2026-08-13','active','excellent'],

  ['Портал обучения','Skill Hub','Внутренняя LMS и контроль прогресса',1,1150000,'2026-08-19','active','stable'],
  ['Интеграция 1С','Trade Line','Интеграция заказов, оплат и номенклатуры',4,1500000,'2026-09-02','active','stable'],
  ['Система заявок','City Service','Управление заявками и SLA',2,900000,'2026-09-03','paused','stable'],
  ['Витрина KPI','Prime Group','Единая витрина управленческих показателей',0,1000000,'2026-09-04','active','excellent'],
  ['Service Desk Enterprise','Cloud Harbor','Расширение Service Desk на группу компаний',3,1700000,'2026-09-05','active','risk'],
];

const projectInsert = db.prepare(`
  INSERT INTO projects
  (name,client,description,status,deal_amount_cents,deal_date,manager_employee_id,attention_required,attention_reason)
  VALUES (?,?,?,?,?,?,?,?,?)
`);
const memberInsert = db.prepare(`
  INSERT INTO project_members (project_id,employee_id,role)
  VALUES (?,?,?)
`);
const completionInsert = db.prepare(`
  INSERT INTO completions
  (project_id,amount_cents,completion_date,document,comment,created_by)
  VALUES (?,?,?,?,?,?)
`);
const transactionInsert = db.prepare(`
  INSERT INTO transactions
  (project_id,category_id,employee_id,counterparty,amount_cents,transaction_date,comment,created_by)
  VALUES (?,?,?,?,?,?,?,?)
`);
const documentInsert = db.prepare(`
  INSERT INTO documents
  (project_id,document_type,document_date,amount_cents,source,sync_status,external_id,comment)
  VALUES (?,?,?,?,?,?,?,?)
`);

const participantPool = [5,6,7,8,9,10,11,12,13,14,15];
const sourceStatuses = ['synced','synced','pending','not_synced','synced','error'];

const monthIndexFromDate = date => months.findIndex(m => m === date.slice(0,7));

for (let i = 0; i < projects.length; i++) {
  const [name,client,description,managerIdx,dealAmount,dealDate,status,targetHealth,productionEndMonth=null] = projects[i];
  const attention = status === 'paused' || i === 10 || targetHealth === 'risk';
  const attentionReason =
    targetHealth === 'risk' ? 'Высокая дебиторская задолженность — требуется контроль оплаты' :
    status === 'paused' ? 'Проект временно приостановлен по согласованию с заказчиком' :
    attention ? 'Требуется контроль следующего этапа' : '';

  const projectId = Number(projectInsert.run(
    name, client, description, status, rub(dealAmount), dealDate,
    employeeIds[managerIdx], attention ? 1 : 0, attentionReason
  ).lastInsertRowid);

  memberInsert.run(projectId, employeeIds[managerIdx], 'Менеджер проекта');

  const participantIndexes = [
    participantPool[i % participantPool.length],
    participantPool[(i + 3) % participantPool.length],
    participantPool[(i + 6) % participantPool.length],
  ];
  for (const pIdx of participantIndexes) {
    memberInsert.run(projectId, employeeIds[pIdx], employees[pIdx][2]);
  }

  const startMonth = monthIndexFromDate(dealDate);
  const productionEndIndex = productionEndMonth ? months.indexOf(productionEndMonth) : months.length - 1;
  let cumulativeCompleted = 0;
  let cumulativeReceived = 0;

  for (let m = startMonth; m < months.length; m++) {
    const month = months[m];
    const d = monthDates[month];
    const postProduction = status === 'done' && m > productionEndIndex;

    if (postProduction) {
      const outstanding = Math.max(0, cumulativeCompleted - cumulativeReceived);
      if (outstanding > 0) {
        transactionInsert.run(
          projectId, categoryByName['Оплата от клиента'], null, client,
          rub(outstanding), d.payment, 'Финальный расчёт после завершения проекта', 'demo'
        );
        cumulativeReceived += outstanding;
      }
      continue;
    }

    const completed = Math.round(90000 + i * 4200 + (m - startMonth) * 14500);
    let expenseRatio = 0.27 + (i % 3) * 0.025;
    let receiptRatio = 0.93 - (i % 4) * 0.015;

    if (targetHealth === 'stable') {
      expenseRatio = i % 2 ? 0.38 : 0.34;
      receiptRatio = i % 2 ? 0.70 : 0.73;
    } else if (targetHealth === 'risk') {
      expenseRatio = 0.31;
      receiptRatio = 0.58;
    }

    const expenseTotal = Math.round(completed * expenseRatio);
    const receivedTotal = Math.round(completed * receiptRatio);

    completionInsert.run(
      projectId,
      rub(completed),
      d.completion,
      `Акт ${String(i + 1).padStart(2,'0')}-${month.slice(5)}`,
      `Закрыт объём работ за ${month}`,
      'demo'
    );
    cumulativeCompleted += completed;

    if (i % 5 === 0) {
      const firstPart = Math.round(receivedTotal * 0.72);
      transactionInsert.run(
        projectId, categoryByName['Оплата от клиента'], null, client,
        rub(firstPart), d.payment, 'Оплата основного заказчика', 'demo'
      );
      transactionInsert.run(
        projectId, categoryByName['Оплата от клиента'], null, `${client} — дочернее юрлицо`,
        rub(receivedTotal - firstPart), d.payment, 'Оплата второго плательщика', 'demo'
      );
      cumulativeReceived += receivedTotal;
    } else {
      transactionInsert.run(
        projectId, categoryByName['Оплата от клиента'], null, client,
        rub(receivedTotal), d.payment, 'Оплата этапа', 'demo'
      );
      cumulativeReceived += receivedTotal;
    }

    const employeeIdx = participantIndexes.find(idx => roleCategory[employees[idx][2]]) ?? 5;
    const employeeRole = employees[employeeIdx][2];
    const employeeCategoryName = roleCategory[employeeRole] || 'Внутренние программисты';

    const employeeExpense = Math.round(expenseTotal * 0.55);
    const aiExpense = Math.round(expenseTotal * 0.16);
    const serverExpense = Math.round(expenseTotal * 0.09);
    const externalExpense = expenseTotal - employeeExpense - aiExpense - serverExpense;

    transactionInsert.run(
      projectId, categoryByName[employeeCategoryName], employeeIds[employeeIdx], '',
      rub(employeeExpense), d.expense, `Работы: ${employeeRole}`, 'demo'
    );
    transactionInsert.run(
      projectId, categoryByName['Расходы на ИИ'], null, 'OpenAI / YandexGPT',
      rub(aiExpense), d.expense, 'ИИ-инструменты и API', 'demo'
    );
    transactionInsert.run(
      projectId, categoryByName['Аренда сервера'], null, 'Selectel',
      rub(serverExpense), d.expense, 'Инфраструктура проекта', 'demo'
    );
    transactionInsert.run(
      projectId, categoryByName['Внешние программисты'], null, 'Digital Partner',
      rub(externalExpense), d.expense, 'Подрядные работы', 'demo'
    );

    const syncStatus = sourceStatuses[(i + m) % sourceStatuses.length];
    documentInsert.run(
      projectId,
      'Акт выполненных работ',
      d.document,
      rub(completed),
      'manual',
      syncStatus,
      syncStatus === 'synced' ? `DEMO-${i + 1}-${month.replace('-','')}` : '',
      `Акт за ${month}`
    );
  }
}

const counts = {
  projects: db.prepare('SELECT COUNT(*) n FROM projects').get().n,
  employees: db.prepare('SELECT COUNT(*) n FROM employees').get().n,
  completions: db.prepare('SELECT COUNT(*) n FROM completions').get().n,
  transactions: db.prepare('SELECT COUNT(*) n FROM transactions').get().n,
  documents: db.prepare('SELECT COUNT(*) n FROM documents').get().n,
};

console.log('');
console.log('Showcase demo created.');
console.log(`Projects: ${counts.projects}`);
console.log(`Employees: ${counts.employees}`);
console.log(`Completions: ${counts.completions}`);
console.log(`Transactions: ${counts.transactions}`);
console.log(`Documents: ${counts.documents}`);
console.log('History: May 2026 — September 2026');
console.log('');
console.log('Start with: npm start');
