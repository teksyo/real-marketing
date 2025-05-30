#!/usr/bin/env python3
"""
Zillow listings scraper that collects listings across the US
and extracts detailed contact information for agents and brokers.

Usage:
# Fetch all listings across US
python3.10 pyzill_fetch_listings.py

# Only update contact information for existing leads
python3.10 pyzill_fetch_listings.py --skip-fetch

# Only fetch new listings (skip contact updates)
python3.10 pyzill_fetch_listings.py --skip-contacts
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

async def update_missing_phone_numbers() -> None:
    """Update contact information for listings without phone numbers"""
    try:        
        # Get leads without contacts
        leads = await prisma.lead.find_many(
            where={
                'contacts': {
                    'none': {}  # No contacts associated
                },
                'contactFetchAttempts': {
                    'lt': 3  # Less than 3 attempts
                }
            }
        )
        
        if not leads:
            print("No leads need contact updates")
            return
            
        print(f"\nUpdating contact information for {len(leads)} leads...")
        updated = 0
        errors = 0
        
        # Process leads in batches to reduce rate limiting issues
        total_batches = (len(leads) + BATCH_SIZE - 1) // BATCH_SIZE
        
        for batch_num, i in enumerate(range(0, len(leads), BATCH_SIZE)):
            batch = leads[i:i + BATCH_SIZE]
            print(f"\n📦 Processing batch {batch_num + 1}/{total_batches} ({len(batch)} leads)")
            
            for lead_num, lead in enumerate(batch):
                try:
                    print(f"\n🔍 Processing lead {i + lead_num + 1}/{len(leads)} (Batch {batch_num + 1}, Lead {lead_num + 1}/{len(batch)})")
                    print(f"   Lead ID: {lead.zid}")
                    
                    if not lead.link:
                        print(f"   ❌ No URL for lead {lead.zid}, skipping...")
                        errors += 1
                        continue
                    
                    # Increment contact fetch attempts first
                    await prisma.lead.update(
                        where={
                            'id': lead.id
                        },
                        data={
                            'contactFetchAttempts': lead.contactFetchAttempts + 1
                        }
                    )
                    
                    # Use improved retry function
                    detail_data = await fetch_listing_details_with_retry(lead.link)
                    
                    if not detail_data:
                        print(f"   ❌ No detail data for lead {lead.zid}")
                        errors += 1
                        continue
                    
                    # Phone number patterns
                    phone_patterns = [
                        r'\b\d{3}-\d{3}-\d{4}\b',  # xxx-xxx-xxxx
                        r'\b\d{3}\.\d{3}\.\d{4}\b',  # xxx.xxx.xxxx
                        r'\b\(\d{3}\)\s*\d{3}-\d{4}\b',  # (xxx) xxx-xxxx
                        r'\b\(\d{3}\)\s*\d{3}\s*\d{4}\b',  # (xxx) xxx xxxx
                        r'\b\d{3}\s*\d{3}\s*\d{4}\b',  # xxx xxx xxxx
                    ]
                    
                    # Try to get contacts from pyzill response
                    contacts_to_create = []
                    if isinstance(detail_data, dict) and 'contacts' in detail_data:
                        print(f"   📞 Found {len(detail_data['contacts'])} contacts in API response")
                        for contact_data in detail_data['contacts']:
                            # Skip contacts without phone numbers since it's required
                            phone_number = contact_data.get('phoneNumber')
                            if not phone_number:
                                continue
                                
                            # Check if contact already exists
                            agent_id = contact_data.get('agentId')
                            if agent_id:
                                existing_contact = await prisma.contact.find_unique(
                                    where={
                                        'agentId': agent_id
                                    }
                                )
                                if existing_contact:
                                    # Connect existing contact to lead
                                    await prisma.lead.update(
                                        where={
                                            'id': lead.id
                                        },
                                        data={
                                            'contacts': {
                                                'connect': {
                                                    'id': existing_contact.id
                                                }
                                            }
                                        }
                                    )
                                    continue
                            
                            # Create new contact
                            contact = {
                                'agentId': contact_data.get('agentId'),
                                'name': contact_data.get('name'),
                                'phoneNumber': phone_number,
                                'type': ContactType.AGENT if contact_data.get('type', 'AGENT') == 'AGENT' else ContactType.BROKER,
                                'licenseNo': contact_data.get('licenseNo'),
                                'company': contact_data.get('company'),
                                'leads': {
                                    'connect': {
                                        'id': lead.id
                                    }
                                }
                            }
                            contacts_to_create.append(contact)
                    
                    # If no contacts found in pyzill response, try regex on raw HTML
                    if not contacts_to_create and 'raw_html' in detail_data:
                        print(f"   🔍 No API contacts found, searching HTML for phone numbers...")
                        html_content = detail_data['raw_html']
                        phone_numbers = set()
                        for pattern in phone_patterns:
                            matches = re.findall(pattern, html_content)
                            for match in matches:
                                # Clean and format the phone number consistently
                                phone = re.sub(r'[^\d]', '', match)
                                if len(phone) >= 10:  # Ensure we have at least a full phone number
                                    phone_numbers.add(f"({phone[:3]}) {phone[3:6]}-{phone[6:10]}")
                        
                        if phone_numbers:
                            print(f"   📞 Found {len(phone_numbers)} phone numbers in HTML")
                            # Create a generic contact for each phone number
                            for phone in phone_numbers:
                                contact = {
                                    'phoneNumber': phone,
                                    'type': ContactType.AGENT,
                                    'leads': {
                                        'connect': {
                                            'id': lead.id
                                        }
                                    }
                                }
                                contacts_to_create.append(contact)
                    
                    # Create all new contacts
                    for contact in contacts_to_create:
                        await prisma.contact.create(data=contact)
                    
                    if contacts_to_create:
                        updated += 1
                        print(f"   ✅ Created {len(contacts_to_create)} contacts for lead {lead.zid}")
                    else:
                        print(f"   ❌ No contacts found for lead {lead.zid}")
                        errors += 1
                    
                    # Add delay between individual requests within a batch
                    if lead_num < len(batch) - 1:  # Don't delay after the last item in batch
                        delay = random.uniform(MIN_DELAY, MAX_DELAY)
                        print(f"   ⏱️  Waiting {delay:.1f} seconds before next request...")
                        time.sleep(delay)
                    
                except Exception as e:
                    print(f"   ❌ Error updating contact info for lead {lead.zid}: {str(e)}")
                    errors += 1
                    continue
            
            # Add longer delay between batches
            if batch_num < total_batches - 1:  # Don't delay after the last batch
                print(f"\n⏱️  Batch {batch_num + 1} complete. Waiting {BATCH_DELAY} seconds before next batch...")
                time.sleep(BATCH_DELAY)
        
        print(f"\nContact update summary:")
        print(f"- Total leads processed: {len(leads)}")
        print(f"- Successfully updated: {updated}")
        print(f"- Errors: {errors}")
        
    except Exception as e:
        if "prepared statement" in str(e):
            print("Skipping contact updates due to database connection issue (prepared statement conflict)")
        else:
            print(f"Error updating contact information: {str(e)}")

async def fetch_us_listings() -> bool:
    """Fetch listings across the continental US"""
    print("\nFetching newest listings across US...")
    
    try:        
        # Get US map bounds
        bounds = get_us_map_bounds()
        
        # Use improved proxy rotation
        proxy_url = get_random_proxy()
        print(f"Using proxy for listings fetch...")
        
        # Fetch listings using pyzill
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
                    
                    # Extract contact information from the listing
                    if lead_id:
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
                    if lead_id:
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
        print(f"- Contacts created: {contacts_created}")
        print(f"- Errors: {error_count}")
        return True
                
    except Exception as e:
        print(f"Error fetching US listings: {str(e)}")
        return False

async def main():
    parser = argparse.ArgumentParser(description='Fetch Zillow listings across the US')
    parser.add_argument('--skip-fetch', action='store_true', help='Skip fetching new listings')
    parser.add_argument('--skip-contacts', action='store_true', help='Skip updating contact information (DEPRECATED - contacts are now extracted from listings)')
    args = parser.parse_args()
    
    ensure_data_directory()
    
    # Test proxy connection first
    if not test_proxy_connection():
        print("Failed to establish proxy connection. Exiting...")
        return
    
    # Connect to database
    await prisma.connect()
    
    try:
        if not args.skip_fetch:
            print("Fetching listings across the US...")
            success = await fetch_us_listings()
            if not success:
                print("Failed to fetch listings")
                return
        else:
            print("Skipping listing fetch as requested.")
        
        # Note: Contact extraction is now integrated into the listing fetch
        if not args.skip_contacts and args.skip_fetch:
            print("\n⚠️  NOTE: --skip-contacts is deprecated!")
            print("Contact information is now extracted directly from listings during fetch.")
            print("To update contacts for existing leads, use the legacy contact update function...")
            
            # Keep the old contact update function available for existing leads
            await update_missing_phone_numbers()
            
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

async def extract_contact_from_listing(listing: Dict, lead_id: int) -> Optional[Dict]:
    """Extract contact information from listing data and create contact if needed"""
    try:
        # Debug: Print all available fields to check for phone numbers
        print(f"\n🔍 Analyzing listing data for phone numbers...")
        print(f"   Main listing keys: {list(listing.keys())}")
        
        # Check for any field containing 'phone', 'Phone', 'contact', 'agent'
        phone_like_fields = []
        contact_like_fields = []
        
        def search_nested_dict(data, path=""):
            if isinstance(data, dict):
                for key, value in data.items():
                    current_path = f"{path}.{key}" if path else key
                    # Look for phone-related fields
                    if any(term in key.lower() for term in ['phone', 'contact', 'agent', 'broker']):
                        if 'phone' in key.lower():
                            phone_like_fields.append(f"{current_path}: {value}")
                        else:
                            contact_like_fields.append(f"{current_path}: {value}")
                    
                    # Recurse into nested structures
                    search_nested_dict(value, current_path)
            elif isinstance(data, list) and data:
                for i, item in enumerate(data[:3]):  # Check first 3 items
                    search_nested_dict(item, f"{path}[{i}]")
        
        search_nested_dict(listing)
        
        if phone_like_fields:
            print(f"   📞 Phone-like fields found: {phone_like_fields}")
        else:
            print(f"   ❌ No phone fields found")
            
        if contact_like_fields:
            print(f"   👤 Contact-like fields found: {contact_like_fields}")
        else:
            print(f"   ❌ No additional contact fields found")
        
        # Extract contact information from various possible fields in listing
        contact_info = {}
        
        # Try to get broker/agent name
        if 'brokerName' in listing and listing['brokerName']:
            contact_info['company'] = listing['brokerName']
            contact_info['name'] = listing['brokerName']  # Use company name as contact name for now
        
        # Check hdpData for additional contact info
        if 'hdpData' in listing and listing['hdpData'] and 'homeInfo' in listing['hdpData']:
            hdp_info = listing['hdpData']['homeInfo']
            
            # Look for agent/broker info in hdpData
            for field in ['listingAgent', 'agent', 'brokerName', 'listingBroker']:
                if field in hdp_info and hdp_info[field]:
                    if isinstance(hdp_info[field], dict):
                        # If it's a dict, extract name and other details
                        agent_data = hdp_info[field]
                        if 'name' in agent_data:
                            contact_info['name'] = agent_data['name']
                        if 'phone' in agent_data:
                            contact_info['phoneNumber'] = agent_data['phone']
                        if 'id' in agent_data:
                            contact_info['agentId'] = str(agent_data['id'])
                    elif isinstance(hdp_info[field], str):
                        contact_info['name'] = hdp_info[field]
        
        # Try to get other contact fields that might be present
        for field in ['agentName', 'listingAgentName', 'contactName', 'agentDisplayName']:
            if field in listing and listing[field]:
                contact_info['name'] = listing[field]
                break
        
        # Try to get phone number from various possible fields
        phone_fields = ['phoneNumber', 'agentPhoneNumber', 'listingAgentPhone', 'contactPhone', 'phone']
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
        
        # Only create contact if we have at least a phone number or meaningful contact info
        if not contact_info.get('phoneNumber') and not contact_info.get('name'):
            return None
        
        # If we don't have a phone number but have company/name info, create a contact with placeholder phone
        if not contact_info.get('phoneNumber') and contact_info.get('name'):
            # Use a placeholder phone number format for companies without direct contact
            contact_info['phoneNumber'] = "000-000-0000"  # Placeholder for company contacts
            
        # Check if contact already exists by agentId
        if contact_info.get('agentId'):
            existing_contact = await prisma.contact.find_unique(
                where={
                    'agentId': contact_info['agentId']
                }
            )
            if existing_contact:
                # Connect existing contact to lead
                await prisma.lead.update(
                    where={'id': lead_id},
                    data={
                        'contacts': {
                            'connect': {'id': existing_contact.id}
                        }
                    }
                )
                return existing_contact.__dict__
        
        # Create new contact
        new_contact_data = {
            'agentId': contact_info.get('agentId'),
            'name': contact_info.get('name'),
            'phoneNumber': contact_info['phoneNumber'],
            'type': ContactType.AGENT,  # Default to AGENT
            'company': contact_info.get('company'),
            'leads': {
                'connect': {'id': lead_id}
            }
        }
        
        # Remove None values
        new_contact_data = {k: v for k, v in new_contact_data.items() if v is not None}
        
        new_contact = await prisma.contact.create(data=new_contact_data)
        return new_contact.__dict__
        
    except Exception as e:
        print(f"Error extracting contact from listing: {str(e)}")
        return None

if __name__ == "__main__":
    asyncio.run(main())