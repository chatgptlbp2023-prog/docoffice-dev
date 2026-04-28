const pool = require('../config/db');

async function withTransaction(work) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const result = await work(client);

    await client.query('COMMIT');
    transactionStarted = false;

    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback hiba:', rollbackError);
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  withTransaction
};