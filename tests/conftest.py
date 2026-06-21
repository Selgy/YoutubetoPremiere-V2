"""Pytest configuration: make the `app/` modules importable.

The application modules use bare imports (e.g. `from utils import ...`),
which means the `app/` directory is on sys.path at runtime. Replicate that
here so tests can import the same modules directly.
"""
import os
import sys

APP_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app")
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)
