const puppeteer = require('puppeteer-core');
const fs = require('fs');

async function findChrome() {
    const locations = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const loc of locations) { if (fs.existsSync(loc)) return loc; }
    return null;
}

async function run() {
    const browserPath = await findChrome();
    if (!browserPath) { console.log('No browser!'); return; }
    const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    
    // Capture console errors
    page.on('pageerror', err => console.log('[pageerror]', err.message));
    page.on('console', msg => {
        if (msg.type() === 'error') console.log('[console.error]', msg.text());
        if (msg.type() === 'warning') console.log('[console.warn]', msg.text());
    });
    
    // Intercept requests and log 404s
    await page.setRequestInterception(true);
    page.on('request', req => req.continue());
    page.on('response', resp => {
        if (resp.status() >= 400) console.log('[HTTP ' + resp.status() + ']', resp.url());
    });
    
    await page.goto('http://localhost:5000/index.html', { waitUntil: 'load', timeout: 15000 });
    console.log('Page loaded');
    
    // Check what's defined
    const result = await page.evaluate(() => {
        return {
            socialUI: typeof window.SocialUI,
            mainStory: typeof window.MainStory,
            jquery: typeof window.$,
            documentReady: document.readyState,
            scriptsLoaded: document.querySelectorAll('script[src]').length,
        };
    });
    console.log('Window state:', JSON.stringify(result, null, 2));
    
    await browser.close();
}

run().catch(console.error);
