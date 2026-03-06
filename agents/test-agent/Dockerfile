FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Apply CDP SDK patches (6 bugs in cdp-sdk 1.39.1)
COPY apply_patches.py .
RUN python apply_patches.py

COPY agent.py .
COPY wallet_data_base_mainnet.txt .

ENV MAX_CYCLES=10
ENV NETWORK_ID=base-mainnet

CMD ["python", "agent.py"]
