import axios from 'axios';
import * as cheerio from 'cheerio';

const scrapeZillowViaScraperAPI = async (zipCode: string) => {
  const apiKey = '00d53552daadeff0cbdd543558c909b8'; // Replace with your real key
  const targetUrl = `https://www.zillow.com/homes/${zipCode}_rb/`;
  const url = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}`;

  console.log("targetURL", targetUrl);
  console.log("url", url);

  try {
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);
    const results: any[] = [];

    console.log("html", html);

    $('[data-test="property-card"]').each((_, element) => {
      const address = $(element).find('[data-test="property-address"]').text().trim();
      const price = $(element).find('[data-test="property-price"]').text().trim();
      const beds = $(element).find('[data-test="property-beds"]').text().trim();
      const link = $(element).find('a').attr('href');

      results.push({
        address,
        price,
        beds,
        link: link?.startsWith('http') ? link : `https://www.zillow.com${link}`
      });
    });

    return results;
  } catch (err) {
    console.error('❌ ScraperAPI request failed:', err);
    return [];
  }
}

export default scrapeZillowViaScraperAPI;