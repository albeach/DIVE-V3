/**
 * DIVE V3 - Terraform Executor Utility
 *
 * Executes Terraform commands from Node.js for dynamic federation management.
 * Enables automatic Hub Terraform re-application after spoke registration.
 *
 * Industry Pattern: Infrastructure as Code (IaC) automation from application layer
 * Examples: AWS CDK, Pulumi, Terraform Cloud API
 *
 * Use Cases:
 * - Automatic Hub Terraform re-apply after spoke approval
 * - Generate hub.auto.tfvars from MongoDB approved spokes
 * - Create spoke-idp in Hub Keycloak dynamically
 *
 * Security:
 * - Runs Terraform in controlled environment with validated inputs
 * - Sanitizes variable values to prevent command injection
 * - Logs all Terraform executions for audit
 *
 * @version 1.0.0
 * @date 2026-01-24
 */

import { spawn, SpawnOptions } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';

// ============================================
// TYPES
// ============================================

export interface ITerraformExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  command: string;
}

export interface ITerraformApplyOptions {
  varFile?: string;
  variables?: Record<string, string>;
  autoApprove?: boolean;
  parallelism?: number;
  timeout?: number; // milliseconds
}

// ============================================
// TERRAFORM EXECUTOR
// ============================================

class TerraformExecutor {
  private readonly terraformBinary: string;
  private readonly terraformBaseDir: string;

  constructor() {
    // Terraform binary path (defaults to 'terraform' in PATH)
    this.terraformBinary = process.env.TERRAFORM_BIN || 'terraform';

    // Base directory for Terraform configurations
    this.terraformBaseDir = process.env.DIVE_ROOT
      ? path.join(process.env.DIVE_ROOT, 'terraform')
      : path.join(__dirname, '../../../terraform');
  }

  /**
   * Execute Terraform command
   *
   * @param args - Terraform command arguments
   * @param options - Execution options
   * @returns Execution result
   */
  private async exec(
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
    } = {}
  ): Promise<ITerraformExecutionResult> {
    const startTime = Date.now();
    const command = `${this.terraformBinary} ${args.join(' ')}`;

    logger.info('Executing Terraform command', {
      command,
      cwd: options.cwd || this.terraformBaseDir,
    });

    return new Promise((resolve, reject) => {
      const spawnOptions: SpawnOptions = {
        cwd: options.cwd || this.terraformBaseDir,
        env: {
          ...process.env,
          ...options.env,
        },
        shell: true,
      };

      const proc = spawn(this.terraformBinary, args, spawnOptions);

      let stdout = '';
      let stderr = '';

      // Capture stdout
      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          // Log verbose Terraform output
          logger.verbose(`Terraform stdout: ${output.trim()}`);
        });
      }

      // Capture stderr
      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          const output = data.toString();
          stderr += output;
          // Terraform often logs informational messages to stderr
          logger.verbose(`Terraform stderr: ${output.trim()}`);
        });
      }

      // Handle timeout
      let timeoutHandle: NodeJS.Timeout | null = null;
      if (options.timeout) {
        timeoutHandle = setTimeout(() => {
          logger.error('Terraform command timeout', {
            command,
            timeout: options.timeout,
          });
          proc.kill('SIGTERM');
        }, options.timeout);
      }

      // Handle process exit
      proc.on('close', (exitCode) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const duration = Date.now() - startTime;
        const success = exitCode === 0;

        const result: ITerraformExecutionResult = {
          success,
          exitCode: exitCode || 0,
          stdout,
          stderr,
          duration,
          command,
        };

        if (success) {
          logger.info('Terraform command completed', {
            command,
            duration,
            exitCode,
          });
          resolve(result);
        } else {
          logger.error('Terraform command failed', {
            command,
            duration,
            exitCode,
            stderr: stderr.substring(0, 500), // First 500 chars of error
          });
          reject(new Error(`Terraform failed with exit code ${exitCode}: ${stderr}`));
        }
      });

      // Handle spawn errors
      proc.on('error', (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        logger.error('Terraform spawn error', {
          error: error.message,
          command,
        });
        reject(error);
      });
    });
  }

  /**
   * Initialize Terraform working directory
   *
   * @param configDir - Terraform configuration directory (relative to terraformBaseDir)
   */
  async init(configDir: string): Promise<ITerraformExecutionResult> {
    const cwd = path.join(this.terraformBaseDir, configDir);

    logger.info('Initializing Terraform', { configDir, cwd });

    return this.exec(['init', '-upgrade'], { cwd });
  }

  /**
   * Apply Terraform configuration
   *
   * @param configDir - Terraform configuration directory (relative to terraformBaseDir)
   * @param options - Apply options
   */
  async apply(
    configDir: string,
    options: ITerraformApplyOptions = {}
  ): Promise<ITerraformExecutionResult> {
    const cwd = path.join(this.terraformBaseDir, configDir);

    // Build Terraform arguments
    const args = ['apply'];

    if (options.autoApprove !== false) {
      args.push('-auto-approve');
    }

    if (options.parallelism) {
      args.push(`-parallelism=${options.parallelism}`);
    }

    if (options.varFile) {
      args.push(`-var-file=${options.varFile}`);
    }

    // Add individual variables
    if (options.variables) {
      for (const [key, value] of Object.entries(options.variables)) {
        // Sanitize variable value to prevent command injection
        const sanitizedValue = this.sanitizeVariableValue(value);
        args.push(`-var=${key}=${sanitizedValue}`);
      }
    }

    logger.info('Applying Terraform configuration', {
      configDir,
      cwd,
      varFile: options.varFile,
      variableCount: options.variables ? Object.keys(options.variables).length : 0,
    });

    return this.exec(args, {
      cwd,
      timeout: options.timeout || 600000, // 10 minutes default
    });
  }

  /**
   * Run Terraform plan
   *
   * @param configDir - Terraform configuration directory
   * @param options - Plan options
   */
  async plan(
    configDir: string,
    options: Omit<ITerraformApplyOptions, 'autoApprove'> = {}
  ): Promise<ITerraformExecutionResult> {
    const cwd = path.join(this.terraformBaseDir, configDir);

    const args = ['plan'];

    if (options.varFile) {
      args.push(`-var-file=${options.varFile}`);
    }

    if (options.variables) {
      for (const [key, value] of Object.entries(options.variables)) {
        const sanitizedValue = this.sanitizeVariableValue(value);
        args.push(`-var=${key}=${sanitizedValue}`);
      }
    }

    return this.exec(args, {
      cwd,
      timeout: options.timeout || 300000, // 5 minutes default
    });
  }

  /**
   * Sanitize variable value to prevent command injection
   *
   * @param value - Variable value
   * @returns Sanitized value
   */
  private sanitizeVariableValue(value: string): string {
    // Remove potentially dangerous characters
    // Keep alphanumeric, dots, slashes, underscores, hyphens, colons
    return value.replace(/[^a-zA-Z0-9._\-/:]/g, '');
  }

  /**
   * Write Terraform auto-vars file
   *
   * @param configDir - Terraform configuration directory
   * @param filename - Auto-vars filename (e.g., 'hub.auto.tfvars')
   * @param content - Tfvars file content
   */
  async writeAutoVars(
    configDir: string,
    filename: string,
    content: string
  ): Promise<void> {
    const filePath = path.join(this.terraformBaseDir, configDir, filename);

    logger.info('Writing Terraform auto-vars file', {
      filePath,
      contentLength: content.length,
    });

    await fs.writeFile(filePath, content, 'utf-8');

    logger.info('Terraform auto-vars file written', { filePath });
  }

  /**
   * Check if Terraform is available
   */
  async checkAvailable(): Promise<boolean> {
    try {
      await this.exec(['version'], { timeout: 5000 });
      return true;
    } catch (error) {
      logger.error('Terraform not available', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const terraformExecutor = new TerraformExecutor();

export default TerraformExecutor;
