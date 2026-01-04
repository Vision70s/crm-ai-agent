import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export function initDb() {
  // Leads table
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY,
      amo_id INTEGER UNIQUE,
      status_id INTEGER,
      last_message_at INTEGER,
      last_analyzed_at INTEGER,
      last_thought TEXT,
      vibe TEXT,
      urgency TEXT,
      lead_name TEXT
    )
  `);

  // Memory table
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER,
      subdomain TEXT
    )
  `);

  // Thoughts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS thoughts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      thought TEXT,
      action TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Pending actions table - AI recommendations awaiting approval
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      action_data TEXT,
      risk_score INTEGER,
      priority TEXT,
      reasoning TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      telegram_message_id INTEGER
    )
  `);

  // Decisions log - track manager approvals/rejections for learning
  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pending_action_id INTEGER,
      decision TEXT,
      modified_data TEXT,
      decided_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      outcome TEXT
    )
  `);

  // Lead scores - historical scoring for trend analysis
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      score INTEGER,
      risk_level TEXT,
      priority TEXT,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✅ Database initialized successfully.');
}

export function getDb() {
  return db;
}
