# Stage 1: Compile React client bundles
FROM node:18-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . ./
RUN npm run build

# Stage 2: Serve static compiled assets using Nginx alpine
FROM nginx:stable-alpine

# Copy static assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx proxy settings
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
