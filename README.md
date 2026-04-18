# 🛡️ Self-Healing Supply Chain – Autonomous Recovery System

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![Google Cloud](https://img.shields.io/badge/GCP-BigQuery-4285F4.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.103-009688.svg)

An AI-driven, autonomous supply chain recovery system. This repository houses the **Data, Memory, and Analytics Layer**—responsible for detecting disruptions, historically logging AI multi-agent decisions, and streaming data dynamically to front-end Looker/React dashboards.

## 📖 Architecture Overview

This project heavily leverages Google Cloud Platform for serverless scalability.
Please see [`architecture.md`](architecture.md) for a deep dive into:
- The BigQuery Table Schema & Clustering Optimizations
- Real-Time Pub/Sub Integration Lifecycle
- Top-K Similarity Search Algorithms

## 🚀 Quickstart

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/self-healing-supply-chain.git
   cd self-healing-supply-chain
   ```

2. **Initialize Environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure Secrets**
   ```bash
   cp .env.example .env
   # Edit .env with your GCP credentials
   ```

4. **Generate Offline Mock Data (Testing without API)**
   ```bash
   python python/mock_data.py
   ```

## 📁 Repository Structure
- `python/`: Source code for backend APIs, Memory similarity indexing, and Publishers.
- `sql/`: BigQuery Table creation scripts and complex Analytics queries.
- `contracts/`: Strict JSON schemas mapping the boundary between the Data Layer and Frontend Teams.

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
