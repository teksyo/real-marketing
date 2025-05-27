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
import urllib3
import pyzill
urllib3.disable_warnings()

# Directory for storing debug data
DATA_DIR = Path("zillow_data")

# Initialize Prisma client
prisma = Prisma()

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

async def save_to_db(listing: Dict) -> str:
    """Save a listing to the database"""
    try:
        # Extract basic listing info
        zpid = str(listing.get('zpid', ''))
        if not zpid:
            return "error"
            
        # Check if listing already exists
        existing = await prisma.lead.find_unique(
            where={
                'zid': zpid
            }
        )
        
        if existing:
            return "exists"
            
        # Prepare listing data
        listing_data = {
            'zid': zpid,
            'address': listing.get('address', ''),
            'price': str(listing.get('unformattedPrice', '')),
            'beds': str(listing.get('beds', '')),
            'link': listing.get('detailUrl', ''),
            'zipCode': listing.get('addressZipcode', ''),
            'region': f"{listing.get('addressCity', '')}, {listing.get('addressState', '')}",
            'status': 'new',
            'contactFetchAttempts': 0
        }
        
        # Create new listing
        await prisma.lead.create(data=listing_data)
        return "created"
        
    except Exception as e:
        print(f"Error saving listing to database: {str(e)}")
        return "error"

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
        
        # Phone number patterns
        phone_patterns = [
            r'\b\d{3}-\d{3}-\d{4}\b',  # xxx-xxx-xxxx
            r'\b\d{3}\.\d{3}\.\d{4}\b',  # xxx.xxx.xxxx
            r'\b\(\d{3}\)\s*\d{3}-\d{4}\b',  # (xxx) xxx-xxxx
            r'\b\(\d{3}\)\s*\d{3}\s*\d{4}\b',  # (xxx) xxx xxxx
            r'\b\d{3}\s*\d{3}\s*\d{4}\b',  # xxx xxx xxxx
        ]
        
        for lead in leads:
            try:
                if not lead.link:
                    print(f"No URL for lead {lead.zid}, skipping...")
                    errors += 1
                    continue
                
                # Configure proxy
                username = 'user-sp6mbpcybk-session-1-state-us_virginia'
                password = 'K40SClud=esN8jxg9c'
                proxy_url = pyzill.parse_proxy("gate.decodo.com", "7000", username, password)
                
                # Get detailed listing info
                detail_data = pyzill.get_from_home_url(lead.link, proxy_url)
                
                # Increment contact fetch attempts
                await prisma.lead.update(
                    where={
                        'id': lead.id
                    },
                    data={
                        'contactFetchAttempts': lead.contactFetchAttempts + 1
                    }
                )
                
                if not detail_data:
                    print(f"No detail data for lead {lead.zid}")
                    errors += 1
                    continue
                
                # Try to get contacts from pyzill response
                contacts_to_create = []
                if isinstance(detail_data, dict) and 'contacts' in detail_data:
                    for contact_data in detail_data['contacts']:
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
                            'phoneNumber': contact_data.get('phoneNumber'),
                            'type': contact_data.get('type', 'AGENT'),
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
                        # Create a generic contact for each phone number
                        for phone in phone_numbers:
                            contact = {
                                'phoneNumber': phone,
                                'type': 'AGENT',
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
                    print(f"Updated contact info for lead {lead.zid} - Found {len(contacts_to_create)} contacts")
                else:
                    print(f"No contacts found for lead {lead.zid}")
                    errors += 1
                
                # Add delay between requests
                time.sleep(random.uniform(2, 4))
                
            except Exception as e:
                print(f"Error updating contact info for lead {lead.zid}: {str(e)}")
                errors += 1
                continue
        
        print(f"\nContact update summary:")
        print(f"- Total leads processed: {len(leads)}")
        print(f"- Successfully updated: {updated}")
        print(f"- Errors: {errors}")
        
    except Exception as e:
        print(f"Error updating contact information: {str(e)}")

async def fetch_us_listings() -> bool:
    """Fetch listings across the continental US"""
    print("\nFetching newest listings across US...")
    
    try:
        # Get US map bounds
        bounds = get_us_map_bounds()
        
        # Configure proxy
        username = 'user-sp6mbpcybk-session-1-state-us_virginia'
        password = 'K40SClud=esN8jxg9c'
        proxy_url = pyzill.parse_proxy("gate.decodo.com", "7000", username, password)
        
        # Fetch listings using pyzill
        response = pyzill.for_sale(
            pagination=1,  # We only need first page as it contains all results
            search_value="Miami, FL",  # Let's try with a specific location
            min_beds=None,
            max_beds=None,
            min_bathrooms=None,
            max_bathrooms=None,
            min_price=None,
            max_price=None,
            ne_lat=25.855783,  # Miami bounds
            ne_long=-80.139160,
            sw_lat=25.709042,
            sw_long=-80.317993,
            zoom_value=12,
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
                
                # Save to database (without contacts - we'll fetch those separately)
                status = await save_to_db(result)
                if status == "created":
                    new_count += 1
                    print(f"Saved new listing {idx+1}/{len(results)}")
                elif status == "exists":
                    existing_count += 1
                    print(f"Listing already exists {idx+1}/{len(results)}")
                else:
                    error_count += 1
                    print(f"Error saving listing {idx+1}/{len(results)}")
                    
            except Exception as e:
                print(f"Error processing listing: {str(e)}")
                error_count += 1
                continue
        
        print(f"\nListing fetch summary:")
        print(f"- Total listings found: {len(results)}")
        print(f"- New leads: {new_count}")
        print(f"- Already exists: {existing_count}")
        print(f"- Errors: {error_count}")
        return True
                
    except Exception as e:
        print(f"Error fetching US listings: {str(e)}")
        return False

async def main():
    parser = argparse.ArgumentParser(description='Fetch Zillow listings across the US')
    parser.add_argument('--skip-fetch', action='store_true', help='Skip fetching new listings')
    parser.add_argument('--skip-contacts', action='store_true', help='Skip updating contact information')
    args = parser.parse_args()
    
    ensure_data_directory()
    
    # Connect to database
    await prisma.connect()
    
    try:
        # Test proxy connection
        if not test_proxy_connection():
            print("Failed to establish proxy connection. Exiting...")
            return
        
        if not args.skip_fetch:
            print("Fetching listings across the US...")
            success = await fetch_us_listings()
            if not success:
                print("Failed to fetch listings")
                return
        
        if not args.skip_contacts:
            print("Updating contact information for leads...")
            await update_missing_phone_numbers()
            
    finally:
        await prisma.disconnect()

def ensure_data_directory():
    """Ensure the data directory exists"""
    DATA_DIR.mkdir(exist_ok=True)

if __name__ == "__main__":
    asyncio.run(main())