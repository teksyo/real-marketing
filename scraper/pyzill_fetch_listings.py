#!/usr/bin/env python3
"""
Zillow listings scraper that collects listings across the US.

Usage:
# Fetch all listings across US
python3.10 pyzill_fetch_listings.py
"""
import json
import time
import random
import sys
import os
import requests
from datetime import datetime
from bs4 import BeautifulSoup
import re
import argparse
from pathlib import Path
import asyncio
from prisma import Prisma
from prisma.enums import LeadStatus, ContactType, LeadPriority, LeadSource
from typing import List, Dict, Optional
from dataclasses import dataclass
import base64
import urllib3
import pyzill
urllib3.disable_warnings()

# Directory for storing debug data
DATA_DIR = Path("zillow_data")

# Initialize Prisma client
prisma = Prisma()

# Proxy rotation settings
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
MIN_DELAY = 5  # Minimum delay between requests (seconds)
MAX_DELAY = 10  # Maximum delay between requests (seconds)
BATCH_SIZE = 5  # Process leads in batches
BATCH_DELAY = 30  # Delay between batches (seconds)
MAX_RETRIES = 3  # Maximum retries for failed requests

def get_us_map_bounds() -> Dict:
    """
    Get map bounds for continental US.
    """
    return {
        "west": -124.848974,
        "east": -66.885444,
        "south": 24.396308,
        "north": 49.384358
    }

def test_proxy_connection():
    """Test if the proxy connection is working"""
    print("Testing proxy connection...")
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
            print(f"✅ Proxy connection successful!")
            print(f"Current IP: {ip_data.get('proxy', {}).get('ip')}")
            return True
        else:
            print(f"❌ Proxy test failed with status code: {result.status_code}")
            print(f"Response content: {result.text}")
            return False
    except Exception as e:
        print(f"❌ Proxy test failed with error: {str(e)}")
        print("Please verify:")
        print("1. Proxy credentials are correct")
        print("2. Proxy server is running")
        print("3. Your IP is whitelisted (if required)")
        return False

async def save_to_db(listing: Dict) -> tuple[str, Optional[int]]:
    """Save a listing to the database and return status and lead ID"""
    try:
        # Extract basic listing info
        zpid = str(listing.get('zpid', ''))
        if not zpid:
            return "error", None
            
        # Check if listing already exists
        existing = await prisma.lead.find_unique(
            where={
                'zid': zpid
            }
        )
        
        if existing:
            return "exists", existing.id
            
        # Prepare listing data
        # Handle required fields with proper defaults for missing data
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
        
        # Create new listing with retry logic for prepared statement errors
        try:
            new_lead = await prisma.lead.create(data=listing_data)
            return "created", new_lead.id
        except Exception as create_error:
            if "prepared statement" in str(create_error):
                # Skip this listing due to connection issue
                return "error", None
            else:
                raise create_error
        
    except Exception as e:
        if "prepared statement" in str(e):
            return "error", None  # Skip silently for prepared statement errors
        print(f"Error saving listing to database: {str(e)}")
        return "error", None

async def extract_contact_from_listing(listing: Dict, lead_id: int) -> Optional[Dict]:
    """Extract basic contact information from listing data if available"""
    try:
        contact_info = {}
        
        # Try to get broker/agent name from basic listing data
        if 'brokerName' in listing and listing['brokerName']:
            contact_info['company'] = listing['brokerName']
            contact_info['name'] = listing['brokerName']
        
        # Try to get basic agent info that might be in listing
        for field in ['agentName', 'listingAgentName', 'contactName']:
            if field in listing and listing[field]:
                contact_info['name'] = listing[field]
                break
        
        # Try to get phone number if available in basic listing
        phone_fields = ['phoneNumber', 'agentPhoneNumber', 'contactPhone', 'phone']
        for field in phone_fields:
            if field in listing and listing[field]:
                contact_info['phoneNumber'] = listing[field]
                break
        
        # Try to get agent ID
        agent_id_fields = ['agentId', 'listingAgentId', 'contactId']
        for field in agent_id_fields:
            if field in listing and listing[field]:
                contact_info['agentId'] = str(listing[field])
                break
        
        # Only create contact if we have meaningful contact info
        if not contact_info.get('phoneNumber') and not contact_info.get('name'):
            return None
        
        # If we have a name but no phone, create with placeholder
        if not contact_info.get('phoneNumber') and contact_info.get('name'):
            contact_info['phoneNumber'] = "000-000-0000"  # Placeholder
            
        # Check if contact already exists by agentId
        if contact_info.get('agentId'):
            existing_contact = await prisma.contact.find_unique(
                where={'agentId': contact_info['agentId']}
            )
            if existing_contact:
                # Connect existing contact to lead
                await prisma.lead.update(
                    where={'id': lead_id},
                    data={'contacts': {'connect': {'id': existing_contact.id}}}
                )
                return existing_contact.__dict__
        
        # Create new contact
        new_contact_data = {
            'agentId': contact_info.get('agentId'),
            'name': contact_info.get('name'),
            'phoneNumber': contact_info['phoneNumber'],
            'type': ContactType.AGENT,
            'company': contact_info.get('company'),
            'leads': {'connect': {'id': lead_id}}
        }
        
        # Remove None values
        new_contact_data = {k: v for k, v in new_contact_data.items() if v is not None}
        
        new_contact = await prisma.contact.create(data=new_contact_data)
        return new_contact.__dict__
        
    except Exception as e:
        print(f"Error extracting contact from listing: {str(e)}")
        return None

async def fetch_us_listings(skip_contacts: bool = False) -> bool:
    """Fetch listings across the continental US"""
    print("\nFetching newest listings across US...")
    
    try:        
        # Get US map bounds
        bounds = get_us_map_bounds()
        
        # Use improved proxy rotation
        proxy_url = get_random_proxy()
        print(f"Using proxy for listings fetch...")
        
        try:
            # Fetch listings using pyzill with proxy
            response = pyzill.for_sale(
                pagination=1,  # We only need first page as it contains all results
                search_value="",  # Empty for nationwide search
                min_beds=None,
                max_beds=None,
                min_bathrooms=None,
                max_bathrooms=None,
                min_price=None,
                max_price=None,
                ne_lat=bounds["north"],  # US bounds - nationwide
                ne_long=bounds["east"],
                sw_lat=bounds["south"],
                sw_long=bounds["west"],
                zoom_value=5,  # Lower zoom for wider area
                proxy_url=proxy_url
            )
        except Exception as proxy_error:
            print(f"⚠️  Proxy failed: {proxy_error}")
            print("🔄 Trying without proxy...")
            
            # Fallback: Try without proxy
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
                proxy_url=None  # No proxy
            )

        if not response:
            print("No response received")
            return False
            
        print(f"Response type: {type(response)}")
        
        # Ensure response is a dictionary
        if not isinstance(response, dict):
            print(f"Unexpected response type: {type(response)}")
            print("Response:", response)
            return False
            
        print("Response keys:", list(response.keys()))
        
        # Try to get results from different possible keys
        results = []
        for key in ['listResults', 'mapResults', 'cat1', 'results']:
            if key in response:
                results = response[key]
                print(f"Found results in '{key}' key")
                break
                
        if not results:
            print("No listings found in response")
            print("Full response:", json.dumps(response, indent=2))
            return False
            
        print(f"Found {len(results)} listings")
        
        # Debug first result
        if results:
            first_result = results[0]
            print(f"First result type: {type(first_result)}")
            if isinstance(first_result, dict):
                print("First result keys:", list(first_result.keys()))
            print("First result:", json.dumps(first_result, indent=2))
        
        # Process each listing
        new_count = 0
        existing_count = 0
        error_count = 0
        contacts_created = 0
        
        for idx, result in enumerate(results):
            try:
                # Skip if result is not a dictionary
                if not isinstance(result, dict):
                    print(f"Skipping invalid result type: {type(result)}")
                    error_count += 1
                    continue
                
                # Get the detail URL using different possible keys
                detail_url = None
                for key in ['detailUrl', 'detail_url', 'url']:
                    if key in result:
                        detail_url = result[key]
                        break
                
                if not detail_url:
                    print("No detail URL found in result")
                    error_count += 1
                    continue
                
                # Save to database and get lead ID
                status, lead_id = await save_to_db(result)
                
                if status == "created":
                    new_count += 1
                    print(f"✅ Created new listing {idx+1}/{len(results)} (ID: {lead_id})")
                    
                    # Extract contact information if not skipping and we have a lead ID
                    if not skip_contacts and lead_id:
                        contact = await extract_contact_from_listing(result, lead_id)
                        if contact:
                            contacts_created += 1
                            print(f"   📞 Created contact: {contact.get('name', 'Unknown')} - {contact.get('company', 'No company')}")
                        else:
                            print(f"   ❌ No contact info found in listing data")
                    
                elif status == "exists":
                    existing_count += 1
                    print(f"📄 Listing already exists {idx+1}/{len(results)}")
                    
                    # Still try to extract contact for existing leads that might not have contacts
                    if not skip_contacts and lead_id:
                        contact = await extract_contact_from_listing(result, lead_id)
                        if contact:
                            contacts_created += 1
                            print(f"   📞 Added contact to existing lead: {contact.get('name', 'Unknown')}")
                else:
                    error_count += 1
                    print(f"❌ Error saving listing {idx+1}/{len(results)}")
                    
            except Exception as e:
                print(f"Error processing listing: {str(e)}")
                error_count += 1
                continue
        
        print(f"\nListing fetch summary:")
        print(f"- Total listings found: {len(results)}")
        print(f"- New leads: {new_count}")
        print(f"- Already exists: {existing_count}")
        if not skip_contacts:
            print(f"- Contacts created: {contacts_created}")
        else:
            print(f"- Contact extraction: SKIPPED")
        print(f"- Errors: {error_count}")
        return True
                
    except Exception as e:
        print(f"Error fetching US listings: {str(e)}")
        return False

async def main():
    parser = argparse.ArgumentParser(description='Fetch Zillow listings across the US')
    parser.add_argument('--skip-fetch', action='store_true', help='Skip fetching new listings')
    parser.add_argument('--skip-contacts', action='store_true', help='Skip extracting contact information from listings')
    parser.add_argument('--skip-proxy-test', action='store_true', help='Skip proxy connection test (for production)')
    args = parser.parse_args()
    
    ensure_data_directory()
    
    # Test proxy connection first (unless skipped)
    if not args.skip_proxy_test:
        if not test_proxy_connection():
            print("Failed to establish proxy connection. Exiting...")
            return
    else:
        print("⚠️  Skipping proxy connection test (production mode)")
    
    # Connect to database
    await prisma.connect()
    
    try:
        if not args.skip_fetch:
            print("Fetching listings across the US...")
            if args.skip_contacts:
                print("⚠️  Contact extraction will be SKIPPED - use scraper_api_contacts.py for detailed phone numbers")
            success = await fetch_us_listings(skip_contacts=args.skip_contacts)
            if not success:
                print("Failed to fetch listings")
                return
        else:
            print("Skipping listing fetch as requested.")
        
    finally:
        await prisma.disconnect()

def ensure_data_directory():
    """Ensure the data directory exists"""
    DATA_DIR.mkdir(exist_ok=True)

def get_random_proxy():
    """Get a random proxy session"""
    session = random.choice(PROXY_SESSIONS)
    return pyzill.parse_proxy(PROXY_HOST, PROXY_PORT, session, PROXY_PASSWORD)

async def fetch_listing_details_with_retry(url: str, max_retries: int = MAX_RETRIES) -> Optional[Dict]:
    """Fetch listing details with retry logic and proxy rotation"""
    for attempt in range(max_retries):
        try:
            # Use different proxy for each attempt
            proxy_url = get_random_proxy()
            
            print(f"Attempt {attempt + 1}/{max_retries} for URL (using proxy session {attempt + 1})")
            
            # Add longer delay for retries
            if attempt > 0:
                delay = min(30 * (2 ** attempt), 120)  # Exponential backoff, max 2 minutes
                print(f"Waiting {delay} seconds before retry...")
                time.sleep(delay)
            
            # Fetch data
            detail_data = pyzill.get_from_home_url(url, proxy_url)
            
            if detail_data:
                print(f"✅ Successfully fetched data on attempt {attempt + 1}")
                return detail_data
            else:
                print(f"❌ No data returned on attempt {attempt + 1}")
                
        except Exception as e:
            error_str = str(e)
            print(f"❌ Attempt {attempt + 1} failed: {error_str}")
            
            # Check for specific error types
            if "403" in error_str:
                print("   → Received 403 Forbidden - changing proxy and waiting longer")
                time.sleep(random.uniform(20, 40))  # Longer wait for 403 errors
            elif "407" in error_str:
                print("   → Proxy authentication failed - trying different session")
                time.sleep(random.uniform(10, 20))
            elif "timeout" in error_str.lower():
                print("   → Request timeout - will retry")
                time.sleep(random.uniform(15, 30))
            else:
                print(f"   → Unknown error: {error_str}")
                time.sleep(random.uniform(10, 20))
    
    print(f"❌ Failed to fetch data after {max_retries} attempts")
    return None

if __name__ == "__main__":
    asyncio.run(main())