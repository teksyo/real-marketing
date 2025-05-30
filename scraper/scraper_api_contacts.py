#!/usr/bin/env python3
"""
Zillow Contact Scraper using ScraperAPI
Fetches agent contact information from individual property detail pages.

Usage:
python3.10 scraper_api_contacts.py

Requirements:
- ScraperAPI account and API key
- Set SCRAPERAPI_KEY environment variable
"""
import os
import time
import random
import re
import asyncio
import requests
from bs4 import BeautifulSoup
from typing import List, Dict, Optional
from prisma import Prisma
from prisma.enums import ContactType
import argparse
from datetime import datetime, timedelta

# Initialize Prisma client
prisma = Prisma()

# ScraperAPI configuration
SCRAPERAPI_KEY = os.getenv('SCRAPERAPI_KEY', '00d53552daadeff0cbdd543558c909b8')
SCRAPERAPI_URL = "http://api.scraperapi.com"

# Rate limiting settings
MIN_DELAY = 3  # Minimum delay between requests (seconds)
MAX_DELAY = 7  # Maximum delay between requests (seconds)
BATCH_SIZE = 10  # Process leads in batches
BATCH_DELAY = 30  # Delay between batches (seconds)
MAX_RETRIES = 3  # Maximum retries for failed requests

# Time limits for cron jobs
MAX_RUNTIME_MINUTES = 12  # Maximum runtime for cron jobs (12 minutes)

def get_scraperapi_url(target_url: str, **kwargs) -> str:
    """
    Build ScraperAPI URL with parameters
    
    Args:
        target_url: The URL to scrape
        **kwargs: Additional ScraperAPI parameters
    """
    if not SCRAPERAPI_KEY:
        raise ValueError("SCRAPERAPI_KEY environment variable not set")
    
    params = {
        'api_key': SCRAPERAPI_KEY,
        'url': target_url,
        'render': 'true',  # Render JavaScript
        'country_code': 'us',  # Use US proxies
        'premium': 'true',  # Use premium proxies for better success rate
        'session_number': random.randint(1, 100),  # Random session for rotation
    }
    
    # Add any additional parameters
    params.update(kwargs)
    
    # Build URL
    url_params = '&'.join([f"{k}={v}" for k, v in params.items()])
    return f"{SCRAPERAPI_URL}?{url_params}"

def extract_phone_numbers(html_content: str) -> List[str]:
    """
    Extract phone numbers from HTML content
    """
    phone_patterns = [
        r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b',  # xxx-xxx-xxxx, xxx.xxx.xxxx, xxx xxx xxxx
        r'\(\d{3}\)\s*\d{3}[-.\s]?\d{4}',  # (xxx) xxx-xxxx
        r'\b\d{10}\b',  # 10 digit numbers
        r'\+1\s*\d{3}[-.\s]?\d{3}[-.\s]?\d{4}',  # +1 xxx-xxx-xxxx
        r'\b1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b',  # 1-xxx-xxx-xxxx
    ]
    
    phone_numbers = set()
    for pattern in phone_patterns:
        matches = re.findall(pattern, html_content)
        for match in matches:
            # Clean and format the phone number
            phone = re.sub(r'[^\d]', '', match)
            if len(phone) == 10:  # Valid US phone number
                formatted_phone = f"({phone[:3]}) {phone[3:6]}-{phone[6:10]}"
                phone_numbers.add(formatted_phone)
            elif len(phone) == 11 and phone.startswith('1'):  # Remove leading 1
                phone = phone[1:]
                formatted_phone = f"({phone[:3]}) {phone[3:6]}-{phone[6:10]}"
                phone_numbers.add(formatted_phone)
    
    return list(phone_numbers)

def extract_agent_info(soup: BeautifulSoup) -> Dict[str, any]:
    """
    Extract agent information from parsed HTML
    """
    agent_info = {
        'names': [],
        'phones': [],
        'companies': [],
        'licenses': []
    }
    
    # Get the full HTML text for phone extraction
    html_text = soup.get_text()
    
    # Extract phone numbers from the entire page using our working function
    phones = extract_phone_numbers(str(soup))
    agent_info['phones'].extend(phones)
    
    # Common selectors for agent information - broader search
    agent_selectors = [
        'div[data-testid="agent-info"]',
        'div[class*="agent"]',
        'div[class*="contact"]',
        'div[class*="listing-agent"]',
        'div[class*="broker"]',
        'section[class*="agent"]',
        'div[class*="realtor"]',
        'div[class*="listing"]',
        'span[class*="agent"]',
        'a[href*="professionals"]',  # Zillow professional links
    ]
    
    # Look for agent containers
    for selector in agent_selectors:
        elements = soup.select(selector)
        for element in elements:
            # Extract names - look for text patterns that look like names
            text_content = element.get_text()
            # Look for patterns like "FirstName LastName" in the text
            name_patterns = [
                r'\b([A-Z][a-z]+ [A-Z][a-z]+)\b',  # Standard "First Last"
                r'\b([A-Z][a-z]+ [A-Z]\. [A-Z][a-z]+)\b',  # "First M. Last"
                r'\b([A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+)\b',  # "First Middle Last"
            ]
            
            for pattern in name_patterns:
                matches = re.findall(pattern, text_content)
                for match in matches:
                    name = match.strip()
                    # Filter out common false positives
                    if (len(name.split()) >= 2 and len(name) < 50 and 
                        not any(word.lower() in name.lower() for word in 
                               ['street', 'ave', 'road', 'blvd', 'dr', 'miami', 'florida', 'zillow', 'mls', 'sqft'])):
                        agent_info['names'].append(name)
    
    # Look for company names in the page text
    company_patterns = [
        r'(?:Brokered by|Listed by|Courtesy of|Listing provided by)\s*:?\s*([A-Za-z][^,\n\.]{5,50})',
        r'\b([A-Z][a-zA-Z\s&]{3,40}(?:Realty|Real Estate|Properties|Group|Team|Associates|Realtors|Brokerage))\b',
        r'\b([A-Z][a-zA-Z\s&]{3,40}(?:RE/MAX|Coldwell|Century|Keller|Compass|eXp))\b',
    ]
    
    for pattern in company_patterns:
        matches = re.findall(pattern, html_text)
        for match in matches:
            company = match.strip()
            # Filter out garbage text
            if (len(company) > 5 and len(company) < 80 and 
                not any(word.lower() in company.lower() for word in 
                       ['loading', 'request', 'contact', 'today', 'early', 'button', 'click', 'undefined'])):
                agent_info['companies'].append(company)
    
    # Remove duplicates
    agent_info['names'] = list(set(agent_info['names']))
    agent_info['phones'] = list(set(agent_info['phones']))
    agent_info['companies'] = list(set(agent_info['companies']))
    
    return agent_info

async def scrape_property_contacts(url: str, max_retries: int = MAX_RETRIES) -> Optional[Dict]:
    """
    Scrape contact information from a property URL using ScraperAPI
    """
    for attempt in range(max_retries):
        try:
            print(f"   🌐 Attempt {attempt + 1}/{max_retries} - Scraping: {url}")
            
            # Build ScraperAPI URL
            scraper_url = get_scraperapi_url(url)
            
            # Make request
            response = requests.get(scraper_url, timeout=60)
            
            if response.status_code == 200:
                print(f"   ✅ Successfully fetched page (Length: {len(response.text)} chars)")
                
                # Debug: Show sample of page content
                if attempt == 0:  # Only on first attempt
                    print(f"   🔍 Page title: {BeautifulSoup(response.text, 'html.parser').title.string if BeautifulSoup(response.text, 'html.parser').title else 'No title'}")
                    # Look for phone numbers in raw text
                    raw_phones = extract_phone_numbers(response.text)
                    print(f"   📱 Raw phone numbers in page: {raw_phones[:5]}")  # Show first 5
                
                # Parse HTML
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # Extract agent information
                agent_info = extract_agent_info(soup)
                
                print(f"   📞 Found: {len(agent_info['phones'])} phones, {len(agent_info['names'])} names, {len(agent_info['companies'])} companies")
                
                if agent_info['phones'] or agent_info['names']:
                    return agent_info
                else:
                    print(f"   ⚠️  No contact information found in page content")
                    
            elif response.status_code == 403:
                print(f"   ❌ 403 Forbidden - Page blocked")
            elif response.status_code == 404:
                print(f"   ❌ 404 Not Found - Property may no longer exist")
                break  # Don't retry for 404s
            else:
                print(f"   ❌ HTTP {response.status_code}: {response.reason}")
                
        except Exception as e:
            print(f"   ❌ Attempt {attempt + 1} failed: {str(e)}")
            
        # Wait before retry (with exponential backoff)
        if attempt < max_retries - 1:
            delay = min(10 * (2 ** attempt), 60)  # Max 60 seconds
            print(f"   ⏱️  Waiting {delay} seconds before retry...")
            time.sleep(delay)
    
    print(f"   ❌ Failed to scrape contact info after {max_retries} attempts")
    return None

async def create_contacts_from_scraped_data(agent_info: Dict, lead_id: int) -> int:
    """
    Create contact records from scraped agent information
    """
    contacts_created = 0
    
    # If we have both names and phones, try to match them
    if agent_info['names'] and agent_info['phones']:
        # Create contacts pairing names with phones (up to the minimum count)
        pairs = min(len(agent_info['names']), len(agent_info['phones']))
        
        for i in range(pairs):
            try:
                contact_data = {
                    'name': agent_info['names'][i],
                    'phoneNumber': agent_info['phones'][i],
                    'type': ContactType.AGENT,
                    'company': agent_info['companies'][0] if agent_info['companies'] else None,
                    'leads': {
                        'connect': {'id': lead_id}
                    }
                }
                
                # Remove None values
                contact_data = {k: v for k, v in contact_data.items() if v is not None}
                
                await prisma.contact.create(data=contact_data)
                contacts_created += 1
                print(f"     ✅ Created contact: {agent_info['names'][i]} - {agent_info['phones'][i]}")
                
            except Exception as e:
                print(f"     ❌ Error creating contact: {str(e)}")
                
    # Create contacts for remaining phones without names
    remaining_phones = agent_info['phones'][contacts_created:]
    for phone in remaining_phones:
        try:
            contact_data = {
                'phoneNumber': phone,
                'type': ContactType.AGENT,
                'company': agent_info['companies'][0] if agent_info['companies'] else None,
                'leads': {
                    'connect': {'id': lead_id}
                }
            }
            
            # Remove None values
            contact_data = {k: v for k, v in contact_data.items() if v is not None}
            
            await prisma.contact.create(data=contact_data)
            contacts_created += 1
            print(f"     ✅ Created contact: Unknown Agent - {phone}")
            
        except Exception as e:
            print(f"     ❌ Error creating contact for {phone}: {str(e)}")
    
    return contacts_created

async def process_zillow_leads():
    """
    Main function to process Zillow leads without contact information
    """
    start_time = datetime.now()
    max_end_time = start_time + timedelta(minutes=MAX_RUNTIME_MINUTES)
    
    try:
        # Get leads without contacts
        leads = await prisma.lead.find_many(
            where={
                'source': 'ZILLOW',
                'contacts': {
                    'none': {}  # No contacts associated
                },
                'contactFetchAttempts': {
                    'lt': 5  # Less than 5 attempts
                },
                'link': {
                    'not': None  # Must have a link
                }
            },
            take=15  # Reduced from 50 to 15 for faster cron jobs
        )
        
        if not leads:
            print("✅ No leads need contact updates")
            return
            
        print(f"\n🏠 Processing {len(leads)} Zillow leads for contact information...")
        print(f"📊 Processing in batches of {BATCH_SIZE}")
        print(f"⏰ Max runtime: {MAX_RUNTIME_MINUTES} minutes")
        
        total_contacts_created = 0
        total_processed = 0
        total_errors = 0
        
        # Process leads in batches
        total_batches = (len(leads) + BATCH_SIZE - 1) // BATCH_SIZE
        
        for batch_num, i in enumerate(range(0, len(leads), BATCH_SIZE)):
            # Check if we're approaching timeout
            current_time = datetime.now()
            if current_time >= max_end_time:
                print(f"\n⏰ Approaching timeout limit ({MAX_RUNTIME_MINUTES} minutes)")
                print(f"Stopping early to avoid cron job timeout")
                break
                
            batch = leads[i:i + BATCH_SIZE]
            print(f"\n📦 Processing batch {batch_num + 1}/{total_batches} ({len(batch)} leads)")
            
            for lead_num, lead in enumerate(batch):
                # Check timeout before each lead
                current_time = datetime.now()
                if current_time >= max_end_time:
                    print(f"\n⏰ Timeout reached, stopping processing")
                    break
                    
                try:
                    total_processed += 1
                    print(f"\n🔍 Lead {total_processed}/{len(leads)} - ID: {lead.zid}")
                    print(f"   🔗 URL: {lead.link}")
                    
                    # Increment contact fetch attempts
                    await prisma.lead.update(
                        where={'id': lead.id},
                        data={'contactFetchAttempts': lead.contactFetchAttempts + 1}
                    )
                    
                    # Scrape contact information
                    agent_info = await scrape_property_contacts(lead.link)
                    
                    if agent_info:
                        # Create contacts from scraped data
                        contacts_created = await create_contacts_from_scraped_data(agent_info, lead.id)
                        total_contacts_created += contacts_created
                        
                        if contacts_created > 0:
                            print(f"   ✅ Successfully created {contacts_created} contacts for lead {lead.zid}")
                        else:
                            print(f"   ⚠️  Scraped data but couldn't create contacts for lead {lead.zid}")
                            total_errors += 1
                    else:
                        print(f"   ❌ Failed to scrape contact info for lead {lead.zid}")
                        total_errors += 1
                    
                    # Delay between requests
                    if lead_num < len(batch) - 1:
                        delay = random.uniform(MIN_DELAY, MAX_DELAY)
                        print(f"   ⏱️  Waiting {delay:.1f} seconds...")
                        time.sleep(delay)
                        
                except Exception as e:
                    print(f"   ❌ Error processing lead {lead.zid}: {str(e)}")
                    total_errors += 1
                    continue
            
            # Delay between batches
            if batch_num < total_batches - 1:
                current_time = datetime.now()
                if current_time < max_end_time:
                    print(f"\n⏱️  Batch {batch_num + 1} complete. Waiting {BATCH_DELAY} seconds before next batch...")
                    time.sleep(BATCH_DELAY)
        
        runtime = datetime.now() - start_time
        print(f"\n📊 Final Summary:")
        print(f"- Runtime: {runtime.total_seconds()/60:.1f} minutes")
        print(f"- Total leads processed: {total_processed}")
        print(f"- Total contacts created: {total_contacts_created}")
        print(f"- Total errors: {total_errors}")
        if total_processed > 0:
            print(f"- Success rate: {((total_processed - total_errors) / total_processed * 100):.1f}%")
        
    except Exception as e:
        print(f"❌ Error in main process: {str(e)}")

async def main():
    parser = argparse.ArgumentParser(description='Scrape Zillow property contacts using ScraperAPI')
    parser.add_argument('--test', action='store_true', help='Test with a single property URL')
    parser.add_argument('--url', type=str, help='Property URL to test (requires --test)')
    args = parser.parse_args()
    
    # Check for ScraperAPI key
    if not SCRAPERAPI_KEY:
        print("❌ Error: SCRAPERAPI_KEY environment variable not set")
        print("Please set your ScraperAPI key:")
        print("export SCRAPERAPI_KEY='your_api_key_here'")
        return
    
    print(f"🚀 Zillow Contact Scraper using ScraperAPI")
    print(f"📅 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Connect to database
    await prisma.connect()
    
    try:
        if args.test:
            # Test mode with single URL
            test_url = args.url or "https://www.zillow.com/homedetails/442663676_zpid/"
            print(f"\n🧪 Test mode - scraping: {test_url}")
            
            agent_info = await scrape_property_contacts(test_url)
            if agent_info:
                print(f"\n✅ Test successful!")
                print(f"📞 Phones found: {agent_info['phones']}")
                print(f"👤 Names found: {agent_info['names']}")
                print(f"🏢 Companies found: {agent_info['companies']}")
            else:
                print(f"\n❌ Test failed - no contact info found")
        else:
            # Production mode
            await process_zillow_leads()
            
    finally:
        await prisma.disconnect()

if __name__ == "__main__":
    asyncio.run(main()) 