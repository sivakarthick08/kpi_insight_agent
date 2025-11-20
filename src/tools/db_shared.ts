import { Pool as PgPool } from 'pg';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let databaseUrl = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || process.env.MYSQL_CONNECTION_STRING || '';
// Normalize SQLAlchemy-style URLs (e.g. mysql+pymysql://) to a form mysql2 can accept
if (databaseUrl.startsWith('mysql+')) {
  databaseUrl = databaseUrl.replace(/^mysql\+[^:]+:/, 'mysql:');
}
if (databaseUrl.startsWith('postgresql://')) {
  // normalize to postgres protocol
  databaseUrl = databaseUrl.replace(/^postgresql:\/\//, 'postgres://');
}

let clientType = (process.env.DATABASE_CLIENT || '').toLowerCase();
if (!clientType) {
  if (databaseUrl.startsWith('mysql://') || databaseUrl.startsWith('mariadb://')) clientType = 'mysql';
  else clientType = 'postgres';
}

let pool: any;
if (clientType === 'postgres') {
  pool = new PgPool({ connectionString: databaseUrl });
} else {
  // mysql
  if (databaseUrl) {
    pool = mysql.createPool(databaseUrl);
  } else {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || undefined,
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
}

export async function ensureTables() {
  if (clientType === 'postgres') {
    const client = await pool.connect();
    try {
      await client.query(`
      CREATE TABLE IF NOT EXISTS kpi (
        name TEXT PRIMARY KEY,
        description TEXT,
        formula TEXT,
        table_name TEXT,
        columns JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

      // Migration safety: add columns if missing
      await client.query(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS table_name TEXT;`);
      await client.query(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS columns JSONB;`);
    } finally {
      client.release();
    }
  } else {
    const conn = await pool.getConnection();
    try {
      await conn.execute(`
      CREATE TABLE IF NOT EXISTS kpi (
        name VARCHAR(255) PRIMARY KEY,
        description TEXT,
        formula TEXT,
        table_name TEXT,
        columns JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

      // Migration safety: add columns if missing (MySQL 8+ supports IF NOT EXISTS in ADD COLUMN)
      try {
        await conn.execute(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS table_name TEXT;`);
        await conn.execute(`ALTER TABLE kpi ADD COLUMN IF NOT EXISTS columns JSON;`);
      } catch (err) {
        // older MySQL versions may not support IF NOT EXISTS for ADD COLUMN; ignore error
      }
    } finally {
      conn.release();
    }
  }
}

export async function listTables(): Promise<string[]> {
  if (clientType === 'postgres') {
    const res = await pool.query(
      `SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name;`
    );
    return res.rows.map((r: any) => `${r.table_schema}.${r.table_name}`);
  }

  const [rows] = await pool.query(
    `SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('mysql','information_schema','performance_schema','sys') ORDER BY table_schema, table_name;`
  );
  return (rows as any[]).map((r) => `${r.TABLE_SCHEMA || r.table_schema}.${r.TABLE_NAME || r.table_name}`);
}

export async function listColumns(table: string): Promise<{ column_name: string; data_type: string }[]> {
  if (clientType === 'postgres') {
    let schema = 'public';
    let tableName = table;
    if (table.includes('.')) {
      const parts = table.split('.');
      schema = parts[0];
      tableName = parts[1];
    }
    const res = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position;`,
      [schema, tableName]
    );
    return res.rows;
  }

  let schema = process.env.DB_NAME || undefined;
  let tableName = table;
  if (table.includes('.')) {
    const parts = table.split('.');
    schema = parts[0];
    tableName = parts[1];
  }
  const [rows] = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ordinal_position;`,
    [schema, tableName]
  );
  return rows as Array<{ column_name: string; data_type: string }>;
}

export async function insertKPI(data: { name: string; description?: string; formula: string; table_name?: string | null; columns?: string[] | null }) {
  if (clientType === 'postgres') {
    await pool.query(`INSERT INTO kpi (name, description, formula, table_name, columns) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, formula = EXCLUDED.formula, table_name = EXCLUDED.table_name, columns = EXCLUDED.columns;`, [
      data.name,
      data.description || null,
      data.formula,
      data.table_name || null,
      data.columns ? JSON.stringify(data.columns) : null,
    ]);
  } else {
    const colsJson = data.columns ? JSON.stringify(data.columns) : null;
    await pool.execute(
      `INSERT INTO kpi (name, description, formula, table_name, columns) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE description=VALUES(description), formula=VALUES(formula), table_name=VALUES(table_name), columns=VALUES(columns);`,
      [data.name, data.description || null, data.formula, data.table_name || null, colsJson]
    );
  }
}

export async function runQuery(sql: string, sample = 5): Promise<any[]> {
  // If the SQL already contains a LIMIT (case-insensitive), don't append another LIMIT.
  const cleaned = sql.trim().replace(/;$/, '');
  const hasLimit = /\blimit\b/i.test(cleaned);
  const limitedSql = hasLimit ? cleaned : `${cleaned} LIMIT ${sample}`;

  if (clientType === 'postgres') {
    const res = await pool.query(limitedSql);
    return res.rows;
  }
  const [rows] = await pool.query(limitedSql);
  return rows as any[];
}

export async function fetchKPIs(): Promise<{ name: string; formula: string; table_name?: string | null; columns?: string[] | null }[]> {
  if (clientType === 'postgres') {
    const res = await pool.query(`SELECT name, formula, table_name, columns FROM kpi ORDER BY name;`);
    return res.rows.map((r: any) => ({
      ...r,
      columns: r.columns ? (Array.isArray(r.columns) ? r.columns : JSON.parse(r.columns)) : undefined,
    }));
  }

  const [rows] = await pool.query(`SELECT name, formula, table_name, columns FROM kpi ORDER BY name;`);
  return (rows as any[]).map((r) => ({
    ...r,
    columns: r.columns ? r.columns : undefined,
  }));
}

export { pool };
