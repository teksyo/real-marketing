#!/bin/bash

echo "[$(date)] Starting script"

npx prisma generate && \
npx prisma migrate deploy && \
python zillow_complete_scraper.py

echo "[$(date)] Script finished with code $?"
