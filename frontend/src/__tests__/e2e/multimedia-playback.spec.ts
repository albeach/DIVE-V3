/**
 * Playwright E2E Tests for Multimedia Playback
 *
 * Tests STANAG 4774/4778 compliant audio and video playback
 * with classification overlays and watermarks.
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

test.describe('Multimedia Playback', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to resources page (authenticated)
    // Note: In real tests, you'd handle authentication
    await page.goto(`${BASE_URL}/resources`);
  });

  test.describe('Audio Playback', () => {
    test('should display classification banner on audio player', async ({ page }) => {
      // Click on an audio resource
      await page.click('[data-testid="resource-audio-item"]');

      // Wait for audio player to load
      await page.waitForSelector('[data-testid="audio-player"]', { timeout: 10000 });

      // Verify classification banner is visible
      const banner = page.locator('[role="banner"]');
      await expect(banner).toBeVisible();
      await expect(banner).toContainText('SECRET');
    });

    test('should show waveform visualization', async ({ page }) => {
      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // Waveform container should be present
      const waveform = page.locator('.wavesurfer-container, [data-testid="waveform"]');
      await expect(waveform).toBeVisible();
    });

    test('should have play/pause controls', async ({ page }) => {
      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // Play button should be visible
      const playButton = page.locator('[aria-label="Play"]');
      await expect(playButton).toBeVisible();

      // Click play
      await playButton.click();

      // Now pause button should be visible
      const pauseButton = page.locator('[aria-label="Pause"]');
      await expect(pauseButton).toBeVisible();
    });

    test('should display time progress', async ({ page }) => {
      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // Time display should show 00:00 / XX:XX format
      const timeDisplay = page.locator('.font-mono');
      await expect(timeDisplay).toBeVisible();
      await expect(timeDisplay).toContainText('/');
    });

    test('should have volume control', async ({ page }) => {
      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // Volume slider or mute button should be present
      const volumeControl = page.locator('[aria-label="Volume"], [aria-label="Mute"]');
      await expect(volumeControl).toBeVisible();
    });

    test('should have download button if authorized', async ({ page }) => {
      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // Download button should be present for authorized users
      const downloadButton = page.locator('[aria-label="Download audio file"]');
      if (await downloadButton.isVisible()) {
        await expect(downloadButton).toBeEnabled();
      }
    });

    test('should show releasability in footer', async ({ page }) => {
      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // Footer should show releasability
      const footer = page.locator('text=Releasable To');
      await expect(footer).toBeVisible();
    });
  });

  test.describe('Video Playback', () => {
    test('should display top and bottom classification banners', async ({ page }) => {
      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]', { timeout: 10000 });

      // Should have multiple classification banners
      const banners = page.locator('[role="banner"]');
      expect(await banners.count()).toBeGreaterThanOrEqual(2);
    });

    test('should show center watermark overlay', async ({ page }) => {
      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]');

      // Watermark should be visible (semi-transparent text)
      const watermark = page.locator('[aria-hidden="true"]:has-text("SECRET")');
      await expect(watermark).toBeVisible();
    });

    test('should preserve markings in fullscreen mode', async ({ page }) => {
      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]');

      // Click fullscreen button
      const fullscreenButton = page.locator('[aria-label="Enter fullscreen"]');
      if (await fullscreenButton.isVisible()) {
        await fullscreenButton.click();

        // Banners should still be visible in fullscreen
        const banner = page.locator('[role="banner"]');
        await expect(banner).toBeVisible();

        // Exit fullscreen
        await page.keyboard.press('Escape');
      }
    });

    test('should have video playback controls', async ({ page }) => {
      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]');

      // Play button
      const playButton = page.locator('[aria-label="Play"]');
      await expect(playButton).toBeVisible();

      // Progress bar
      const progressBar = page.locator('[aria-label="Video progress"]');
      await expect(progressBar).toBeVisible();

      // Volume control
      const volumeControl = page.locator('[aria-label="Volume"], [aria-label="Mute"]');
      await expect(volumeControl).toBeVisible();
    });

    test('should display video duration', async ({ page }) => {
      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]');

      // Time display should show duration
      const timeDisplay = page.locator('.font-mono');
      await expect(timeDisplay).toBeVisible();
      await expect(timeDisplay).toContainText('/');
    });

    test('should have skip forward/backward controls', async ({ page }) => {
      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]');

      // Skip buttons
      const skipBack = page.locator('[aria-label="Skip back 10 seconds"]');
      const skipForward = page.locator('[aria-label="Skip forward 10 seconds"]');

      await expect(skipBack).toBeVisible();
      await expect(skipForward).toBeVisible();
    });
  });

  test.describe('Classification Overlay Compliance', () => {
    test('should use correct colors for classification level', async ({ page }) => {
      // Test different classification levels have correct colors
      const classificationColors: Record<string, string> = {
        UNCLASSIFIED: 'bg-green',
        SECRET: 'bg-red',
        TOP_SECRET: 'bg-orange',
      };

      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]');

      const banner = page.locator('[role="banner"]');
      const bannerClasses = await banner.getAttribute('class');

      // Verify banner has appropriate color class
      const hasColorClass = Object.values(classificationColors).some(
        (color) => bannerClasses?.includes(color)
      );
      expect(hasColorClass).toBe(true);
    });

    test('should display full marking string', async ({ page }) => {
      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]');

      // Banner should show full marking (e.g., "SECRET // REL TO USA, GBR")
      const banner = page.locator('[role="banner"]');
      const text = await banner.textContent();

      // Should have classification
      expect(text).toMatch(/(UNCLASSIFIED|CONFIDENTIAL|SECRET|TOP SECRET)/);

      // Should have releasability if present
      if (text?.includes('REL TO')) {
        expect(text).toMatch(/REL TO [A-Z]{3}/);
      }
    });

    test('should show ZTDF encrypted indicator', async ({ page }) => {
      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]');

      // Should indicate file is ZTDF encrypted
      const encryptedBadge = page.locator('text=ZTDF Encrypted');
      await expect(encryptedBadge).toBeVisible();
    });
  });

  test.describe('Audit Event Logging', () => {
    test('should log play event on playback start', async ({ page }) => {
      // Set up console listener for audit logs
      const auditLogs: string[] = [];
      page.on('console', (msg) => {
        if (msg.text().includes('[Audit]')) {
          auditLogs.push(msg.text());
        }
      });

      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // Click play
      const playButton = page.locator('[aria-label="Play"]');
      await playButton.click();

      // Wait for log event
      await page.waitForTimeout(1000);

      // Should have logged play event
      expect(auditLogs.some((log) => log.includes('play'))).toBe(true);
    });

    test('should log pause event on playback pause', async ({ page }) => {
      const auditLogs: string[] = [];
      page.on('console', (msg) => {
        if (msg.text().includes('[Audit]')) {
          auditLogs.push(msg.text());
        }
      });

      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // Play then pause
      const playButton = page.locator('[aria-label="Play"]');
      await playButton.click();
      await page.waitForTimeout(500);

      const pauseButton = page.locator('[aria-label="Pause"]');
      await pauseButton.click();

      await page.waitForTimeout(1000);

      // Should have logged pause event
      expect(auditLogs.some((log) => log.includes('pause'))).toBe(true);
    });
  });

  test.describe('Accessibility', () => {
    test('should have accessible audio player controls', async ({ page }) => {
      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // All interactive elements should have aria-labels
      const playButton = page.locator('[aria-label="Play"]');
      await expect(playButton).toBeVisible();

      const volumeSlider = page.locator('[aria-label="Volume"]');
      await expect(volumeSlider).toBeVisible();

      // Classification banner should have role="banner"
      const banner = page.locator('[role="banner"]');
      await expect(banner).toHaveAttribute('aria-label');
    });

    test('should have accessible video player controls', async ({ page }) => {
      await page.click('[data-testid="resource-video-item"]');
      await page.waitForSelector('[data-testid="video-player"]');

      // Verify aria labels
      const playButton = page.locator('[aria-label="Play"]');
      await expect(playButton).toBeVisible();

      const fullscreenButton = page.locator('[aria-label*="fullscreen"]');
      await expect(fullscreenButton).toBeVisible();
    });

    test('should be keyboard navigable', async ({ page }) => {
      await page.click('[data-testid="resource-audio-item"]');
      await page.waitForSelector('[data-testid="audio-player"]');

      // Tab to play button
      await page.keyboard.press('Tab');

      // Verify focus is on play button
      const playButton = page.locator('[aria-label="Play"]');
      await expect(playButton).toBeFocused();

      // Space should activate play
      await page.keyboard.press('Space');

      // Now pause button should be visible
      const pauseButton = page.locator('[aria-label="Pause"]');
      await expect(pauseButton).toBeVisible();
    });
  });
});
