# Document 01: Project Overview & Executive Summary

## 1. Executive Summary & Purpose

**HackPair** is an enterprise-grade, full-stack matchmaking and collaboration platform tailored specifically for software engineers, designers, and tech creators looking for hackathon teammates and project co-founders. 

While conventional professional networks (e.g., LinkedIn) focus on static professional resumes and corporate recruiting, and social platforms focus on generic interactions, HackPair solves the acute problem of **developer team formation under strict time and skill constraints**. Hackathon competitors, indie hackers, and open-source contributors consistently struggle to discover complementary talent (e.g., a React frontend developer pairing with a Python machine learning engineer or Node.js systems developer).

HackPair bridges this gap by merging:
1. **Swipe/Discovery-driven feed mechanics**: Dynamic discovery of verified developers based on tech stacks, skills, and bios with instant "Interested" or "Ignored" actions.
2. **Bi-directional Consent Matching**: Two-way connection workflow (Request $\rightarrow$ Review/Accept/Reject) ensuring mutual interest prior to collaboration.
3. **Real-time Live Messaging**: Low-latency, full-duplex WebSocket messaging engine (Socket.IO) allowing paired developers to coordinate instantly.
4. **Automated Notification Infrastructure**: Event-driven email dispatch (Nodemailer / Resend) delivering transactional onboarding, connection alerts, and secure credential recovery.

---

## 2. Target Audience & Personas

- **Hackathon Participants**: Engineers and UI/UX designers needing to assemble a balanced squad within 24 to 48 hours of an event kickoff.
- **Indie Hackers & Side-Project Builders**: Developers looking for co-builders with complementary proficiencies (e.g., Frontend + Backend, Mobile + DevOps).
- **Computer Science Students & Bootcamp Graduates**: Junior builders looking for peer programming partners to collaborate on portfolio-grade projects.

---

## 3. Core Modules & Feature Breakdown

| Module | Primary Responsibility | Key Technical Components |
| :--- | :--- | :--- |
| **Authentication & Identity** | Registration, session management, secure credential storage, password reset. | Bcrypt hashing, HttpOnly JWT cookies, cryptographic SHA-256 reset tokens. |
| **Profile & Developer Portfolio** | Managing skills, about summaries, profile pictures, and personal data. | Whitelisted field validation, schema constraints, reactive UI editing forms. |
| **Discovery Feed Engine** | Algorithmic feed excluding existing connections and reviewed profiles. | Mongoose `$nin` aggregation, compound sets, pagination (`skip`/`limit`). |
| **Connection Workflow** | Dispatching, reviewing, accepting, and ignoring collaboration requests. | Bi-directional query guards, pre-save hooks, status transition enforcement. |
| **Real-time Live Chat** | Full-duplex 1-on-1 private messaging between confirmed teammates. | Socket.IO, room isolation, typing indicators, real-time unread badges. |
| **Email Notification Dispatch** | Asynchronous transactional notification and password recovery delivery. | Dual-engine transport (Nodemailer Gmail SMTP + Resend API fallback). |

---

## 4. Main User Workflows

### Workflow A: Developer Onboarding & Profile Activation
1. The developer visits `/signup` and submits identity details (name, email, secure password, age, gender, skills, and bio).
2. The backend enforces validator checks, checks for existing accounts, hashes the password via bcrypt (cost factor 10), and writes to MongoDB.
3. The server asynchronously triggers a branded HTML welcome email via the email service.
4. The client automatically signs in, receives a 7-day `HttpOnly` JWT cookie, and is redirected to `/feed`.

### Workflow B: The Matchmaking & Pairing Loop
1. The user navigates to `/feed` where the feed engine queries developers that the user has not yet interacted with.
2. The user reviews a candidate’s skills and bio:
   - **Click "Interested"**: Dispatches `POST /request/send/interested/:toUserId`. The backend validates that no prior request exists in either direction, creates a `ConnectionRequest` with status `"interested"`, and emails the recipient asynchronously.
   - **Click "Ignore"**: Dispatches `POST /request/send/ignored/:toUserId`. The candidate is removed from the user's future feeds without alerting the candidate.
3. The recipient opens `/requests`, views incoming requests, and accepts or rejects the candidate:
   - **Accept**: Status transitions to `"accepted"`. An acceptance email is dispatched to the initiator.
   - **Reject**: Status transitions to `"rejected"`.

### Workflow C: Real-Time Team Coordination
1. Once accepted, both developers appear in each other's `/connections` list and `/chat` messenger.
2. The sidebar dynamically lights up with unread message badges whenever new chat messages are sent.
3. Both developers can exchange instant messages, view live typing indicators, and review previous chat history loaded from MongoDB.

---

## 5. System Classification & Technical Significance

### Is this a Frontend, Backend, or Full-Stack Application?
HackPair is a **production-oriented Full-Stack Web Application** consisting of two fully decoupled codebases:
- **Backend**: Node.js, Express 5, MongoDB (Mongoose 9), Socket.IO, Nodemailer, Resend, Helmet, Express-Rate-Limit.
- **Frontend**: Next.js 16 (App Router), React 19, CSS Modules / SCSS, Framer Motion, Axios, Socket.IO Client.

### What Makes This Project Technically Interesting?
1. **Decoupled Asynchronous Micro-Patterns**: Heavy network operations (e.g. SMTP email delivery) are completely decoupled from Express HTTP request-response cycles, preventing latency degradation.
2. **Complex Feed Query Logic**: The feed algorithm dynamically builds exclusion lists of all bi-directional past relationships (ignored, interested, accepted, rejected, plus self) to construct clean candidate feeds with zero duplicate suggestions.
3. **Low-Latency State Synchronization**: Utilizing WebSockets alongside REST APIs ensures that chat messages, typing events, and unread badges update with zero page refreshes.
4. **Defense-in-Depth Security**: Strict cookie sandboxing (`httpOnly`, `sameSite`, `secure`), rate limiting on sensitive routes, IDOR protection on mutating endpoints, and automatic stripping of password hashes at the ODM layer.

---

## 6. Interview Pitch: "Can You Explain Your Project?"

Use the following scripts depending on the interview setting:

### 30-Second Elevator Pitch
> *"HackPair is a full-stack developer matchmaking and collaboration platform built with Next.js 16, Node.js, Express, and MongoDB. It solves the problem of finding hackathon teammates and project partners by pairing developers through a swipe-inspired feed based on skills and tech stacks. Once two developers mutually connect, our real-time Socket.IO engine enables instant messaging with live typing indicators and unread badges, supported by an asynchronous email notification service."*

### 1-Minute Architectural Pitch
> *"HackPair is a full-stack platform designed to help engineers team up for hackathons and side projects. On the frontend, I used Next.js 16 and React 19 with a modular component architecture, CSS Modules, and custom hooks for authentication and feed state management. The backend is an Express 5 and MongoDB API wrapped in a native HTTP server powering Socket.IO for real-time WebSocket communication.*
>
> *Technically, the most interesting challenges were the feed algorithm—which computes exclusion sets across bi-directional relationship states to prevent redundant matching—and the real-time messaging pipeline, which verifies connection authorization before routing messages into deterministic private rooms. I also placed heavy emphasis on security: enforcing HttpOnly JWT cookies, rate limiting against brute-force attacks, IDOR checks, and crypto-based tokenized password recovery."*

