FROM node:11-alpine

WORKDIR /usr/src/app

# install dependencies
COPY package*.json ./
RUN npm install --only=production

# copy source code
COPY . .

# run server
EXPOSE 8080
CMD [ "npm", "start" ]
