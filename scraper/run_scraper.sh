#!/bin/bash

echo "[$(date)] Starting script"

prisma generate && \
prisma migrate deploy && \
python zillow_complete_scraper.py

echo "[$(date)] Script finished with code $?"
