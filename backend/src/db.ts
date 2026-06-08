import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { config } from './config';
import { logger } from './logger';

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

export function initDb(): void {
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY,
      hash TEXT UNIQUE NOT NULL,
      file_path TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL,
      download_count INTEGER DEFAULT 0,
      last_accessed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_shares_hash ON shares(hash);
    CREATE INDEX IF NOT EXISTS idx_shares_file_path ON shares(file_path);
  `);

  type ColInfo = { name: string };

  // Migration: role column on users
  const userCols = db.prepare('PRAGMA table_info(users)').all() as ColInfo[];
  if (!userCols.some(c => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'");
    db.exec("UPDATE users SET role='admin' WHERE id=(SELECT MIN(id) FROM users)");
    logger.info('migration: added users.role');
  }

  // Migration: share_type on shares
  const shareCols = db.prepare('PRAGMA table_info(shares)').all() as ColInfo[];
  if (!shareCols.some(c => c.name === 'share_type')) {
    db.exec("ALTER TABLE shares ADD COLUMN share_type TEXT NOT NULL DEFAULT 'file'");
    logger.info('migration: added shares.share_type');
  }

  // Migration: revoked_at on shares (soft-revoke — link stops working but stays for audit)
  if (!shareCols.some(c => c.name === 'revoked_at')) {
    db.exec('ALTER TABLE shares ADD COLUMN revoked_at INTEGER');
    logger.info('migration: added shares.revoked_at');
  }

  // Migration: user_permissions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, folder_path)
    );
    CREATE INDEX IF NOT EXISTS idx_perms_user ON user_permissions(user_id);
  `);

  // Migration: trash table (item 14 — recoverable deletes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS trash (
      id INTEGER PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      original_path TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      deleted_by INTEGER REFERENCES users(id),
      deleted_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trash_expires ON trash(expires_at);
  `);

  seedAdmin();
}

function seedAdmin(): void {
  const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existing) return;

  const hash = bcrypt.hashSync(config.adminPassword, 12);
  db.prepare(
    'INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)'
  ).run(config.adminUsername, hash, 'admin', Date.now());

  logger.info({ username: config.adminUsername }, 'admin user seeded');
}
