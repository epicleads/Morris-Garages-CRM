import requests
import sys

def test_connection():
    url = "https://graph.facebook.com/v20.0"
    print(f"Testing connection to {url}...")
    try:
        response = requests.get(url, timeout=10)
        print(f"Success! Status Code: {response.status_code}")
        print(f"Response: {response.text[:100]}...")
    except Exception as e:
        print(f"Connection failed: {e}")
        print("\nPossible causes:")
        print("1. Firewall or Antivirus blocking Python.")
        print("2. ISP blocking Facebook Graph API.")
        print("3. VPN connection instability.")

if __name__ == "__main__":
    test_connection()
