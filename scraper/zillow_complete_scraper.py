import asyncio
from prisma import Prisma

# Initialize Prisma client
prisma = Prisma()

async def minimal_test():
    """Minimal test to check if the script runs on Render."""
    print("Starting minimal test...")

    await prisma.connect()
    try:
        # Test database connection
        print("Testing database connection...")
        # existing = await prisma.lead.find_unique(where={'zid': "442663676"})
        # print("Database connection successful!", existing)

    finally:
        await prisma.disconnect()
        print("Disconnected from database.")

if __name__ == "__main__":
    asyncio.run(minimal_test())
    print("Minimal test completed.")
