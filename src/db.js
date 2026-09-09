import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'finance.sqlite');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');

function tableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name));
}

function ensureColumn(table, name, definition) {
  if (tableColumns(table).has(name)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  return true;
}

function createTransactionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      employee_id INTEGER,
      counterparty TEXT NOT NULL DEFAULT '',
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      transaction_date TEXT NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE RESTRICT,
      FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE SET NULL
    );
  `);
}

function migrateLegacyMoneyColumn() {
  const columns = tableColumns('transactions');
  if (!columns.has('amount') || columns.has('amount_cents')) return;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec(`
      ALTER TABLE transactions RENAME TO transactions_legacy;

      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        employee_id INTEGER,
        counterparty TEXT NOT NULL DEFAULT '',
        amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
        transaction_date TEXT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE RESTRICT,
        FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE SET NULL
      );

      INSERT INTO transactions (
        id, project_id, category_id, amount_cents, transaction_date,
        comment, created_by, created_at, updated_at
      )
      SELECT
        id, project_id, category_id, CAST(ROUND(amount * 100) AS INTEGER), transaction_date,
        comment, created_by, created_at, updated_at
      FROM transactions_legacy;

      DROP TABLE transactions_legacy;
    `);
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      client TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','done')),
      deal_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(deal_amount_cents >= 0),
      deal_date TEXT,
      manager_employee_id INTEGER,
      attention_required INTEGER NOT NULL DEFAULT 0 CHECK(attention_required IN (0,1)),
      attention_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      party_mode TEXT NOT NULL DEFAULT 'counterparty' CHECK(party_mode IN ('counterparty','employee')),
      employee_role TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(name, type)
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      bitrix_user_id TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(project_id, employee_id),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      completion_date TEXT NOT NULL,
      document TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      document_date TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_cents >= 0),
      source TEXT NOT NULL DEFAULT 'manual',
      sync_status TEXT NOT NULL DEFAULT 'not_synced' CHECK(sync_status IN ('not_synced','pending','synced','error')),
      external_id TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  // Safe incremental migration from the first task version.
  ensureColumn('projects', 'deal_amount_cents', 'INTEGER NOT NULL DEFAULT 0 CHECK(deal_amount_cents >= 0)');
  ensureColumn('projects', 'deal_date', 'TEXT');
  ensureColumn('projects', 'manager_employee_id', 'INTEGER REFERENCES employees(id) ON DELETE SET NULL');
  ensureColumn('projects', 'attention_required', 'INTEGER NOT NULL DEFAULT 0 CHECK(attention_required IN (0,1))');
  ensureColumn('projects', 'attention_reason', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('employees', 'role', "TEXT NOT NULL DEFAULT ''");
  const categoryPartyModeAdded = ensureColumn(
    'categories',
    'party_mode',
    "TEXT NOT NULL DEFAULT 'counterparty' CHECK(party_mode IN ('counterparty','employee'))"
  );
  const categoryEmployeeRoleAdded = ensureColumn('categories', 'employee_role', "TEXT NOT NULL DEFAULT ''");

  if (categoryPartyModeAdded || categoryEmployeeRoleAdded) {
    db.prepare(`
      UPDATE categories
      SET party_mode='employee', employee_role='Внутренний программист'
      WHERE type='expense' AND name='Внутренние программисты'
    `).run();
  }

  createTransactionsTable();
  migrateLegacyMoneyColumn();
  ensureColumn('transactions', 'employee_id', 'INTEGER REFERENCES employees(id) ON DELETE SET NULL');
  ensureColumn('transactions', 'counterparty', "TEXT NOT NULL DEFAULT ''");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_deal_date ON projects(deal_date);
    CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(manager_employee_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_employee ON transactions(employee_id);
    CREATE INDEX IF NOT EXISTS idx_completions_project ON completions(project_id);
    CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(completion_date);
    CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
    CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(document_date);
    CREATE INDEX IF NOT EXISTS idx_documents_sync ON documents(sync_status);
    CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
  `);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO categories (name, type, party_mode, employee_role, is_default)
    VALUES (?, ?, ?, ?, 1)
  `);
  insert.run('Оплата от клиента', 'income', 'counterparty', '');
  insert.run('Внешние программисты', 'expense', 'counterparty', '');
  insert.run('Внутренние программисты', 'expense', 'employee', 'Внутренний программист');
  insert.run('Расходы на ИИ', 'expense', 'counterparty', '');
  insert.run('Аренда сервера', 'expense', 'counterparty', '');
  insert.run('Дивиденды', 'expense', 'counterparty', '');
}

export function resetDemoData() {
  db.exec(`
    DELETE FROM documents;
    DELETE FROM completions;
    DELETE FROM transactions;
    DELETE FROM project_members;
    DELETE FROM projects;
    DELETE FROM employees;
    DELETE FROM categories WHERE is_default = 0;
  `);
}
