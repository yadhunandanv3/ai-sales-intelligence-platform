FROM node:18-alpine

# Install openSSL and required dependencies for Prisma on Alpine
RUN apk update && apk add --no-cache openssl

WORKDIR /app

# Copy dependency configuration
COPY package*.json ./

# Install dependencies (exclude dev dependencies in production)
RUN npm ci --omit=dev

# Copy database schema configurations
COPY prisma/schema.prisma ./prisma/

# Generate Prisma Client artifact
RUN npx prisma generate

# Copy application source code
COPY src/ ./src/

EXPOSE 3000

# Start application server
CMD ["npm", "start"]
