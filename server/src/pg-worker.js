import { parentPort, workerData } from 'node:worker_threads';
import pg from 'pg';

const { Pool, types } = pg;
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

const pool = new Pool({
  connectionString: workerData.databaseUrl,
  max: 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: workerData.databaseUrl.includes('localhost') || workerData.databaseUrl.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false },
});

const state = new Int32Array(workerData.sharedBuffer, 0, 1);
const bytes = new Uint8Array(workerData.sharedBuffer, 4);
const encoder = new TextEncoder();

function qmarksToPg(sql) {
  let out = '';
  let n = 0;
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) out += sql[++i];
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '?') out += `$${++n}`;
    else out += ch;
  }
  return out;
}

function translate(sql, op) {
  let text = String(sql).trim();
  if (/^PRAGMA\b/i.test(text)) return null;
  text = text.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');
  text = text.replace(/\bINSERT\s+OR\s+REPLACE\s+INTO\b/gi, 'INSERT INTO');
  text = text.replace(/\bADD\s+COLUMN\s+/gi, 'ADD COLUMN IF NOT EXISTS ');
  text = qmarksToPg(text);
  if (op === 'run' && /^INSERT\b/i.test(text) && !/\bRETURNING\b/i.test(text)) {
    text += ' RETURNING id';
  }
  return text;
}

function write(payload) {
  const text = JSON.stringify(payload);
  const encoded = encoder.encode(text);
  if (encoded.length > bytes.length) {
    const fallback = encoder.encode(JSON.stringify({ ok: false, error: { message: 'Database response exceeded 32 MB shared buffer' } }));
    bytes.set(fallback.subarray(0, bytes.length));
    Atomics.store(state, 0, fallback.length + 1);
  } else {
    bytes.set(encoded);
    Atomics.store(state, 0, encoded.length + 1);
  }
  Atomics.notify(state, 0);
}

async function execute(op, sql, params) {
  const text = translate(sql, op);
  if (text === null) return null;
  const result = await pool.query(text, params || []);
  if (op === 'get') return result.rows[0];
  if (op === 'all') return result.rows;
  if (op === 'run') {
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows?.[0]?.id ?? undefined,
    };
  }
  return true;
}

parentPort.on('message', async (message) => {
  if (message.op === 'close') {
    await pool.end().catch(() => {});
    process.exit(0);
  }
  try {
    const result = await execute(message.op, message.sql, message.params);
    write({ ok: true, result });
  } catch (error) {
    write({ ok: false, error: { message: error.message, code: error.code } });
  }
});
