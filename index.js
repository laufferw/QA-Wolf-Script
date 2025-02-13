const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
    url: 'https://news.ycombinator.com/newest',
    headless: true,
    maxRetries: 3,
    retryDelay: 1000,
    articleLimit: 100,
    screenshotDir: 'screenshots',
    viewport: { width: 1280, height: 720 }
};

// Custom logger with timestamps
const logger = {
    log: (msg) => console.log(`[${new Date().toISOString()}] ${msg}`),
    error: (msg) => console.error(`[${new Date().toISOString()}] ERROR: ${msg}`),
    info: (msg) => console.log(`[${new Date().toISOString()}] INFO: ${msg}`)
};

async function retry(fn, retries = CONFIG.maxRetries) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            const delay = CONFIG.retryDelay * Math.pow(2, i);
            logger.info(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function captureScreenshot(page, name) {
    await fs.mkdir(CONFIG.screenshotDir, { recursive: true });
    const filename = path.join(CONFIG.screenshotDir, `${name}_${Date.now()}.png`);
    await page.screenshot({ path: filename, fullPage: true });
    return filename;
}

async function validateHNSorting() {
    const startTime = Date.now();
    const browser = await chromium.launch({ headless: CONFIG.headless });
    let page;
    try {
        const context = await browser.newContext({ viewport: CONFIG.viewport });
        page = await context.newPage();

        logger.info('Navigating to Hacker News newest stories...');
        await retry(() => page.goto(CONFIG.url, { waitUntil: 'networkidle' }));

        // Get all articles (we'll process first 100)
        const articles = [];
        logger.info('Collecting article data...');

        const rows = await retry(() => page.locator('tr.athing').all());
        for (let i = 0; i < Math.min(CONFIG.articleLimit, rows.length); i++) {
            const row = rows[i];
            const subtext = await row.locator('xpath=./following-sibling::tr[1]').first();
            
            const title = await row.locator('.titleline a').first().textContent();
            const timeText = await subtext.locator('.age a').first().textContent();
            
            articles.push({
                title,
                timeText,
                timestamp: parseTimeAgo(timeText)
            });
        }

        logger.info(`Collected ${articles.length} articles`);

        // Verify sorting
        let isSorted = true;
        let sortingErrors = [];
        for (let i = 1; i < articles.length; i++) {
            const curr = articles[i];
            const prev = articles[i-1];
            
            // Skip articles with identical timestamps
            if (curr.timestamp.getTime() === prev.timestamp.getTime()) {
                logger.info(`Skipping comparison of articles with identical timestamps (${curr.timeText}):
                    - ${prev.title}
                    - ${curr.title}`);
                continue;
            }

            if (curr.timestamp > prev.timestamp) {
                const timeDiff = Math.round((curr.timestamp - prev.timestamp) / 1000 / 60);
                sortingErrors.push({
                    position: i,
                    article1: prev,
                    article2: curr,
                    timeDiff
                });
                isSorted = false;
                break;
            }
        }

        const executionTime = Date.now() - startTime;

        if (isSorted) {
            logger.info(`✅ Validation passed: Articles are correctly sorted from newest to oldest (${executionTime}ms)`);
        } else {
            logger.error('❌ Validation failed: Articles are not properly sorted');
            logger.error('Sorting errors:');
            for (const error of sortingErrors) {
                logger.error(`Position ${error.position} - Time difference: ${error.timeDiff} minutes`);
                logger.error(`  Earlier: ${error.article1.title} (${error.article1.timeText})`);
                logger.error(`   Later: ${error.article2.title} (${error.article2.timeText})`);
            }
            const screenshotPath = await captureScreenshot(page, 'sorting_failure');
            logger.info(`Screenshot saved to: ${screenshotPath}`);
        }
    } catch (error) {
    logger.error(`An error occurred: ${error.message}`);
    logger.error(error.stack);
    if (page) {
        try {
            const screenshotPath = await captureScreenshot(page, 'error');
            logger.info(`Error screenshot saved to: ${screenshotPath}`);
        } catch (screenshotError) {
            logger.error(`Failed to capture error screenshot: ${screenshotError.message}`);
        }
    }
    throw error;
} finally {
    await browser.close();
    logger.info(`Total execution time: ${Date.now() - startTime}ms`);
}
}

function parseTimeAgo(timeText) {
    const now = new Date();
    const match = timeText.match(/(\d+)\s*([a-zA-Z]+)/);
    if (!match) return now;

    const [, number, unit] = match;
    const value = parseInt(number);
    
    // Handle both singular and plural forms
    const normalizedUnit = unit.toLowerCase().replace(/s$/, '');
    
    const multipliers = {
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000
    };

    const multiplier = multipliers[normalizedUnit];
    if (!multiplier) {
        logger.error(`Unknown time unit: ${unit} in "${timeText}"`);
        return now;
    }

    return new Date(now - value * multiplier);
}

// Run the validation
validateHNSorting().catch(console.error);

