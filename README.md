# AI-Powered Lead Management & Sales Intelligence Platform

A production-quality SaaS platform featuring multi-tenancy, granular Role-Based Access Control (RBAC), sales pipelines, background workers, and advanced AI services.

---

## 🚀 Key Features

* **Strict Multi-Tenancy:** Secure tenant organization partitioning at the database level to prevent IDOR and cross-tenant information leakage.
* **Granular RBAC:** Flexible roles (`SUPER_ADMIN`, `ORG_ADMIN`, `SALES_MANAGER`, `SALES_REP`) with dynamic permissions.
* **Lead Pipelines:** Custom configurable sales stages per organization.
* **Asynchronous Jobs:** Processing notifications, lead scoring, and reports using Redis and BullMQ.
* **Sales Intelligence AI:**
  * Automated lead scoring with detailed intent logic.
  * Lead summary compiler analyzing all customer touchpoints.
  * Adaptive outreach template generator.
  * Controlled natural language sales assistant using a tool-calling layer.
* **Modern UI:** Visual Kanban Board and AI Assistant Chat interface.
* **Containerized Deployment:** Multi-container docker-compose setup.

---

## 🛠️ Technology Stack

* **Backend:** Node.js (ESM), Express.js
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Caching & Queues:** Redis, BullMQ
* **Validation:** Zod
* **Testing:** Vitest, Supertest
* **Frontend:** React, Vite, Tailwind CSS, React Router
* **Reverse Proxy:** Nginx (static bundle delivery)
* **Containerization:** Docker, Docker Compose

---

## 📂 Project Structure

```text
D:/Projects AI/
├── backend/               # Backend Express API & Worker codebase
│   ├── prisma/            # Database schema & migrations
│   ├── src/               # Express routing, middleware, controllers, services
│   ├── tests/             # Automated integration tests
│   └── Dockerfile         # Node.js production image
├── frontend/              # Frontend React client SPA
│   ├── src/               # UI components, routing, services
│   ├── nginx.conf         # Nginx proxy-pass configurations
│   └── Dockerfile         # Multi-stage production container
├── docker-compose.yml     # Orchestration stack configuring all services
└── README.md
```

---

## ⚙️ Local Setup

### Prerequisites
* Node.js (v18+)
* Docker & Docker Desktop

---

### Option A: The Full Containerized Setup (Recommended)
This runs the entire stack inside Docker containers, matching the production environment.

1. **Start the Containers:**
   Ensure Docker Desktop is open and running, then execute in the root directory:
   ```bash
   docker-compose up --build -d
   ```

2. **Run Migrations & Seed Data:**
   Initialize your database tables and seed default roles/permissions:
   ```bash
   docker exec -it sales_intel_backend npx prisma migrate deploy
   docker exec -it sales_intel_backend node prisma/seed.js
   ```

3. **Access the Application:**
   * **Frontend Web Interface:** [http://localhost:8080](http://localhost:8080)
   * **Backend API Gateway:** [http://localhost:3000](http://localhost:3000)

---

### Option B: Local Hybrid Development Setup
This runs PostgreSQL and Redis inside Docker, but executes the Express API, workers, and React dev compiler directly on your machine.

1. **Start Databases:**
   ```bash
   docker-compose up -d sales_intel_postgres sales_intel_redis
   ```

2. **Setup and Start Backend:**
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npx prisma migrate dev
   node prisma/seed.js
   npm run dev
   ```

3. **Start Background Queue Worker (Separate Terminal):**
   ```bash
   cd backend
   node src/workers/system.worker.js
   ```

4. **Setup and Start Frontend (Separate Terminal):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   * Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Running Tests

All backend modules are validated using Vitest. Run the test suite:

```bash
cd backend
npm run test
```
