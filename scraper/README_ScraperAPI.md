# Zillow Contact Scraper using ScraperAPI

A robust solution for extracting agent contact information from Zillow property detail pages using ScraperAPI to bypass anti-bot protection.

## 🚀 Features

- **Bypasses Zillow's PerimeterX protection** using ScraperAPI
- **Batch processing** with rate limiting
- **Automatic retry logic** with exponential backoff
- **Phone number extraction** using multiple regex patterns
- **Agent name and company extraction**
- **Database integration** with Prisma
- **Test mode** for single URL testing

## 📋 Prerequisites

### 1. ScraperAPI Account
- Sign up at [ScraperAPI.com](https://www.scraperapi.com/)
- Get your API key from the dashboard
- **Recommended plan**: Professional ($149/month) for better success rates

### 2. Environment Setup
```bash
# Set your ScraperAPI key
export SCRAPERAPI_KEY='your_api_key_here'

# Or add to your .env file
echo "SCRAPERAPI_KEY=your_api_key_here" >> .env
```

### 3. Dependencies
```bash
pip3.10 install beautifulsoup4 requests prisma
```

## 🎯 How It Works

### 1. **Database Query**
- Finds Zillow leads without contact information
- Filters by `source = 'ZILLOW'` and `contacts = none`
- Limits contact fetch attempts to avoid infinite loops

### 2. **ScraperAPI Integration**
- Uses premium proxies and JavaScript rendering
- Handles captchas and bot detection automatically
- Rotates sessions for better success rates

### 3. **Contact Extraction**
- Parses HTML with BeautifulSoup
- Extracts phone numbers using regex patterns
- Finds agent names and company information
- Creates contact records in database

## 🔧 Usage

### Test Mode (Recommended First)
```bash
# Test with default property
python3.10 scraper_api_contacts.py --test

# Test with specific URL
python3.10 scraper_api_contacts.py --test --url "https://www.zillow.com/homedetails/your-property-id_zpid/"
```

### Production Mode
```bash
# Process up to 50 leads without contacts
python3.10 scraper_api_contacts.py
```

## ⚙️ Configuration

### Rate Limiting (adjust in script)
```python
MIN_DELAY = 3      # Minimum seconds between requests
MAX_DELAY = 7      # Maximum seconds between requests  
BATCH_SIZE = 10    # Leads per batch
BATCH_DELAY = 30   # Seconds between batches
MAX_RETRIES = 3    # Retry attempts per URL
```

### ScraperAPI Parameters
```python
'render': 'true',        # Enable JavaScript rendering
'country_code': 'us',    # Use US proxies
'premium': 'true',       # Use premium proxies
'session_number': random # Rotate sessions
```

## 💰 Cost Estimation

### ScraperAPI Pricing
- **Professional Plan**: $149/month (250K requests)
- **Cost per request**: ~$0.0006
- **Cost per property**: ~$0.002 (including retries)

### Expected Results
- **Success rate**: 70-85% (depends on Zillow's protection)
- **Processing speed**: ~10-15 properties per minute
- **Monthly capacity**: ~125K properties on Professional plan

## 📊 Example Output

```bash
🚀 Zillow Contact Scraper using ScraperAPI
📅 Started at: 2024-01-15 10:30:00

🏠 Processing 41 Zillow leads for contact information...
📊 Processing in batches of 10

📦 Processing batch 1/5 (10 leads)

🔍 Lead 1/41 - ID: 442663676
   🔗 URL: https://www.zillow.com/homedetails/442663676_zpid/
   🌐 Attempt 1/3 - Scraping: https://www.zillow.com/homedetails/442663676_zpid/
   ✅ Successfully fetched page (Length: 156789 chars)
   📞 Found: 2 phones, 1 names, 1 companies
     ✅ Created contact: John Smith - (555) 123-4567
     ✅ Created contact: Unknown Agent - (555) 987-6543

📊 Final Summary:
- Total leads processed: 41
- Total contacts created: 67
- Total errors: 8
- Success rate: 80.5%
```

## 🔍 What Gets Extracted

### Phone Numbers
- Agent direct lines
- Office numbers  
- Mobile numbers
- Formatted as: `(555) 123-4567`

### Agent Information
- Full names
- Company/brokerage names
- Agent roles (automatically set as AGENT type)

### Data Quality
- Deduplicates phone numbers
- Validates phone number format
- Associates contacts with leads in database

## 🛠️ Troubleshooting

### Common Issues

1. **"SCRAPERAPI_KEY not set"**
   ```bash
   export SCRAPERAPI_KEY='your_actual_key'
   ```

2. **403 Forbidden responses**
   - ScraperAPI is being blocked
   - Try premium proxies: `'premium': 'true'`
   - Increase delays between requests

3. **No contacts found**
   - Property page structure may have changed
   - Check HTML selectors in `extract_agent_info()`
   - Zillow may not display contact info for that property

4. **Rate limiting**
   - Increase `MIN_DELAY` and `MAX_DELAY`
   - Reduce `BATCH_SIZE`
   - Check ScraperAPI usage limits

### Debug Mode
Add debug prints to see raw HTML:
```python
# In scrape_property_contacts function
print(f"Raw HTML (first 1000 chars): {response.text[:1000]}")
```

## 🚦 Best Practices

1. **Start with test mode** to verify setup
2. **Monitor ScraperAPI usage** to avoid overages
3. **Run during off-peak hours** for better success rates
4. **Process in smaller batches** for better reliability
5. **Keep backups** of successful extractions

## 📈 Scaling Tips

1. **Multiple API keys**: Rotate between different ScraperAPI accounts
2. **Parallel processing**: Run multiple instances with different batches
3. **Time optimization**: Schedule runs during Zillow's low-traffic periods
4. **Result caching**: Store successful extractions to avoid re-scraping

## 🔒 Legal Considerations

- **Respect robots.txt** and Zillow's terms of service
- **Rate limiting** prevents overwhelming their servers  
- **Data usage** should comply with applicable laws
- **Commercial use** may require additional permissions

---

**Need help?** Check the logs for detailed error messages and success rates. 