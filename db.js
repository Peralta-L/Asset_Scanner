import express from 'express';
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./assets.db');

db.run(`
    CREATE TABLE IF NOT EXISTS assets(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        InventoryNumber TEXT NOT NULL UNIQUE ,
        SerialNumber TEXT NOT NULL UNIQUE,
        Model TEXT NOT NULL,
        Brand TEXT NOT NULL,
        ItemType TEXT NOT NULL,
        AssignedTo TEXT,
        CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export default db;