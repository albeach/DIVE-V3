/**
 * Compliance Report Controller
 * 
 * Endpoints for generating and exporting compliance reports:
 * - NIST SP 800-63-3 reports
 * - NATO ACP-240 reports
 * - STANAG compliance reports
 * 
 * Phase 12: Advanced Security & Compliance
 */

import { Request, Response } from 'express';
import { IAuthenticatedRequest } from '../types/auth.types';
import { complianceReportingService } from '../services/compliance-reporting.service';
import { logger } from '../utils/logger';

/**
 * GET /api/admin/compliance/reports/nist
 * Generate NIST SP 800-63-3 compliance report
 */
export const generateNISTReportHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const authReq = req as IAuthenticatedRequest;

  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'startDate and endDate are required (ISO 8601 format)'
      });
      return;
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Invalid date format',
        message: 'Dates must be in ISO 8601 format'
      });
      return;
    }

    logger.info('Generating NIST compliance report', {
      requestId,
      admin: authReq.user?.uniqueID,
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });

    const report = await complianceReportingService.generateNISTReport(
      start,
      end,
      authReq.user?.uniqueID || 'system'
    );

    res.status(200).json({
      success: true,
      report,
      requestId
    });
  } catch (error) {
    logger.error('Failed to generate NIST report', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to generate NIST report',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestId
    });
  }
};

/**
 * GET /api/admin/compliance/reports/nato
 * Generate NATO ACP-240 compliance report
 */
export const generateNATOReportHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const authReq = req as IAuthenticatedRequest;

  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'startDate and endDate are required (ISO 8601 format)'
      });
      return;
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({
        success: false,
        error: 'Invalid date format',
        message: 'Dates must be in ISO 8601 format'
      });
      return;
    }

    logger.info('Generating NATO compliance report', {
      requestId,
      admin: authReq.user?.uniqueID,
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });

    const report = await complianceReportingService.generateNATOReport(
      start,
      end,
      authReq.user?.uniqueID || 'system'
    );

    res.status(200).json({
      success: true,
      report,
      requestId
    });
  } catch (error) {
    logger.error('Failed to generate NATO report', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to generate NATO report',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestId
    });
  }
};

/**
 * GET /api/admin/compliance/reports/export
 * Export compliance report to JSON or CSV
 */
export const exportComplianceReportHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
  const authReq = req as IAuthenticatedRequest;

  try {
    const { reportType, startDate, endDate, format } = req.query;

    if (!reportType || !startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'reportType, startDate, and endDate are required'
      });
      return;
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    const exportFormat = (format as 'json' | 'csv') || 'json';

    let report;
    if (reportType === 'NIST') {
      report = await complianceReportingService.generateNISTReport(
        start,
        end,
        authReq.user?.uniqueID || 'system'
      );
    } else if (reportType === 'NATO') {
      report = await complianceReportingService.generateNATOReport(
        start,
        end,
        authReq.user?.uniqueID || 'system'
      );
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid report type',
        message: 'reportType must be NIST or NATO'
      });
      return;
    }

    const exported = await complianceReportingService.exportReport(report, exportFormat);

    const contentType = exportFormat === 'json' ? 'application/json' : 'text/csv';
    const extension = exportFormat === 'json' ? 'json' : 'csv';
    const filename = `compliance-report-${reportType.toLowerCase()}-${Date.now()}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(exported);
  } catch (error) {
    logger.error('Failed to export compliance report', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: 'Failed to export compliance report',
      message: error instanceof Error ? error.message : 'Unknown error',
      requestId
    });
  }
};
