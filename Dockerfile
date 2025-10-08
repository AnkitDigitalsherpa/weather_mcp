# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
# COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size
# RUN npm prune --production

# Expose port (Railway will override this with PORT env var)
# EXPOSE 3000

# Start the application
CMD ["node", "build/index.js"]