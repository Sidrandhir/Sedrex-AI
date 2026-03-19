# 🎯 Authentication Features - Visual Guide

## Feature 1: Forgot Password

### User Journey
```
                        LOGIN PAGE
                              ↓
              ┌─────────────────────────────┐
              │   [Email]                   │
              │   [Password]                │
              │   [Forgot Password?] ← NEW  │
              └─────────────────────────────┘
                              ↓ Click
                    FORGOT PASSWORD FORM
              ┌─────────────────────────────┐
              │   Enter Your Email          │
              │   [email@example.com]       │
              │                             │
              │  [Send Reset Link] [Back]   │
              └─────────────────────────────┘
                              ↓
                    ✅ EMAIL SENT MESSAGE
                              ↓
              ┌─────────────────────────────┐
              │   📧 Check Your Email       │
              │                             │
              │   "Click here to reset..."  │
              │   https://.../?token=xyz    │
              └─────────────────────────────┘
                              ↓ Click Link
                  RESET PASSWORD PAGE
              ┌─────────────────────────────┐
              │   New Password              │
              │   [••••••••]                │
              │   Confirm Password          │
              │   [••••••••]                │
              │                             │
              │   [Update Password]         │
              └─────────────────────────────┘
                              ↓
                    ✅ PASSWORD UPDATED
                              ↓
                         LOGIN PAGE
                    (Now with new password)
```

### Technical Flow
```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Browser)                      │
│                                                               │
│  User enters email and clicks "Send Reset Link"              │
│                           ↓                                   │
│  handleForgotPassword() called                               │
│                           ↓                                   │
│  Validates email not empty                                   │
│                           ↓                                   │
│  Calls supabase.auth.resetPasswordForEmail(email)            │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                  SUPABASE BACKEND                            │
│                                                               │
│  1. Generates random token                                   │
│  2. Hashes token with SHA256                                 │
│  3. Stores token in database with user_id                   │
│  4. Sets token expiry to 24 hours                            │
│  5. Generates reset link with token                          │
│  6. Sends email via configured SMTP                          │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   EMAIL SERVICE                              │
│                                                               │
│  From: noreply@supabase.io (or custom SMTP)                 │
│  To: user@example.com                                        │
│  Subject: Reset your password                                │
│                                                               │
│  Body:                                                        │
│  Click here to reset your password:                          │
│  https://yourapp.com/#/reset-password?token=...xyz...       │
│                                                               │
│  This link expires in 24 hours                               │
│  This link can only be used once                             │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                    USER'S EMAIL                              │
│                                                               │
│  ✅ Email arrives (30 seconds to 5 minutes)                  │
│  📧 User reads and clicks reset link                         │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              RESET PASSWORD PAGE (Frontend)                  │
│                                                               │
│  URL contains token: #/reset-password?token=xyz...           │
│  User enters new password                                    │
│  Submits form                                                │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                  SUPABASE BACKEND                            │
│                                                               │
│  1. Validates token format                                   │
│  2. Checks token exists in database                          │
│  3. Checks token hasn't expired (24 hours)                   │
│  4. Hashes new password                                      │
│  5. Updates user password                                    │
│  6. Deletes/invalidates token                                │
│  7. Returns success                                          │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND (Login Page)                           │
│                                                               │
│  ✅ Password updated successfully                            │
│  User can now login with new password                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Feature 2: Google Sign-In

### User Journey
```
                        LOGIN PAGE
                              ↓
              ┌─────────────────────────────┐
              │   [Initialize Session]      │
              │   [Create Identity]         │
              │                             │
              │ ─────────────────────────── │
              │  "Uplink Gateway"           │
              │ ─────────────────────────── │
              │                             │
              │  [Continue with Google] ←   │
              │                             │
              └─────────────────────────────┘
                              ↓ Click
                    GOOGLE LOGIN PAGE
              ┌─────────────────────────────┐
              │  Choose Your Google Account │
              │                             │
              │  [user@gmail.com]           │
              │  [another@gmail.com]        │
              │  [+ Add another account]    │
              └─────────────────────────────┘
                              ↓ Select Account
                 GOOGLE PERMISSIONS PAGE
              ┌─────────────────────────────┐
              │  SEDREX wants to:         │
              │                             │
              │  ✓ Access your email       │
              │  ✓ Access your profile      │
              │  ✓ Access your name         │
              │                             │
              │  [Allow]  [Deny]            │
              └─────────────────────────────┘
                              ↓ Click Allow
                        ✅ LOGGED IN
              ┌─────────────────────────────┐
              │       DASHBOARD             │
              │                             │
              │  Welcome, John Doe! 👋      │
              │  john@gmail.com             │
              │  Plan: Free                 │
              └─────────────────────────────┘
```

### Technical Flow
```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Browser)                      │
│                                                               │
│  User clicks "Continue with Google"                          │
│                           ↓                                   │
│  handleGoogleAuth() called                                   │
│                           ↓                                   │
│  Calls supabase.auth.signInWithOAuth({                       │
│    provider: 'google',                                       │
│    redirectTo: window.location.origin                        │
│  })                                                          │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓ Browser redirects
┌─────────────────────────────────────────────────────────────┐
│                   GOOGLE LOGIN PAGE                          │
│                                                               │
│  1. User selects Google account (or logs in)                │
│  2. Google shows permissions screen                          │
│  3. User clicks "Allow"                                     │
│  4. Google generates auth code                              │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓ Browser redirects back
┌─────────────────────────────────────────────────────────────┐
│            SUPABASE CALLBACK HANDLER                         │
│         (https://yourapp.supabase.co/auth/v1/callback)      │
│                                                               │
│  1. Receives auth code from Google                          │
│  2. Exchanges code for access token (backend)               │
│  3. Requests user info from Google                          │
│  4. Checks if user exists in Supabase                       │
│     ├─ If exists: Logs in                                   │
│     └─ If new: Creates account                              │
│  5. Creates Supabase session token                          │
│  6. Redirects back to app                                   │
└────────────────────┬───────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                FRONTEND (Dashboard)                          │
│                                                               │
│  Session token in localStorage/cookies                       │
│  User automatically logged in                                │
│  Dashboard appears                                           │
│  User data synced:                                           │
│  - Email from Google                                         │
│  - Name from Google                                          │
│  - Avatar (optional)                                         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow
```
                    GOOGLE SERVERS
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
    (Auth Code)    (User Info)      (Tokens)
        │                 │                 │
        ↓                 ↓                 ↓
    ┌─────────────────────────────────┐
    │     SUPABASE BACKEND            │
    │                                 │
    │  POST /auth/v1/oauth/callback   │
    │                                 │
    │  1. Validate code               │
    │  2. Exchange for token          │
    │  3. Get user profile from Google│
    │  4. Create/link user in DB      │
    │  5. Generate session token      │
    │  6. Return redirect URL         │
    └─────────────────┬───────────────┘
                      │
            ┌─────────┴─────────┐
            │                   │
        (User created or found) │
        (Session token)         │
            │                   │
            ↓                   ↓
        Supabase DB       Browser Storage
        - users            - Session cookie
        - profiles          - JWT token
        - auth logs         - User data
```

---

## State Machine: Forgot Password

```
                    ┌──────────────┐
                    │  LOGIN PAGE  │
                    └──────┬───────┘
                           │
                    Click "Forgot?"
                           │
                           ↓
                ┌──────────────────────┐
                │  FORGOT PASSWORD     │
                │     FORM             │
                │ (showForgotPassword  │
                │  = true)             │
                └─────────┬────────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
      (Back click)  (Email submitted)  (Invalid)
            │             │             │
            ↓             ↓             ↓
        ┌────────┐  ┌──────────┐  ┌─────────────┐
        │ CLOSED │  │ LOADING  │  │ ERROR MSG   │
        │        │  │(Sending) │  │ shown       │
        └────────┘  └─────┬────┘  └─────────────┘
                          │
                          ↓
                  ┌──────────────────┐
                  │ SUCCESS! EMAIL   │
                  │ SENT             │
                  │(resetEmailSent   │
                  │ = true)          │
                  └─────────┬────────┘
                            │
                   (Auto close in 3s)
                            │
                            ↓
                      ┌──────────────┐
                      │  LOGIN PAGE  │
                      │  (reset)     │
                      └──────────────┘
```

### State Variables in Code
```typescript
// Forgot password UI visibility
showForgotPassword: boolean  // true = form visible, false = hidden

// Email sending status
resetEmailSent: boolean      // true = success message shown

// Loading state
isLoading: boolean           // true = button disabled, loading text shown

// Error handling
error: string | null         // Error message if something went wrong
infoMessage: string | null   // Success message when email sent
```

---

## State Machine: Google OAuth

```
            ┌──────────────┐
            │  LOGIN PAGE  │
            │ "Continue    │
            │  with Google"│
            └──────┬───────┘
                   │
            (Click button)
                   │
                   ↓
        ┌────────────────────┐
        │ REDIRECTING TO     │
        │ GOOGLE LOGIN       │
        │ (isLoading = true) │
        └─────────┬──────────┘
                  │
        ┌─────────┴────────────────┐
        │                          │
    (User logs in)         (User cancels)
        │                          │
        ↓                          ↓
    GOOGLE PERMISSIONS        ERROR MESSAGE
        │                          │
    (User allows)                  │
        │                          │
        ↓                          ↓
    SUPABASE CALLBACK          ┌────────┐
        │                      │ LOGIN  │
        │                      │ FAILED │
        ↓                      └────────┘
    ┌──────────────┐
    │ LOGGING IN   │
    │(Creating/    │
    │ linking      │
    │ account)     │
    │              │
    │(isLoading =  │
    │ true)        │
    └──────┬───────┘
           │
           ↓
    ✅ SESSION CREATED
           │
           ↓
    ┌──────────────┐
    │ DASHBOARD    │
    │ User logged  │
    │ in!          │
    └──────────────┘
```

---

## Security: Token Lifecycle

### Forgot Password Token
```
┌──────────────────────────────────────────────────────────┐
│                    TOKEN TIMELINE                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Time: 0  - Token Generated                              │
│      ↓   - Random bytes created                         │
│      ↓   - Hashed with SHA256                           │
│      ↓   - Stored in database                           │
│      ↓   - Email sent                                   │
│      │                                                  │
│      ├─ User receives email (~30 sec)                   │
│      ├─ User clicks link (~5 min)                       │
│      │                                                  │
│ +5min - Token validated                                │
│      ├─ Check token exists in DB                        │
│      ├─ Check token not expired (<24h)                  │
│      ├─ Check token not already used                    │
│      │                                                  │
│      ├─ User sets new password                          │
│      │                                                  │
│ +6min - Token deleted                                  │
│      ├─ Token removed from database                     │
│      ├─ Cannot be reused                                │
│      ├─ Old password hash replaced                      │
│      │                                                  │
│      └─ User logs in with new password                  │
│                                                          │
│ +24h  - Link would expire                               │
│      └─ Unused links automatically expire               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Google OAuth Token
```
┌──────────────────────────────────────────────────────────┐
│                    TOKEN TIMELINE                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Click "Google" Button                                   │
│      ↓                                                   │
│ User redirected to Google Login                         │
│      ↓                                                  │
│ User authenticates with Google                          │
│      ↓                                                  │
│ Google generates temporary code                         │
│      ↓ (code is short-lived)                            │
│ Google redirects back to app with code                  │
│      ↓                                                  │
│ Supabase receives code                                  │
│      ├─ Validates code (1-time use only)                │
│      ├─ Exchanges code for access token                 │
│      ├─ Requests user data from Google                  │
│      ├─ Creates/finds user in database                  │
│      ├─ Generates Supabase session token                │
│      └─ Stores in browser (localStorage/cookie)         │
│                                                          │
│ Session Token Valid for:                                │
│      ├─ 1 hour (access token)                           │
│      ├─ 7 days (refresh token)                          │
│      └─ Auto-refresh happens automatically              │
│                                                          │
│ User logged in                                           │
│      ├─ Session token in browser                        │
│      ├─ All API calls include token                     │
│      └─ Token proves authentication                     │
│                                                          │
│ User logs out                                            │
│      └─ Token deleted from browser                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    USER BROWSER                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │           AuthPage Component                    │   │
│  │                                                 │   │
│  │  ┌──────────────────────────────────────────┐  │   │
│  │  │   Forgot Password                        │  │   │
│  │  │   - Input: email                         │  │   │
│  │  │   - Handler: handleForgotPassword()      │  │   │
│  │  │   - State: showForgotPassword            │  │   │
│  │  │   - State: resetEmailSent               │  │   │
│  │  └──────────────────────────────────────────┘  │   │
│  │                                                 │   │
│  │  ┌──────────────────────────────────────────┐  │   │
│  │  │   Google OAuth                           │  │   │
│  │  │   - Button: "Continue with Google"      │  │   │
│  │  │   - Handler: handleGoogleAuth()         │  │   │
│  │  │   - Function: loginWithGoogle()         │  │   │
│  │  └──────────────────────────────────────────┘  │   │
│  │                                                 │   │
│  └─────────────────────────────────────────────────┘   │
│                          ↓                              │
│                   localStorage                         │
│                 (Session tokens, user)                 │
│                                                         │
└────────────────┬────────────────────────────────────────┘
                 │ HTTPS/TLS Encrypted
                 │
    ┌────────────┼────────────┐
    │            │            │
    ↓            ↓            ↓
┌────────┐  ┌──────────┐  ┌──────────┐
│Supabase│  │ Google   │  │ Email    │
│Backend │  │ OAuth    │  │ Service  │
│(Auth)  │  │ Servers  │  │(SMTP)    │
│        │  │          │  │          │
│Database│  │API       │  │Send/Log  │
│Tables: │  │iam       │  │Emails    │
│- users │  │- token   │  │          │
│- auth  │  │- profile │  │Template: │
│- logs  │  │- email   │  │"Reset    │
│        │  │          │  │Password" │
└────────┘  └──────────┘  └──────────┘
```

---

## Summary Comparison Table

```
┌────────────┬──────────────────┬──────────────────┐
│ Aspect     │ Forgot Password  │ Google OAuth     │
├────────────┼──────────────────┼──────────────────┤
│ User Flow  │ Link in email    │ Redirect OAuth   │
│ Time       │ ~5-10 minutes    │ ~1 minute        │
│ Steps      │ 4 steps          │ 3 steps          │
│ Tech       │ Email + Token    │ OAuth 2.0        │
│ Token Life │ 24 hours         │ 1 hour (refresh) │
│ Security   │ One-time link    │ Industry std     │
│ Password   │ User creates new │ Not needed       │
│ Data Sync  │ Email only       │ Email + name     │
│ Setup      │ Auto (0 min)     │ Manual (15 min)  │
│ Cost       │ Free             │ Free             │
└────────────┴──────────────────┴──────────────────┘
```

---

**Visual Guide Complete! 📊**
