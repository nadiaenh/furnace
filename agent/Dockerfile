FROM mcr.microsoft.com/playwright:v1.48.0-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    nmap \
    dnsutils \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY agent.mjs tools.mjs report-template.html ./

ENTRYPOINT ["node", "agent.mjs"]
