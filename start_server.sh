#!/bin/bash
# Simple script to start the local server

echo "Starting local server for NADIALEEKA web app..."
echo "This will serve the files and avoid CORS issues."
echo ""

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    echo "Using python3..."
    python3 server.py
elif command -v python &> /dev/null; then
    echo "Using python..."
    python server.py
else
    echo "Error: Python not found. Please install Python 3."
    exit 1
fi 