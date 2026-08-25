import db from '../../db.js';

export function CreateAssetService(
    InventoryNumber,
    SerialNumber,
    Model,
    Brand,
    ItemType,
    AssignedTo
) {
    return new Promise((resolve, reject) => {

        // 1. Check for duplicates
        db.get(
            `SELECT * FROM assets 
             WHERE InventoryNumber = ? OR SerialNumber = ?`,
            [InventoryNumber, SerialNumber],
            (err, row) => {
                if (err) {
                    return reject(new Error("Database error"));
                }

                if (row) {
                    return reject(new Error("Cannot insert a duplicate"));
                }

                // 2. Insert new asset
                db.run(
                    `INSERT INTO assets 
                    (InventoryNumber, SerialNumber, Model, Brand, ItemType, AssignedTo)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [InventoryNumber, SerialNumber, Model, Brand, ItemType, AssignedTo],
                    function (err) {
                        if (err) {
                            return reject(new Error("Failed to insert asset"));
                        }

                        resolve({
                            id: this.lastID,
                            InventoryNumber,
                            SerialNumber,
                            Model,
                            Brand,
                            ItemType,
                            AssignedTo,
                            message: "HAS BEEN ADDED"
                        });
                    }
                );
            }
        );
    });
}


export async function ReviewAssetsService() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM assets", (err, rows) => {
            if (err) {
                reject(new Error('Failed to retrieve assets'));
            } else {
                resolve(rows);
            }
        });
    });
}

export async function UpdateAssetService(id, data) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE assets SET InventoryNumber = ?, SerialNumber = ?, Model = ?, Brand = ?, ItemType = ?, AssignedTo = ? WHERE id = ?`,
            [data.InventoryNumber, data.SerialNumber, data.Model, data.Brand, data.ItemType, data.AssignedTo, id],
            function (err) {
                if (err) reject(new Error('Failed to update asset'));
                else resolve({ id, ...data });
            }
        );
    });
}

export async function DeleteAssetService(id) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM assets WHERE id = ?`, [id], function (err) {
            if (err) reject(new Error('Failed to delete asset'));
            else resolve();
        });
    });
}

export async function DeleteAllAssetService() {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM assets`, function (err) {
            if (err) reject(new Error('Failed to delete all assets'));
            else resolve();
        });
    });
}