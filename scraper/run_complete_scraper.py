#!/usr/bin/env python3
"""
Complete Zillow Scraper Runner
Runs both listing fetch and contact scraper in sequence

Usage:
python3.10 run_complete_scraper.py [--listings-only] [--contacts-only]
"""
import os
import sys
import subprocess
import time
from datetime import datetime
import argparse

def log_message(message):
    """Print timestamped log message"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {message}")

def run_script(script_name, env_vars=None):
    """Run a Python script with optional environment variables"""
    log_message(f"🚀 Starting {script_name}...")
    
    # Prepare environment
    env = os.environ.copy()
    if env_vars:
        env.update(env_vars)
    
    try:
        # Run the script
        result = subprocess.run([
            sys.executable, script_name
        ], env=env, capture_output=True, text=True, timeout=3600)  # 1 hour timeout
        
        if result.returncode == 0:
            log_message(f"✅ {script_name} completed successfully")
            if result.stdout:
                print(result.stdout)
            return True
        else:
            log_message(f"❌ {script_name} failed with exit code {result.returncode}")
            if result.stderr:
                print(f"Error: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        log_message(f"⏰ {script_name} timed out after 1 hour")
        return False
    except Exception as e:
        log_message(f"❌ Error running {script_name}: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Run complete Zillow scraping pipeline')
    parser.add_argument('--listings-only', action='store_true', help='Only run listings fetch')
    parser.add_argument('--contacts-only', action='store_true', help='Only run contact scraper')
    args = parser.parse_args()
    
    log_message("🏠 Starting Complete Zillow Scraper Pipeline")
    log_message(f"Current working directory: {os.getcwd()}")
    log_message(f"Script location: {os.path.abspath(__file__)}")
    
    # Check if required files exist
    listings_script = 'pyzill_fetch_listings.py'
    contacts_script = 'scraper_api_contacts.py'
    
    log_message(f"Checking for {listings_script}: {'✅ Found' if os.path.exists(listings_script) else '❌ Missing'}")
    log_message(f"Checking for {contacts_script}: {'✅ Found' if os.path.exists(contacts_script) else '❌ Missing'}")
    
    # Check for required API key
    scraperapi_key = os.getenv('SCRAPERAPI_KEY')
    if not scraperapi_key and not args.listings_only:
        log_message("❌ SCRAPERAPI_KEY environment variable not set")
        log_message("Please run: export SCRAPERAPI_KEY='your_api_key_here'")
        return False
    else:
        log_message("✅ SCRAPERAPI_KEY is set")
    
    success_count = 0
    total_steps = 0
    
    # Step 1: Fetch Listings
    if not args.contacts_only:
        total_steps += 1
        log_message("📋 Step 1: Fetching property listings from Zillow...")
        if run_script('pyzill_fetch_listings.py'):
            success_count += 1
            log_message("✅ Listings fetch completed")
        else:
            log_message("❌ Listings fetch failed")
            if not args.listings_only:
                log_message("⚠️  Continuing with contact scraper anyway...")
    
    # Delay between steps
    if not args.listings_only and not args.contacts_only:
        log_message("⏱️  Waiting 10 seconds before contact scraping...")
        time.sleep(10)
    
    # Step 2: Fetch Contacts
    if not args.listings_only:
        total_steps += 1
        log_message("📞 Step 2: Scraping contact information...")
        env_vars = {'SCRAPERAPI_KEY': scraperapi_key} if scraperapi_key else {}
        
        if run_script('scraper_api_contacts.py', env_vars):
            success_count += 1
            log_message("✅ Contact scraping completed")
        else:
            log_message("❌ Contact scraping failed")
    
    # Final summary
    log_message(f"📊 Pipeline Summary: {success_count}/{total_steps} steps completed successfully")
    
    if success_count == total_steps:
        log_message("🎉 Complete pipeline finished successfully!")
        return True
    else:
        log_message("⚠️  Pipeline completed with some failures")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 