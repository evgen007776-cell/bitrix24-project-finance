import { db, initDb, resetDemoData } from './db.js';

initDb();
resetDemoData();

const p1 = db.prepare('INSERT INTO projects (name, client, description, status) VALUES (?, ?, ?, ?)')
  .run('CRM для отдела продаж', 'Альфа', 'Автоматизация воронки и аналитики', 'active');
const p2 = db.prepare('INSERT INTO projects (name, client, description, status) VALUES (?, ?, ?, ?)')
  .run('Личный кабинет', 'Бета', 'Кабинет клиента и интеграция с 1С', 'active');

const e1 = db.prepare('INSERT INTO employees (name, email) VALUES (?, ?)').run('Антон Смирнов', 'anton@example.ru');
const e2 = db.prepare('INSERT INTO employees (name, email) VALUES (?, ?)').run('Мария Орлова', 'maria@example.ru');
const e3 = db.prepare('INSERT INTO employees (name, email) VALUES (?, ?)').run('Илья Кузнецов', 'ilya@example.ru');

const member = db.prepare('INSERT INTO project_members (project_id, employee_id, role) VALUES (?, ?, ?)');
member.run(p1.lastInsertRowid, e1.lastInsertRowid, 'Руководитель проекта');
member.run(p1.lastInsertRowid, e2.lastInsertRowid, 'Разработчик');
member.run(p2.lastInsertRowid, e3.lastInsertRowid, 'Разработчик');

const cat = Object.fromEntries(db.prepare('SELECT id, name FROM categories').all().map(r => [r.name, r.id]));
const tx = db.prepare(`INSERT INTO transactions
  (project_id, category_id, amount, transaction_date, comment, created_by)
  VALUES (?, ?, ?, ?, ?, ?)`);

const today = new Date().toISOString().slice(0, 10);
tx.run(p1.lastInsertRowid, cat['Оплата от клиента'], 480000, today, 'Этап 1', 'demo');
tx.run(p1.lastInsertRowid, cat['Внутренние программисты'], 165000, today, 'Разработка', 'demo');
tx.run(p1.lastInsertRowid, cat['Расходы на ИИ'], 18000, today, 'API и подписки', 'demo');
tx.run(p1.lastInsertRowid, cat['Аренда сервера'], 12000, today, 'VPS', 'demo');
tx.run(p2.lastInsertRowid, cat['Оплата от клиента'], 210000, today, 'Аванс', 'demo');
tx.run(p2.lastInsertRowid, cat['Внешние программисты'], 95000, today, 'Frontend', 'demo');
tx.run(p2.lastInsertRowid, cat['Расходы на ИИ'], 9000, today, 'ИИ-инструменты', 'demo');

console.log('Demo data created. Start with: npm start');
