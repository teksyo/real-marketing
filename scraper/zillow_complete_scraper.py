from pyzill_fetch_listings import test_proxy_connection

def minimal_test():
    """Minimal test to check if the script runs and logs execution."""
    print("Starting minimal test...")

    # Test proxy connection
    print("Testing proxy connection...")
    if test_proxy_connection():
        print("Proxy connection successful!")
    else:
        print("Proxy connection failed!")

if __name__ == "__main__":
    minimal_test()
    print("Minimal test completed.")
