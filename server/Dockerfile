FROM node:16-alpine

WORKDIR /usr/src/app

# copy source code
COPY . .

# install dependencies
RUN npm ci --only=production

# run server
EXPOSE 8080
CMD [ "npm", "start" ]
