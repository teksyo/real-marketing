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
from typing import List, Dict, Optional
from dataclasses import dataclass
import base64

# Directory for storing debug data
DATA_DIR = Path("zillow_data")

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

async def save_to_db(listing):
    """Save a single listing and its contacts to the database"""
    db = Prisma()
    await db.connect()
    
    try:
        # Extract zipcode and region from address
        address_parts = listing['address'].split(',')
        zipcode = address_parts[-1].strip().split()[-1] if len(address_parts) > 2 else "00000"
        region = address_parts[-1].strip().split()[-2] if len(address_parts) > 2 else "Unknown"  # Get state/province
        
        # Prepare lead data
        lead_data = {
            "zid": str(listing.get('zpid', '')),
            "address": listing.get('address', ''),
            "price": listing.get('price', ''),
            "beds": str(listing.get('beds', '')),
            "link": listing.get('detailUrl', ''),
            "zipCode": zipcode,
            "region": region,
            "status": "new"
        }
        
        # Check if lead exists
        existing_lead = await db.lead.find_unique(
            where={
                "zid": lead_data["zid"]
            }
        )
        
        if not existing_lead:
            # Process contacts if available
            contacts_data = []
            if 'contacts' in listing:
                for contact in listing['contacts']:
                    # Check if contact exists
                    existing_contact = None
                    if contact.get('agentId'):
                        existing_contact = await db.contact.find_unique(
                            where={
                                "agentId": contact['agentId']
                            }
                        )
                    
                    if not existing_contact:
                        # Create new contact
                        contact_data = {
                            "agentId": contact.get('agentId'),
                            "name": contact.get('name'),
                            "phoneNumber": contact.get('phoneNumber'),
                            "type": "AGENT" if contact.get('type') == 'AGENT' else "BROKER",  # Ensure valid enum value
                            "licenseNo": contact.get('licenseNo'),
                            "company": contact.get('company')
                        }
                        contacts_data.append(contact_data)
            
            # Create lead with contacts
            lead_data["contacts"] = {
                "create": contacts_data
            } if contacts_data else {}
            
            await db.lead.create(data=lead_data)
            return "created"
        return "exists"
            
    except Exception as e:
        print(f"Error saving listing {lead_data.get('zid')}: {str(e)}")
        return "error"
    finally:
        await db.disconnect()

async def update_phone_number(lead_id, phone_number):
    """Update phone number for a specific lead"""
    db = Prisma()
    await db.connect()
    
    try:
        await db.lead.update(
            where={
                "id": lead_id
            },
            data={
                "phoneNumber": phone_number
            }
        )
        return True
    except Exception as e:
        print(f"Error updating phone number for lead {lead_id}: {str(e)}")
        return False
    finally:
        await db.disconnect()

async def get_leads_without_phone():
    """Get all leads that don't have a phone number and haven't exceeded fetch attempts"""
    db = Prisma()
    await db.connect()
    
    try:
        leads = await db.lead.find_many(
            where={
                "contacts": {
                    "none": {}
                },
                "contactFetchAttempts": {
                    "lt": 2  # Less than 2 attempts
                }
            },
            include={
                "contacts": True
            }
        )
        return leads
    finally:
        await db.disconnect()

def extract_contact_info(html_content):
    """Extract contact information from HTML content using BeautifulSoup"""
    soup = BeautifulSoup(html_content, 'html.parser')
    contacts = []
    
    # Enhanced selectors for contact information
    contact_sections = [
        soup.find(attrs={"data-testid": "seller-attribution"}),  # Primary seller attribution
        soup.find('div', {'class': 'agent-info'}),  # Agent info section
        soup.find('div', {'class': 'ds-listing-agent-info'}),  # Listing agent info
        soup.find('div', {'class': 'ds-seller-attribution'}),  # Seller attribution
        soup.find('div', {'class': 'contact-info'}),  # Generic contact info
        soup.find('div', {'class': 'agent-details'}),  # Agent details
        soup.find('div', {'class': 'broker-info'}),  # Broker info
        # Modal/popup content
        soup.find('div', {'role': 'dialog'}),
        soup.find('div', {'class': lambda x: x and 'modal' in x.lower() if x else False}),
    ]
    
    # Also search in parent containers
    for section in contact_sections[:]:
        if section and section.parent:
            contact_sections.append(section.parent)
    
    for section in contact_sections:
        if not section:
            continue
            
        contact_info = {
            'agentId': None,
            'name': None,
            'phoneNumber': None,
            'type': 'AGENT',  # Default to AGENT
            'licenseNo': None,
            'company': None
        }
        
        # Prioritize xxx-xxx-xxxx format but fallback to other formats if needed
        section_text = section.get_text()
        
        # First try the specific xxx-xxx-xxxx format
        primary_phone_pattern = r'\b\d{3}-\d{3}-\d{4}\b'
        phone_match = re.search(primary_phone_pattern, section_text)
        
        if not phone_match:
            # Fallback patterns for other common formats
            fallback_patterns = [
                r'\b\d{3}\.\d{3}\.\d{4}\b',  # xxx.xxx.xxxx
                r'\b\(\d{3}\)\s*\d{3}-\d{4}\b',  # (xxx) xxx-xxxx
                r'\b\(\d{3}\)\s*\d{3}\s*\d{4}\b',  # (xxx) xxx xxxx
                r'\b\d{3}\s*\d{3}\s*\d{4}\b',  # xxx xxx xxxx
            ]
            
            for pattern in fallback_patterns:
                phone_match = re.search(pattern, section_text)
                if phone_match:
                    break
        
        if phone_match:
            # Clean and format the phone number consistently
            phone = re.sub(r'[^\d]', '', phone_match.group(0))
            if len(phone) >= 10:  # Ensure we have at least a full phone number
                contact_info['phoneNumber'] = f"({phone[:3]}) {phone[3:6]}-{phone[6:10]}"
        
        # Look for agent ID in profile links and data attributes
        agent_links = section.find_all(['a', 'div', 'span'], 
            attrs={'href': lambda x: x and ('profile' in x or 'agent' in x) if x else False})
        for link in agent_links:
            # Check href attribute
            href = link.get('href', '')
            agent_id_match = re.search(r'/(?:profile|agent)/(\d+)/?', href)
            if agent_id_match:
                contact_info['agentId'] = agent_id_match.group(1)
                break
            
            # Check data attributes
            for attr in link.attrs:
                if 'agent' in attr.lower() and link[attr].isdigit():
                    contact_info['agentId'] = link[attr]
                    break
        
        # Enhanced license number patterns
        license_patterns = [
            r'(?:DRE|License|Lic\.?)\s*#?\s*([A-Z0-9-]+)',  # Standard format
            r'(?:Real Estate License|Agent License|Broker License)\s*#?\s*([A-Z0-9-]+)',  # Extended format
            r'License(?:\s+number)?:\s*([A-Z0-9-]+)',  # Alternative format
        ]
        
        for pattern in license_patterns:
            license_matches = re.findall(pattern, section_text, re.IGNORECASE)
            if license_matches:
                contact_info['licenseNo'] = f"DRE #{license_matches[0]}"
                break
        
        # Enhanced company indicators
        company_indicators = [
            'LLC', 'Inc', 'Real Estate', 'Realty', 'Properties', 'Brokerage', 'Group',
            'Associates', 'Agency', 'Company', 'Corp', 'Corporation', 'Team', 'Partners',
            'International', 'Homes', 'Sotheby', 'Coldwell', 'Century 21', 'RE/MAX',
            'Keller Williams', 'Berkshire Hathaway'
        ]
        
        # First try to find structured company data
        company_elem = section.find(['span', 'div', 'a'], 
            attrs={'class': lambda x: x and any(c in x.lower() for c in ['company', 'broker', 'office', 'business']) if x else False})
        if company_elem:
            contact_info['company'] = company_elem.get_text().strip()
        
        if not contact_info['company']:
            # Look for company name in text
            company_matches = []
            for elem in section.find_all(['span', 'div', 'a']):
                text = elem.get_text().strip()
                if any(indicator in text for indicator in company_indicators):
                    company_matches.append(text)
            
            if company_matches:
                # Use the longest match as it's likely the full company name
                contact_info['company'] = max(company_matches, key=len)
        
        # Try to find name after company is identified
        name_elements = section.find_all(['span', 'div', 'a'], 
            string=lambda x: x and len(x.strip()) > 2 and 
                           not any(char.isdigit() for char in x) and
                           not any(indicator in x for indicator in company_indicators))
        
        for elem in name_elements:
            text = elem.get_text().strip()
            # Check if it looks like a name (2+ words, no special characters)
            if len(text.split()) >= 2 and re.match(r'^[A-Za-z\s.-]+$', text):
                contact_info['name'] = text
                break
        
        # Determine contact type
        if contact_info.get('company'):
            if any(broker_term in section_text.lower() for broker_term in ['broker', 'brokerage']):
                contact_info['type'] = 'BROKER'
            elif contact_info.get('name'):  # Has both company and individual name
                contact_info['type'] = 'AGENT'
        
        # Only add contact if we found meaningful information
        if (contact_info['phoneNumber'] or contact_info['agentId']) and \
           (contact_info['name'] or contact_info['company']):
            # Check if this contact is unique
            if not any(c['agentId'] == contact_info['agentId'] or 
                      c['phoneNumber'] == contact_info['phoneNumber'] 
                      for c in contacts):
                contacts.append(contact_info)
    
    # Debug output (console only)
    if not contacts:
        print("No contact information found in the HTML")
    else:
        print(f"Found {len(contacts)} contacts:")
        for contact in contacts:
            print(f"- {contact['type']}: {contact['name'] or contact['company']} ({contact['phoneNumber']})")
    
    return contacts

async def update_contact_info(lead_id, contacts):
    """Update contact information for a specific lead"""
    db = Prisma()
    await db.connect()
    
    try:
        for contact_info in contacts:
            # First try to find contact by agent ID if available
            existing_contact = None
            if contact_info['agentId']:
                existing_contact = await db.contact.find_unique(
                    where={
                        "agentId": contact_info['agentId']
                    }
                )
            
            # If no agent ID or not found by agent ID, try phone number
            if not existing_contact:
                existing_contact = await db.contact.find_first(
                    where={
                        "phoneNumber": contact_info["phoneNumber"]
                    }
                )
            
            if existing_contact:
                contact_id = existing_contact.id
                # Update existing contact with any new information
                await db.contact.update(
                    where={"id": contact_id},
                    data={
                        "name": contact_info["name"] if contact_info["name"] else existing_contact.name,
                        "licenseNo": contact_info["licenseNo"] if contact_info["licenseNo"] else existing_contact.licenseNo,
                        "company": contact_info["company"] if contact_info["company"] else existing_contact.company,
                        "agentId": contact_info["agentId"] if contact_info["agentId"] else existing_contact.agentId
                    }
                )
            else:
                # Create new contact
                contact = await db.contact.create(
                    data={
                        **contact_info,
                        "leads": {
                            "connect": [{"id": lead_id}]
                        }
                    }
                )
                contact_id = contact.id
            
            # Connect contact to lead if not already connected
            await db.lead.update(
                where={"id": lead_id},
                data={
                    "contacts": {
                        "connect": [{"id": contact_id}]
                    }
                }
            )
        
        return True
    except Exception as e:
        print(f"Error updating contact information for lead {lead_id}: {str(e)}")
        return False
    finally:
        await db.disconnect()

async def update_missing_phone_numbers():
    """Find and update leads without contact information"""
    db = Prisma()
    await db.connect()
    
    try:
        # Get leads that don't have any contacts and haven't exceeded fetch attempts
        leads = await db.lead.find_many(
            where={
                "contacts": {
                    "none": {}
                },
                "contactFetchAttempts": {
                    "lt": 2  # Less than 2 attempts
                }
            },
            include={
                "contacts": True
            }
        )
        
        if not leads:
            print("No leads found without contact information or all leads have exceeded fetch attempts")
            return
        
        print(f"Found {len(leads)} leads to process for contact information")
        updated_count = 0
        
        for lead in leads:
            try:
                print(f"Processing lead {lead.id}: {lead.address}")
                
                # Increment the attempt counter
                await db.lead.update(
                    where={"id": lead.id},
                    data={
                        "contactFetchAttempts": lead.contactFetchAttempts + 1
                    }
                )
                
                if lead.link:
                    response = fetch_listing_details(lead.link)
                    
                    if response:
                        contacts = extract_contact_info(response)
                        if contacts:
                            if await update_contact_info(lead.id, contacts):
                                print(f"✅ Updated contact information for lead {lead.id}")
                                print(f"   Found {len(contacts)} contacts:")
                                for contact in contacts:
                                    print(f"   - {contact['type']}: {contact['name'] or contact['company']} ({contact['phoneNumber']})")
                                updated_count += 1
                            else:
                                print(f"❌ Failed to update contact information for lead {lead.id}")
                        else:
                            print(f"No contact information found for lead {lead.id}")
                    
                # Add a delay between requests
                time.sleep(random.uniform(3, 7))
                    
            except Exception as e:
                print(f"Error processing lead {lead.id}: {str(e)}")
                continue
        
        print(f"\nContact information update summary:")
        print(f"- Total leads processed: {len(leads)}")
        print(f"- Successfully updated: {updated_count}")
        print(f"- Failed to update: {len(leads) - updated_count}")
    
    finally:
        await db.disconnect()

async def fetch_us_listings() -> bool:
    """Fetch listings across the continental US"""
    print("\nFetching newest listings across US...")
    
    # Base URL for US listings
    base_url = "https://www.zillow.com/homes/for_sale/"
    
    # Search parameters for US-wide search, sorted by newest
    search_params = {
        "searchQueryState": {
            "pagination": {},
            "mapBounds": get_us_map_bounds(),
            "isMapVisible": False,
            "filterState": {
                "sortSelection": {"value": "days"},  # Sort by newest
                "isAllHomes": {"value": True},
                "isForSaleByAgent": {"value": True},
                "isForSaleByOwner": {"value": True},
                "isNewConstruction": {"value": True},
                "isComingSoon": {"value": True},
                "isAuction": {"value": True},
                "isForSaleForeclosure": {"value": True}
            },
            "isListVisible": True
        }
    }
    
    headers = {
        'User-Agent': get_user_agent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.zillow.com/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
    }
    
    # Create a timestamp for log files
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    print(f"Making request to Zillow for newest US listings...")
    print(f"Base URL: {base_url}")
    
    try:
        with requests.Session() as session:
            session.proxies = PROXIES
            session.headers.update(headers)
            
            # Add a small delay to mimic human behavior
            time.sleep(random.uniform(2, 4))
            
            # First get the main page to get cookies
            response = session.get(
                base_url,
                params={"searchQueryState": json.dumps(search_params["searchQueryState"])},
                timeout=30,
                verify=True
            )
            
            # Save the HTML for debugging if needed
            debug_file = DATA_DIR / f"debug_html_{timestamp}.html"
            with open(debug_file, "w", encoding="utf-8") as f:
                f.write(response.text)
            
            print(f"Response status code: {response.status_code}")
            print(f"Response length: {len(response.text)} characters")
            
            # Extract the search query state from the HTML
            search_data = None 
            try:
                # Find the start of the searchResults object
                start_marker = '"searchResults":'
                start_pos = response.text.find(start_marker)
                
                if start_pos != -1:
                    print("Found search results marker")
                    # Find the start of the JSON object (skip whitespace)
                    json_start = response.text.find('{', start_pos)
                    if json_start != -1:
                        # Extract the complete JSON object
                        json_str = find_json_object(response.text, json_start)
                        if json_str:
                            print("Successfully extracted JSON object")
                            try:
                                search_data = {"searchResults": json.loads(json_str)}
                                
                                # Save the raw extracted data for debugging
                                raw_file = DATA_DIR / f"zillow_raw_{timestamp}.json"
                                with open(raw_file, "w", encoding="utf-8") as f:
                                    json.dump(search_data, f, indent=2)
                                
                                print("Successfully saved raw search data")
                                
                                # Process the search results
                                if 'searchResults' in search_data and 'listResults' in search_data['searchResults']:
                                    results = search_data['searchResults']['listResults']
                                    print(f"Found {len(results)} listings")
                                    
                                    # Process each listing
                                    new_count = 0
                                    existing_count = 0
                                    error_count = 0
                                    
                                    for result in results:
                                        try:
                                            # Get detailed listing info including contacts
                                            if result.get('detailUrl'):
                                                detail_html = fetch_listing_details(result['detailUrl'])
                                                if detail_html:
                                                    contacts = extract_contact_info(detail_html)
                                                    if contacts:
                                                        result['contacts'] = contacts
                                            
                                            # Save to database
                                            status = await save_to_db(result)
                                            if status == "created":
                                                new_count += 1
                                            elif status == "exists":
                                                existing_count += 1
                                            else:
                                                error_count += 1
                                                
                                            # Add a delay between listings
                                            time.sleep(random.uniform(1, 3))
                                            
                                        except Exception as e:
                                            print(f"Error processing listing {result.get('zpid', 'unknown')}: {str(e)}")
                                            error_count += 1
                                            continue
                                    
                                    print(f"\nListing fetch summary:")
                                    print(f"- Total listings found: {len(results)}")
                                    print(f"- New leads: {new_count}")
                                    print(f"- Already exists: {existing_count}")
                                    print(f"- Errors: {error_count}")
                                    return True
                                else:
                                    print("No search results found in the data")
                                    return False
                                    
                            except json.JSONDecodeError as e:
                                print(f"Error parsing search data JSON: {e}")
                                return False
                        else:
                            print("Could not find complete JSON object")
                            return False
                    else:
                        print("Could not find start of JSON object")
                        return False
                else:
                    print("Could not find search results in the response")
                    return False
            
            except Exception as e:
                print(f"Error extracting data from HTML: {e}")
                return False
                
    except Exception as e:
        print(f"Error fetching US listings: {str(e)}")
        return False

async def main():
    parser = argparse.ArgumentParser(description='Fetch Zillow listings across the US')
    parser.add_argument('--skip-fetch', action='store_true', help='Skip fetching new listings')
    parser.add_argument('--skip-contacts', action='store_true', help='Skip updating contact information')
    args = parser.parse_args()
    
    ensure_data_directory()
    
    if not args.skip_fetch:
        print("Fetching listings across the US...")
        success = await fetch_us_listings()
        if not success:
            print("Failed to fetch listings")
            return
    
    if not args.skip_contacts:
        print("Updating contact information for leads...")
        await update_missing_phone_numbers()

def find_json_object(text, start_pos):
    """
    Find a complete JSON object in text starting from start_pos
    Handles nested objects and escaped quotes
    """
    stack = []
    in_string = False
    escape = False
    
    for i in range(start_pos, len(text)):
        char = text[i]
        
        if not escape and char == '"':
            in_string = not in_string
        elif not in_string:
            if char == '{':
                stack.append(char)
            elif char == '}':
                if not stack:
                    return None
                stack.pop()
                if not stack:
                    return text[start_pos:i+1]
        
        escape = not escape and in_string and char == '\\'
    
    return None

# Proxy configuration
PROXY_USERNAME = "sp6mbpcybk"
PROXY_PASSWORD = "K40SClud=esN8jxg9c"
PROXY_HOST = "gate.decodo.com"
PROXY_PORT = "10001"

# Configure proxy with auth in the URL
PROXY_URL = f"http://{PROXY_USERNAME}:{PROXY_PASSWORD}@{PROXY_HOST}:{PROXY_PORT}"
PROXIES = {
    "http": PROXY_URL,
    "https": PROXY_URL
}

def get_user_agent():
    """Return a random user agent string"""
    user_agents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0'
    ]
    return random.choice(user_agents)

def test_proxy_connection():
    """Test if the proxy connection is working"""
    print("Testing proxy connection...")
    print(f"Using proxy: {PROXY_HOST}:{PROXY_PORT}")
    try:
        response = requests.get(
            "https://ip.decodo.com/json",
            proxies=PROXIES,
            timeout=30,
            verify=True
        )
        if response.status_code == 200:
            ip_data = response.json()
            print(f"✅ Proxy connection successful!")
            print(f"Current IP: {ip_data.get('ip')}")
            return True
        else:
            print(f"❌ Proxy test failed with status code: {response.status_code}")
            print(f"Response content: {response.text}")
            return False
    except Exception as e:
        print(f"❌ Proxy test failed with error: {str(e)}")
        print("Please verify:")
        print("1. Proxy credentials are correct")
        print("2. Proxy server is running")
        print("3. Your IP is whitelisted (if required)")
        return False

def fetch_listing_details(detail_url):
    """
    Fetch detailed information for a single listing
    """
    print(f"Fetching details for: {detail_url}")
    
    headers = {
        'User-Agent': get_user_agent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.zillow.com/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
    }
    
    try:
        # Add a random delay between requests
        time.sleep(random.uniform(2, 5))
        
        response = requests.get(
            detail_url,
            headers=headers,
            proxies=PROXIES,
            timeout=30
        )
        
        if response.status_code == 200:
            return response.text
        else:
            print(f"Failed to fetch details. Status code: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"Error fetching listing details: {str(e)}")
        return None

def ensure_data_directory():
    """Ensure the data directory exists"""
    DATA_DIR.mkdir(exist_ok=True)

if __name__ == "__main__":
    asyncio.run(main())