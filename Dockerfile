FROM node:20

# Install Python 3, pip, venv, and build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dataset folder first (needed for training/seeding)
COPY dataset /app/dataset

# Copy webapp package files and install production dependencies (building native modules from source)
COPY webapp/package*.json /app/webapp/
WORKDIR /app/webapp
RUN npm ci --only=production --build-from-source

# Copy Python requirements and build Python venv
COPY webapp/ai_service/requirements.txt /app/webapp/ai_service/
WORKDIR /app/webapp/ai_service
RUN python3 -m venv venv && \
    ./venv/bin/pip install --upgrade pip && \
    ./venv/bin/pip install -r requirements.txt

# Download NLTK data inside the Docker image during build
RUN ./venv/bin/python -c "import nltk; nltk.download('stopwords'); nltk.download('wordnet')"

# Copy the rest of the application
WORKDIR /app
COPY webapp /app/webapp

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/gradi.sqlite
ENV PYTHONPATH=/app/webapp/ai_service

# Expose port
EXPOSE 3000

# Copy start script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Run startup script
CMD ["/app/start.sh"]
