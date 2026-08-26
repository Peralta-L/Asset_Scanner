import db from '../../db.js';

export async function CreateAssetService(InventoryNumber, SerialNumber, Model, Brand, ItemType, AssignedTo) {
    const stmt = db.prepare(
        `INSERT INTO assets (InventoryNumber, SerialNumber, Model, Brand, ItemType, AssignedTo) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(InventoryNumber, SerialNumber, Model, Brand, ItemType, AssignedTo);
    return { id: info.lastInsertRowid, InventoryNumber, SerialNumber, Model, Brand, ItemType, AssignedTo };
}

export async function ReviewAssetsService() {
    return db.prepare(`SELECT * FROM assets`).all();
}

export async function UpdateAssetService(id, data) {
    db.prepare(
        `UPDATE assets SET InventoryNumber = ?, SerialNumber = ?, Model = ?, Brand = ?, ItemType = ?, AssignedTo = ? WHERE id = ?`
    ).run(data.InventoryNumber, data.SerialNumber, data.Model, data.Brand, data.ItemType, data.AssignedTo, id);
    return { id, ...data };
}

export async function DeleteAssetService(id) {
    db.prepare(`DELETE FROM assets WHERE id = ?`).run(id);
}

export async function DeleteAllAssetService(){
    db.prepare(`DELETE FROM assets`).run();
}