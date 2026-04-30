import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Database connection URL missing. Set DB_URL or DATABASE_URL in environment.');
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

export const initDb = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(50) PRIMARY KEY,
      script TEXT,
      global_character TEXT,
      narrative_arc TEXT,
      scenes JSONB,
      merged_video TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  const migrationQueries = [
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS script TEXT;`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS global_character TEXT;`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS narrative_arc TEXT;`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scenes JSONB;`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS merged_video TEXT;`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS global_environments JSONB;`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS target_language TEXT DEFAULT 'Hindi';`,
  ];
  
  try {
    await pool.query(createTableQuery);
    for (const migrationQuery of migrationQueries) {
      await pool.query(migrationQuery);
    }
    console.log('Database initialized: sessions table ready.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

export const query = (text, params) => pool.query(text, params);
