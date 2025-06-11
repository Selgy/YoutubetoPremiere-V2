#!/usr/bin/env python3
"""
Test SocketIO connectivity exactly like the Chrome extension does
"""

import urllib.request
import urllib.error
import urllib.parse
import json
import time

def test_socket_io_handshake():
    """Test SocketIO handshake exactly like the Chrome extension"""
    print("Testing SocketIO handshake...")
    
    # Test the SocketIO handshake endpoint
    handshake_url = 'http://localhost:3001/socket.io/?EIO=4&transport=polling'
    
    try:
        with urllib.request.urlopen(handshake_url, timeout=10) as response:
            content = response.read().decode('utf-8')
            print(f"✓ SocketIO handshake successful")
            print(f"  Response: {content[:100]}..." if len(content) > 100 else f"  Response: {content}")
            
            # Try to parse the handshake response
            if content.startswith('0{'):
                try:
                    handshake_data = json.loads(content[1:])  # Remove the '0' prefix
                    print(f"  Session ID: {handshake_data.get('sid', 'unknown')}")
                    print(f"  Ping interval: {handshake_data.get('pingInterval', 'unknown')}ms")
                    print(f"  Ping timeout: {handshake_data.get('pingTimeout', 'unknown')}ms")
                    return True
                except json.JSONDecodeError:
                    print(f"  Warning: Could not parse handshake data")
                    return True
            else:
                print(f"  Warning: Unexpected handshake format")
                return False
                
    except urllib.error.URLError as e:
        print(f"✗ SocketIO handshake failed: {e}")
        return False
    except Exception as e:
        print(f"✗ SocketIO handshake error: {e}")
        return False

def test_socket_io_polling():
    """Test SocketIO polling like the extension does"""
    print("Testing SocketIO polling...")
    
    # First get a session ID
    handshake_url = 'http://localhost:3001/socket.io/?EIO=4&transport=polling'
    
    try:
        with urllib.request.urlopen(handshake_url, timeout=10) as response:
            content = response.read().decode('utf-8')
            
            if not content.startswith('0{'):
                print("✗ Invalid handshake response")
                return False
                
            handshake_data = json.loads(content[1:])
            session_id = handshake_data.get('sid')
            
            if not session_id:
                print("✗ No session ID in handshake")
                return False
                
            print(f"  Got session ID: {session_id}")
            
            # Now test polling with the session ID
            polling_url = f'http://localhost:3001/socket.io/?EIO=4&transport=polling&sid={session_id}'
            
            with urllib.request.urlopen(polling_url, timeout=10) as poll_response:
                poll_content = poll_response.read().decode('utf-8')
                print(f"✓ SocketIO polling successful")
                print(f"  Poll response: {poll_content[:50]}..." if len(poll_content) > 50 else f"  Poll response: {poll_content}")
                return True
                
    except Exception as e:
        print(f"✗ SocketIO polling failed: {e}")
        return False

def test_get_ip_endpoint():
    """Test the get-ip endpoint that the extension uses"""
    print("Testing /get-ip endpoint...")
    
    try:
        with urllib.request.urlopen('http://localhost:3001/get-ip', timeout=5) as response:
            data = response.read().decode('utf-8')
            result = json.loads(data)
            
            print(f"✓ /get-ip endpoint accessible")
            print(f"  Server reports IP: {result.get('ip', 'unknown')}")
            print(f"  IPs found: {result.get('ips', [])}")
            
            # Check if localhost is in the list
            ips = result.get('ips', [])
            if 'localhost' in ips or '127.0.0.1' in ips:
                print("  ✓ Localhost found in IP list")
                return True
            else:
                print("  ⚠ Localhost not found in IP list - this might cause connection issues")
                return True
                
    except Exception as e:
        print(f"✗ /get-ip endpoint failed: {e}")
        return False

def main():
    """Run all SocketIO tests"""
    print("YoutubetoPremiere SocketIO Connectivity Test")
    print("=" * 50)
    
    tests_passed = 0
    total_tests = 3
    
    # Run tests
    if test_get_ip_endpoint():
        tests_passed += 1
    
    if test_socket_io_handshake():
        tests_passed += 1
    
    if test_socket_io_polling():
        tests_passed += 1
    
    # Summary
    print("\n" + "=" * 50)
    print(f"RESULT: {tests_passed}/{total_tests} SocketIO tests passed")
    
    if tests_passed == total_tests:
        print("✓ All SocketIO tests passed! Extension should be able to connect.")
    elif tests_passed >= 1:
        print("⚠ Some SocketIO tests passed. Extension might work with reduced functionality.")
    else:
        print("✗ SocketIO connectivity issues detected.")
        print("  The Chrome extension will likely fail to connect.")
    
    print("\nPress Enter to exit...")
    try:
        input()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main() 