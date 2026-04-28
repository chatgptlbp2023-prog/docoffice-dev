const { Pool } = require('pg');
require('dotenv').config();

function buildPoolConfig(env = process.env) {
  if (env.DATABASE_URL) {
    return {
      connectionString: env.DATABASE_URL,
    };
  }

  return {
    host: env.DB_HOST || env.PGHOST,
    port: Number(env.DB_PORT || env.PGPORT),
    database: env.DB_NAME || env.PGDATABASE,
    user: env.DB_USER || env.PGUSER,
    password: env.DB_PASSWORD || env.PGPASSWORD,
  };
}

const pool = new Pool(buildPoolConfig());

module.exports = pool;
