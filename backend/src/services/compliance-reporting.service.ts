/**
 * Compliance Reporting Service
 * 
 * Generates automated compliance reports for:
 * - NIST SP 800-63-3 (Digital Identity Guidelines)
 * - NATO ACP-240 (Policy-Based Access Control)
 * - STANAG 4774/5636 (Security Labeling)
 * 
 * Phase 12: Advanced Security & Compliance
 */

import { logger } from '../utils/logger';
import { getDb } from '../utils/mongodb-singleton';

export interface IComplianceReport {
  reportId: string;
  reportType: 'NIST' | 'NATO' | 'STANAG';
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalEvents: number;
    accessGrants: number;
    accessDenials: number;
    mfaEnforcements: number;
    federationEvents: number;
    violations: number;
  };
  findings: IComplianceFinding[];
  recommendations: string[];
  generatedAt: string;
  generatedBy: string;
}

export interface IComplianceFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  evidence: string[];
  standard: string;
  requirement: string;
}

class ComplianceReportingService {
  // MongoDB is connected via singleton at server startup - no per-service connection needed

  /**
   * Generate NIST SP 800-63-3 compliance report
   */
  async generateNISTReport(
    startDate: Date,
    endDate: Date,
    generatedBy: string
  ): Promise<IComplianceReport> {
    const db = getDb();
    const collection = db.collection('audit_logs');
    
    // Query audit logs for the period
    const logs = await collection.find({
      timestamp: {
        $gte: startDate.toISOString(),
        $lte: endDate.toISOString()
      }
    }).toArray();

    // Analyze logs for NIST compliance
    const accessGrants = logs.filter(log => log.outcome === 'ALLOW');
    const accessDenials = logs.filter(log => log.outcome === 'DENY');
    const mfaEnforcements = logs.filter(log => 
      log.subjectAttributes?.aal_level && 
      ['AAL2', 'AAL3'].includes(log.subjectAttributes.aal_level)
    );
    const federationEvents = logs.filter(log => 
      log.eventType === 'FEDERATION_AUTH' || 
      log.context?.sourceIP?.includes('federation')
    );

    // Check for violations
    const violations = logs.filter(log => 
      log.eventType === 'ACCESS_DENIED' && 
      log.reason?.includes('insufficient')
    );

    // Generate findings
    const findings: IComplianceFinding[] = [];

    // Check AAL enforcement
    const aal1Events = logs.filter(log => 
      log.subjectAttributes?.aal_level === 'AAL1' &&
      log.resourceAttributes?.classification &&
      ['SECRET', 'TOP_SECRET'].includes(log.resourceAttributes.classification)
    );

    if (aal1Events.length > 0) {
      findings.push({
        severity: 'high',
        category: 'Authentication Assurance',
        description: 'AAL1 users accessing SECRET/TOP_SECRET resources',
        evidence: aal1Events.slice(0, 5).map(e => `Resource ${e.resourceId} accessed by ${e.subject}`),
        standard: 'NIST SP 800-63-3',
        requirement: 'AAL2 required for SECRET, AAL3 for TOP_SECRET'
      });
    }

    // Check session timeout compliance
    const longSessions = logs.filter(log => {
      // auth_time is logged for audit purposes, token_lifetime used for check
      const tokenLifetime = log.subjectAttributes?.token_lifetime;
      return tokenLifetime && tokenLifetime > 8 * 60 * 60; // 8 hours
    });

    if (longSessions.length > 0) {
      findings.push({
        severity: 'medium',
        category: 'Session Management',
        description: 'Sessions exceeding 8-hour limit',
        evidence: longSessions.slice(0, 5).map(e => `Session ${e.requestId} lifetime: ${e.subjectAttributes?.token_lifetime}s`),
        standard: 'NIST SP 800-63-3',
        requirement: 'Session timeout should not exceed 8 hours'
      });
    }

    return {
      reportId: `nist-${Date.now()}`,
      reportType: 'NIST',
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      summary: {
        totalEvents: logs.length,
        accessGrants: accessGrants.length,
        accessDenials: accessDenials.length,
        mfaEnforcements: mfaEnforcements.length,
        federationEvents: federationEvents.length,
        violations: violations.length
      },
      findings,
      recommendations: this.generateNISTRecommendations(findings),
      generatedAt: new Date().toISOString(),
      generatedBy
    };
  }

  /**
   * Generate NATO ACP-240 compliance report
   */
  async generateNATOReport(
    startDate: Date,
    endDate: Date,
    generatedBy: string
  ): Promise<IComplianceReport> {
    const db = getDb();
    const collection = db.collection('audit_logs');
    
    const logs = await collection.find({
      timestamp: {
        $gte: startDate.toISOString(),
        $lte: endDate.toISOString()
      }
    }).toArray();

    // ACP-240 specific analysis
    const encryptEvents = logs.filter(log => log.eventType === 'ENCRYPT');
    const decryptEvents = logs.filter(log => log.eventType === 'DECRYPT');
    const accessDenials = logs.filter(log => log.eventType === 'ACCESS_DENIED');
    const dataSharedEvents = logs.filter(log => log.eventType === 'DATA_SHARED');

    const findings: IComplianceFinding[] = [];

    // Check for missing ENCRYPT events for classified resources
    const classifiedResources = logs.filter(log => 
      log.resourceAttributes?.classification &&
      ['CONFIDENTIAL', 'SECRET', 'TOP_SECRET'].includes(log.resourceAttributes.classification)
    );

    const missingEncrypt = classifiedResources.filter(log => 
      !encryptEvents.some(e => e.resourceId === log.resourceId)
    );

    if (missingEncrypt.length > 0) {
      findings.push({
        severity: 'high',
        category: 'Data Protection',
        description: 'Classified resources without ENCRYPT events',
        evidence: missingEncrypt.slice(0, 5).map(e => `Resource ${e.resourceId} (${e.resourceAttributes?.classification})`),
        standard: 'NATO ACP-240',
        requirement: 'All classified resources must have ENCRYPT events'
      });
    }

    // ACP-240 Compliance: Check DECRYPT events are authorized
    // Every DECRYPT should have a corresponding authorized access decision
    const unauthorizedDecrypts = decryptEvents.filter(decryptEvent => {
      const hasAuthorizedAccess = logs.some(log => 
        log.resourceId === decryptEvent.resourceId &&
        log.subject === decryptEvent.subject &&
        log.outcome === 'ALLOW'
      );
      return !hasAuthorizedAccess;
    });

    if (unauthorizedDecrypts.length > 0) {
      findings.push({
        severity: 'critical',
        category: 'Data Access Control',
        description: 'DECRYPT events without corresponding authorization',
        evidence: unauthorizedDecrypts.slice(0, 5).map(e => 
          `Resource ${e.resourceId} decrypted by ${e.subject} without authorization`
        ),
        standard: 'NATO ACP-240',
        requirement: 'All decryption operations must be preceded by explicit authorization'
      });
    }

    // ACP-240 Compliance: Check DATA_SHARED events for coalition sharing rules
    // Data shared across borders must have proper releasability markings
    const improperSharing = dataSharedEvents.filter(shareEvent => {
      const targetCountry = shareEvent.context?.targetCountry;
      const releasability = shareEvent.resourceAttributes?.releasabilityTo || [];
      // If sharing to a country not in releasability list, it's a violation
      return targetCountry && !releasability.includes(targetCountry);
    });

    if (improperSharing.length > 0) {
      findings.push({
        severity: 'critical',
        category: 'Coalition Data Sharing',
        description: 'Data shared to countries not in releasability list',
        evidence: improperSharing.slice(0, 5).map(e => 
          `Resource ${e.resourceId} shared to ${e.context?.targetCountry}, ` +
          `releasableTo: [${e.resourceAttributes?.releasabilityTo?.join(', ') || 'none'}]`
        ),
        standard: 'NATO ACP-240',
        requirement: 'Data can only be shared with countries listed in releasabilityTo'
      });
    }

    // Check KAS integration
    const kasEvents = logs.filter(log => 
      log.resourceAttributes?.kas_actions &&
      log.resourceAttributes.kas_actions.length > 0
    );

    const encryptedWithoutKAS = logs.filter(log => 
      log.resourceAttributes?.encrypted === true &&
      !kasEvents.some(e => e.resourceId === log.resourceId)
    );

    if (encryptedWithoutKAS.length > 0) {
      findings.push({
        severity: 'medium',
        category: 'Key Access Service',
        description: 'Encrypted resources without KAS events',
        evidence: encryptedWithoutKAS.slice(0, 5).map(e => `Resource ${e.resourceId}`),
        standard: 'NATO ACP-240',
        requirement: 'Encrypted resources should use KAS for key management'
      });
    }

    // Calculate violation count from critical findings
    const criticalViolations = findings.filter(f => f.severity === 'critical').length;

    return {
      reportId: `nato-${Date.now()}`,
      reportType: 'NATO',
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      summary: {
        totalEvents: logs.length,
        accessGrants: logs.filter(log => log.outcome === 'ALLOW').length,
        accessDenials: accessDenials.length,
        mfaEnforcements: logs.filter(log => 
          log.subjectAttributes?.aal_level && 
          ['AAL2', 'AAL3'].includes(log.subjectAttributes.aal_level)
        ).length,
        federationEvents: dataSharedEvents.length + logs.filter(log => 
          log.eventType === 'FEDERATION_AUTH'
        ).length,
        violations: criticalViolations + accessDenials.length
      },
      findings,
      recommendations: this.generateNATORecommendations(findings),
      generatedAt: new Date().toISOString(),
      generatedBy
    };
  }

  /**
   * Export compliance report to JSON
   */
  async exportReport(report: IComplianceReport, format: 'json' | 'csv' = 'json'): Promise<string> {
    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    // CSV format
    const csvLines: string[] = [];
    csvLines.push('Report Type,Period Start,Period End,Total Events,Access Grants,Access Denials,MFA Enforcements,Violations');
    csvLines.push([
      report.reportType,
      report.period.startDate,
      report.period.endDate,
      report.summary.totalEvents,
      report.summary.accessGrants,
      report.summary.accessDenials,
      report.summary.mfaEnforcements,
      report.summary.violations
    ].join(','));

    csvLines.push('');
    csvLines.push('Findings');
    csvLines.push('Severity,Category,Description,Standard,Requirement');
    report.findings.forEach(finding => {
      csvLines.push([
        finding.severity,
        finding.category,
        `"${finding.description}"`,
        finding.standard,
        `"${finding.requirement}"`
      ].join(','));
    });

    return csvLines.join('\n');
  }

  private generateNISTRecommendations(findings: IComplianceFinding[]): string[] {
    const recommendations: string[] = [];

    if (findings.some(f => f.category === 'Authentication Assurance')) {
      recommendations.push('Enforce AAL2 for SECRET resources and AAL3 for TOP_SECRET resources');
    }

    if (findings.some(f => f.category === 'Session Management')) {
      recommendations.push('Implement session timeout policies to limit session lifetime to 8 hours');
    }

    if (recommendations.length === 0) {
      recommendations.push('No critical compliance issues identified');
    }

    return recommendations;
  }

  private generateNATORecommendations(findings: IComplianceFinding[]): string[] {
    const recommendations: string[] = [];

    if (findings.some(f => f.category === 'Data Protection')) {
      recommendations.push('Ensure all classified resources have ENCRYPT events logged');
    }

    if (findings.some(f => f.category === 'Data Access Control')) {
      recommendations.push('Review authorization workflow to ensure all DECRYPT operations are preceded by explicit authorization decisions');
    }

    if (findings.some(f => f.category === 'Coalition Data Sharing')) {
      recommendations.push('Enforce releasability checks before cross-border data sharing; update releasabilityTo markings as needed');
    }

    if (findings.some(f => f.category === 'Key Access Service')) {
      recommendations.push('Integrate KAS for all encrypted resources');
    }

    if (recommendations.length === 0) {
      recommendations.push('NATO ACP-240 compliance maintained');
    }

    return recommendations;
  }
}

export const complianceReportingService = new ComplianceReportingService();
