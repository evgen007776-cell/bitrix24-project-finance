import { db, initDb, resetDemoData } from './db.js';

initDb();
resetDemoData();

const employee = db.prepare('INSERT INTO employees (name, email, role) VALUES (?, ?, ?)');
const anna = employee.run('Анна Смирнова', 'anna@example.ru', 'Менеджер');
const natalia = employee.run('Наталья Лебедева', 'natalia@example.ru', 'Менеджер');
const ivan = employee.run('Иван Петров', 'ivan@example.ru', 'Внутренний программист');
const dmitry = employee.run('Дмитрий Волков', 'dmitry@example.ru', 'Внутренний программист');

const project = db.prepare(`INSERT INTO projects
  (name, client, description, status, deal_amount_cents, deal_date, manager_employee_id, attention_required, attention_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const p1 = project.run('CRM для отдела продаж', 'Nova Retail', 'Разработка и внедрение CRM в Битрикс24', 'active', 120000000, '2026-09-02', anna.lastInsertRowid, 0, '');
const p2 = project.run('RPA для бухгалтерии', 'FinCore', 'Автоматизация обработки первичных документов', 'active', 98000000, '2026-08-18', natalia.lastInsertRowid, 1, 'Требуется согласовать следующий этап');

const member = db.prepare('INSERT INTO project_members (project_id, employee_id, role) VALUES (?, ?, ?)');
member.run(p1.lastInsertRowid, anna.lastInsertRowid, 'Менеджер проекта');
member.run(p1.lastInsertRowid, ivan.lastInsertRowid, 'Разработчик');
member.run(p1.lastInsertRowid, dmitry.lastInsertRowid, 'Разработчик');
member.run(p2.lastInsertRowid, natalia.lastInsertRowid, 'Менеджер проекта');

const completion = db.prepare(`INSERT INTO completions (project_id, amount_cents, completion_date, document, comment, created_by)
  VALUES (?, ?, ?, ?, ?, ?)`);
completion.run(p1.lastInsertRowid, 54000000, '2026-08-28', 'Акт №8', 'Закрыт этап аналитики', 'demo');
completion.run(p1.lastInsertRowid, 14616000, '2026-09-07', 'Акт №9', 'Закрыт этап разработки', 'demo');
completion.run(p2.lastInsertRowid, 31000000, '2026-08-25', 'Акт №4', 'RPA контур 1', 'demo');
completion.run(p2.lastInsertRowid, 15860000, '2026-09-06', 'Акт №5', 'RPA контур 2', 'demo');

const cat = Object.fromEntries(db.prepare('SELECT id, name FROM categories').all().map(r => [r.name, r.id]));
const tx = db.prepare(`INSERT INTO transactions
  (project_id, category_id, employee_id, counterparty, amount_cents, transaction_date, comment, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
tx.run(p1.lastInsertRowid, cat['Оплата от клиента'], null, 'Nova Retail', 56400000, '2026-08-30', 'Оплата по акту №8', 'demo');
tx.run(p1.lastInsertRowid, cat['Оплата от клиента'], null, 'Nova Retail', 12528000, '2026-09-07', 'Оплата этапа', 'demo');
tx.run(p1.lastInsertRowid, cat['Внутренние программисты'], ivan.lastInsertRowid, '', 1320000, '2026-09-07', 'Работы по проекту', 'demo');
tx.run(p1.lastInsertRowid, cat['Внутренние программисты'], dmitry.lastInsertRowid, '', 1329600, '2026-09-07', 'Работы по проекту', 'demo');
tx.run(p2.lastInsertRowid, cat['Оплата от клиента'], null, 'FinCore', 28500000, '2026-08-29', 'Оплата этапа', 'demo');
tx.run(p2.lastInsertRowid, cat['Расходы на ИИ'], null, 'YandexGPT API', 745200, '2026-09-07', 'API', 'demo');

const doc = db.prepare(`INSERT INTO documents
  (project_id, document_type, document_date, amount_cents, source, sync_status, external_id, comment)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
doc.run(p1.lastInsertRowid, 'Акт выполненных работ', '2026-09-07', 14616000, 'manual', 'pending', '', 'Готов к отправке в учетную систему');
doc.run(p2.lastInsertRowid, 'Акт выполненных работ', '2026-09-06', 15860000, 'manual', 'synced', 'DEMO-5', 'Синхронизирован');

console.log('Production-like demo data created. Start with: npm start');
