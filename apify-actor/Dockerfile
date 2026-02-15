FROM apify/actor-node:20

COPY package*.json ./
RUN npm ci --omit=dev

COPY . ./

RUN npm run build

CMD ["npm", "start"]
