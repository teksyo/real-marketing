from dotenv import load_dotenv
import os
from pathlib import Path

# Load environment variables
load_dotenv()

# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL')

# Data directory for storing debug data
DATA_DIR = Path("zillow_data")

# Scraping configuration
ZILLOW_URL = "https://www.zillow.com"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"

# US Map Bounds
US_MAP_BOUNDS = {
    "west": -124.848974,
    "east": -66.885444,
    "south": 24.396308,
    "north": 49.384358
}

# Scraping settings
MAX_CONTACT_FETCH_ATTEMPTS = 2
DELAY_BETWEEN_REQUESTS = 2  # seconds
MAX_RETRIES = 3

# Create data directory if it doesn't exist
DATA_DIR.mkdir(exist_ok=True)

# Regions to scrape (can be moved to environment variables if needed)
REGIONS = [
    "CA",  # California
    "TX",  # Texas
    # Add more regions as needed
]
