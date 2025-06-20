#!/usr/bin/env python3
"""
Complete Zillow Scraper - Fixed Version with Proper Exit Handling
Handles both property listing fetch and contact extraction with robust timeout and exit logic.

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
import signal
import aiohttp
import gc
import threading
from contextlib import asynccontextmanager

from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

# Database and enums
from prisma import Prisma
from prisma.enums import LeadStatus, ContactType, LeadPriority, LeadSource
import json
# Zillow API
import pyzill
import urllib3
urllib3.disable_warnings()

# ================== CONFIGURATION ==================

# ScraperAPI configuration
SCRAPERAPI_KEY = os.getenv('SCRAPERAPI_KEY', '00d53552daadeff0cbdd543558c909b8')
SCRAPERAPI_URL = "http://api.scraperapi.com"

# Proxy settings for pyzill - Fixed authentication format
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
LISTINGS_MIN_DELAY = 2
LISTINGS_MAX_DELAY = 5
CONTACTS_MIN_DELAY = 1
CONTACTS_MAX_DELAY = 3
CONTACTS_BATCH_SIZE = 3
CONTACTS_BATCH_DELAY = 10
MAX_RETRIES = 2

# Runtime limits - Conservative for cron jobs
MAX_LISTINGS_TO_FETCH = 20
MAX_CONTACTS_TO_PROCESS = 8
MAX_RUNTIME_MINUTES = 6  # Reduced for reliable cron execution

# Timeout settings
REQUEST_TIMEOUT = 30
SCRAPER_TIMEOUT = 25
OPERATION_TIMEOUT = 180  # 3 minutes max

# Directory for storing debug data
DATA_DIR = Path("zillow_data")

# Global state management
class ScraperState:
    def __init__(self):
        self.start_time = datetime.now()
        self.max_runtime = timedelta(minutes=MAX_RUNTIME_MINUTES)
        self.should_stop = False
        self.prisma_client = None
        self.force_exit = False
        self.exit_code = 0
        
    def is_timeout(self) -> bool:
        return datetime.now() - self.start_time >= self.max_runtime or self.should_stop
    
    def remaining_minutes(self) -> float:
        elapsed = datetime.now() - self.start_time
        remaining = self.max_runtime - elapsed
        return max(0, remaining.total_seconds() / 60)
    
    def set_exit(self, code: int = 0):
        self.force_exit = True
        self.exit_code = code
        self.should_stop = True

# Global state instance
state = ScraperState()

# -- Global log collector --
collected_logs: list[dict] = []

def collect_log(message: str, type_: str, name: str = "ZillowScraper"):
    # Add a log to the in-memory list (can be called anywhere in your code)
    collected_logs.append({
        "timestamp": datetime.now().isoformat(),
        "type": type_,
        "name": name,
        "message": message
    })

# ================== SIGNAL HANDLING ==================

def signal_handler(signum, frame):
    """Handle termination signals gracefully"""
    log_message(f"⚠️  Received signal {signum}, initiating graceful shutdown")
    state.set_exit(0)

def setup_signal_handlers():
    """Setup signal handlers for graceful shutdown"""
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    # Don't use SIGALRM as it can cause issues in some environments

# ================== TIMEOUT UTILITIES ==================

async def run_with_timeout(coro, timeout_seconds: int):
    """Run coroutine with timeout protection"""
    try:
        return await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        log_message(f"⚠️  Operation timed out after {timeout_seconds} seconds")
        return None
    except Exception as e:
        log_message(f"⚠️  Operation failed: {str(e)}")
        return None
def run_sync_with_timeout(func, timeout_seconds: int, *args, **kwargs):
    """Run synchronous function with timeout protection"""
    with ThreadPoolExecutor(max_workers=1) as executor:
        try:
            future = executor.submit(func, *args, **kwargs)
            return future.result(timeout=timeout_seconds)
        except FutureTimeoutError:
            log_message(f"⚠️  Sync operation timed out after {timeout_seconds} seconds")
            return None
        except Exception as e:
            log_message(f"⚠️  Sync operation failed: {str(e)}")
            return None

# ================== UTILITY FUNCTIONS ==================

def log_message(message: str):
    """Print timestamped log message with immediate flush"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {message}", flush=True)
    sys.stdout.flush()  # Force flush for immediate output

def ensure_data_directory():
    """Ensure the data directory exists"""
    try:
        DATA_DIR.mkdir(exist_ok=True)
    except Exception as e:
        log_message(f"⚠️  Could not create data directory: {e}")

def get_us_map_bounds() -> Dict:
    """Get map bounds for continental US"""
    return {
        "west": -124.848974,
        "east": -66.885444,
        "south": 24.396308,
        "north": 49.384358
    }

def get_random_proxy():
    """Get a random proxy session for pyzill with proper authentication"""
    try:
        session = random.choice(PROXY_SESSIONS)
        # Format: http://username:password@host:port
        proxy_url = f"http://{session}:{PROXY_PASSWORD}@{PROXY_HOST}:{PROXY_PORT}"
        return proxy_url
    except Exception as e:
        log_message(f"⚠️  Error creating proxy URL: {e}")
        return None

def test_proxy_connection():
    """Test if the proxy connection is working"""
    log_message("Testing proxy connection...")
    try:
        session = PROXY_SESSIONS[0]  # Use first session for testing
        proxy_url = f"http://{session}:{PROXY_PASSWORD}@{PROXY_HOST}:{PROXY_PORT}"
        
        proxies = {
            'http': proxy_url,
            'https': proxy_url
        }
        
        response = requests.get(
            'https://httpbin.org/ip', 
            proxies=proxies, 
            timeout=15,
            verify=False
        )
        
        if response.status_code == 200:
            data = response.json()
            log_message(f"✅ Proxy connection successful! IP: {data.get('origin', 'Unknown')}")
            return True
        else:
            log_message(f"❌ Proxy test failed with status: {response.status_code}")
            return False
            
    except Exception as e:
        log_message(f"❌ Proxy test failed: {str(e)}")
        return False

# ================== DATABASE CONTEXT MANAGER ==================

@asynccontextmanager
async def get_prisma_client():
    """Context manager for Prisma client with proper cleanup"""
    client = Prisma()
    try:
        await client.connect()
        state.prisma_client = client
        log_message("✅ Database connected successfully")
        collect_log("✅ Database connected successfully", type_="SUCCESS", name="DB_Connectivity")
        yield client
    except Exception as e:
        log_message(f"❌ Database connection failed: {e}")
        collect_log(f"❌ Database connection failed: {e}", type_="ERROR", name="DB_Connectivity")
        raise
    finally:
        try:
            if client.is_connected():
                await client.disconnect()
                log_message("✅ Database disconnected")
                collect_log("✅ Database disconnected", type_="SUCCESS", name="DB_Connectivity")
        except Exception as e:
            log_message(f"⚠️ Error disconnecting database: {e}")
            collect_log(f"⚠️ Error disconnecting database: {e}", type_="ERROR", name="DB_Connectivity")
        finally:
            state.prisma_client = None

# ================== LISTINGS FUNCTIONS ==================

async def save_listing_to_db(listing: Dict, prisma: Prisma) -> tuple[str, Optional[int]]:
    """Save a listing to the database and return status and lead ID"""
    try:
        if state.is_timeout():
            return "timeout", None
            
        zpid = str(listing.get('zpid', ''))
        if not zpid:
            return "error", None
            
        # Check if listing already exists
        existing = await run_with_timeout(
            prisma.lead.find_unique(where={'zid': zpid}),
            5
        )
        
        if existing is None:  # Timeout
            return "timeout", None
        elif existing:  # Record exists
            return "exists", existing.id
            
        # Prepare listing data
        zip_code = listing.get('addressZipcode', '') or listing.get('zipCode', '') or 'Unknown'
        city = listing.get('addressCity', '') or 'Unknown'
        state_code = listing.get('addressState', '') or 'Unknown'
        region = f"{city}, {state_code}"
        
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
        
        new_lead = await run_with_timeout(
            prisma.lead.create(data=listing_data),
            5
        )
        collect_log("✅ Lead created successfully", type_="SUCCESS", name="Lead_Creation")
        return ("created", new_lead.id) if new_lead else ("timeout", None)
        
    except Exception as e:
        log_message(f"Error saving listing: {str(e)}")
        collect_log(f"Error saving listing: {str(e)}", type_="ERROR", name="Lead_Creation")
        return "error", None

async def fetch_zillow_listings(prisma: Prisma, skip_proxy_test: bool = False) -> bool:
    """Fetch listings from Zillow using pyzill"""
    log_message("🏠 Starting Zillow listings fetch...")
    
    try:
        if state.is_timeout():
            log_message("⚠️  Global timeout reached, skipping listings")
            return False
        
        # Test proxy connection unless skipped
        proxy_working = False
        if not skip_proxy_test:
            proxy_working = run_sync_with_timeout(test_proxy_connection, 20)
            if proxy_working is None:
                log_message("❌ Proxy test timed out")
                collect_log("❌ Proxy test timed out", type_="ERROR", name="Proxy_Test")
            elif not proxy_working:
                log_message("⚠️  Proxy test failed, will try without proxy")
                collect_log("⚠️  Proxy test failed, will try without proxy", type_="WARNING", name="Proxy_Test")
        else:
            log_message("⚠️ Skipping proxy test")
            proxy_working = True  # Assume it works
            collect_log("⚠️ Skipping proxy test", type_="WARNING", name="Proxy_Test")
        
        # Get map bounds
        bounds = get_us_map_bounds()
        
        # Fetch listings function
        def fetch_listings():
            proxy_url = None
            if proxy_working:
                proxy_url = get_random_proxy()
                log_message(f"Using proxy: {proxy_url is not None}")
                collect_log(f"Using proxy: {proxy_url is not None}", type_="SUCCESS", name="Proxy_Test")
            
            try:
                return pyzill.for_sale(
                    pagination=1,
                    search_value="",
                    ne_lat=bounds["north"],
                    ne_long=bounds["east"],
                    sw_lat=bounds["south"],
                    sw_long=bounds["west"],
                    zoom_value=5,
                    proxy_url=proxy_url
                )
            except Exception as e:
                if proxy_url:
                    log_message(f"⚠️  Proxy request failed: {e}")
                    log_message("🔄 Retrying without proxy...")
                    collect_log(f"⚠️  Proxy request failed: {e} 🔄 Retrying without proxy...", type_="WARNING", name="Proxy_Test")
                    return pyzill.for_sale(
                        pagination=1,
                        search_value="",
                        ne_lat=bounds["north"],
                        ne_long=bounds["east"],
                        sw_lat=bounds["south"],
                        sw_long=bounds["west"],
                        zoom_value=5,
                        proxy_url=None
                    )
                else:
                    raise

        # Execute with timeout
        response = run_sync_with_timeout(fetch_listings, OPERATION_TIMEOUT)
        
        if response is None:
            log_message("❌ Listings fetch timed out or failed")
            collect_log("❌ Listings fetch timed out or failed", type_="ERROR", name="Zillow_List_Fetch")
            return False

        if not response or not isinstance(response, dict):
            log_message("❌ No valid response received from Zillow")
            collect_log("❌ No valid response received from Zillow", type_="ERROR", name="Zillow_List_Fetch")
            return False
            
        # Extract results
        results = []
        for key in ['listResults', 'mapResults', 'cat1', 'results']:
            if key in response:
                results = response[key]
                log_message(f"Found {len(results)} listings in '{key}' key")
                collect_log(f"Found {len(results)} listings in '{key}' key", type_="SUCCESS", name="Zillow_List_Fetch")
                break
                
        if not results:
            log_message("❌ No listings found in response")
            collect_log("❌ No listings found in response", type_="ERROR", name="Zillow_List_Fetch")
            return False
        
        # Process listings
        new_count = existing_count = error_count = timeout_count = 0
        
        for idx, result in enumerate(results[:MAX_LISTINGS_TO_FETCH]):
            if state.is_timeout():
                log_message(f"⚠️ Global timeout reached at listing {idx}")
                collect_log(f"⚠️ Global timeout reached at listing {idx}", type_="WARNING", name="Zillow_List_Fetch")
                break
                
            try:
                if not isinstance(result, dict):
                    error_count += 1
                    continue
                
                status, lead_id = await save_listing_to_db(result, prisma)
                
                if status == "created":
                    new_count += 1
                    log_message(f"✅ Created listing {idx+1}: ID {lead_id}")
                    collect_log(f"✅ Created listing {idx+1}: ID {lead_id}", type_="SUCCESS", name="Zillow_List_Fetch")
                elif status == "exists":
                    existing_count += 1
                elif status == "timeout":
                    timeout_count += 1
                    break
                else:
                    error_count += 1
                    
            except Exception as e:
                log_message(f"Error processing listing {idx}: {str(e)}")
                collect_log(f"Error processing listing {idx}: {str(e)}", type_="ERROR", name="Zillow_List_Fetch")
                error_count += 1
            
            # Small delay between listings
            if idx < len(results) - 1 and not state.is_timeout():
                await asyncio.sleep(random.uniform(0.2, 0.8))
        
        log_message(f"📊 Listings Summary: {new_count} new, {existing_count} existing, {error_count} errors, {timeout_count} timeouts")
        collect_log(f"📊 Listings Summary: {new_count} new, {existing_count} existing, {error_count} errors, {timeout_count} timeouts", type_="SUCCESS", name="Zillow_List_Fetch")
        return True
                
    except Exception as e:
        log_message(f"❌ Error fetching listings: {str(e)}")
        collect_log(f"❌ Error fetching listings: {str(e)}", type_="ERROR", name="Zillow_List_Fetch")
        return False

# ================== CONTACT FUNCTIONS ==================

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
    """Extract agent information from Zillow property page HTML"""
    agent_info = {'names': [], 'phones': [], 'companies': []}
    
    try:
        # Extract phone numbers
        phones = extract_phone_numbers(str(soup))
        agent_info['phones'].extend(phones[:5])  # Limit phones
        
        # Extract agent names - simplified version
        page_text = soup.get_text()
        
        # Look for "Listed by" patterns
        listed_by_patterns = [
            r'Listed by\s+([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        ]
        
        agent_names = set()
        for pattern in listed_by_patterns:
            matches = re.findall(pattern, page_text, re.IGNORECASE)
            for match in matches:
                name = match.strip()
                if is_valid_agent_name(name):
                    agent_names.add(name)
        
        # Look for company information
        companies = set()
        company_patterns = [
            r'([A-Z][a-zA-Z\s&\-]{3,50}(?:Realty|Real Estate|Properties|Group|Team|Associates|Realtors?))',
            r'(RE/MAX[A-Za-z\s&\-]*)',
            r'(Coldwell Banker[A-Za-z\s&\-]*)',
            r'(Century 21[A-Za-z\s&\-]*)',
        ]
        
        for pattern in company_patterns:
            matches = re.findall(pattern, page_text, re.IGNORECASE)
            for match in matches[:3]:  # Limit matches
                company = match.strip()
                if is_valid_company_name(company):
                    companies.add(company)
        
        agent_info['names'] = list(agent_names)[:3]  # Limit names
        agent_info['companies'] = list(companies)[:3]  # Limit companies
        
        return agent_info
        
    except Exception as e:
        log_message(f" ❌ Error extracting agent info: {str(e)}")
        collect_log(f" ❌ Error extracting agent info: {str(e)}", type_="ERROR", name="Agent_Info_Fetch")
        return {'names': [], 'phones': [], 'companies': []}

def is_valid_agent_name(name: str) -> bool:
    """Check if extracted text is likely a real estate agent name"""
    if not name or len(name) < 4 or len(name) > 50:
        return False
    
    parts = name.split()
    if len(parts) < 2:
        return False
    
    # Basic validation
    property_terms = {
        'electric', 'water', 'kitchen', 'bedroom', 'bathroom', 'garage',
        'listing', 'property', 'home', 'house', 'price', 'sold', 'new'
    }
    
    for part in parts:
        if part.lower() in property_terms:
            return False
        if not part.replace('.', '').isalpha():
            return False
    
    return True

def is_valid_company_name(company: str) -> bool:
    """Check if extracted text is likely a real estate company name"""
    if not company or len(company) < 5 or len(company) > 80:
        return False
    
    company_lower = company.lower()
    real_estate_terms = [
        'realty', 'real estate', 'properties', 'group', 'team', 'associates',
        'realtors', 'realtor', 'brokerage', 're/max', 'coldwell', 'century'
    ]
    
    return any(term in company_lower for term in real_estate_terms)

async def scrape_property_contacts(url: str) -> Optional[Dict]:
    """Scrape contact information from a property URL"""
    try:
        scraper_url = get_scraperapi_url(url)
        
        def make_request():
            return requests.get(scraper_url, timeout=REQUEST_TIMEOUT)
        
        response = run_sync_with_timeout(make_request, REQUEST_TIMEOUT + 10)
        
        if response and response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            agent_info = extract_agent_info(soup)
            
            if agent_info['phones'] or agent_info['names']:
                return agent_info
                
    except Exception as e:
        log_message(f"❌ Error scraping {url}: {str(e)}")
        collect_log(f"❌ Error scraping {url}: {str(e)}", type_="ERROR", name="Property_Contacts_Fetch")
    
    return None

async def create_contacts_from_scraped_data(agent_info: Dict, lead_id: int, prisma: Prisma) -> int:
    """Create contact records from scraped agent information"""
    contacts_created = 0
    
    try:
        # Create contacts pairing names with phones
        if agent_info['names'] and agent_info['phones']:
            pairs = min(len(agent_info['names']), len(agent_info['phones']))
            
            for i in range(pairs):
                contact_data = {
                    'name': agent_info['names'][i],
                    'phoneNumber': agent_info['phones'][i],
                    'type': ContactType.AGENT,
                    'company': agent_info['companies'][0] if agent_info['companies'] else None,
                    'leads': {'connect': {'id': lead_id}}
                }
                
                contact_data = {k: v for k, v in contact_data.items() if v is not None}
                
                result = await run_with_timeout(
                    prisma.contact.create(data=contact_data),
                    5
                )
                
                if result:
                    contacts_created += 1
                    log_message(f"✅ Created: {agent_info['names'][i]} - {agent_info['phones'][i]}")
                    collect_log(f"✅ Created: {agent_info['names'][i]} - {agent_info['phones'][i]}", type_="SUCCESS", name="Contacts_From_ScrapedData")
        
        # Create remaining phone contacts
        remaining_phones = agent_info['phones'][contacts_created:]
        for phone in remaining_phones[:2]:  # Limit remaining phones
            contact_data = {
                'phoneNumber': phone,
                'type': ContactType.AGENT,
                'company': agent_info['companies'][0] if agent_info['companies'] else None,
                'leads': {'connect': {'id': lead_id}}
            }
            
            result = await run_with_timeout(
                prisma.contact.create(data=contact_data),
                5
            )
            
            if result:
                contacts_created += 1
                log_message(f"✅ Created: Unknown - {phone}")
                collect_log(f"✅ Created: Unknown - {phone}", type_="SUCCESS", name="Contacts_From_ScrapedData")
    
    except Exception as e:
        log_message(f"❌ Error creating contacts: {str(e)}")
        collect_log(f"❌ Error creating contacts: {str(e)}", type_="ERROR", name="Contacts_From_ScrapedData")
    
    return contacts_created

async def process_zillow_contacts(prisma: Prisma) -> bool:
    """Process Zillow leads without contact information"""
    log_message("📞 Starting contact extraction...")
    
    try:
        # Get leads without contacts
        leads = await run_with_timeout(
            prisma.lead.find_many(
                where={
                    'source': 'ZILLOW',
                    'contacts': {'none': {}},
                    'contactFetchAttempts': {'lt': 3},
                    'link': {'not': None}
                },
                take=MAX_CONTACTS_TO_PROCESS
            ),
            10
        )
        
        if not leads:
            log_message("✅ No leads need contact updates")
            collect_log("✅ No leads need contact updates", type_="SUCCESS", name="Contacts_Process")
            return True
        
        log_message(f"📊 Processing {len(leads)} leads for contacts")
        collect_log(f"📊 Processing {len(leads)} leads for contacts", type_="SUCCESS", name="Contacts_Process")
        
        total_contacts_created = 0
        total_processed = 0
        
        for lead in leads:
            if state.is_timeout():
                log_message(f"⚠️ Timeout reached, stopping at lead {total_processed}")
                collect_log(f"⚠️ Timeout reached, stopping at lead {total_processed}", type_="WARNING", name="Contacts_Process")
                break
                
            try:
                total_processed += 1
                log_message(f"🔍 Lead {total_processed}/{len(leads)} - {lead.zid}")
                collect_log(f"🔍 Lead {total_processed}/{len(leads)} - {lead.zid}", type_="SUCCESS", name="Contacts_Process")
                
                # Increment attempts
                await run_with_timeout(
                    prisma.lead.update(
                        where={'id': lead.id},
                        data={'contactFetchAttempts': lead.contactFetchAttempts + 1}
                    ),
                    5
                )
                
                # Scrape contacts
                agent_info = await scrape_property_contacts(lead.link)
                
                if agent_info:
                    contacts_created = await create_contacts_from_scraped_data(agent_info, lead.id, prisma)
                    total_contacts_created += contacts_created
                    
                    if contacts_created > 0:
                        log_message(f"✅ Created {contacts_created} contacts")
                        collect_log(f"✅ Created {contacts_created} contacts", type_="SUCCESS", name="Contacts_Process")
                    else:
                        log_message(f"⚠️ No contacts created")
                        collect_log(f"⚠️ No contacts created", type_="WARNING", name="Contacts_Process")
                else:
                    log_message(f"❌ No contact info found")
                    collect_log(f"❌ No contact info found", type_="ERROR", name="Contact_Process")
                
                # Delay between requests
                if total_processed < len(leads) and not state.is_timeout():
                    delay = random.uniform(CONTACTS_MIN_DELAY, CONTACTS_MAX_DELAY)
                    await asyncio.sleep(delay)
                    
            except Exception as e:
                log_message(f"❌ Error processing lead: {str(e)}")
                collect_log(f"❌ Error processing lead: {str(e)}", type_="ERROR", name="Contact_Process")
        
        log_message(f"📊 Contacts Summary: {total_processed} processed, {total_contacts_created} contacts created")
        collect_log(f"📊 Contacts Summary: {total_processed} processed, {total_contacts_created} contacts created", type_="SUCCESS", name="Contact_Process")
        return True
        
    except Exception as e:
        log_message(f"❌ Error in contact processing: {str(e)}")
        collect_log(f"❌ Error in contact processing: {str(e)}",type_="ERROR", name="Contact_Process")
        return False
# ================== MAIN FUNCTION ==================

async def main():
    """Main execution function with proper error handling and cleanup"""
    parser = argparse.ArgumentParser(description='Complete Zillow Scraper - Listings + Contacts')
    parser.add_argument('--listings-only', action='store_true', help='Only fetch listings')
    parser.add_argument('--contacts-only', action='store_true', help='Only extract contacts')
    parser.add_argument('--skip-contacts', action='store_true', help='Skip contacts')
    parser.add_argument('--skip-proxy-test', action='store_true', help='Skip proxy test')
    args = parser.parse_args()
    
    start_time = datetime.now()
    log_message("🚀 Starting Complete Zillow Scraper")
    log_message(f"Max runtime: {MAX_RUNTIME_MINUTES} minutes")
    collect_log(f"🚀 Starting Complete Zillow Scraper, Max runtime: {MAX_RUNTIME_MINUTES} minutes", type_="SUCCESS", name="Scraping_Process")
    
    ensure_data_directory()
    setup_signal_handlers()
    
    success_listings = True
    success_contacts = True
    
    try:
        async with get_prisma_client() as prisma:
            # Step 1: Fetch Listings
            if not args.contacts_only:
                log_message("=" * 50)
                log_message("STEP 1: FETCHING LISTINGS")
                log_message("=" * 50)
                
                try:
                    success_listings = await fetch_zillow_listings(prisma, args.skip_proxy_test)
                    log_message(f"Listings: {'✅ Success' if success_listings else '❌ Failed'}")
                except Exception as e:
                    log_message(f"❌ Listings error: {e}")
                    success_listings = False
            
            # Step 2: Extract Contacts
            if not args.listings_only and not args.skip_contacts and not state.is_timeout():
                log_message("=" * 50)
                log_message("STEP 2: EXTRACTING CONTACTS")
                log_message("=" * 50)
                
                if not SCRAPERAPI_KEY:
                    log_message("❌ SCRAPERAPI_KEY not set, skipping contacts")
                    success_contacts = False
                else:
                    try:
                        success_contacts = await process_zillow_contacts(prisma)
                        log_message(f"Contacts: {'✅ Success' if success_contacts else '❌ Failed'}")
                    except Exception as e:
                        log_message(f"❌ Contacts error: {e}")
                        success_contacts = False
            
            # Final summary
            runtime = datetime.now() - start_time
            log_message("=" * 50)
            log_message("FINAL SUMMARY")
            log_message("=" * 50)
            log_message(f"Runtime: {runtime.total_seconds()/60:.1f} minutes")
            collect_log(f"Runtime: {runtime.total_seconds()/60:.1f} minutes", type_="SUCCESS", name="Scraping_Process")
            log_message(f"Listings: {'✅ Success' if success_listings else '❌ Failed'}")
            collect_log(f"Listings: {'✅ Success' if success_listings else '❌ Failed'}", type_="SUCCESS", name="Scraping_Process")
            log_message(f"Contacts: {'✅ Success' if success_contacts else '❌ Failed/Skipped'}")
            collect_log(f"Contacts: {'✅ Success' if success_contacts else '❌ Failed/Skipped'}", type_="SUCCESS", name="Scraping_Process")
            
            if success_listings and success_contacts:
                log_message("🎉 Scraper completed successfully!")
                collect_log("🎉 Scraper completed successfully!", type_="SUCCESS", name="Scraping_Process")
                return True
            else:
                log_message("⚠️ Scraper completed with issues")
                collect_log("⚠️ Scraper completed with issues", type_="WARNING", name="Scraping_Process")
                return False
                
    except Exception as e:
        log_message(f"❌ Critical error: {e}")
        collect_log(f"❌ Critical error: {e}", type_="ERROR", name="Scraping_Process")
        import traceback
        traceback.print_exc()
        return False


async def safe_cleanup():
    """Perform safe cleanup of resources"""
    log_message("🧹 Performing cleanup...")
    
    try:
        # Cancel all tasks except the current one
        current_task = asyncio.current_task()
        tasks = [task for task in asyncio.all_tasks() if task != current_task and not task.done()]
        
        if tasks:
            log_message(f"Cancelling {len(tasks)} running tasks...")
            for task in tasks:
                task.cancel()
            
            # Wait for tasks to be cancelled with timeout
            try:
                await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=5.0)
                log_message("✅ All tasks cancelled successfully")
            except asyncio.TimeoutError:
                log_message("⚠️  Some tasks didn't cancel within timeout")
        
        # Close any open aiohttp sessions
        try:
            import aiohttp
            # Force close any unclosed sessions
            connector = aiohttp.TCPConnector()
            await connector.close()
            log_message("✅ HTTP sessions closed")
        except Exception as e:
            log_message(f"⚠️  Error closing HTTP sessions: {e}")
        
        # Close any open file handles
        try:
            import gc
            gc.collect()
            log_message("✅ Garbage collection completed")
        except Exception as e:
            log_message(f"⚠️  Error during garbage collection: {e}")
            
        log_message("✅ Cleanup completed")
        
    except Exception as e:
        log_message(f"❌ Error during cleanup: {e}")


async def cleanup_and_exit():
    """Final cleanup before script termination"""
    try:
        await safe_cleanup()
        
        # Additional cleanup for database connections
        try:
            # Close any remaining database connections
            log_message("🔌 Closing database connections...")
            # Add any specific database cleanup here if needed
        except Exception as e:
            log_message(f"⚠️  Error closing database connections: {e}")
            
        # Final memory cleanup
        import gc
        gc.collect()
        
    except Exception as e:
        log_message(f"❌ Error during final cleanup: {e}")


def setup_signal_handlers():
    """Setup signal handlers for graceful shutdown"""
    import signal
    
    def signal_handler(signum, frame):
        log_message(f"🛑 Received signal {signum}, initiating graceful shutdown...")
        state.set_timeout(True)
        
        # Run cleanup in the event loop
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(cleanup_and_exit())
        except Exception as e:
            log_message(f"❌ Error in signal handler: {e}")
    
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)


def ensure_data_directory():
    """Ensure data directory exists"""
    try:
        import os
        data_dir = "data"
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
            log_message(f"📁 Created data directory: {data_dir}")
    except Exception as e:
        log_message(f"❌ Error creating data directory: {e}")

from typing import cast, Any
async def save_collected_logs_to_db(prisma: Prisma, type_: str = "SUCCESS", name: str = "BatchRun"):
    print(f"collected logs: {collected_logs}")
    log_message(f"collected logs: {collected_logs}")

    if not collected_logs:
        return
    try:
        await prisma.log.create(
            data={
                "type": type_,
                "name": name,
                "logData": cast(Any, collected_logs),  # ✅ Tell Prisma "trust me, this is JSON"
            }
        )
        collected_logs.clear()  # Reset for next batch
    except Exception as e:
        print(f"Failed to save logs: {e}")

if __name__ == "__main__":
    print("🟢 Script started")
    
    # For Render cron jobs, we need aggressive cleanup
    import gc
    
    try:
        # Run the main function
        success = asyncio.run(main())
        
        # Force cleanup
        asyncio.run(cleanup_and_exit())
        
        if success:
            print("✅ Script finished successfully")
            log_message("✅ Script finished successfully")
        else:
            print("⚠️  Script finished with issues")
            log_message("⚠️  Script finished with issues")
            
    except KeyboardInterrupt:
        print("🛑 Script interrupted by user")
        log_message("🛑 Script interrupted by user")
    except Exception as e:
        print(f"❌ Script failed with error: {e}")
        log_message(f"❌ Script failed with error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("🔚 Forcing script termination")
        try:
            # Save logs and cleanup using an async function
            import asyncio

            async def _save_logs_and_cleanup():
                from prisma import Prisma
                async with get_prisma_client() as prisma:
                    await save_collected_logs_to_db(prisma, type_="SUCCESS", name="ZillowBatch")

            asyncio.run(_save_logs_and_cleanup())

            # Close any remaining file descriptors
            import platform
            if platform.system() != "Windows":
                import resource
            max_fd = resource.getrlimit(resource.RLIMIT_NOFILE)[1]
            for fd in range(3, min(max_fd, 256)):  # Skip stdin, stdout, stderr
                try:
                    os.close(fd)
                except OSError:
                    pass
        except Exception as e:
            print(f"❌ Error during final log save or cleanup: {e}")

        # Force garbage collection
        gc.collect()

        # Force exit the process
        os._exit(0 if 'success' in locals() and success else 1)