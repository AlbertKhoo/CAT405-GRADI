#!/bin/bash

# Ensure the database directory exists in the persistent volume
mkdir -p /data

# If the database does not exist in the persistent volume, copy the pre-seeded one
if [ ! -f /data/gradi.sqlite ]; then
    echo "Initializing persistent database in /data from pre-seeded build database..."
    cp /app/webapp/database/gradi.sqlite /data/gradi.sqlite
    chmod 666 /data/gradi.sqlite
else
    echo "Persistent database already exists in /data."
fi

# Start Python FastAPI AI service on port 8000 in the background
echo "Starting FastAPI AI Service on port 8000..."
cd /app/webapp/ai_service
./venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8000 &

# Start Node.js Web Server in the foreground
echo "Starting Node.js Web Server on port 3000..."
cd /app/webapp
exec node server.js
