#!/usr/bin/env python3
"""
Simple ODrive Test - Minimal test to verify ODrive connection
"""

import json
import sys

# Test basic imports
try:
    import odrive
    print("✓ ODrive library imported")
except ImportError as e:
    print(f"✗ Failed to import ODrive: {e}")
    print("  Install with: pip install odrive")
    sys.exit(1)

# Test connection
print("\nSearching for ODrive...")
try:
    odrv0 = odrive.find_any(timeout=10)
    print("✓ ODrive found!")
    
    # Test basic read
    vbus = odrv0.vbus_voltage
    print(f"✓ Bus voltage: {vbus:.2f}V")
    
    # Test JSON output (what Node-RED expects)
    output = {
        "status": "connected",
        "vbus_voltage": vbus
    }
    print(f"\nJSON output: {json.dumps(output)}")
    
    print("\n✅ ODrive is working correctly!")
    
except Exception as e:
    print(f"✗ Error: {e}")
    print("\nTroubleshooting:")
    print("1. Check USB connection")
    print("2. Check power to ODrive")
    print("3. On Windows, check Device Manager for 'ODrive 3.6 Native Interface'")
    print("4. Try: zadig.exe to install WinUSB driver")
    sys.exit(1)