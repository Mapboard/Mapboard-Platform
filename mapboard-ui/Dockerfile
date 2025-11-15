FROM node:22

# Install system dependencies for Canvas

RUN apt-get update && apt-get install -y \
  build-essential \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  libtool \
  autoconf \
  automake \
&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases

RUN yarn install --immutable

COPY . .

RUN yarn build

EXPOSE 3000

CMD ["yarn", "start"]
