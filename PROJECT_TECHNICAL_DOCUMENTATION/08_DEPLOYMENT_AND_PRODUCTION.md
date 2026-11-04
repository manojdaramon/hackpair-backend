# Document 08: Deployment, Production Architecture & Operations

## 1. Production Architecture Overview

The HackPair platform is deployed across modern cloud infrastructure designed to decouple static asset distribution from real-time persistent compute:

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│   Frontend (Cloudflare Pages)  │         │    Backend (Render / Railway)  │
│   - Next.js Client App         │         │    - Node.js + Express 5       │
│   - Global Edge CDN Cache      │         │    - Socket.IO WebSocket Server│
│   - Subdomain: *.pages.dev     │         │    - Persistent HTTP Service   │
└───────────────┬────────────────┘         └───────────────┬────────────────┘
                │                                          │
                │ HTTPS (CORS Credentials)                 │ Mongoose Connection
                │ WSS (WebSocket Secure)                   │ (TCP Port 27017)
                ▼                                          ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    MongoDB Atlas Cloud Cluster (M0 / M10)                 │
│                    Database: hackpair                                     │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Infrastructure & Hosting Requirements

### A. Frontend Hosting: Cloudflare Pages / Vercel
- **Type**: Edge-accelerated Static / Node SSR Hosting.
- **Build Command**: `npm run build` (or `yarn build`).
- **Output Directory**: `.next` (or static export).
- **Environment Variables**:
  - `NEXT_PUBLIC_API_URL`: Points to the live backend URL (e.g., `https://api.hackpair.dev` or `https://hackpair-backend.onrender.com`).
  - `NEXT_PUBLIC_SITE_URL`: Points to the live frontend domain (e.g., `https://hackpair.pages.dev`).

### B. Backend Hosting: Persistent Server (Render / Railway / Fly.io / EC2)
- **CRITICAL ARCHITECTURAL CONSTRAINT: WebSockets Require Persistent Compute**:
  - **Incompatible Platforms**: Vercel Serverless Functions, AWS Lambda, Netlify Functions.
    *Why:* Serverless functions are stateless, invoked on HTTP requests, and terminate execution after a few seconds. WebSockets require long-lived, continuous TCP connections for Socket.IO.
  - **Recommended Platforms**: **Render (Web Service)**, **Railway**, **Fly.io**, **AWS EC2**, or **DigitalOcean Droplet**.
- **Process Management**: In containerized or VPS environments, use **PM2** or Docker:
  ```bash
  pm2 start src/app.js --name "hackpair-backend" -i max
  ```
  *(Note: When running multiple PM2 cluster instances, a Redis adapter is required for Socket.IO).*

---

## 3. Environment Variable Specification

### Backend Configuration (`.env`)

| Variable | Sample Value | Purpose & Security Note |
| :--- | :--- | :--- |
| `PORT` | `7777` | The local or container listening port. |
| `NODE_ENV` | `production` | Enables strict cookie flags (`secure: true`, `sameSite: "none"`). |
| `JWT_SECRET` | `LONG_RANDOM_SECRET_KEY_HERE` | Secret used to cryptographically sign authentication tokens. |
| `MONGODB_URI` | `mongodb+srv://<user>:<pwd>@cluster...` | MongoDB Atlas connection string with embedded credentials. |
| `EMAIL_USER` | `immanoj2830@gmail.com` | Google account email for Gmail SMTP transport. |
| `EMAIL_PASS` | `svcfjhoajwedycuu` | 16-character Google App Password (never the main account password). |
| `EMAIL_FROM` | `HackPair <immanoj2830@gmail.com>` | Sender header displayed in user email inboxes. |
| `RESEND_API_KEY` | `re_MMaC6BX2_...` | Optional cloud email fallback API key. |
| `FRONTEND_URL` | `https://hackpair.pages.dev` | Allowed CORS origin and base URL for email action links. |
| `ALLOWED_ORIGINS`| `http://localhost:3000,http://localhost:5173` | Comma-delimited list of permitted CORS domains. |

---

## 4. Production Cross-Origin Cookie Handling

When the frontend is hosted on Cloudflare (`https://hackpair.pages.dev`) and the backend is on Render (`https://hackpair-backend.onrender.com`), the browser treats communication as **Cross-Site (Cross-Origin)**.

To allow JWT authentication cookies to be set and read across domains:
1. **`secure: true`**: The browser refuses to transmit cross-site cookies over unencrypted HTTP. Both origins must be HTTPS.
2. **`sameSite: "none"`**: Allows the cookie to be sent in cross-site requests initiated by Axios.
3. **`withCredentials: true`**: Must be enabled on Axios and Socket.IO on the frontend.
4. **`cors({ credentials: true, origin: [...] })`**: Backend must explicitly echo the requesting origin (wildcards `*` are forbidden by browser security specifications when credentials are true).

---

## 5. Health Monitoring & Reliability

- **Health Check Endpoint**:
  `GET /health` returns:
  ```json
  { "status": "OK", "timestamp": "2026-11-05T04:00:00.000Z" }
  ```
  Used by cloud orchestrators (Render, AWS ALB, Kubernetes) to verify container readiness and automatically restart failed instances.
- **DNS Resolution Safeguard**:
  [`src/config/database.js`](file:///c:/Backend/hackpair-backend/src/config/database.js) explicitly sets Google Public DNS (`dns.setServers(["8.8.8.8", "8.8.4.4"])`) to prevent MongoDB Atlas SRV connection lookup timeouts on restrictive local networks.

---

## 6. Scaling Roadmaps & Production Bottlenecks

1. **Horizontal Backend Scaling (Socket.IO Redis Adapter)**:
   - *Current Status*: Single-node instance memory routing.
   - *Scaling Action*: When scaling past 1 backend instance, install `@socket.io/redis-adapter` connected to Redis Pub/Sub so users connected to Server 1 can chat with users on Server 2.
2. **Database Read Replicas & Connection Pooling**:
   - Mongoose manages connection pooling natively. For high-volume feed swiping, read queries can be offloaded to MongoDB secondary read replicas (`readPreference: "secondaryPreferred"`).
3. **Asset Delivery (Cloudflare CDN / AWS S3)**:
   - Profile images should be migrated from base64/URL strings to an S3/Cloudflare R2 bucket with an image optimization pipeline.

