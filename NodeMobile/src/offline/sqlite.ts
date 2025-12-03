// src/offline/sqlite.ts
import SQLite, { SQLiteDatabase, ResultSet } from "react-native-sqlite-storage";

SQLite.enablePromise(true);
SQLite.DEBUG(__DEV__);

const DB_NAME = "offline.db";

let dbPromise: Promise<SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabase({
      name: DB_NAME,
      location: "default",
    });
  }
  return dbPromise;
}

export interface RunResult {
  insertId?: number;
  rowsAffected: number;
}

/**
 * Run a write statement (INSERT/UPDATE/DELETE).
 * Resolves with { insertId, rowsAffected }.
 */
export async function dbRun(
  sql: string,
  params: any[] = []
): Promise<RunResult> {
  const db = await getDb();
  const [result] = await db.executeSql(sql, params);
  return {
    insertId: (result as ResultSet).insertId,
    rowsAffected: (result as ResultSet).rowsAffected,
  };
}

/**
 * Read many rows.
 * Resolves with an array of rows.
 */
export async function dbAll<T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const db = await getDb();
  const [result] = await db.executeSql(sql, params);
  const rows: T[] = [];

  const len = result.rows.length;
  for (let i = 0; i < len; i++) {
    rows.push(result.rows.item(i) as T);
  }
  return rows;
}

/**
 * Read one row (or null).
 */
export async function dbGet<T = any>(
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await dbAll<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
