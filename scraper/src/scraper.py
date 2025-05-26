from playwright.async_api import async_playwright
import asyncio
import json
from typing import Dict, List
import random
import time
from bs4 import BeautifulSoup
from .database import Database
from .config import (
    ZILLOW_URL,
    USER_AGENT,
    REGIONS,
    DELAY_BETWEEN_REQUESTS,
    MAX_RETRIES
)

class ZillowScraper:
    def __init__(self):
        self.db = Database()
        self.base_url = ZILLOW_URL

    async def init_browser(self):
        """Initialize playwright browser"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.context = await self.browser.new_context(
            user_agent=USER_AGENT,
            viewport={'width': 1920, 'height': 1080}
        )
        self.page = await self.context.new_page()

    async def close_browser(self):
        """Cleanup browser resources"""
        await self.context.close()
        await self.browser.close()
        await self.playwright.stop()

    async def get_property_details(self, url: str) -> Dict:
        """Extract property details from a listing page"""
        try:
            await self.page.goto(url)
            await self.page.wait_for_load_state('networkidle')
            
            # Extract the required information
            content = await self.page.content()
            soup = BeautifulSoup(content, 'html.parser')
            
            # This is a placeholder - you'll need to adjust these selectors
            # based on Zillow's actual HTML structure
            details = {
                'zid': url.split('/')[-1],
                'address': soup.select_one('.address')?.text.strip(),
                'price': soup.select_one('.price')?.text.strip(),
                'beds': soup.select_one('.beds')?.text.strip(),
                'link': url,
                'zipCode': '',  # Extract from address
                'region': ''    # Extract from address
            }
            
            return details
        except Exception as e:
            print(f"Error extracting property details: {e}")
            return None

    async def get_agent_details(self, property_url: str) -> List[Dict]:
        """Extract agent details from a listing page"""
        try:
            # Navigate to the agent section or modal
            # This is placeholder logic - adjust based on actual website structure
            agents = []
            # Extract agent information
            # Add to agents list
            return agents
        except Exception as e:
            print(f"Error extracting agent details: {e}")
            return []

    async def scrape_region(self, region: str):
        """Scrape properties for a specific region"""
        try:
            # Construct the search URL for the region
            search_url = f"{self.base_url}/homes/{region}"
            await self.page.goto(search_url)
            await self.page.wait_for_load_state('networkidle')

            # Extract property links
            content = await self.page.content()
            soup = BeautifulSoup(content, 'html.parser')
            
            # Adjust selector based on actual website structure
            property_links = [
                link['href'] for link in soup.select('.property-card-link')
            ]

            # Process each property
            for link in property_links:
                # Check if property already exists
                zid = link.split('/')[-1]
                existing_lead = await self.db.get_lead_by_zid(zid)
                if existing_lead:
                    continue

                # Get property details
                details = await self.get_property_details(link)
                if not details:
                    continue

                # Save lead to database
                lead = await self.db.create_lead(details)
                if not lead:
                    continue

                # Get and save agent details
                agents = await self.get_agent_details(link)
                for agent in agents:
                    await self.db.create_contact(agent, lead.id)

                # Respect rate limiting
                await asyncio.sleep(DELAY_BETWEEN_REQUESTS)

        except Exception as e:
            print(f"Error scraping region {region}: {e}")

    async def run(self):
        """Main scraping function"""
        try:
            await self.init_browser()
            for region in REGIONS:
                await self.scrape_region(region)
        finally:
            await self.close_browser()

async def main():
    scraper = ZillowScraper()
    await scraper.run()

if __name__ == "__main__":
    asyncio.run(main())
