# Document 07: Authentication & Security Architecture

## 1. Authentication Strategy & Philosophy

HackPair employs a **Stateless, Cookie-Backed JWT Architecture**. Rather than storing tokens in browser `localStorage` or `sessionStorage` (where any Cross-Site Scripting / XSS flaw can extract credentials via JavaScript `document.cookie` or `window.localStorage`), HackPair sandboxes authentication inside **`HttpOnly` Cookies**.

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Browser                        │
│                                                             │
│   ❌ JavaScript Runtime (window, document)                 │
│      Cannot read, access, or modify the JWT token.          │
│                                                             │
│   ✅ Browser Cookie Storage (Secure Sandboxed Jar)          │
│      Cookie: token=<jwt>                                    │
│      Flags: HttpOnly; Secure; SameSite                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
            Automatic Credential Transmission
            (withCredentials: true / CORS)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Express Backend                        │
│                                                             │
│   1. cookieParser() extracts req.cookies.token              │
│   2. jwt.verify(token, JWT_SECRET) validates signature      │
│   3. Extracts decoded._id and attaches user to req.user     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User as Developer
    participant Client as Next.js Client
    participant API as Express Auth Router
    participant DB as MongoDB Atlas

    Note over User,DB: Phase 1: User Registration (/signup)
    User->>Client: Fills registration form
    Client->>API: POST /signup { firstName, email, password, skills... }
    API->>API: validateSignUpData(req)
    API->>DB: User.findOne({ email }) (Pre-check)
    DB-->>API: Null
    API->>API: bcrypt.hash(password, 10)
    API->>DB: user.save()
    API-->>Client: HTTP 201 Created

    Note over User,DB: Phase 2: User Login (/login)
    User->>Client: Submits email & password
    Client->>API: POST /login { email, password }
    API->>DB: User.findOne({ email })
    DB-->>API: user document (including password hash)
    API->>API: user.validatePassword(password) via bcrypt.compare()
    API->>API: user.getJWT() signs { _id: user._id }
    API-->>Client: Set-Cookie: token=<jwt>; HttpOnly; Secure; SameSite<br/>HTTP 200 OK { sanitizedUser }

    Note over User,DB: Phase 3: Authenticated Operations (/feed, /chat)
    Client->>API: GET /feed (Browser automatically attaches Cookie: token)
    API->>API: userAuth middleware checks jwt.verify()
    API->>DB: User.findById(decodedId)
    API-->>Client: HTTP 200 OK { feedData }

    Note over User,DB: Phase 4: User Logout (/logout)
    User->>Client: Clicks "Sign Out"
    Client->>API: POST /logout
    API-->>Client: Set-Cookie: token=; Expires=Thu, 01 Jan 1970<br/>HTTP 200 OK "Logout Successful!!"
```

---

## 3. Cryptographic Implementation Details

### A. Password Hashing (Bcrypt)
- **Algorithm**: Adaptive Blowfish-based hashing function (`bcrypt.hash(password, 10)`).
- **Work Factor (Cost Factor)**: `10` ($2^{10} = 1,024$ key expansion rounds). This introduces ~80–120ms of cryptographic compute time per hash on modern CPUs, rendering rainbow table and offline GPU brute-force attacks computationally infeasible.
- **Salting**: Generates a cryptographically random salt per user, ensuring identical passwords produce completely distinct hashes.

### B. JWT Token Generation (`src/models/user.js`)
```javascript
userSchema.methods.getJWT = async function () {
    const user = this;
    const token = await jwt.sign({ _id: user._id }, JWT_SECRET, {
        expiresIn: "7d",
    });
    return token;
};
```
- **Payload**: Minimalist design carrying only the immutable subject identifier `_id`. Storing emails or roles in JWTs is avoided to prevent stale identity claims.
- **Expiration**: 7 days (`expiresIn: "7d"`). Matches the cookie `maxAge`.

### C. Password Recovery Cryptography (`src/routes/auth.js`)
Unlike vulnerable applications that allow anyone to overwrite passwords with plain emails, HackPair enforces a **Two-Factor Out-of-Band Token Handshake**:
1. **Entropy**: Generates a 32-byte cryptographically secure pseudorandom token:
   `const resetToken = crypto.randomBytes(32).toString("hex");` (256 bits of entropy).
2. **Database Hashing**: The raw token is **never stored in the database**. Instead, the server stores a SHA-256 hash:
   `const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");`
   *Why this matters:* If a database dump is leaked, attackers cannot read reset tokens from the DB to hijack accounts.
3. **Time Expiration**: Automatically invalidated after 15 minutes (`Date.now() + 15 * 60 * 1000`).

---

## 4. Comprehensive Security Vulnerability Matrix & Mitigations

| Vulnerability | Threat Description | HackPair Architectural Defense |
| :--- | :--- | :--- |
| **XSS (Cross-Site Scripting)** | Malicious scripts injected into the client attempting to read session tokens. | **HttpOnly Cookies**: Browser blocks JavaScript from accessing `document.cookie`. React also auto-escapes interpolated strings in JSX. |
| **CSRF (Cross-Site Request Forgery)** | Malicious third-party sites forging authenticated state-changing requests. | **SameSite Cookie Policies**: Set to `Lax` in development and `None` + `Secure` across cross-origin deployments. Critical mutating routes enforce JSON Content-Type headers. |
| **Brute-Force & Credential Stuffing** | Automated bots attempting thousands of password combinations. | **Express-Rate-Limit**: Strict rate limiter capped at 25 requests per 15-minute window per IP on `/login`, `/signup`, `/forgotPassword`. |
| **IDOR (Insecure Direct Object Reference)** | Malicious user submitting another user's ID to delete or modify their account. | **Strict Ownership Verification**: Mutating routes verify `targetUserId.toString() === req.user._id.toString()`, returning `HTTP 403 Forbidden` on mismatch. |
| **User Enumeration** | Attackers probing password reset endpoints to discover which emails are registered. | **Generic Response Masking**: `/forgotPassword` always returns `"If an account with that email exists, we have sent instructions..."` whether the email exists or not. |
| **Password Hash Leakage** | Backend sending full user documents to the client, exposing bcrypt hashes. | **Mongoose Schema Transforms**: `userSchema.set("toJSON")` explicitly deletes `password`, `resetPasswordToken`, and `resetPasswordExpires`. |
| **Clickjacking & MIME-Sniffing** | Framing site inside malicious iframes or forcing incorrect MIME execution. | **Helmet Middleware**: Injects `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, and disables `X-Powered-By`. |
| **Self-Matching Exploit** | Malicious users attempting to send connection requests to themselves. | **Mongoose Pre-Save Hook**: `connectionRequestSchema.pre("save")` throws an error if `fromUserId.equals(toUserId)`. |
| **Unauthorized Chat Interception** | Strangers attempting to join WebSocket rooms or query chat history. | **Two-Tier Connection Guards**: Both the REST endpoint `GET /chat/:id` and Socket `joinChat`/`sendMessage` verify `ConnectionRequest.findOne({ status: "accepted" })`. |

