const { connectDB, getPool } = require('./src/config/db');
require('dotenv').config();

connectDB().then(async (pool) => {
    try {
        const result = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Users'
        `);
        console.log('COLUMNS:', result.recordset);
    } catch (err) {
        console.error('Error:', err.message);
    }
    process.exit(0);
}).catch(err => {
    console.error('DB connect failed:', err.message);
    process.exit(1);
});
