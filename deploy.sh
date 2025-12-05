#!/bin/bash

set -e

# Clean up
rm -rf .mastra
rm -rf ./*.zip

# Install dependencies and build
yarn install
yarn build

# npx trigger.dev deploy

# Copy .env file to output directory
cp .env.prod ./.mastra/output/.env


# Zip the files
zip -r deepspot.zip .mastra  package.json Dockerfile 