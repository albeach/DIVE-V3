import express, { Application } from 'express';
import cors from 'cors';
import { config } from 'dotenv';

// Week 4: Full KAS implementation
// Week 1: Minimal stub for service discovery

config({ path: '.env.local' });

const app: Application = express();
const PORT = process.env.KAS_PORT || 8080;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'dive-v3-kas',
        version: '1.0.0-stub',
        timestamp: new Date().toISOString(),
        message: 'KAS stub - Full implementation in Week 4'
    });
});

// Placeholder for Week 4
app.post('/request-key', (req, res) => {
    res.status(501).json({
        error: 'Not Implemented',
        message: 'KAS key request will be implemented in Week 4 (stretch goal)',
        hint: 'This endpoint will re-evaluate ABAC policy and return encryption keys'
    });
});

app.listen(PORT, () => {
    console.log(`🔑 KAS Service started on port ${PORT}`);
    console.log(`   Status: STUB (Week 4 implementation pending)`);
});

