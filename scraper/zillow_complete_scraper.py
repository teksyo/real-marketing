import asyncio
import prisma
from frontend.pyzill_fetch_listings import test_proxy_connection

async def minimal_test():
    """Minimal test to check if the script runs on Render."""
    print("Starting minimal test...", "INFO")
    await prisma.connect()
    try:
        # Test database connection
        print("Testing database connection...", "DEBUG")
        await prisma.lead.find_many(take=1)
        print("Database connection successful!", "INFO")

        # Test proxy connection
        if test_proxy_connection():
            print("Proxy connection successful!", "INFO")
        else:
            print("Proxy connection failed!", "ERROR")

    finally:
        await prisma.disconnect()

if __name__ == "__main__":
    asyncio.run(minimal_test())
