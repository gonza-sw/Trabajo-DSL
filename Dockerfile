FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node docs ./docs
USER node
RUN npm run seed
EXPOSE 3000
CMD ["node", "src/server.js"]
