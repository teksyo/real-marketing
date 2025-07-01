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
import itertools

from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

# Database and enums
from prisma import Prisma
from prisma.enums import LeadStatus, ContactType, LeadPriority, LeadSource

# Zillow API
import pyzill
import urllib3
urllib3.disable_warnings()

# ================== CONFIGURATION ==================

# ScraperAPI configuration
SCRAPERAPI_KEY = os.getenv('SCRAPERAPI_KEY', '00d53552daadeff0cbdd543558c909b8')

RAPIDAPI_KEY = "11b08ddccamsh284e03f292010c1p161205jsnae7557d35c9a"
HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": "skip-tracing-working-api.p.rapidapi.com"
}

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
MAX_RUNTIME_MINUTES = 180  # Reduced for reliable cron execution

# Timeout settings
REQUEST_TIMEOUT = 60
SCRAPER_TIMEOUT = 55
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

# List of user agents for randomization
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0",
    # Add more user agents as needed
]

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

def get_state_bounds(state_code: str) -> Dict:
    """Get map bounds for a specific state"""
    state_bounds = {
        "GA": {  # Georgia
            "west": -85.605165,
            "east": -80.751429,
            "south": 30.355644,
            "north": 35.000659
        },
        "LA": {  # Louisiana
            "west": -94.043147,
            "east": -88.758388,
            "south": 28.855127,
            "north": 33.019457
        },
        "FL": {  # Florida
            "west": -87.634938,
            "east": -79.974306,
            "south": 24.396308,
            "north": 31.000888
        }
    }
    return state_bounds.get(state_code.upper())

def get_us_map_bounds() -> Dict:
    """Get combined map bounds for GA, LA, and FL"""
    # Combine bounds to cover all three states
    return {
        "west": -94.043147,  # Westernmost point (Louisiana)
        "east": -79.974306,  # Easternmost point (Florida)
        "south": 24.396308,  # Southernmost point (Florida)
        "north": 35.000659   # Northernmost point (Georgia)
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
        yield client
    except Exception as e:
        log_message(f"❌ Database connection failed: {e}")
        raise
    finally:
        try:
            if client.is_connected():
                await client.disconnect()
                log_message("✅ Database disconnected")
        except Exception as e:
            log_message(f"⚠️  Error disconnecting database: {e}")
        finally:
            state.prisma_client = None

# ================== LISTINGS FUNCTIONS ==================

async def save_listing_to_db(listing: Dict, prisma: Prisma) -> tuple[str, Optional[int]]:
    try:
        if state.is_timeout():
            return "timeout", None

        zpid = str(listing.get('zpid', ''))
        if not zpid:
            return "error", None

        existing = await prisma.lead.find_unique(where={'zid': zpid})
        if existing:
            return "exists", existing.id

        zip_code = listing.get('addressZipcode', '') or listing.get('zipCode', '') or 'Unknown'
        city = listing.get('addressCity', '') or 'Unknown'
        state_code = listing.get('addressState', '') or 'Unknown'
        region = f"{city}, {state_code}"

        if state_code not in ['GA', 'LA', 'FL']:
            return "skip", None

        address_str = listing.get('address', '')
        street = listing.get('addressStreet', '') or address_str.split(',')[0].strip()

        # Build address dict for API call
        api_address = {
            "street": street,
            "city": city,
            "state": state_code,
            "zipcode": zip_code
        }

        # Get full name and phone from rapid API
        # contact_info = await rapid_agent_info(api_address)
        contact_info = None
        full_name = contact_info["name"] if contact_info else None
        phone = contact_info["phone"] if contact_info else None

        listing_data = {
            'zid': zpid,
            'fullName': full_name,
            'phoneNumber': phone,
            'address': address_str or None,
            'price': str(listing.get('unformattedPrice', '')) or None,
            'beds': str(listing.get('beds', '')) or None,
            'link': listing.get('detailUrl', '') or None,
            'zipCode': zip_code,
            'region': region,
            'status': LeadStatus.NEW,
            'priority': LeadPriority.MEDIUM,
            'source': LeadSource.ZILLOW,
            'contactFetchAttempts': 1 if contact_info else 0
        }

        new_lead = await prisma.lead.create(data=listing_data)
        return ("created", new_lead.id) if new_lead else ("timeout", None)

    except Exception as e:
        log_message(f"Error saving listing: {str(e)}")
        return "error", None

def get_property_by_zpid(zpid: str, proxy_url: Optional[str] = None) -> Optional[Dict]:
    """Fetch property details by ZPID using pyzill"""
    log_message(f"Fetching property by ZPID: {zpid}")
    try:
        from pyzill import Zill         # Correct import
        
        # Manually create a session and call the method
        zill = Zill()
        details = zill.get_property_by_zpid(zpid, proxy_url=proxy_url)
        
        if details and isinstance(details, dict):
            log_message(f"✅ Successfully fetched details for ZPID {zpid}")
            return details
        else:
            log_message(f"⚠️  No details returned for ZPID {zpid}")
            return None
            
    except Exception as e:
        log_message(f"❌ Error fetching property by ZPID {zpid}: {e}")
        return None

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
            elif not proxy_working:
                log_message("⚠️  Proxy test failed, will try without proxy")
        else:
            log_message("⚠️  Skipping proxy test")
            proxy_working = True  # Assume it works
        
        # Target states
        target_states = ['GA', 'LA', 'FL']
        total_new_count = 0
        total_existing_count = 0
        total_error_count = 0
        total_skipped_count = 0
        
        # Fetch listings for each state
        for state_code in target_states:
            if state.is_timeout():
                log_message(f"⚠️  Global timeout reached, stopping at state {state_code}")
                break
                
            log_message(f"\n📍 Fetching listings for {state_code}...")
            bounds = get_state_bounds(state_code)
            
            if not bounds:
                log_message(f"❌ No bounds found for state {state_code}")
                continue
            
            # Fetch listings function
            def fetch_listings():
                session_cycle = itertools.cycle(PROXY_SESSIONS)  # Infinite rotation
                max_attempts = len(PROXY_SESSIONS) * 2  # Try each session twice before giving up
                page = 1
                all_results = []
                total_count = None
                # Remove max_pages limit to fetch all pages
                while True:
                    for attempt in range(max_attempts):
                        session = next(session_cycle)
                        proxy_url = f"http://{session}:{PROXY_PASSWORD}@{PROXY_HOST}:{PROXY_PORT}"
                        user_agent = random.choice(USER_AGENTS)
                        log_message(f"Using proxy session: {session} with User-Agent: {user_agent} (page {page})")
                        try:
                            response = pyzill.for_sale(
                                pagination=page,
                                search_value=state_code,
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
                            break
                        except Exception as e:
                            log_message(f"⚠️  Proxy session {session} failed: {e}")
                            continue
                    else:
                        log_message("❌ All proxy sessions failed for this page.")
                        break

                    results = response.get('listResults', [])
                    log_message(f"Fetched {len(results)} listings from page {page} for {state_code}")
                    if not results:
                        log_message(f"No more results for {state_code} at page {page}. Stopping.")
                        break
                    all_results.extend(results)
                    page += 1
                    # Add a random delay between requests (1-3 seconds)
                    asyncio.sleep(random.uniform(1, 3))
                return all_results, total_count

            # Execute with timeout
            results, total_results = run_sync_with_timeout(fetch_listings, OPERATION_TIMEOUT)
            
            if results is None:
                log_message(f"❌ Listings fetch timed out or failed for {state_code}")
                continue

            if not results or not isinstance(results, list):
                log_message(f"❌ No valid response received from Zillow for {state_code}")
                continue

            # Log the number of listings fetched
            log_message(f"Fetched {len(results)} listings for {state_code} (all pages fetched)")
            
            # Process all fetched listings (no MAX_LISTINGS_TO_FETCH limit)
            new_count = existing_count = error_count = skipped_count = 0
            
            for idx, result in enumerate(results):
                if state.is_timeout():
                    log_message(f"⚠️  Global timeout reached at listing {idx}")
                    break
   
                try:
                    if not isinstance(result, dict):
                        error_count += 1
                        continue
                    
                    status, lead_id = await save_listing_to_db(result, prisma)
                    
                    if status == "created":
                        new_count += 1
                        log_message(f"✅ Created listing {idx+1}: ID {lead_id}")
                    elif status == "exists":
                        existing_count += 1
                    elif status == "timeout":
                        error_count += 1
                        break
                    elif status == "skip":
                        skipped_count += 1
                    else:
                        error_count += 1
                        
                except Exception as e:
                    log_message(f"Error processing listing {idx}: {str(e)}")
                    error_count += 1
                
                # Small delay between listings
                if idx < len(results) - 1 and not state.is_timeout():
                    await asyncio.sleep(random.uniform(0.2, 0.8))
            
            log_message(f"\n📊 {state_code} Summary: {new_count} new, {existing_count} existing, {error_count} errors, {skipped_count} skipped")
            
            # Update totals
            total_new_count += new_count
            total_existing_count += existing_count
            total_error_count += error_count
            total_skipped_count += skipped_count
            
            # Delay between states
            if not state.is_timeout() and state_code != target_states[-1]:
                await asyncio.sleep(random.uniform(2, 5))
            
            # Print the total number of results reported by Zillow for this state
            if total_results is not None:
                log_message(f"🌐 Zillow reports {total_results} total results for {state_code}")
            else:
                log_message(f"⚠️  Could not find total result count in response for {state_code}")
        
        log_message(f"\n📊 Overall Summary:")
        log_message(f"- New leads: {total_new_count}")
        log_message(f"- Existing leads: {total_existing_count}")
        log_message(f"- Errors: {total_error_count}")
        log_message(f"- Skipped (out of state): {total_skipped_count}")
        return True
                
    except Exception as e:
        log_message(f"❌ Error fetching listings: {str(e)}")
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

def extract_phone_numbers(text_content: str) -> List[str]:
    """Extract phone numbers from a string of text."""
    phone_patterns = [
        r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b',
        r'\(\d{3}\)\s*\d{3}[-.\s]?\d{4}',
        r'\b\d{10}\b',
        r'\+1\s*\d{3}[-.\s]?\d{3}[-.\s]?\d{4}',
    ]
    
    phone_numbers = set()
    for pattern in phone_patterns:
        matches = re.findall(pattern, text_content)
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

def extract_agent_info(soup: BeautifulSoup) -> List[Dict[str, str]]:
    # 🧪 Save full HTML for inspection
    with open("full_page_debug.html", "w", encoding="utf-8") as f:
        f.write(soup.prettify())

    # Step 1: Find the <script> tag that contains 'listedBy'
    for script in soup.find_all("script"):
        if 'listedBy' in script.text:
            script_text = script.text
            break
    else:
        return []

    # Save the matched <script> block
    with open("scraped_script_debug.html", "w", encoding="utf-8") as f:
        f.write(script_text)

    # Step 2: Match the escaped "listedBy" JSON block
    match = re.search(r'\\"listedBy\\":(\[.*?\])', script_text, re.DOTALL)
    if not match:
        return []

    # Save just the listedBy JSON block
    listed_by_str = match.group(1)
    with open("listed_by_debug.json", "w", encoding="utf-8") as f:
        f.write(listed_by_str)

    # Initialize variables
    agent_name = agent_phone = company = None

    try:
        # Extract agent name
        name_match = re.search(r'\\"id\\":\s*\\"NAME\\".*?\\"text\\":\s*\\"([^"\\]*)\\"', listed_by_str)
        if name_match:
            agent_name = name_match.group(1)
            log_message(f"Found agent name: {agent_name}")
        else:
            log_message("No agent name found in regex match")

        # Extract phone
        phone_match = re.search(r'\\"id\\":\s*\\"PHONE\\".*?\\"text\\":\s*\\"([^"\\]*)\\"', listed_by_str)
        if phone_match:
            agent_phone = phone_match.group(1)
            log_message(f"Found agent phone: {agent_phone}")
        else:
            log_message("No agent phone found in regex match")

        # Extract broker/company
        broker_match = re.search(
            r'\\"id\\":\s*\\"BROKER\\".*?\\"elements\\":\s*\[.*?\\"id\\":\s*\\"NAME\\".*?\\"text\\":\s*\\"([^"\\]*)\\"',
            listed_by_str, re.DOTALL
        )
        if broker_match:
            company = broker_match.group(1)
            log_message(f"Found company: {company}")
        else:
            log_message("No company found in regex match")

        if agent_name and agent_phone:
            result = [{
                "name": agent_name.strip(),
                "phone": agent_phone.strip(),
                "company": company.strip() if company else None
            }]
            log_message(f"Returning contact: {result}")
            return result
        elif agent_name:
            log_message(f"Found name ({agent_name}) but no phone number")
        else:
            log_message("No name or phone found")

        return []

    except Exception as e:
        log_message(f"Exception in regex extraction: {str(e)}")
        with open("json_debug.txt", "w", encoding="utf-8") as f:
            f.write(f"Raw match: {listed_by_str}\n")
            f.write(f"Error: {str(e)}\n")
        print("⚠️ Regex extraction error:", e)
        return []

def is_valid_agent_name(name: str) -> bool:
    """Check if extracted text is likely a real estate agent name"""
    if not name or len(name) < 4 or len(name) > 50:
        return False
    
    # Check against company terms first
    if is_valid_company_name(name):
        return False
        
    # Check for common name patterns
    name_patterns = [
        r'^[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+(?:PA|Jr|Sr|III|IV))?$',  # Standard names with optional suffix
        r'^[A-Z][a-z]+\s+(?:De|Van|Von)\s+[A-Z][a-z]+$',  # Names with prefixes
    ]
    
    if any(re.match(pattern, name) for pattern in name_patterns):
        return True
    
    # Basic validation for other cases
    parts = name.split()
    if len(parts) < 2 or len(parts) > 4:
        return False
        
    # Check for property terms that shouldn't be in names
    property_terms = {
        'electric', 'water', 'kitchen', 'bedroom', 'bathroom', 'garage',
        'listing', 'property', 'home', 'house', 'price', 'sold', 'new'
    }
    
    for part in parts:
        if part.lower() in property_terms:
            return False
        if not part.replace('.', '').replace('-', '').isalpha():
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

async def scrape_property_contacts(url: str) -> Optional[List[Dict[str, any]]]:
    """Scrape contact information from a property URL (single fast attempt, no retries/logs)."""
    log_message(f"🔍 Scraping contacts from URL: {url}")
    scraper_url = get_scraperapi_url(url, session_number=random.randint(1000, 9999))
    def make_request():
        return requests.get(scraper_url, timeout=REQUEST_TIMEOUT)
    response = run_sync_with_timeout(make_request, REQUEST_TIMEOUT + 5)
    if response and response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        agent_info = extract_agent_info(soup)
        log_message(f" Extracted agent info: {agent_info}")
        if agent_info:
            return agent_info
    return None

async def create_contacts_from_scraped_data(contacts_data: List[Dict[str, any]], lead_id: int, prisma: Prisma) -> int:
    """Create contact records from scraped agent information"""
    contacts_created = 0
    if not contacts_data:
        return 0
    
    for contact_info in contacts_data:
        phone = contact_info.get('phone')
        if not phone:
            continue

        name = contact_info.get('name')
        company = contact_info.get('company')

        try:
            # Check if contact with this phone number already exists
            existing_contact = await run_with_timeout(
                prisma.contact.find_first(where={'phoneNumber': phone}),
                5
            )
            
            if existing_contact:
                # Connect existing contact to lead if not already connected
                try:
                    await run_with_timeout(
                        prisma.lead.update(
                            where={'id': lead_id},
                            data={'contacts': {'connect': {'id': existing_contact.id}}}
                        ),
                        5
                    )
                    contacts_created += 1
                    log_message(f"     ✅ Connected existing contact: {name or 'Unknown'} - {phone}")
                except Exception as e:
                    # Might fail if already connected, which is fine.
                    log_message(f"     ℹ️  Note connecting existing contact: {str(e)}")
            else:
                # Create new contact
                contact_data = {
                    'phoneNumber': phone,
                    'type': ContactType.AGENT,
                    'leads': {'connect': {'id': lead_id}}
                }
                if name:
                    contact_data['name'] = name
                if company:
                    contact_data['company'] = company
                
                result = await run_with_timeout(
                    prisma.contact.create(data=contact_data),
                    5
                )
                
                if result:
                    contacts_created += 1
                    log_message(f"     ✅ Created new contact: {name or 'Unknown'} - {phone}")
        
        except Exception as e:
            log_message(f"     ❌ Error creating contact for {phone}: {str(e)}")
    
    return contacts_created

async def rapid_agent_info(address: dict):
    """
    address = {
        "street": "62 Kitty Hawk St",
        "city": "Zwolle",
        "state": "LA",
        "zipcode": "71486"
    }
    """
    try:
        # STEP 1: Search by address to get person ID
        citystatezip = f"{address['city']}, {address['state']} {address['zipcode']}"
        address_params = {
            "street": address["street"],
            "citystatezip": citystatezip,
            "page": 1
        }

        res1 = requests.get(
            "https://skip-tracing-working-api.p.rapidapi.com/search/byaddress",
            headers=HEADERS,
            params=address_params
        )
        res1_data = res1.json()
        log_message(f"🔍 Search results for address {address['street']}, {citystatezip}: {res1_data}")
        people = res1_data.get("PeopleDetails", [])
        if not people:
            print("❌ No people found.")
            return None

        # Take the first person's ID
        person_id = people[0].get("Person ID")
        if not person_id:
            print("❌ Person ID missing.")
            return None

        # STEP 2: Fetch person detail by ID
        res2 = requests.get(
            "https://skip-tracing-working-api.p.rapidapi.com/search/detailsbyID",
            headers=HEADERS,
            params={"peo_id": person_id}
        )
        res2_data = res2.json()

        person_details = res2_data.get("Person Details", [])
        if not person_details:
            print("❌ Person details not found.")
            return None

        person = person_details[0]
        full_name = person.get("Person_name")
        phone = person.get("Telephone")

        return {
            "name": full_name or "N/A",
            "phone": phone or "N/A",
            "company": None  # not present in response
        }

    except Exception as e:
        print("❌ Error in rapid_agent_info:", e)
        return None
        
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
                    'contactFetchAttempts': {'lt': 1},
                    'link': {'not': None}
                },
                take=MAX_CONTACTS_TO_PROCESS
            ),
            10
        )
        
        if not leads:
            log_message("✅ No leads need contact updates")
            return True
        
        log_message(f"📊 Processing {len(leads)} leads for contacts")
        
        total_contacts_created = 0
        total_processed = 0
        
        for lead in leads:
            if state.is_timeout():
                log_message(f"⚠️  Timeout reached, stopping at lead {total_processed}")
                break
                
            try:
                total_processed += 1
                log_message(f"🔍 Lead {total_processed}/{len(leads)} - {lead.zid}")
                
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
                        log_message(f"   ✅ Created {contacts_created} contacts")
                    else:
                        log_message(f"   ⚠️  No contacts created")
                else:
                    log_message(f"   ❌ No contact info found")
                
                # Delay between requests
                if total_processed < len(leads) and not state.is_timeout():
                    delay = random.uniform(CONTACTS_MIN_DELAY, CONTACTS_MAX_DELAY)
                    await asyncio.sleep(delay)
                    
            except Exception as e:
                log_message(f"   ❌ Error processing lead: {str(e)}")
        
        log_message(f"📊 Contacts Summary: {total_processed} processed, {total_contacts_created} contacts created")
        return True
        
    except Exception as e:
        log_message(f"❌ Error in contact processing: {str(e)}")
        return False

# ================== MAIN FUNCTION ==================

async def main():
    """Main execution function with proper error handling and cleanup"""
    parser = argparse.ArgumentParser(description='Complete Zillow Scraper - Listings + Contacts')
    parser.add_argument('--listings-only', action='store_true', help='Only fetch listings')
    parser.add_argument('--contacts-only', action='store_true', help='Only extract contacts')
    parser.add_argument('--skip-contacts', action='store_true', help='Skip contacts')
    parser.add_argument('--skip-proxy-test', action='store_true', help='Skip proxy test')
    parser.add_argument('--zpid', nargs='+', help='Fetch a specific ZPID (can be used multiple times)')
    args = parser.parse_args()
    
    start_time = datetime.now()
    log_message("🚀 Starting Complete Zillow Scraper")
    log_message(f"Max runtime: {MAX_RUNTIME_MINUTES} minutes")
    
    ensure_data_directory()
    setup_signal_handlers()
    
    success_listings = True
    success_contacts = True
    
    try:
        async with get_prisma_client() as prisma:
            # # # Step 0: Fetch specific ZPIDs if provided
            if args.zpid:
                log_message("=" * 50)
                log_message(f"STEP 0: FETCHING SPECIFIC ZPIDS: {args.zpid}")
                log_message("=" * 50)
                
                proxy_url = get_random_proxy() if not args.skip_proxy_test else None
                
                for zpid in args.zpid:
                    if state.is_timeout():
                        log_message("⚠️ Timeout reached, stopping ZPID fetch.")
                        break
                        
                    details = get_property_by_zpid(zpid, proxy_url)
                    
                    if details:
                        # The returned dictionary needs a 'results' key for save_listing_to_db
                        status, lead_id = await save_listing_to_db(details, prisma)
                        log_message(f"   -> Status for {zpid}: {status}")
                    
                    await asyncio.sleep(random.uniform(1, 3)) # Delay between requests

            # Step 1: Fetch Listings
            if not args.contacts_only and not args.zpid: # Skip if fetching specific zpid
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
            # if not args.listings_only and not args.skip_contacts and not state.is_timeout():
            #     log_message("=" * 50)
            #     log_message("STEP 2: EXTRACTING CONTACTS")
            #     log_message("=" * 50)
                
            #     if not SCRAPERAPI_KEY:
            #         log_message("❌ SCRAPERAPI_KEY not set, skipping contacts")
            #         success_contacts = False
            #     else:
            #         try:
            #             success_contacts = await process_zillow_contacts(prisma)
            #             log_message(f"Contacts: {'✅ Success' if success_contacts else '❌ Failed'}")
            #         except Exception as e:
            #             log_message(f"❌ Contacts error: {e}")
            #             success_contacts = False
            
            # Final summary
            runtime = datetime.now() - start_time
            log_message("=" * 50)
            log_message("FINAL SUMMARY")
            log_message("=" * 50)
            log_message(f"Runtime: {runtime.total_seconds()/60:.1f} minutes")
            log_message(f"Listings: {'✅ Success' if success_listings else '❌ Failed'}")
            log_message(f"Contacts: {'✅ Success' if success_contacts else '❌ Failed/Skipped'}")
            
            if success_listings and success_contacts:
                log_message("🎉 Scraper completed successfully!")
                return True
            else:
                log_message("⚠️  Scraper completed with issues")
                return False
                
    except Exception as e:
        log_message(f"❌ Critical error: {e}")
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
        # Force exit - critical for Render cron jobs
        print("🔚 Forcing script termination")
        try:
            # Close any remaining file descriptors
            import resource
            max_fd = resource.getrlimit(resource.RLIMIT_NOFILE)[1]
            for fd in range(3, min(max_fd, 256)):  # Skip stdin, stdout, stderr
                try:
                    os.close(fd)
                except OSError:
                    pass
        except:
            pass
        
        # Force garbage collection
        gc.collect()
        
        # Force exit the process
        os._exit(0 if 'success' in locals() and success else 1)