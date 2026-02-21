import request from 'supertest';
import express from 'express';
import decisionReplayRoutes from '../routes/decision-replay.routes';
import { authenticateJWT } from '../middleware/authz.middleware';

// Mock dependencies
jest.mock('../services/resource.service');
jest.mock('../middleware/authz.middleware');

const app = express();
app.use(express.json());
app.use('/api/decision-replay', decisionReplayRoutes);

describe('Decision Replay API', () => {
    beforeEach(() => {
        // Mock authenticateJWT to set req.user
        (authenticateJWT as jest.Mock).mockImplementation((req, _res, next) => {
            req.user = {
                sub: 'john.doe@mil',
                uniqueID: 'john.doe@mil',
                clearance: 'SECRET',
                countryOfAffiliation: 'USA',
                acpCOI: ['FVEY'],
                iss: 'https://keycloak:8080/realms/dive-v3-usa',
                auth_time: Math.floor(Date.now() / 1000) - 300,
                acr: 'aal2',
                amr: ['pwd', 'otp'],
            };
            next();
        });
    });

    it('POST / - returns 400 if resourceId missing', async () => {
        const response = await request(app)
            .post('/api/decision-replay')
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Bad Request');
    });

    it('POST / - requires authentication', async () => {
        (authenticateJWT as jest.Mock).mockImplementation((_req, res) => {
            res.status(401).json({ error: 'Unauthorized' });
        });

        const response = await request(app)
            .post('/api/decision-replay')
            .send({ resourceId: 'doc-123' });

        expect(response.status).toBe(401);
    });

    // Note: Full integration tests would require MongoDB and OPA running
    // These tests verify the controller structure and error handling
});
