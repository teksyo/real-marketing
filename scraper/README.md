# Real Estate Scraper

A Python-based web scraper for collecting real estate data.

## Setup

1. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install Playwright browsers:
```bash
playwright install
```

4. Create a `.env` file with your configuration:
```bash
cp .env.example .env
# Edit .env with your settings
```

## Usage

To run the scraper:
```bash
python -m src.scraper
```

## Project Structure

- `src/`
  - `scraper.py`: Main scraping logic
  - `database.py`: Database operations
  - `config.py`: Configuration management
- `tests/`: Test files
- `.env`: Environment variables
- `requirements.txt`: Project dependencies
