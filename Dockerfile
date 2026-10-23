FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /var/lib/lume/data /var/lib/lume/uploads /var/lib/lume/backups && chown -R node:node /var/lib/lume
COPY --chown=node:node server.js ./
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node public ./public
USER node
ENV PORT=8080 DB_PATH=/var/lib/lume/data/lume.sqlite UPLOAD_DIR=/var/lib/lume/uploads BACKUP_DIR=/var/lib/lume/backups
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
