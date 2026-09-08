import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initDb } from './db.js';
import { calculateMetrics } from './finance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const port = Number(process.env.PORT || 3000);

initDb();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function badRequest(res, message) {
  json(res, 400, { error: message });
}

function notFound(res) {
  json(res, 404, { error: 'Не найдено' });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeType(value) {
  return value === 'income' || value === 'expense' ? value : null;
}

function projectExists(id) {
  return Boolean(db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id));
}

function getProjectMetrics(projectId = null) {
  const where = projectId ? 'WHERE p.id = ?' : '';
  // Transactions and members are aggregated independently. Joining both detail tables
  // directly would multiply transaction amounts by the number of project members.
  const rows = db.prepare(`
    SELECT p.id, p.name, p.client, p.description, p.status, p.created_at,
      COALESCE(fin.income, 0) AS income,
      COALESCE(fin.expense, 0) AS expense,
      COALESCE(team.members_count, 0) AS members_count
    FROM projects p
    LEFT JOIN (
      SELECT t.project_id,
        SUM(CASE WHEN c.type = 'income' THEN t.amount ELSE 0 END) AS income,
        SUM(CASE WHEN c.type = 'expense' THEN t.amount ELSE 0 END) AS expense
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      GROUP BY t.project_id
    ) fin ON fin.project_id = p.id
    LEFT JOIN (
      SELECT project_id, COUNT(*) AS members_count
      FROM project_members
      GROUP BY project_id
    ) team ON team.project_id = p.id
    ${where}
    ORDER BY p.created_at DESC, p.id DESC
  `).all(...(projectId ? [projectId] : []));

  return rows.map(row => ({ ...row, ...calculateMetrics(row.income, row.expense) }));
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const parts = url.pathname.split('/').filter(Boolean);

  if (method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'bitrix24-project-finance' });
  }

  if (method === 'GET' && url.pathname === '/api/dashboard') {
    const projects = getProjectMetrics();
    const totals = projects.reduce((acc, project) => {
      acc.income += project.income;
      acc.expense += project.expense;
      return acc;
    }, { income: 0, expense: 0 });
    return json(res, 200, { totals: calculateMetrics(totals.income, totals.expense), projects });
  }

  if (parts[1] === 'projects' && parts.length === 2) {
    if (method === 'GET') return json(res, 200, getProjectMetrics());
    if (method === 'POST') {
      const body = await readJson(req);
      const name = String(body.name || '').trim();
      if (!name) return badRequest(res, 'Укажите название проекта');
      const status = ['active', 'paused', 'done'].includes(body.status) ? body.status : 'active';
      const result = db.prepare(`INSERT INTO projects (name, client, description, status)
        VALUES (?, ?, ?, ?)`).run(name, String(body.client || '').trim(), String(body.description || '').trim(), status);
      return json(res, 201, getProjectMetrics(Number(result.lastInsertRowid))[0]);
    }
  }

  if (parts[1] === 'projects' && parts.length === 3) {
    const id = parseId(parts[2]);
    if (!id) return badRequest(res, 'Некорректный id проекта');
    if (method === 'GET') {
      const project = getProjectMetrics(id)[0];
      if (!project) return notFound(res);
      const members = db.prepare(`
        SELECT e.id, e.name, e.email, e.bitrix_user_id, pm.role
        FROM project_members pm JOIN employees e ON e.id = pm.employee_id
        WHERE pm.project_id = ? ORDER BY e.name
      `).all(id);
      const transactions = db.prepare(`
        SELECT t.id, t.amount, t.transaction_date, t.comment, t.created_by, t.created_at,
               c.id AS category_id, c.name AS category_name, c.type
        FROM transactions t JOIN categories c ON c.id = t.category_id
        WHERE t.project_id = ? ORDER BY t.transaction_date DESC, t.id DESC
      `).all(id);
      return json(res, 200, { ...project, members, transactions });
    }
    if (method === 'PATCH') {
      if (!projectExists(id)) return notFound(res);
      const body = await readJson(req);
      const current = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
      const name = body.name !== undefined ? String(body.name).trim() : current.name;
      if (!name) return badRequest(res, 'Название проекта не может быть пустым');
      const status = body.status !== undefined ? body.status : current.status;
      if (!['active','paused','done'].includes(status)) return badRequest(res, 'Некорректный статус');
      db.prepare(`UPDATE projects SET name=?, client=?, description=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(name, body.client !== undefined ? String(body.client).trim() : current.client,
          body.description !== undefined ? String(body.description).trim() : current.description, status, id);
      return json(res, 200, getProjectMetrics(id)[0]);
    }
  }

  if (parts[1] === 'projects' && parts[3] === 'members' && parts.length === 4 && method === 'POST') {
    const projectId = parseId(parts[2]);
    if (!projectId || !projectExists(projectId)) return notFound(res);
    const body = await readJson(req);
    const employeeId = parseId(body.employee_id);
    if (!employeeId || !db.prepare('SELECT 1 FROM employees WHERE id=?').get(employeeId)) return badRequest(res, 'Сотрудник не найден');
    db.prepare(`INSERT INTO project_members (project_id, employee_id, role) VALUES (?, ?, ?)
      ON CONFLICT(project_id, employee_id) DO UPDATE SET role=excluded.role`)
      .run(projectId, employeeId, String(body.role || '').trim());
    return json(res, 201, { ok: true });
  }

  if (parts[1] === 'projects' && parts[3] === 'members' && parts.length === 5 && method === 'DELETE') {
    const projectId = parseId(parts[2]);
    const employeeId = parseId(parts[4]);
    if (!projectId || !employeeId) return badRequest(res, 'Некорректный id');
    db.prepare('DELETE FROM project_members WHERE project_id=? AND employee_id=?').run(projectId, employeeId);
    return json(res, 200, { ok: true });
  }

  if (parts[1] === 'categories' && parts.length === 2) {
    if (method === 'GET') {
      const type = url.searchParams.get('type');
      const rows = type
        ? db.prepare('SELECT * FROM categories WHERE type=? ORDER BY is_default DESC, name').all(type)
        : db.prepare('SELECT * FROM categories ORDER BY type, is_default DESC, name').all();
      return json(res, 200, rows);
    }
    if (method === 'POST') {
      const body = await readJson(req);
      const name = String(body.name || '').trim();
      const type = normalizeType(body.type);
      if (!name || !type) return badRequest(res, 'Укажите название и тип статьи');
      try {
        const result = db.prepare('INSERT INTO categories (name, type, is_default) VALUES (?, ?, 0)').run(name, type);
        return json(res, 201, db.prepare('SELECT * FROM categories WHERE id=?').get(Number(result.lastInsertRowid)));
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) return badRequest(res, 'Такая статья уже существует');
        throw e;
      }
    }
  }

  if (parts[1] === 'employees' && parts.length === 2) {
    if (method === 'GET') return json(res, 200, db.prepare('SELECT * FROM employees ORDER BY name').all());
    if (method === 'POST') {
      const body = await readJson(req);
      const name = String(body.name || '').trim();
      if (!name) return badRequest(res, 'Укажите имя сотрудника');
      const result = db.prepare('INSERT INTO employees (name, email, bitrix_user_id) VALUES (?, ?, ?)')
        .run(name, String(body.email || '').trim(), String(body.bitrix_user_id || '').trim());
      return json(res, 201, db.prepare('SELECT * FROM employees WHERE id=?').get(Number(result.lastInsertRowid)));
    }
  }

  if (parts[1] === 'transactions' && parts.length === 2 && method === 'POST') {
    const body = await readJson(req);
    const projectId = parseId(body.project_id);
    const categoryId = parseId(body.category_id);
    const amount = Number(body.amount);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.transaction_date || '')) ? body.transaction_date : null;
    if (!projectId || !projectExists(projectId)) return badRequest(res, 'Проект не найден');
    const category = categoryId ? db.prepare('SELECT * FROM categories WHERE id=?').get(categoryId) : null;
    if (!category) return badRequest(res, 'Статья не найдена');
    if (!Number.isFinite(amount) || amount <= 0) return badRequest(res, 'Сумма должна быть больше нуля');
    if (!date) return badRequest(res, 'Укажите дату');
    const creator = String(req.headers['x-bitrix-user'] || body.created_by || '').slice(0, 200);
    const result = db.prepare(`INSERT INTO transactions
      (project_id, category_id, amount, transaction_date, comment, created_by)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(projectId, categoryId, Math.round(amount * 100) / 100, date, String(body.comment || '').trim(), creator);
    return json(res, 201, db.prepare(`SELECT t.*, c.name AS category_name, c.type FROM transactions t JOIN categories c ON c.id=t.category_id WHERE t.id=?`)
      .get(Number(result.lastInsertRowid)));
  }

  if (parts[1] === 'transactions' && parts.length === 3) {
    const id = parseId(parts[2]);
    if (!id) return badRequest(res, 'Некорректный id операции');
    if (method === 'DELETE') {
      db.prepare('DELETE FROM transactions WHERE id=?').run(id);
      return json(res, 200, { ok: true });
    }
    if (method === 'PATCH') {
      const current = db.prepare('SELECT * FROM transactions WHERE id=?').get(id);
      if (!current) return notFound(res);
      const body = await readJson(req);
      const categoryId = body.category_id !== undefined ? parseId(body.category_id) : current.category_id;
      const amount = body.amount !== undefined ? Number(body.amount) : current.amount;
      const date = body.transaction_date !== undefined ? String(body.transaction_date) : current.transaction_date;
      if (!db.prepare('SELECT 1 FROM categories WHERE id=?').get(categoryId)) return badRequest(res, 'Статья не найдена');
      if (!Number.isFinite(amount) || amount <= 0) return badRequest(res, 'Сумма должна быть больше нуля');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest(res, 'Некорректная дата');
      db.prepare(`UPDATE transactions SET category_id=?, amount=?, transaction_date=?, comment=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(categoryId, Math.round(amount * 100) / 100, date,
          body.comment !== undefined ? String(body.comment).trim() : current.comment, id);
      return json(res, 200, { ok: true });
    }
  }

  return notFound(res);
}

function serveStatic(req, res, url) {
  let relative = decodeURIComponent(url.pathname);
  if (relative === '/') relative = '/index.html';
  const file = path.resolve(publicDir, '.' + relative);
  if (!file.startsWith(publicDir)) return notFound(res);

  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return notFound(res);
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    // SPA fallback
    if (!path.extname(relative)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      fs.createReadStream(path.join(publicDir, 'index.html')).pipe(res);
    } else {
      notFound(res);
    }
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (error) {
      const message = error?.message === 'INVALID_JSON' ? 'Некорректный JSON'
        : error?.message === 'PAYLOAD_TOO_LARGE' ? 'Слишком большой запрос'
        : 'Внутренняя ошибка сервера';
      if (!res.headersSent) json(res, error?.message === 'INVALID_JSON' || error?.message === 'PAYLOAD_TOO_LARGE' ? 400 : 500, { error: message });
      console.error(error);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(port, () => {
    console.log(`Project Finance: http://localhost:${port}`);
  });
}
