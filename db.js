import Database from 'better-sqlite3';

const db = new Database('./assets.db');

db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        InventoryNumber TEXT NOT NULL,
        SerialNumber TEXT NOT NULL,
        Model TEXT,
        Brand TEXT,
        ItemType TEXT,
        AssignedTo TEXT
    )
`);

export default db;