
// node drop_all_data.js


const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

async function dropAllData() {
    const client = await pool.connect();

    try {
        console.log('🗑️  Starting to drop all data from tables...');

        // Disable foreign key checks temporarily (PostgreSQL doesn't have this, but we'll handle order)
        await client.query('BEGIN');

        // Delete in order to respect foreign key constraints
        // Start with tables that have no dependencies
        const tablesToClear = [
            'booking_history',      // References bookings
            'booking_seats',        // References events, bookings, users
            'notifications',        // References users, events
            'organization_invites',  // References organizations, users
            'bookings',            // References events, users
            'events',              // References organizations, users
            'organization_users',   // References organizations, users
            'users',               // Referenced by many tables
            'organizations'        // Referenced by events, organization_users, organization_invites
        ];

        for (const table of tablesToClear) {
            try {
                const result = await client.query(`DELETE FROM ${table}`);
                console.log(`✅ Cleared ${result.rowCount} rows from ${table}`);
            } catch (error) {
                console.log(`⚠️  Table ${table} might not exist or be empty: ${error.message}`);
            }
        }

        await client.query('COMMIT');
        console.log('✅ Successfully dropped all data from all tables!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error dropping data:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the script
dropAllData()
    .then(() => {
        console.log('🎉 All data has been successfully dropped!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Failed to drop data:', error);
        process.exit(1);
    });
