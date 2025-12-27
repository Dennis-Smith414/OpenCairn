FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies (package.json & package-lock.json should be copied first for layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Copy source
COPY . .

# Expose the server port
EXPOSE 5100

# Use a non-root user (optional)
RUN useradd --user-group --create-home --shell /bin/false appuser && chown -R appuser /usr/src/app
USER appuser

# Default dev command — use `npm run dev` which runs node index.js in this repo
CMD ["npm", "run", "dev"]
