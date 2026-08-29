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

---

## 🛠️ Technology Stack

* **Backend:** Node.js (ESM), Express.js
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Caching & Queues:** Redis, BullMQ
* **Validation:** Zod
* **Structured Logging:** Pino, Pino-Pretty
* **Testing:** Vitest, Supertest
* **Containerization:** Docker, Docker Compose

---

## 📂 Project Structure

```
src/
├── app.js               # Express application config & routing bootstrap
├── server.js            # Node service entry point & graceful shutdown
├── config/              # Server config and Zod environment validation
├── database/            # Prisma Client init and query tracing
├── middleware/          # Security, auth, tenant resolution, logs, errors
├── common/              # System custom errors and helpers
├── integrations/        # Redis, AI provider services, third-party hooks
└── modules/             # Encapsulated feature domains (leads, auth, etc.)
```

---

## ⚙️ Local Setup

### Prerequisites
* Node.js (v18+)
* Docker & Docker Compose

### Steps
1. **Clone the Repository:**
   ```bash
   git clone <repo-url>
   cd ai-sales-intelligence-platform
   ```

2. **Environment Configuration:**
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   Modify `.env` to match your local setup.

3. **Start Containers:**
   Ensure Docker is running, then launch PostgreSQL and Redis:
   ```bash
   docker-compose up -d
   ```

4. **Install Dependencies:**
   ```bash
   npm install
   ```

5. **Run Migrations & Seed Data:**
   Initialize tables and populate default Roles and Permissions:
   ```bash
   npx prisma migrate dev
   node prisma/seed.js
   ```

6. **Run Server:**
   ```bash
   npm run dev
   ```

7. **Run Tests:**
   ```bash
   npm run test
   ```
