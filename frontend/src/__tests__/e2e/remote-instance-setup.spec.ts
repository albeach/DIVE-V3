/**
 * DIVE V3 - Remote Instance Setup and Testing
 * 
 * Demonstrates how Playwright tests can SSH into remote machines for:
 * - Pre-test setup (checking remote health)
 * - Remote test execution
 * - Post-test verification
 * 
 * This test shows two approaches:
 * 1. Browser tests that connect to remote URLs (run locally)
 * 2. SSH-based setup/teardown (SSH to remote machines)
 * 
 * Run with: npm run test:e2e -- remote-instance-setup.spec.ts --headed
 */

import { test, expect } from '@playwright/test';
import { sshRemote, checkRemoteHealth, getRemoteInstanceUrl, waitForRemoteReady } from './helpers/ssh';
import { TEST_USERS } from './fixtures/test-users';
import { loginAs } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Remote Instance Testing', () => {
  
  test.beforeAll(async () => {
    // Check if remote DEU instance is accessible via SSH
    console.log('🔍 Checking remote DEU instance health...');
    
    try {
      const isHealthy = await checkRemoteHealth('deu');
      if (!isHealthy) {
        console.warn('⚠️  Remote DEU instance not healthy - some tests may be skipped');
      } else {
        console.log('✅ Remote DEU instance is healthy');
      }
    } catch (error) {
      console.warn('⚠️  Could not check remote DEU health:', error);
    }
  });
  
  test('SSH into remote DEU instance and check status', async () => {
    // This test demonstrates SSH capability
    test.skip(true, 'SSH test - uncomment to enable');
    
    try {
      // Execute command on remote instance
      const result = await sshRemote('deu', 'docker ps --format "{{.Names}}\t{{.Status}}"');
      
      console.log('Remote Docker containers:');
      console.log(result.stdout);
      
      expect(result.stdout).toContain('dive-v3');
    } catch (error) {
      console.error('SSH failed:', error);
      throw error;
    }
  });
  
  test('DEU user authenticates via remote instance URL', async ({ page }) => {
    // Skip if DEU user not configured
    const deuUser = TEST_USERS.DEU?.SECRET;
    if (!deuUser) {
      test.skip(true, 'DEU test user not configured');
      return;
    }
    
    // Get remote instance URL
    let remoteUrl: string;
    try {
      remoteUrl = await getRemoteInstanceUrl('deu');
      console.log(`🌐 Using remote DEU URL: ${remoteUrl}`);
    } catch (error) {
      test.skip(true, `Could not get remote DEU URL: ${error}`);
      return;
    }
    
    // Navigate to remote instance
    await page.goto(remoteUrl);
    
    // Login as DEU user
    await loginAs(page, deuUser, { skipMFA: true });
    
    // Verify logged in
    const dashboard = new DashboardPage(page);
    await dashboard.verifyLoggedIn();
    
    // Verify we're on the remote instance
    expect(page.url()).toContain('prosecurity.biz');
  });
  
  test('Wait for remote instance to be ready before testing', async ({ page }) => {
    // Skip if DEU user not configured
    const deuUser = TEST_USERS.DEU?.SECRET;
    if (!deuUser) {
      test.skip(true, 'DEU test user not configured');
      return;
    }
    
    // Wait for remote instance to be ready
    try {
      await waitForRemoteReady('deu', 30000); // 30 second timeout
      console.log('✅ Remote instance is ready');
    } catch (error) {
      test.skip(true, `Remote instance not ready: ${error}`);
      return;
    }
    
    // Now proceed with test
    const remoteUrl = await getRemoteInstanceUrl('deu');
    await page.goto(remoteUrl);
    await loginAs(page, deuUser, { skipMFA: true });
    
    const dashboard = new DashboardPage(page);
    await dashboard.verifyLoggedIn();
  });
});

test.describe('Remote vs Local Testing', () => {
  
  test('Compare local vs remote instance behavior', async ({ page }) => {
    // This test demonstrates testing both local and remote instances
    test.skip(true, 'Comparison test - uncomment to enable');
    
    const user = TEST_USERS.USA.SECRET;
    
    // Test local instance
    await page.goto('http://localhost:3000');
    await loginAs(page, user, { skipMFA: true });
    const localDashboard = new DashboardPage(page);
    await localDashboard.verifyLoggedIn();
    
    // Test remote instance (if accessible)
    try {
      const remoteUrl = await getRemoteInstanceUrl('deu');
      await page.goto(remoteUrl);
      await loginAs(page, user, { skipMFA: true });
      const remoteDashboard = new DashboardPage(page);
      await remoteDashboard.verifyLoggedIn();
    } catch (error) {
      console.warn('Remote instance not accessible:', error);
    }
  });
});








