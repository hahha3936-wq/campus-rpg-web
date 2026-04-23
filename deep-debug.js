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
    
    const allMessages = [];
    page.on('pageerror', err => allMessages.push('[pageerror] ' + err.message + '\n' + (err.stack||'').split('\n').slice(0,5).join('\n')));
    page.on('console', msg => allMessages.push('[' + msg.type() + '] ' + msg.text()));
    
    await page.goto('http://localhost:5000/index.html', { waitUntil: 'load', timeout: 15000 });
    await new Promise(r => setTimeout(r, 5000));
    
    // Try loading social.js manually to see what happens
    try {
        const socialLoaded = await page.evaluate(async () => {
            try {
                const resp = await fetch('/js/features/social.js');
                const text = await resp.text();
                return { status: resp.status, length: text.length, first500: text.substring(0, 500), last500: text.substring(text.length - 500) };
            } catch(e) { return { error: e.message }; }
        });
        console.log('social.js content check:', JSON.stringify(socialLoaded, null, 2));
    } catch(e) { console.log('Failed to check social.js:', e.message); }
    
    // Try to eval social.js manually
    try {
        const evalResult = await page.evaluate(async () => {
            try {
                const resp = await fetch('/js/features/social.js');
                const text = await resp.text();
                eval(text);
                return { socialUI: typeof window.SocialUI, mainStory: typeof window.MainStory };
            } catch(e) { return { error: e.message, stack: e.stack }; }
        });
        console.log('After manual eval:', JSON.stringify(evalResult, null, 2));
    } catch(e) { console.log('Manual eval failed:', e.message); }
    
    console.log('\n--- All Messages ---');
    allMessages.forEach(m => console.log(m));
    
    await browser.close();
}

run().catch(console.error);
