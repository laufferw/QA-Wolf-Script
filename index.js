const { chromium } = require('playwright');

async function validateHNSorting() {
const browser = await chromium.launch();
try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log('Navigating to Hacker News newest stories...');
    await page.goto('https://news.ycombinator.com/newest');

    // Get all articles (we'll process first 100)
    const articles = [];
    console.log('Collecting article data...');
    
    const rows = await page.locator('tr.athing').all();
    for (let i = 0; i < Math.min(100, rows.length); i++) {
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

    console.log(`Collected ${articles.length} articles`);
    
    // Verify sorting
    let isSorted = true;
    for (let i = 1; i < articles.length; i++) {
    if (articles[i].timestamp > articles[i-1].timestamp) {
        console.error(`Sorting error detected at position ${i}:`);
        console.error(`  ${articles[i-1].title} (${articles[i-1].timeText})`);
        console.error(`  ${articles[i].title} (${articles[i].timeText})`);
        isSorted = false;
        break;
    }
    }

    if (isSorted) {
    console.log('✅ Validation passed: Articles are correctly sorted from newest to oldest');
    } else {
    console.log('❌ Validation failed: Articles are not properly sorted');
    }

} catch (error) {
    console.error('An error occurred:', error);
} finally {
    await browser.close();
}
}

function parseTimeAgo(timeText) {
const now = new Date();
const number = parseInt(timeText);

if (timeText.includes('minute')) {
    return new Date(now - number * 60 * 1000);
} else if (timeText.includes('hour')) {
    return new Date(now - number * 60 * 60 * 1000);
} else if (timeText.includes('day')) {
    return new Date(now - number * 24 * 60 * 60 * 1000);
} else if (timeText.includes('month')) {
    return new Date(now - number * 30 * 24 * 60 * 60 * 1000);
} else if (timeText.includes('year')) {
    return new Date(now - number * 365 * 24 * 60 * 60 * 1000);
}
return now; // fallback
}

// Run the validation
validateHNSorting().catch(console.error);

