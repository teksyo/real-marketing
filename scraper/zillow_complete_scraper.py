#!/usr/bin/env python3
"""
Complete Zillow Scraper - Unified Script
Handles both property listing fetch and contact extraction in one file.

Usage:
python3.10 zillow_complete_scraper.py                    # Run both listings + contacts
python3.10 zillow_complete_scraper.py --listings-only    # Only fetch listings
python3.10 zillow_complete_scraper.py --contacts-only    # Only extract contacts
python3.10 zillow_complete_scraper.py --skip-contacts    # Fetch listings, skip contacts
"""
import os
import time
import random
import re
import asyncio
import requests
import json
import sys
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
from bs4 import BeautifulSoup

# Database and enums
from prisma import Prisma
from prisma.enums import LeadStatus, ContactType, LeadPriority, LeadSource

# Zillow API
import pyzill
import urllib3
urllib3.disable_warnings()

# Initialize Prisma client
prisma = Prisma()

# ================== CONFIGURATION ==================

# ScraperAPI configuration
SCRAPERAPI_KEY = os.getenv('SCRAPERAPI_KEY', '00d53552daadeff0cbdd543558c909b8')
SCRAPERAPI_URL = "http://api.scraperapi.com"

# Proxy settings for pyzill
PROXY_SESSIONS = [
    'user-sp6mbpcybk-session-1-state-us_virginia',
    'user-sp6mbpcybk-session-2-state-us_california', 
    'user-sp6mbpcybk-session-3-state-us_texas',
    'user-sp6mbpcybk-session-4-state-us_florida',
    'user-sp6mbpcybk-session-5-state-us_newyork'
]
PROXY_PASSWORD = 'K40SClud=esN8jxg9c'
PROXY_HOST = "gate.decodo.com"
PROXY_PORT = "7000"

# Rate limiting settings
LISTINGS_MIN_DELAY = 5
LISTINGS_MAX_DELAY = 10
CONTACTS_MIN_DELAY = 3
CONTACTS_MAX_DELAY = 7
CONTACTS_BATCH_SIZE = 10
CONTACTS_BATCH_DELAY = 30
MAX_RETRIES = 3

# Runtime limits
MAX_LISTINGS_TO_FETCH = 50
MAX_CONTACTS_TO_PROCESS = 15
MAX_RUNTIME_MINUTES = 12

# Directory for storing debug data
DATA_DIR = Path("zillow_data")

# ================== UTILITY FUNCTIONS ==================

def log_message(message: str):
    """Print timestamped log message"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {message}")

def ensure_data_directory():
    """Ensure the data directory exists"""
    DATA_DIR.mkdir(exist_ok=True)

def get_us_map_bounds() -> Dict:
    """Get map bounds for continental US"""
    return {
        "west": -124.848974,
        "east": -66.885444,
        "south": 24.396308,
        "north": 49.384358
    }

def get_random_proxy():
    """Get a random proxy session for pyzill"""
    session = random.choice(PROXY_SESSIONS)
    return pyzill.parse_proxy(PROXY_HOST, PROXY_PORT, session, PROXY_PASSWORD)

def test_proxy_connection():
    """Test if the proxy connection is working"""
    log_message("Testing proxy connection...")
    try:
        url = 'https://ip.decodo.com/json'
        username = 'user-sp6mbpcybk-session-1-state-us_virginia'
        password = 'K40SClud=esN8jxg9c'
        proxy = pyzill.parse_proxy("gate.decodo.com", "7000", username, password)
        result = requests.get(url, proxies={
            'http': proxy,
            'https': proxy
        }, verify=False, timeout=30)
        
        if result.status_code == 200:
            ip_data = result.json()
            log_message(f"✅ Proxy connection successful! IP: {ip_data.get('proxy', {}).get('ip')}")
            return True
        else:
            log_message(f"❌ Proxy test failed with status code: {result.status_code}")
            return False
    except Exception as e:
        log_message(f"❌ Proxy test failed: {str(e)}")
        return False

# ================== LISTINGS FUNCTIONS ==================

async def save_listing_to_db(listing: Dict) -> tuple[str, Optional[int]]:
    """Save a listing to the database and return status and lead ID"""
    try:
        zpid = str(listing.get('zpid', ''))
        if not zpid:
            return "error", None
            
        # Check if listing already exists
        existing = await prisma.lead.find_unique(where={'zid': zpid})
        if existing:
            return "exists", existing.id
            
        # Prepare listing data
        zip_code = listing.get('addressZipcode', '') or listing.get('zipCode', '') or 'Unknown'
        city = listing.get('addressCity', '') or 'Unknown'
        state = listing.get('addressState', '') or 'Unknown'
        region = f"{city}, {state}"
        
        listing_data = {
            'zid': zpid,
            'address': listing.get('address', '') or None,
            'price': str(listing.get('unformattedPrice', '')) or None,
            'beds': str(listing.get('beds', '')) or None,
            'link': listing.get('detailUrl', '') or None,
            'zipCode': zip_code,
            'region': region,
            'status': LeadStatus.NEW,
            'priority': LeadPriority.MEDIUM,
            'source': LeadSource.ZILLOW,
            'contactFetchAttempts': 0
        }
        
        new_lead = await prisma.lead.create(data=listing_data)
        return "created", new_lead.id
        
    except Exception as e:
        if "prepared statement" in str(e):
            return "error", None
        log_message(f"Error saving listing: {str(e)}")
        return "error", None

async def fetch_zillow_listings(skip_proxy_test: bool = False) -> bool:
    """Fetch listings from Zillow using pyzill"""
    log_message("🏠 Starting Zillow listings fetch...")
    
    try:
        # Test proxy connection (unless skipped)
        if not skip_proxy_test:
            if not test_proxy_connection():
                log_message("Failed to establish proxy connection. Trying without proxy...")
        else:
            log_message("⚠️  Skipping proxy connection test")
        
        # Get US map bounds
        bounds = get_us_map_bounds()
        
        # Try with proxy first, then without if it fails
        proxy_url = get_random_proxy()
        log_message("Using proxy for listings fetch...")
        
        try:
            response = pyzill.for_sale(
                pagination=1,
                search_value="",
                min_beds=None,
                max_beds=None,
                min_bathrooms=None,
                max_bathrooms=None,
                min_price=None,
                max_price=None,
                ne_lat=bounds["north"],
                ne_long=bounds["east"],
                sw_lat=bounds["south"],
                sw_long=bounds["west"],
                zoom_value=5,
                proxy_url=proxy_url
            )
        except Exception as proxy_error:
            log_message(f"⚠️  Proxy failed: {proxy_error}")
            log_message("🔄 Trying without proxy...")
            
            response = pyzill.for_sale(
                pagination=1,
                search_value="",
                min_beds=None,
                max_beds=None,
                min_bathrooms=None,
                max_bathrooms=None,
                min_price=None,
                max_price=None,
                ne_lat=bounds["north"],
                ne_long=bounds["east"],
                sw_lat=bounds["south"],
                sw_long=bounds["west"],
                zoom_value=5,
                proxy_url=None
            )

        if not response or not isinstance(response, dict):
            log_message("❌ No valid response received from Zillow")
            return False
            
        # Extract results
        results = []
        for key in ['listResults', 'mapResults', 'cat1', 'results']:
            if key in response:
                results = response[key]
                log_message(f"Found results in '{key}' key")
                break
                
        if not results:
            log_message("❌ No listings found in response")
            return False
            
        log_message(f"📊 Found {len(results)} listings")
        
        # Process each listing
        new_count = 0
        existing_count = 0
        error_count = 0
        
        for idx, result in enumerate(results[:MAX_LISTINGS_TO_FETCH]):
            try:
                if not isinstance(result, dict):
                    error_count += 1
                    continue
                
                status, lead_id = await save_listing_to_db(result)
                
                if status == "created":
                    new_count += 1
                    log_message(f"✅ Created new listing {idx+1}/{len(results)} (ID: {lead_id})")
                elif status == "exists":
                    existing_count += 1
                    log_message(f"📄 Listing already exists {idx+1}/{len(results)}")
                else:
                    error_count += 1
                    
            except Exception as e:
                log_message(f"Error processing listing: {str(e)}")
                error_count += 1
                continue
        
        log_message(f"📊 Listings Summary:")
        log_message(f"- Total found: {len(results)}")
        log_message(f"- New leads: {new_count}")
        log_message(f"- Already exists: {existing_count}")
        log_message(f"- Errors: {error_count}")
        
        return True
                
    except Exception as e:
        log_message(f"❌ Error fetching listings: {str(e)}")
        return False

# ================== CONTACTS FUNCTIONS ==================

def get_scraperapi_url(target_url: str, **kwargs) -> str:
    """Build ScraperAPI URL with parameters"""
    if not SCRAPERAPI_KEY:
        raise ValueError("SCRAPERAPI_KEY not set")
    
    params = {
        'api_key': SCRAPERAPI_KEY,
        'url': target_url,
        'render': 'true',
        'country_code': 'us',
        'premium': 'true',
        'session_number': random.randint(1, 100),
    }
    params.update(kwargs)
    
    url_params = '&'.join([f"{k}={v}" for k, v in params.items()])
    return f"{SCRAPERAPI_URL}?{url_params}"

def extract_phone_numbers(html_content: str) -> List[str]:
    """Extract phone numbers from HTML content"""
    phone_patterns = [
        r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b',
        r'\(\d{3}\)\s*\d{3}[-.\s]?\d{4}',
        r'\b\d{10}\b',
        r'\+1\s*\d{3}[-.\s]?\d{3}[-.\s]?\d{4}',
        r'\b1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b',
    ]
    
    phone_numbers = set()
    for pattern in phone_patterns:
        matches = re.findall(pattern, html_content)
        for match in matches:
            phone = re.sub(r'[^\d]', '', match)
            if len(phone) == 10:
                formatted_phone = f"({phone[:3]}) {phone[3:6]}-{phone[6:10]}"
                phone_numbers.add(formatted_phone)
            elif len(phone) == 11 and phone.startswith('1'):
                phone = phone[1:]
                formatted_phone = f"({phone[:3]}) {phone[3:6]}-{phone[6:10]}"
                phone_numbers.add(formatted_phone)
    
    return list(phone_numbers)

def extract_agent_info(soup: BeautifulSoup) -> Dict[str, any]:
    """Extract agent information from parsed HTML"""
    agent_info = {'names': [], 'phones': [], 'companies': []}
    
    # Extract phone numbers from entire page
    phones = extract_phone_numbers(str(soup))
    agent_info['phones'].extend(phones)
    
    # Extract agent names
    html_text = soup.get_text()
    name_patterns = [
        r'\b([A-Z][a-z]+ [A-Z][a-z]+)\b',
        r'\b([A-Z][a-z]+ [A-Z]\. [A-Z][a-z]+)\b',
        r'\b([A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+)\b',
    ]
    
    for pattern in name_patterns:
        matches = re.findall(pattern, html_text)
        for match in matches:
            name = match.strip()
            if (len(name.split()) >= 2 and len(name) < 50 and 
                not any(word.lower() in name.lower() for word in 
                       ['street', 'ave', 'road', 'blvd', 'dr', 'miami', 'florida', 'zillow', 'mls', 'sqft'])):
                agent_info['names'].append(name)
    
    # Extract company names
    company_patterns = [
        r'(?:Brokered by|Listed by|Courtesy of|Listing provided by)\s*:?\s*([A-Za-z][^,\n\.]{5,50})',
        r'\b([A-Z][a-zA-Z\s&]{3,40}(?:Realty|Real Estate|Properties|Group|Team|Associates|Realtors|Brokerage))\b',
        r'\b([A-Z][a-zA-Z\s&]{3,40}(?:RE/MAX|Coldwell|Century|Keller|Compass|eXp))\b',
    ]
    
    for pattern in company_patterns:
        matches = re.findall(pattern, html_text)
        for match in matches:
            company = match.strip()
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
    """Scrape contact information from a property URL using ScraperAPI"""
    for attempt in range(max_retries):
        try:
            log_message(f"   🌐 Attempt {attempt + 1}/{max_retries} - Scraping: {url}")
            
            scraper_url = get_scraperapi_url(url)
            response = requests.get(scraper_url, timeout=60)
            
            if response.status_code == 200:
                log_message(f"   ✅ Successfully fetched page (Length: {len(response.text)} chars)")
                
                soup = BeautifulSoup(response.text, 'html.parser')
                agent_info = extract_agent_info(soup)
                
                log_message(f"   📞 Found: {len(agent_info['phones'])} phones, {len(agent_info['names'])} names, {len(agent_info['companies'])} companies")
                
                if agent_info['phones'] or agent_info['names']:
                    return agent_info
                else:
                    log_message(f"   ⚠️  No contact information found")
                    
            elif response.status_code == 403:
                log_message(f"   ❌ 403 Forbidden - Page blocked")
            elif response.status_code == 404:
                log_message(f"   ❌ 404 Not Found - Property may no longer exist")
                break
            else:
                log_message(f"   ❌ HTTP {response.status_code}: {response.reason}")
                
        except Exception as e:
            log_message(f"   ❌ Attempt {attempt + 1} failed: {str(e)}")
            
        if attempt < max_retries - 1:
            delay = min(10 * (2 ** attempt), 60)
            log_message(f"   ⏱️  Waiting {delay} seconds before retry...")
            time.sleep(delay)
    
    log_message(f"   ❌ Failed to scrape contact info after {max_retries} attempts")
    return None

async def create_contacts_from_scraped_data(agent_info: Dict, lead_id: int) -> int:
    """Create contact records from scraped agent information"""
    contacts_created = 0
    
    # Create contacts pairing names with phones
    if agent_info['names'] and agent_info['phones']:
        pairs = min(len(agent_info['names']), len(agent_info['phones']))
        
        for i in range(pairs):
            try:
                contact_data = {
                    'name': agent_info['names'][i],
                    'phoneNumber': agent_info['phones'][i],
                    'type': ContactType.AGENT,
                    'company': agent_info['companies'][0] if agent_info['companies'] else None,
                    'leads': {'connect': {'id': lead_id}}
                }
                
                contact_data = {k: v for k, v in contact_data.items() if v is not None}
                await prisma.contact.create(data=contact_data)
                contacts_created += 1
                log_message(f"     ✅ Created contact: {agent_info['names'][i]} - {agent_info['phones'][i]}")
                
            except Exception as e:
                log_message(f"     ❌ Error creating contact: {str(e)}")
                
    # Create contacts for remaining phones without names
    remaining_phones = agent_info['phones'][contacts_created:]
    for phone in remaining_phones:
        try:
            contact_data = {
                'phoneNumber': phone,
                'type': ContactType.AGENT,
                'company': agent_info['companies'][0] if agent_info['companies'] else None,
                'leads': {'connect': {'id': lead_id}}
            }
            
            contact_data = {k: v for k, v in contact_data.items() if v is not None}
            await prisma.contact.create(data=contact_data)
            contacts_created += 1
            log_message(f"     ✅ Created contact: Unknown Agent - {phone}")
            
        except Exception as e:
            log_message(f"     ❌ Error creating contact for {phone}: {str(e)}")
    
    return contacts_created

async def process_zillow_contacts() -> bool:
    """Process Zillow leads without contact information"""
    start_time = datetime.now()
    max_end_time = start_time + timedelta(minutes=MAX_RUNTIME_MINUTES)
    
    log_message("📞 Starting contact extraction...")
    
    try:
        # Get leads without contacts
        leads = await prisma.lead.find_many(
            where={
                'source': 'ZILLOW',
                'contacts': {'none': {}},
                'contactFetchAttempts': {'lt': 5},
                'link': {'not': None}
            },
            take=MAX_CONTACTS_TO_PROCESS
        )
        
        if not leads:
            log_message("✅ No leads need contact updates")
            return True
            
        log_message(f"📊 Processing {len(leads)} leads for contacts (max runtime: {MAX_RUNTIME_MINUTES} min)")
        
        total_contacts_created = 0
        total_processed = 0
        total_errors = 0
        
        for lead in leads:
            # Check timeout
            if datetime.now() >= max_end_time:
                log_message(f"⏰ Timeout reached, stopping processing")
                break
                
            try:
                total_processed += 1
                log_message(f"🔍 Lead {total_processed}/{len(leads)} - ID: {lead.zid}")
                
                # Increment attempts
                await prisma.lead.update(
                    where={'id': lead.id},
                    data={'contactFetchAttempts': lead.contactFetchAttempts + 1}
                )
                
                # Scrape contacts
                agent_info = await scrape_property_contacts(lead.link)
                
                if agent_info:
                    contacts_created = await create_contacts_from_scraped_data(agent_info, lead.id)
                    total_contacts_created += contacts_created
                    
                    if contacts_created > 0:
                        log_message(f"   ✅ Created {contacts_created} contacts for lead {lead.zid}")
                    else:
                        log_message(f"   ⚠️  No contacts created for lead {lead.zid}")
                        total_errors += 1
                else:
                    log_message(f"   ❌ Failed to scrape contact info for lead {lead.zid}")
                    total_errors += 1
                
                # Delay between requests
                if total_processed < len(leads):
                    delay = random.uniform(CONTACTS_MIN_DELAY, CONTACTS_MAX_DELAY)
                    log_message(f"   ⏱️  Waiting {delay:.1f} seconds...")
                    time.sleep(delay)
                    
            except Exception as e:
                log_message(f"   ❌ Error processing lead {lead.zid}: {str(e)}")
                total_errors += 1
                continue
        
        runtime = datetime.now() - start_time
        log_message(f"📊 Contacts Summary:")
        log_message(f"- Runtime: {runtime.total_seconds()/60:.1f} minutes")
        log_message(f"- Leads processed: {total_processed}")
        log_message(f"- Contacts created: {total_contacts_created}")
        log_message(f"- Errors: {total_errors}")
        if total_processed > 0:
            log_message(f"- Success rate: {((total_processed - total_errors) / total_processed * 100):.1f}%")
        
        return True
        
    except Exception as e:
        log_message(f"❌ Error in contact processing: {str(e)}")
        return False

# ================== MAIN FUNCTION ==================

async def main():
    parser = argparse.ArgumentParser(description='Complete Zillow Scraper - Listings + Contacts')
    parser.add_argument('--listings-only', action='store_true', help='Only fetch listings')
    parser.add_argument('--contacts-only', action='store_true', help='Only extract contacts')
    parser.add_argument('--skip-contacts', action='store_true', help='Fetch listings but skip contacts')
    parser.add_argument('--skip-proxy-test', action='store_true', help='Skip proxy test (for production)')
    args = parser.parse_args()
    
    start_time = datetime.now()
    log_message("🚀 Starting Complete Zillow Scraper")
    log_message(f"Working directory: {os.getcwd()}")
    
    ensure_data_directory()
    
    # Connect to database
    await prisma.connect()
    
    try:
        success_listings = True
        success_contacts = True
        
        # Step 1: Fetch Listings (unless contacts-only)
        if not args.contacts_only:
            log_message("=" * 50)
            log_message("STEP 1: FETCHING LISTINGS")
            log_message("=" * 50)
            success_listings = await fetch_zillow_listings(skip_proxy_test=args.skip_proxy_test)
            
            if not success_listings:
                log_message("⚠️  Listings fetch failed, but continuing...")
        
        # Step 2: Extract Contacts (unless listings-only or skip-contacts)
        if not args.listings_only and not args.skip_contacts:
            log_message("=" * 50)
            log_message("STEP 2: EXTRACTING CONTACTS")
            log_message("=" * 50)
            
            if not SCRAPERAPI_KEY:
                log_message("❌ SCRAPERAPI_KEY not set, skipping contacts")
                success_contacts = False
            else:
                success_contacts = await process_zillow_contacts()
        elif args.skip_contacts:
            log_message("⚠️  Contact extraction skipped as requested")
        elif args.listings_only:
            log_message("⚠️  Running in listings-only mode")
        
        # Final summary
        runtime = datetime.now() - start_time
        log_message("=" * 50)
        log_message("FINAL SUMMARY")
        log_message("=" * 50)
        log_message(f"Total runtime: {runtime.total_seconds()/60:.1f} minutes")
        log_message(f"Listings: {'✅ Success' if success_listings else '❌ Failed'}")
        log_message(f"Contacts: {'✅ Success' if success_contacts else '❌ Failed/Skipped'}")
        
        if success_listings and success_contacts:
            log_message("🎉 Complete scraper finished successfully!")
        else:
            log_message("⚠️  Scraper completed with some issues")
        
    finally:
        await prisma.disconnect()

if __name__ == "__main__":
    asyncio.run(main()) 