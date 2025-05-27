from urllib3.contrib import socks
import socket
import requests
import urllib3
urllib3.disable_warnings()

def create_connection(address, timeout=None, source_address=None):
    sock = socks.create_connection(
        (address[0], address[1]),
        proxy_type=socks.SOCKS5,
        proxy_addr="gate.decodo.com",
        proxy_port=7000,
        proxy_username="user-sp6mbpcybk-session-1",
        proxy_password="K40SClud=esN8jxg9c",
        timeout=timeout,
        source_address=source_address
    )
    return sock

# Replace the default socket creator with our SOCKS-aware one
socket.create_connection = create_connection

url = 'https://ip.decodo.com/json'
headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Accept': 'application/json'
}

try:
    response = requests.get(url, headers=headers, verify=False)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {str(e)}") 