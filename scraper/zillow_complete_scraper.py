from dotenv import load_dotenv
import os
import asyncio
from prisma import Prisma

# Load .env file
load_dotenv()

# Initialize Prisma client
prisma = Prisma()

async def test_pg_conn():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("❌ DATABASE_URL is not set!")
    
    print(f"✅ Using DB URL: {db_url}")
    
    print("Connecting to Prisma...")
    await prisma.connect()
    print("✅ Connected to Prisma!")

    try:
        print("Fetching record...")
        existing = await prisma.lead.find_unique(where={'zid': '442663676'})
        print("✅ Fetched record:", existing)
    finally:
        await prisma.disconnect()
        print("✅ Disconnected!")

if __name__ == "__main__":
    try:
        asyncio.run(test_pg_conn())
        print("✅ Script completed successfully.")
    except Exception as e:
        print("❌ An error occurred:", e)
