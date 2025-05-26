import { chromium } from 'playwright';

interface ZillowListing {
  address: string;
  price: string;
  beds: string;
  link: string;
}

export async function scrapeZillowWithPlaywright(zipCode: string, proxyUrl?: string): Promise<ZillowListing[]> {
  const browserOptions: any = {
    headless: false, // Keep browser visible to bypass Zillow's anti-bot
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-position=2000,0', // Position browser window off-screen
    ]
  };

  if (proxyUrl) {
    browserOptions.proxy = {
      server: proxyUrl
    };
  }

  const browser = await chromium.launch(browserOptions);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }, // Smaller viewport for better performance
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true
  });
  
  const page = await context.newPage();
  let retryCount = 0;
  const maxRetries = 2;
  
  try {
    while (retryCount < maxRetries) {
      try {
        console.log(`Attempt ${retryCount + 1}/${maxRetries}: Accessing Zillow...`);
        await page.goto(`https://www.zillow.com/homes/${zipCode}_rb/`, {
          waitUntil: 'load',
          timeout: 30000
        });
        
        // Wait for any of the selectors to be found
        const selectors = [
          '[data-test="property-card"]',
          'article[role="presentation"]',
          '.list-card'
        ];
        
        const element = await page.waitForSelector(selectors.join(','), { 
          timeout: 15000,
          state: 'visible'
        });
        
        if (!element) {
          throw new Error('No property cards found');
        }

        const listings = await page.evaluate(() => {
          const results: any[] = [];
          const cards = document.querySelectorAll('article[role="presentation"]') || 
                       document.querySelectorAll('[data-test="property-card"]') ||
                       document.querySelectorAll('.list-card');
          
          cards.forEach((card) => {
            const address = card.querySelector('address')?.textContent || 
                           card.querySelector('[data-test="property-card-link"] address')?.textContent || '';
            const price = card.querySelector('[data-test="property-card-price"]')?.textContent || 
                         card.querySelector('.list-card-price')?.textContent || '';
            const beds = card.querySelector('[data-test="property-beds"]')?.textContent || 
                        card.querySelector('.list-card-beds')?.textContent || '';
            const link = card.querySelector('a')?.href || '';
            
            if (address || price || beds || link) {
              results.push({ address, price, beds, link });
            }
          });
          
          return results;
        });
        
        if (listings.length === 0) {
          throw new Error('No listings found in the page');
        }

        console.log(`Successfully scraped ${listings.length} listings`);
        return listings;
        
      } catch (error) {
        retryCount++;
        
        if (retryCount === maxRetries) {
          throw error;
        }
        
        // Wait before retrying
        await page.waitForTimeout(2000);
      }
    }
    
    return [];
  } catch (error) {
    return [];
  } finally {
    await browser.close();
  }
}