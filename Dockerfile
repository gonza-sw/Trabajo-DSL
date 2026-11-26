FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY docs ./docs
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
