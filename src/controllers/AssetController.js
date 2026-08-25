 import {CreateAssetService, ReviewAssetsService, DeleteAssetService, UpdateAssetService, DeleteAllAssetService } from '../services/AssetService.js';
 
 
 export async function CreateAssetController(req, res) {
     console.log("Incoming body:", req.body);
     console.log("Route params:", req.params);
     const { InventoryNumber, SerialNumber, Model, Brand, ItemType, AssignedTo } = req.body;
     console.log("Extracted values:", { InventoryNumber, SerialNumber, Model, Brand, ItemType, AssignedTo });
     
     if (!InventoryNumber || !SerialNumber || !Model || !Brand || !ItemType) {
        return res.status(400).json({ error: 'Missing required body parameters' });
    }

        try {
            const newAsset = await CreateAssetService(InventoryNumber, SerialNumber, Model, Brand, ItemType, AssignedTo);
            res.status(201).json(newAsset);
        }
        catch (error) {
            return res.status(400).json({ error: error.message });
        }

}

export async function ReviewAssetsController(req, res) {
    console.log("Incoming body:", req.body);
    console.log("Route params:", req.params);
    try {
        const reviewAssets = await ReviewAssetsService();
        res.status(200).json(reviewAssets);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to retrieve assets' });
    }
}

export async function UpdateAssetController(req, res) {
    try {
        const updated = await UpdateAssetService(req.params.id, req.body);
        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update asset' });
    }
}

export async function DeleteAssetController(req, res) {
    try {
        await DeleteAssetService(req.params.id);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete asset' });
    }
}

export async function DeleteAllAssetController(req, res) {
    try {
        await DeleteAllAssetService();
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete all assets' });
    } 
}