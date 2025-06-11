#!/usr/bin/env python3
"""
Simple connectivity test for YoutubetoPremiere
This script tests basic HTTP and SocketIO connectivity without complex dependencies.
"""

import urllib.request
import urllib.error
import socket
import sys
import time
import json

def test_http_health():
    """Test basic HTTP connectivity"""
    print("Testing HTTP connectivity...")
    
    try:
        with urllib.request.urlopen('http://localhost:3001/health', timeout=5) as response:
            data = response.read().decode('utf-8')
            result = json.loads(data)
            if result.get('status') == 'ok':
                print("✓ HTTP health check passed")
                return True
            else:
                print(f"✗ HTTP health check failed: {result}")
                return False
    except urllib.error.URLError as e:
        print(f"✗ HTTP connection failed: {e}")
        return False
    except Exception as e:
        print(f"✗ HTTP test error: {e}")
        return False

def test_port_open():
    """Test if port 3001 is open"""
    print("Testing port connectivity...")
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        result = sock.connect_ex(('localhost', 3001))
        sock.close()
        
        if result == 0:
            print("✓ Port 3001 is accessible")
            return True
        else:
            print("✗ Port 3001 is not accessible")
            return False
    except Exception as e:
        print(f"✗ Port test error: {e}")
        return False

def test_socketio_endpoint():
    """Test SocketIO polling endpoint"""
    print("Testing SocketIO polling endpoint...")
    
    try:
        # Test the SocketIO polling endpoint directly
        with urllib.request.urlopen('http://localhost:3001/socket.io/?EIO=4&transport=polling', timeout=5) as response:
            if response.status == 200:
                print("✓ SocketIO polling endpoint accessible")
                return True
            else:
                print(f"✗ SocketIO polling endpoint returned: {response.status}")
                return False
    except urllib.error.URLError as e:
        print(f"✗ SocketIO polling test failed: {e}")
        return False
    except Exception as e:
        print(f"✗ SocketIO polling test error: {e}")
        return False

def test_network_diagnostic():
    """Test network diagnostic endpoint"""
    print("Testing network diagnostic endpoint...")
    
    try:
        with urllib.request.urlopen('http://localhost:3001/network-test', timeout=5) as response:
            data = response.read().decode('utf-8')
            result = json.loads(data)
            
            print("✓ Network diagnostic endpoint accessible")
            print(f"  Platform: {result.get('platform', 'Unknown')}")
            print(f"  Hostname: {result.get('hostname', 'Unknown')}")
            print(f"  Server Status: {result.get('server_status', 'Unknown')}")
            
            return True
    except Exception as e:
        print(f"✗ Network diagnostic test failed: {e}")
        return False

def main():
    """Run connectivity tests"""
    print("YoutubetoPremiere Connectivity Test")
    print("=" * 40)
    
    tests_passed = 0
    total_tests = 4
    
    # Run tests
    if test_http_health():
        tests_passed += 1
    
    if test_port_open():
        tests_passed += 1
    
    if test_socketio_endpoint():
        tests_passed += 1
    
    if test_network_diagnostic():
        tests_passed += 1
    
    # Summary
    print("\n" + "=" * 40)
    print(f"RESULT: {tests_passed}/{total_tests} tests passed")
    
    if tests_passed == total_tests:
        print("✓ All tests passed! Server connectivity is good.")
        print("  If you're still having issues, try restarting both:")
        print("  1. Adobe Premiere Pro")
        print("  2. The YoutubetoPremiere application")
    elif tests_passed >= 2:
        print("⚠ Basic connectivity works but some advanced features may fail.")
        print("  The application should work but may have limited functionality.")
    else:
        print("✗ Multiple connectivity issues detected.")
        print("  Check if:")
        print("  1. YoutubetoPremiere server is running")
        print("  2. Windows Firewall is not blocking port 3001")
        print("  3. No other application is using port 3001")
    
    print("\nPress Enter to exit...")
    try:
        input()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main() 