FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

RUN addgroup -g 1001 -S mcp && adduser -u 1001 -S mcp -G mcp
USER 1001:1001

EXPOSE 3000
CMD ["node", "dist/index.js"]
