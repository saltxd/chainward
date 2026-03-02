import { createDb, type Database } from '@chainward/db';
import { getEnv } from '../config.js';

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = createDb(getEnv().DATABASE_URL);
  }
  return _db;
}
