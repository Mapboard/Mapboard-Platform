# Dockerfile for setting up a basic version of this server.
# Topology features are not supported.
FROM python:3.10
RUN pip install --upgrade pip && pip install zeroconf 

WORKDIR /app

# Copy the rest of the code
COPY . .

# Port for mdns/bonjour
EXPOSE 5353/udp

# Run the server
CMD ["python3", "bonjour-service.py"]

