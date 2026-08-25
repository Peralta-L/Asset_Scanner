import express from 'express';

import {CreateAssetController, ReviewAssetsController, UpdateAssetController, DeleteAssetController, DeleteAllAssetController } from '../controllers/AssetController.js';
    
const router = express.Router();

router.use(express.json());

router.post('/assets', CreateAssetController);
router.get('/review', ReviewAssetsController);
router.put('/assets/:id', UpdateAssetController);
router.delete('/assets/:id', DeleteAssetController);
router.delete('/assets', DeleteAllAssetController);

export default router;