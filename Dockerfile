FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm install
COPY frontend .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "psycopg[binary]==3.2.3" pytesseract==0.3.13
COPY backend .
COPY --from=web /web/dist ./frontend_dist
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD python -c "import os,urllib.request;urllib.request.urlopen('http://localhost:%s/api/config' % os.getenv('PORT','8000'))"
# Cloud hosts (Render, Railway, Fly...) tell the app which port to use through $PORT; locally it stays 8000.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
