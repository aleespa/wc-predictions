#!/bin/bash
if [ -z "$1" ]; then
  echo "Showing logs for all services. Press Ctrl+C to exit."
  docker compose -f docker-compose.prod.yml --env-file .env logs -f
else
  echo "Showing logs for $1. Press Ctrl+C to exit."
  docker compose -f docker-compose.prod.yml --env-file .env logs -f "$1"
fi
