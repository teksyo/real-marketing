#!/bin/bash

# Exit on any error
set -e

echo "=== Starting Scraper Setup ==="
echo "Current directory: $(pwd)"
echo "Python version: $(python3 --version)"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Verify we're in the right venv
echo "Virtual env Python: $(which python)"
echo "Virtual env pip: $(which pip)"

# Install/update requirements
echo "Installing requirements..."
pip install -r requirements.txt

# Generate Prisma client
echo "Generating Prisma client..."
prisma generate
prisma migrate deploy


# Verify Prisma import works
echo "Testing Prisma import..."
python -c "from prisma import Prisma; print('✓ Prisma import successful')"
echo $DATABASE_URL && /opt/render/project/src/.venv/bin/python /opt/render/project/src/path/to/test_prisma_connection.py


# Run the scraper
echo "Starting scraper..."
export SCRAPERAPI_KEY='00d53552daadeff0cbdd543558c909b8'
python zillow_complete_scraper.py
echo "=== Scraper completed successfully ==="