import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    const health = {
        status: 'healthy',
        service: 'dive-v3-backend',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    };

    res.json(health);
});

router.get('/ready', async (req: Request, res: Response) => {
    // Check dependencies
    const checks = {
        opa: false,
        mongodb: false
    };

    try {
        // Check OPA
        const opaUrl = process.env.OPA_URL;
        if (opaUrl) {
            const axios = require('axios');
            const opaHealth = await axios.get(`${opaUrl}/health`, { timeout: 2000 });
            checks.opa = opaHealth.status === 200;
        }
    } catch (error) {
        logger.warn({ error }, 'OPA health check failed');
    }

    try {
        // Check MongoDB
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(process.env.MONGODB_URL!);
        await client.connect();
        await client.db().admin().ping();
        await client.close();
        checks.mongodb = true;
    } catch (error) {
        logger.warn({ error }, 'MongoDB health check failed');
    }

    const ready = checks.opa && checks.mongodb;

    res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not ready',
        checks,
        timestamp: new Date().toISOString()
    });
});

export default router;

