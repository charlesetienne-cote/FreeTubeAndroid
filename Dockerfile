FROM node:18-alpine AS dep
WORKDIR /app
COPY package.json ./package.json
COPY yarn.lock ./yarn.lock
RUN yarn install

FROM node:18-alpine AS build
WORKDIR /app
COPY . .
COPY --from=dep /app/node_modules ./node_modules
RUN yarn pack:web

FROM nginx:latest as app
COPY --from=build /app/dist/web /usr/share/nginx/html
