#!/bin/bash
echo "Pulling latest changes from GitHub..."
git pull

echo "Rebuilding backend and nginx containers..."
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

echo "Update complete."
