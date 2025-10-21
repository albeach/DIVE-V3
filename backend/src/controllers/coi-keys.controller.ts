/**
 * COI Keys API Controller
 * 
 * RESTful API endpoints for managing Community of Interest (COI) Keys
 * Provides CRUD operations and metadata queries for COI registry.
 * 
 * Date: October 21, 2025
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
    getAllCOIKeys,
    getCOIKeyById,
    createCOIKey,
    updateCOIKey,
    deprecateCOIKey,
    getCOIsForCountry,
    getAllCOICountries,
    getCOIKeyStatistics
} from '../services/coi-key.service';
import { ICreateCOIKeyRequest, IUpdateCOIKeyRequest } from '../types/coi-key.types';

/**
 * GET /api/coi-keys
 * Get all COI Keys (optionally filtered by status)
 */
export async function getAllCOIKeysHandler(req: Request, res: Response): Promise<void> {
    try {
        const status = req.query.status as 'active' | 'deprecated' | 'pending' | undefined;

        const result = await getAllCOIKeys(status);

        logger.info('Retrieved COI Keys', { count: result.total, status });

        res.json(result);
    } catch (error) {
        logger.error('Failed to get COI Keys', { error });
        res.status(500).json({ error: 'Failed to retrieve COI Keys' });
    }
}

/**
 * GET /api/coi-keys/:coiId
 * Get a single COI Key by ID
 */
export async function getCOIKeyByIdHandler(req: Request, res: Response): Promise<void> {
    try {
        const { coiId } = req.params;

        const coiKey = await getCOIKeyById(coiId);

        if (!coiKey) {
            res.status(404).json({ error: `COI Key '${coiId}' not found` });
            return;
        }

        logger.info('Retrieved COI Key', { coiId });

        res.json(coiKey);
    } catch (error) {
        logger.error('Failed to get COI Key', { coiId: req.params.coiId, error });
        res.status(500).json({ error: 'Failed to retrieve COI Key' });
    }
}

/**
 * POST /api/coi-keys
 * Create a new COI Key (admin only)
 */
export async function createCOIKeyHandler(req: Request, res: Response): Promise<void> {
    try {
        const request: ICreateCOIKeyRequest = req.body;

        // Validate required fields
        if (!request.coiId || !request.name || !request.description || !request.memberCountries) {
            res.status(400).json({
                error: 'Missing required fields: coiId, name, description, memberCountries'
            });
            return;
        }

        // Validate coiId format (uppercase, no spaces)
        if (!/^[A-Z0-9-]+$/.test(request.coiId)) {
            res.status(400).json({
                error: 'Invalid coiId format. Must be uppercase alphanumeric with hyphens only.'
            });
            return;
        }

        // Validate memberCountries (ISO 3166-1 alpha-3)
        if (!Array.isArray(request.memberCountries) || request.memberCountries.length === 0) {
            res.status(400).json({
                error: 'memberCountries must be a non-empty array of ISO 3166-1 alpha-3 country codes'
            });
            return;
        }

        const coiKey = await createCOIKey(request);

        logger.info('Created COI Key', { coiId: request.coiId });

        res.status(201).json(coiKey);
    } catch (error: any) {
        if (error.message.includes('already exists')) {
            res.status(409).json({ error: error.message });
        } else {
            logger.error('Failed to create COI Key', { error });
            res.status(500).json({ error: 'Failed to create COI Key' });
        }
    }
}

/**
 * PUT /api/coi-keys/:coiId
 * Update a COI Key (admin only)
 */
export async function updateCOIKeyHandler(req: Request, res: Response): Promise<void> {
    try {
        const { coiId } = req.params;
        const request: IUpdateCOIKeyRequest = req.body;

        // Validate memberCountries if provided
        if (request.memberCountries !== undefined) {
            if (!Array.isArray(request.memberCountries) || request.memberCountries.length === 0) {
                res.status(400).json({
                    error: 'memberCountries must be a non-empty array of ISO 3166-1 alpha-3 country codes'
                });
                return;
            }
        }

        const coiKey = await updateCOIKey(coiId, request);

        logger.info('Updated COI Key', { coiId });

        res.json(coiKey);
    } catch (error: any) {
        if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else {
            logger.error('Failed to update COI Key', { coiId: req.params.coiId, error });
            res.status(500).json({ error: 'Failed to update COI Key' });
        }
    }
}

/**
 * DELETE /api/coi-keys/:coiId
 * Deprecate a COI Key (soft delete, admin only)
 */
export async function deprecateCOIKeyHandler(req: Request, res: Response): Promise<void> {
    try {
        const { coiId } = req.params;

        await deprecateCOIKey(coiId);

        logger.info('Deprecated COI Key', { coiId });

        res.json({ message: `COI Key '${coiId}' deprecated successfully` });
    } catch (error: any) {
        if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('resources still use it')) {
            res.status(409).json({ error: error.message });
        } else {
            logger.error('Failed to deprecate COI Key', { coiId: req.params.coiId, error });
            res.status(500).json({ error: 'Failed to deprecate COI Key' });
        }
    }
}

/**
 * GET /api/coi-keys/country/:countryCode
 * Get all COIs that a specific country is a member of
 */
export async function getCOIsForCountryHandler(req: Request, res: Response): Promise<void> {
    try {
        const { countryCode } = req.params;

        // Validate country code format (ISO 3166-1 alpha-3)
        if (!/^[A-Z]{3}$/.test(countryCode)) {
            res.status(400).json({
                error: 'Invalid country code format. Must be ISO 3166-1 alpha-3 (e.g., USA, GBR, FRA)'
            });
            return;
        }

        const cois = await getCOIsForCountry(countryCode);

        logger.info('Retrieved COIs for country', { countryCode, count: cois.length });

        res.json({ countryCode, cois, total: cois.length });
    } catch (error) {
        logger.error('Failed to get COIs for country', { countryCode: req.params.countryCode, error });
        res.status(500).json({ error: 'Failed to retrieve COIs for country' });
    }
}

/**
 * GET /api/coi-keys/countries
 * Get all distinct countries across all COIs
 */
export async function getAllCOICountriesHandler(_req: Request, res: Response): Promise<void> {
    try {
        const countries = await getAllCOICountries();

        logger.info('Retrieved all COI countries', { count: countries.length });

        res.json({ countries, total: countries.length });
    } catch (error) {
        logger.error('Failed to get COI countries', { error });
        res.status(500).json({ error: 'Failed to retrieve COI countries' });
    }
}

/**
 * GET /api/coi-keys/statistics
 * Get COI Keys statistics
 */
export async function getCOIKeyStatisticsHandler(_req: Request, res: Response): Promise<void> {
    try {
        const stats = await getCOIKeyStatistics();

        logger.info('Retrieved COI Key statistics', stats);

        res.json(stats);
    } catch (error) {
        logger.error('Failed to get COI Key statistics', { error });
        res.status(500).json({ error: 'Failed to retrieve COI Key statistics' });
    }
}

