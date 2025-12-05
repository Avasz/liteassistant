#!/bin/bash

# Navigate to the frontend directory
cd frontend

# Install dependencies if needed (optional, but good practice)
# npm install

# Build the frontend
npm run build

# Navigate back
cd ..

# Remove existing static files
rm -rf backend/static

# Copy build artifacts to backend static directory
cp -r frontend/dist backend/static

echo "Frontend build completed and artifacts copied to backend/static."
