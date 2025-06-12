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
    'user-sp6mbpcybk',
    # 'user-sp6mbpcybk-session-2-state-us_california', 
    # 'user-sp6mbpcybk-session-3-state-us_texas',
    # 'user-sp6mbpcybk-session-4-state-us_florida',
    # 'user-sp6mbpcybk-session-5-state-us_newyork'
]
PROXY_PASSWORD = 'K40SClud=esN8jxg9c'
PROXY_HOST = "gate.decodo.com"
PROXY_PORT = "10001"

# Rate limiting settings with better timeout handling
LISTINGS_MIN_DELAY = 3
LISTINGS_MAX_DELAY = 7
CONTACTS_MIN_DELAY = 2
CONTACTS_MAX_DELAY = 5
CONTACTS_BATCH_SIZE = 5  # Reduced batch size
CONTACTS_BATCH_DELAY = 15  # Reduced delay
MAX_RETRIES = 2  # Reduced retries

# Runtime limits - More conservative for cron jobs
MAX_LISTINGS_TO_FETCH = 30  # Reduced
MAX_CONTACTS_TO_PROCESS = 10  # Reduced
MAX_RUNTIME_MINUTES = 8  # Reduced for cron job reliability

# Timeout settings
REQUEST_TIMEOUT = 45  # Reduced from 60
SCRAPER_TIMEOUT = 40  # Individual scraper timeout
OPERATION_TIMEOUT = 300  # 5 minutes for any single operation

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
    """Extract agent information from Zillow property page HTML"""
    agent_info = {'names': [], 'phones': [], 'companies': []}
    
    # Extract phone numbers from entire page
    phones = extract_phone_numbers(str(soup))
    agent_info['phones'].extend(phones)
    
    # Zillow-specific agent information extraction based on the screenshot structure
    agent_names = set()
    companies = set()
    
    # 1. Look for "Listed by" section (visible in your screenshot)
    listed_by_patterns = [
        # Direct "Listed by" text followed by name
        r'Listed by\s+([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        r'Listed by\s*\n\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
    ]
    
    page_text = soup.get_text()
    for pattern in listed_by_patterns:
        matches = re.findall(pattern, page_text, re.MULTILINE | re.IGNORECASE)
        for match in matches:
            name = match.strip()
            if is_valid_agent_name(name):
                agent_names.add(name)
                log_message(f"   📝 Found agent via 'Listed by': {name}")
    
    # 2. Look for agent profile sections with specific Zillow selectors
    zillow_agent_selectors = [
        # Common Zillow agent container selectors
        '[data-testid*="agent"]',
        '[data-testid*="listing-agent"]',
        '[data-testid*="contact"]',
        '.agent-profile',
        '.listing-agent',
        '.agent-info',
        '.contact-info',
        '[class*="agent"]',
        '[class*="realtor"]',
        # Zillow-specific attribution selectors
        '[data-testid="attribution-AGENT"]',
        '[data-testid="attribution-BROKER"]',
        '[data-testid="attribution-LISTING_OFFICE"]',
        # Profile card selectors (based on screenshot structure)
        '.profile-card',
        '.agent-card',
        '[class*="profile"]',
        '[class*="card"]'
    ]
    
    for selector in zillow_agent_selectors:
        elements = soup.select(selector)
        for element in elements:
            text = element.get_text(strip=True)
            # Extract names from agent sections
            names = extract_names_from_agent_section(text)
            for name in names:
                if is_valid_agent_name(name):
                    agent_names.add(name)
                    log_message(f"   📝 Found agent via selector '{selector}': {name}")
    
    # 3. Look for specific text patterns around contact buttons
    contact_button_patterns = [
        r'Contact\s+([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        r'Call\s+([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        r'Text\s+([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        r'Email\s+([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
    ]
    
    for pattern in contact_button_patterns:
        matches = re.findall(pattern, page_text, re.MULTILINE | re.IGNORECASE)
        for match in matches:
            name = match.strip()
            if is_valid_agent_name(name):
                agent_names.add(name)
                log_message(f"   📝 Found agent via contact pattern: {name}")
    
    # 4. Look for names in proximity to phone numbers (within 300 characters)
    html_content = str(soup)
    for phone in phones:
        phone_clean = re.sub(r'[^\d]', '', phone)
        
        # Find all occurrences of this phone number
        phone_patterns = [
            re.escape(phone),
            re.escape(phone_clean),
            phone_clean[:3] + r'[-.\s]*' + phone_clean[3:6] + r'[-.\s]*' + phone_clean[6:],
        ]
        
        for pattern in phone_patterns:
            for match in re.finditer(pattern, html_content, re.IGNORECASE):
                # Get context around phone number
                start = max(0, match.start() - 300)
                end = min(len(html_content), match.end() + 300)
                context = html_content[start:end]
                
                # Parse context and extract names
                context_soup = BeautifulSoup(context, 'html.parser')
                context_text = context_soup.get_text()
                
                names = extract_names_from_agent_section(context_text)
                for name in names:
                    if is_valid_agent_name(name):
                        agent_names.add(name)
                        log_message(f"   📝 Found agent near phone {phone}: {name}")
    
    # 5. Look for company/brokerage information
    company_patterns = [
        # Brokerage information patterns
        r'(?:Brokered by|Listed by|Courtesy of|Listing provided by|Brokerage)[\s:]+([A-Za-z][^,\n\.]{5,60})',
        r'([A-Z][a-zA-Z\s&\-]{3,50}(?:Realty|Real Estate|Properties|Group|Team|Associates|Realtors?|Brokerage))',
        # Popular brokerages
        r'(RE/MAX[A-Za-z\s&\-]*)',
        r'(Coldwell Banker[A-Za-z\s&\-]*)',
        r'(Century 21[A-Za-z\s&\-]*)',
        r'(Keller Williams[A-Za-z\s&\-]*)',
        r'(Compass[A-Za-z\s&\-]*)',
        r'(eXp Realty[A-Za-z\s&\-]*)',
    ]
    
    for pattern in company_patterns:
        matches = re.findall(pattern, page_text, re.IGNORECASE)
        for match in matches:
            company = match.strip()
            if is_valid_company_name(company):
                companies.add(company)
                log_message(f"   🏢 Found company: {company}")
    
    # 6. Look for names in JSON data (Zillow often embeds data in script tags)
    script_tags = soup.find_all('script', type='application/json')
    for script in script_tags:
        try:
            data = json.loads(script.string or '{}')
            names_from_json = extract_names_from_json(data)
            for name in names_from_json:
                if is_valid_agent_name(name):
                    agent_names.add(name)
                    log_message(f"   📝 Found agent in JSON data: {name}")
        except (json.JSONDecodeError, AttributeError):
            continue
    
    # Convert sets to lists and clean up
    agent_info['names'] = list(agent_names)
    agent_info['companies'] = list(companies)
    
    # Remove duplicates and clean up
    agent_info['names'] = list(set([name.strip() for name in agent_info['names'] if name.strip()]))
    agent_info['phones'] = list(set(agent_info['phones']))
    agent_info['companies'] = list(set([comp.strip() for comp in agent_info['companies'] if comp.strip()]))
    
    return agent_info


def extract_names_from_agent_section(text: str) -> List[str]:
    """Extract names from agent-specific text sections"""
    names = []
    
    # Common name patterns for agents
    name_patterns = [
        r'\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b',  # First Last
        r'\b([A-Z][a-z]{2,}\s+[A-Z]\.\s+[A-Z][a-z]{2,})\b',  # First M. Last
        r'\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b',  # First Middle Last
        r'\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{1,3}[A-Z][a-z]{2,})\b',  # First McLastname
    ]
    
    for pattern in name_patterns:
        matches = re.findall(pattern, text)
        for match in matches:
            name = match.strip()
            if len(name) >= 4 and len(name) <= 50:
                names.append(name)
    
    return names


def extract_names_from_json(data: any, path: str = "") -> List[str]:
    """Recursively extract names from JSON data structures"""
    names = []
    
    if isinstance(data, dict):
        for key, value in data.items():
            # Look for keys that might contain agent names
            if any(agent_key in key.lower() for agent_key in ['agent', 'contact', 'name', 'realtor', 'broker']):
                if isinstance(value, str) and is_valid_agent_name(value):
                    names.append(value)
            # Recurse into nested structures
            names.extend(extract_names_from_json(value, f"{path}.{key}"))
            
    elif isinstance(data, list):
        for i, item in enumerate(data):
            names.extend(extract_names_from_json(item, f"{path}[{i}]"))
            
    elif isinstance(data, str):
        # Check if string looks like a name
        if is_valid_agent_name(data):
            names.append(data)
    
    return names


def is_valid_agent_name(name: str) -> bool:
    """Check if extracted text is likely a real estate agent name"""
    if not name or len(name) < 4 or len(name) > 50:
        return False
    
    # Split into parts
    parts = name.split()
    if len(parts) < 2:
        return False
    
    # Property terms that are definitely NOT names (expanded list based on your screenshot)
    property_terms = {
        'electric', 'water', 'heater', 'gourmet', 'kitchen', 'corner', 'lot',
        'high', 'ceilings', 'common', 'wall', 'walls', 'floor', 'floors',
        'square', 'feet', 'sqft', 'bedroom', 'bathroom', 'garage', 'parking',
        'pool', 'spa', 'patio', 'yard', 'garden', 'view', 'mountain', 'ocean',
        'lake', 'river', 'street', 'avenue', 'road', 'drive', 'way', 'place',
        'court', 'circle', 'lane', 'north', 'south', 'east', 'west',
        'listing', 'property', 'home', 'house', 'condo', 'apartment',
        'price', 'sold', 'sale', 'rent', 'lease', 'available', 'coming', 'soon',
        'new', 'construction', 'built', 'year', 'updated', 'renovated',
        'granite', 'marble', 'hardwood', 'tile', 'carpet', 'stainless', 'steel',
        'appliances', 'washer', 'dryer', 'refrigerator', 'dishwasher',
        'central', 'air', 'heating', 'cooling', 'fireplace', 'balcony',
        'deck', 'fence', 'landscaping', 'sprinkler', 'security', 'alarm',
        'single', 'family', 'residence', 'built', 'data', 'photos', 'floor',
        'plan', 'home', 'save', 'share', 'hide', 'showcase', 'all', 'photos',
        'for', 'sale', 'beds', 'baths', 'contact', 'request', 'tour'
    }
    
    # Check if any part is a property term
    for part in parts:
        if part.lower() in property_terms:
            return False
    
    # Must be alphabetic characters only (except for middle initials)
    for part in parts:
        if not (part.replace('.', '').isalpha() and len(part.replace('.', '')) >= 2):
            return False
    
    # Additional validation: first part should look like a first name
    first_name = parts[0].lower()
    
    # Common first names for additional validation
    common_first_names = {
        'john', 'jane', 'michael', 'michelle', 'david', 'sarah', 'robert', 'lisa',
        'william', 'jennifer', 'james', 'mary', 'christopher', 'patricia',
        'daniel', 'linda', 'matthew', 'elizabeth', 'anthony', 'barbara',
        'mark', 'susan', 'donald', 'jessica', 'steven', 'helen', 'paul', 'nancy',
        'andrew', 'betty', 'joshua', 'dorothy', 'kenneth', 'sandra', 'kevin',
        'donna', 'brian', 'carol', 'george', 'ruth', 'edward', 'sharon',
        'ronald', 'michelle', 'timothy', 'laura', 'jason', 'sarah', 'jeffrey',
        'kimberly', 'ryan', 'deborah', 'jacob', 'dorothy', 'gary', 'lisa',
        'nicholas', 'nancy', 'eric', 'karen', 'jonathan', 'betty', 'stephen',
        'helen', 'larry', 'sandra', 'justin', 'donna', 'scott', 'carol',
        'brandon', 'ruth', 'benjamin', 'sharon', 'samuel', 'michelle',
        'frank', 'laura', 'raymond', 'sarah', 'alexander', 'kimberly',
        'patrick', 'deborah', 'jack', 'dorothy', 'dennis', 'lisa',
        'jerry', 'nancy', 'tyler', 'karen', 'aaron', 'betty',
        'jasmin', 'jasmine', 'alex', 'alexandra', 'chris', 'christina',
        'mike', 'monica', 'joe', 'joseph', 'tom', 'thomas', 'bob', 'robert'
    }
    
    # If it's a common first name, very likely to be valid
    if first_name in common_first_names:
        return True
    
    # Check if it follows reasonable name patterns
    if len(first_name) >= 3 and first_name.isalpha():
        return True
    
    return False


def is_valid_company_name(company: str) -> bool:
    """Check if extracted text is likely a real estate company name"""
    if not company or len(company) < 5 or len(company) > 80:
        return False
    
    # Remove common false positives
    bad_terms = [
        'loading', 'request', 'contact', 'today', 'early', 'button', 'click', 
        'undefined', 'null', 'error', 'message', 'please', 'thank', 'welcome',
        'search', 'results', 'found', 'showing', 'page', 'next', 'previous',
        'photos', 'floor', 'plan', 'home', 'save', 'share', 'hide',
        'electric water', 'gourmet kitchen', 'corner lot', 'high ceilings'
    ]
    
    company_lower = company.lower()
    for term in bad_terms:
        if term in company_lower:
            return False
    
    # Must contain at least one real estate related term
    real_estate_terms = [
        'realty', 'real estate', 'properties', 'group', 'team', 'associates',
        'realtors', 'realtor', 'brokerage', 'broker', 'homes', 'housing',
        're/max', 'coldwell', 'century', 'keller', 'compass', 'exp', 'sotheby',
        '24th', 'home'  # Added based on your screenshot showing "24TH&HOME"
    ]
    
    has_re_term = any(term in company_lower for term in real_estate_terms)
    if not has_re_term:
        return False
    
    return True

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
    print("🟢 Script started")  # Log before event loop starts
    try:
        asyncio.run(main())
        print("✅ Script finished successfully")
    except Exception as e:
        print(f"❌ Script failed with error: {e}")