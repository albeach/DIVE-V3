/**
 * SSH Helper for Playwright E2E Tests
 * 
 * Allows tests to SSH into remote machines for:
 * - Setup/teardown operations
 * - Checking remote state
 * - Running commands on remote instances
 * 
 * Usage:
 * ```typescript
 * import { sshRemote, checkRemoteHealth } from './helpers/ssh';
 * 
 * // Execute command on remote DEU instance
 * await sshRemote('deu', 'docker ps');
 * 
 * // Check if remote instance is healthy
 * const isHealthy = await checkRemoteHealth('deu');
 * ```
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

interface RemoteConfig {
  host: string;
  password: string;
  dir: string;
  domain: string;
}

/**
 * Get remote instance configuration
 */
async function getRemoteConfig(instance: 'deu'): Promise<RemoteConfig> {
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const sshHelperPath = path.join(projectRoot, 'scripts/remote/ssh-helper.sh');
  
  // Source SSH helper and get config
  const { stdout: host } = await execAsync(
    `source ${sshHelperPath} && get_remote_config ${instance} host`
  );
  
  const { stdout: password } = await execAsync(
    `source ${sshHelperPath} && get_remote_config ${instance} password`
  );
  
  const { stdout: dir } = await execAsync(
    `source ${sshHelperPath} && get_remote_config ${instance} dir`
  );
  
  const { stdout: domain } = await execAsync(
    `source ${sshHelperPath} && get_remote_config ${instance} domain`
  );
  
  return {
    host: host.trim(),
    password: password.trim(),
    dir: dir.trim(),
    domain: domain.trim(),
  };
}

/**
 * Execute command on remote instance via SSH
 * 
 * @param instance Instance code (e.g., 'deu')
 * @param command Command to execute
 * @returns Command output
 */
export async function sshRemote(
  instance: 'deu',
  command: string
): Promise<{ stdout: string; stderr: string }> {
  const projectRoot = path.resolve(__dirname, '../../../../..');
  const sshHelperPath = path.join(projectRoot, 'scripts/remote/ssh-helper.sh');
  
  // Use existing SSH helper script
  const fullCommand = `
    source ${sshHelperPath} && 
    ssh_remote ${instance} "${command.replace(/"/g, '\\"')}"
  `;
  
  return execAsync(fullCommand, {
    cwd: projectRoot,
    shell: '/bin/bash',
  });
}

/**
 * Check if remote instance is healthy
 * 
 * @param instance Instance code
 * @returns True if healthy, false otherwise
 */
export async function checkRemoteHealth(instance: 'deu'): Promise<boolean> {
  try {
    const result = await sshRemote(instance, 'docker ps --format json | jq -r ".State" | head -1');
    return result.stdout.trim() === 'running';
  } catch {
    return false;
  }
}

/**
 * Get remote instance URL for browser tests
 * 
 * @param instance Instance code
 * @returns Base URL for the instance
 */
export async function getRemoteInstanceUrl(instance: 'deu'): Promise<string> {
  const config = await getRemoteConfig(instance);
  return `https://deu-app.${config.domain}`;
}

/**
 * Wait for remote instance to be ready
 * 
 * @param instance Instance code
 * @param timeout Timeout in milliseconds
 */
export async function waitForRemoteReady(
  instance: 'deu',
  timeout: number = 60000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const isHealthy = await checkRemoteHealth(instance);
    if (isHealthy) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error(`Remote instance ${instance} not ready within ${timeout}ms`);
}








