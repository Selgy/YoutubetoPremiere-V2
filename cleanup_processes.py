#!/usr/bin/env python3
"""
Utility script to clean up orphaned YoutubetoPremiere processes on Windows
This can be useful when multiple processes get stuck and need to be cleaned up.
"""

import os
import sys
import subprocess
import time

def count_processes():
    """Count YoutubetoPremiere processes"""
    if sys.platform != 'win32':
        print("This script is for Windows only.")
        return 0
    
    try:
        result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq YoutubetoPremiere.exe', '/FO', 'CSV'], 
                              capture_output=True, text=True, shell=True)
        if result.returncode == 0:
            lines = result.stdout.split('\n')
            processes = [line for line in lines if 'YoutubetoPremiere.exe' in line]
            return len(processes)
        return 0
    except Exception as e:
        print(f"Error counting processes: {e}")
        return 0

def kill_processes():
    """Kill all YoutubetoPremiere processes"""
    if sys.platform != 'win32':
        print("This script is for Windows only.")
        return False
    
    try:
        result = subprocess.run(['taskkill', '/F', '/IM', 'YoutubetoPremiere.exe'], 
                              capture_output=True, text=True, shell=True)
        return result.returncode == 0
    except Exception as e:
        print(f"Error killing processes: {e}")
        return False

def check_port_usage():
    """Check if port 3001 is still in use"""
    try:
        result = subprocess.run(['netstat', '-an'], capture_output=True, text=True, shell=True)
        if result.returncode == 0:
            lines = result.stdout.split('\n')
            port_lines = [line for line in lines if ':3001' in line and 'LISTENING' in line]
            return len(port_lines) > 0
        return False
    except Exception as e:
        print(f"Error checking port usage: {e}")
        return False

def main():
    print("YoutubetoPremiere Process Cleanup Utility")
    print("=" * 40)
    
    # Count initial processes
    initial_count = count_processes()
    print(f"Found {initial_count} YoutubetoPremiere processes")
    
    if initial_count == 0:
        print("No processes found. Nothing to clean up.")
        return
    
    # Check port usage
    port_in_use = check_port_usage()
    if port_in_use:
        print("Port 3001 is in use")
    else:
        print("Port 3001 is free")
    
    if initial_count > 3:
        print(f"WARNING: Found {initial_count} processes. This suggests a process loop issue.")
        response = input("Do you want to kill all YoutubetoPremiere processes? (y/N): ")
        if response.lower() == 'y':
            print("Killing processes...")
            success = kill_processes()
            if success:
                print("✓ Processes killed successfully")
                
                # Wait and recheck
                time.sleep(2)
                remaining = count_processes()
                if remaining == 0:
                    print("✓ All processes cleaned up")
                else:
                    print(f"⚠ {remaining} processes still running")
                    
                # Check port again
                port_still_used = check_port_usage()
                if not port_still_used:
                    print("✓ Port 3001 is now free")
                else:
                    print("⚠ Port 3001 is still in use")
            else:
                print("✗ Failed to kill processes")
        else:
            print("Cleanup cancelled.")
    else:
        print(f"Process count ({initial_count}) seems normal. No cleanup needed.")
    
    print("\nCleanup complete. You can now restart your extension.")

if __name__ == "__main__":
    main() 