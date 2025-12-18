const { chromium } = require('playwright');

async function discoverAuth() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('🔍 Discovering authentication options on DIVE instances...\n');

    const instances = [
      { code: 'hub', url: 'https://localhost:3000', name: 'DIVE Hub' },
      { code: 'alb', url: 'https://localhost:3001', name: 'Albania' },
      { code: 'dnk', url: 'https://localhost:3007', name: 'Denmark' },
      { code: 'gbr', url: 'https://localhost:3003', name: 'UK' },
      { code: 'rou', url: 'https://localhost:3025', name: 'Romania' },
    ];

    for (const instance of instances) {
      console.log(`\n🏛️  Checking ${instance.name} (${instance.code})`);
      console.log(`📍 ${instance.url}`);

      try {
        await page.goto(instance.url, { timeout: 10000, waitUntil: 'networkidle' });

        // Wait for potential client-side rendering
        await page.waitForTimeout(3000);

        const title = await page.title();
        console.log(`📄 Title: "${title}"`);

        // Check for JavaScript errors
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', msg => {
          if (msg.type() === 'error') {
            errors.push(msg.text());
          }
        });

        // Wait a bit more for dynamic content
        await page.waitForTimeout(2000);

        console.log(`⚠️  JavaScript errors: ${errors.length > 0 ? errors.join(', ') : 'None'}`);

        // Get all buttons and links
        const elements = await page.$$('button, [role="button"], a, input[type="submit"]');

        console.log(`🔘 Found ${elements.length} clickable elements:`);

        let authElements = [];
        for (const element of elements) {
          const tagName = await element.evaluate(el => el.tagName.toLowerCase());
          const text = await element.evaluate(el => el.textContent?.trim());
          const isVisible = await element.isVisible();

          if (text && isVisible) {
            console.log(`  ${tagName}: "${text}"`);

            // Check if it's auth-related
            const isAuthRelated = /(login|sign|auth|france|germany|united|denmark|albania|romania|keycloak|federat)/i.test(text);
            if (isAuthRelated) {
              authElements.push({ tag: tagName, text, element });
            }
          }
        }

        if (authElements.length > 0) {
          console.log(`\n🎯 Found ${authElements.length} auth-related elements:`);
          for (const auth of authElements) {
            console.log(`  ${auth.tag}: "${auth.text}"`);
          }

          // Try to click the first auth element
          if (authElements[0]) {
            console.log(`\n🖱️  Clicking: "${authElements[0].text}"`);
            try {
              await authElements[0].element.click({ timeout: 5000 });
              await page.waitForTimeout(2000);

              const newUrl = page.url();
              console.log(`  ➡️  Navigated to: ${newUrl}`);

              if (newUrl.includes('keycloak') || newUrl.includes('auth') || newUrl.includes('login')) {
                console.log(`  ✅ Reached authentication system!`);
              }
            } catch (clickError) {
              console.log(`  ❌ Click failed: ${clickError.message}`);
            }
          }
        } else {
          console.log(`❌ No auth-related elements found`);
        }

      } catch (error) {
        console.log(`❌ Failed to load ${instance.name}: ${error.message}`);
      }
    }

  } catch (error) {
    console.error('Discovery failed:', error);
  } finally {
    await browser.close();
  }
}

discoverAuth();
