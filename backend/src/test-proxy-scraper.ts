import { scrapeZillowWithPlaywright } from './scrapers/playwrightZillow';

async function testScraper() {
  const proxyUrl = 'socks5h://user-sp6mbpcybk-session-1:K40SClud=esN8jxg9c@gate.decodo.com:7000';
  const zipCode = '90210'; // Test with Beverly Hills zip code
  
  try {
    console.log('Starting scraper test with proxy...');
    const results = await scrapeZillowWithPlaywright(zipCode, proxyUrl);
    console.log(`Found ${results.length} results`);
    console.log('First few results:', results.slice(0, 3));
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testScraper(); 