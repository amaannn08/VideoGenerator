import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DB_URL,
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
  
  try {
    await pool.query(createTableQuery);
    console.log('Database initialized: sessions table ready.');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

export const query = (text, params) => pool.query(text, params);
