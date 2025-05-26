import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export async function scrapeZillow(zipCode: string) {
  const url = `https://www.zillow.com/homes/${zipCode}_rb/`;

  try {
    const browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle2' });

    await new Promise(res => setTimeout(res, 5000));
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForSelector('[data-test="property-card"]', { timeout: 15000 });

    const listings = await page.evaluate(() => {
      const results: any[] = [];
      const cards = document.querySelectorAll('[data-test="property-card"]');
      cards.forEach((card) => {
        const address = card.querySelector('[data-test="property-address"]')?.textContent;
        const price = card.querySelector('[data-test="property-price"]')?.textContent;
        const beds = card.querySelector('[data-test="property-beds"]')?.textContent;
        const link = card.querySelector('a')?.href;

        results.push({ address, price, beds, link });
      });

      return results;
    });

    await browser.close();
    return listings;
  } catch (error) {
    console.error("❌ scrapeZillow failed:", error);
    return [];
  }
}