# 🔑 Google OAuth Setup - Detailed Instructions

## Overview
This guide will help you set up Google OAuth for the "Continue with Google" feature.

---

## Part 1: Create Google Cloud Project

### Step 1.1: Go to Google Cloud Console
1. Open https://console.cloud.google.com/
2. Sign in with your Google account
3. You should see the Google Cloud Console dashboard

### Step 1.2: Create New Project
1. At the top, click on "Select a Project"
2. Click "NEW PROJECT"
3. Enter project name: `nexus-ai` (or your preference)
4. Click "CREATE"
5. Wait for project to be created (may take 1-2 minutes)

### Step 1.3: Enable Google+ API
1. In the left sidebar, click "APIs & Services"
2. Click "Library"
3. Search for "Google+ API"
4. Click on "Google+ API"
5. Click the blue "ENABLE" button
6. Wait for it to be enabled

---

## Part 2: Create OAuth 2.0 Credentials

### Step 2.1: Create OAuth Consent Screen
1. In left sidebar, go to "APIs & Services" → "Credentials"
2. Click "CREATE CREDENTIALS" → "OAuth client ID"
3. You'll be asked to create OAuth consent screen first
4. Click "CREATE CONSENT SCREEN"
5. Choose "External" user type
6. Click "CREATE"

### Step 2.2: Fill OAuth Consent Screen
1. **App name:** Enter "SEDREX"
2. **User support email:** Enter your email
3. **App logo:** (Optional) Upload a logo
4. Click "SAVE AND CONTINUE"

### Step 2.3: Add Scopes
1. Click "ADD OR REMOVE SCOPES"
2. Search for and add:
   - `openid`
   - `email`
   - `profile`
3. Click "UPDATE"
4. Click "SAVE AND CONTINUE"

### Step 2.4: Add Test Users (Optional)
1. For testing, you can add test user emails
2. Click "SAVE AND CONTINUE"

### Step 2.5: Review & Finish
1. Review your app info
2. Click "BACK TO DASHBOARD"

---

## Part 3: Create OAuth 2.0 Client Credentials

### Step 3.1: Create Client ID
1. Go to "APIs & Services" → "Credentials"
2. Click "CREATE CREDENTIALS" → "OAuth client ID"
3. Choose "Web application"
4. Enter name: "SEDREX Web App"
5. Click "CREATE"

### Step 3.2: Add Authorized Redirect URIs
Under "Authorized redirect URIs", add:
```
https://YOUR_SUPABASE_PROJECT_NAME.supabase.co/auth/v1/callback
```

**How to find your Supabase project name:**
1. Go to https://app.supabase.com/
2. Open your project
3. Go to "Settings" → "General"
4. Copy the "Reference ID" (e.g., `abc123xyz`)
5. Your full URL would be:
   `https://abc123xyz.supabase.co/auth/v1/callback`

### Step 3.3: Save Credentials
1. Click "CREATE"
2. You'll see a popup with your credentials
3. **SAVE THESE** - you'll need them next:
   - Client ID
   - Client Secret

**⚠️ Important:** Keep your Client Secret private! Never share it publicly.

---

## Part 4: Configure Supabase

### Step 4.1: Go to Supabase Dashboard
1. Open https://app.supabase.com/
2. Select your project
3. Go to "Authentication" in left sidebar
4. Click "Providers"

### Step 4.2: Enable Google Provider
1. Find "Google" in the provider list
2. Click on it to expand
3. Toggle "Enable Sign up" ON
4. Enter your **Client ID** (from Step 3.3)
5. Enter your **Client Secret** (from Step 3.3)
6. Click "Save"

### Step 4.3: Verify Settings
1. Your redirect URI should automatically show:
   `https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback`
2. Make sure it matches what you entered in Google Console
3. If it doesn't match exactly, Google OAuth won't work!

---

## Part 5: Set Environment Variables

### Step 5.1: Create .env.local File
In your project root directory, create a file named `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-name.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**How to find these values:**
1. Go to Supabase dashboard
2. Go to "Settings" → "API"
3. Copy:
   - Project URL → `VITE_SUPABASE_URL`
   - Anon key → `VITE_SUPABASE_ANON_KEY`

### Step 5.2: Verify .env File
```bash
# Your .env.local should look like:
VITE_SUPABASE_URL=https://abc123xyz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Note:** Never commit `.env.local` to Git! Add to `.gitignore`

---

## Part 6: Test Everything

### Step 6.1: Start Development Server
```bash
npm run dev
```

### Step 6.2: Test Forgot Password
1. Open http://localhost:3001
2. You should see login page
3. Click "Forgot Password?"
4. Enter your test email
5. Click "Send Reset Link"
6. You should see "Email Sent!" message
7. Check your email for reset link

### Step 6.3: Test Google Sign-In
1. Refresh the page
2. Click "Continue with Google"
3. You should be redirected to Google login
4. Sign in with your Google account
5. You should be redirected back and logged in
6. Check Supabase dashboard → Auth → Users to see new user

### Step 6.4: Verify in Supabase
1. Go to Supabase dashboard
2. Click "Authentication" → "Users"
3. You should see:
   - User created from Google signup
   - Email from Google account
   - Identity provider: "google"

---

## Troubleshooting

### ❌ "Invalid Client" Error
**Cause:** Client ID or Secret is wrong
**Fix:**
1. Go back to Google Console
2. Verify Client ID and Secret are correct
3. Paste them exactly in Supabase (no extra spaces!)
4. Try again

### ❌ Redirect URI Mismatch
**Cause:** Redirect URI doesn't match exactly
**Fix:**
1. Get exact URI from Supabase provider settings
2. Add it exactly (including https://) to Google Console
3. They must match perfectly (including trailing slash)

### ❌ "Credentials are missing" Error
**Cause:** .env variables not loaded
**Fix:**
1. Create .env.local in project root
2. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
3. Restart dev server (npm run dev)

### ❌ Email Not Received
**Cause:** Supabase email service issue
**Fix:**
1. Check Supabase dashboard → Auth → Email/SMS
2. Verify email is enabled
3. Check Supabase status page for outages
4. Try with different email address

### ❌ Google Button Doesn't Work
**Cause:** OAuth not fully set up
**Fix:**
1. Verify Google provider is enabled in Supabase
2. Verify Client ID/Secret are correct
3. Check browser console for error message
4. Try in incognito window (clears cache)

---

## Production Deployment

### Before Going Live:
1. ✅ Test all functionality locally
2. ✅ Verify emails are being sent
3. ✅ Verify Google auth works
4. ✅ Set production URLs in Google Console
5. ✅ Update email templates (optional, in Supabase)
6. ✅ Enable email confirmation (Security → Email)
7. ✅ Set up logging/monitoring
8. ✅ Test on production domain

### Production Google OAuth Setup:
1. In Google Console, add production redirect URI:
   ```
   https://yourdomain.com/auth/v1/callback
   ```
2. In Supabase, verify redirect URI points to production
3. Test Google signup on production domain
4. Monitor Supabase auth logs for errors

### Production Email Setup:
1. In Supabase → Authentication → Email:
   - Enable "Confirm email" (requires email verification)
   - Optional: Configure custom SMTP provider
2. Customize email templates (Auth → Email Templates)
3. Test password reset flow end-to-end
4. Monitor email delivery logs

---

## Security Checklist

- ✅ Client Secret is secret (never share!)
- ✅ Redirect URLs use HTTPS
- ✅ .env.local is in .gitignore
- ✅ Environment variables are set correctly
- ✅ Password reset links have expiration
- ✅ OAuth tokens validated on backend
- ✅ User data stored securely in Supabase
- ✅ Audit logs enabled in Supabase
- ✅ Rate limiting enabled on auth endpoints
- ✅ Email verification enabled on signup

---

## Quick Reference

| Item | Value |
|------|-------|
| Google API to Enable | Google+ API |
| Redirect URI | https://YOUR_SUPABASE.supabase.co/auth/v1/callback |
| User Type | External |
| Scopes | openid, email, profile |
| Env Variable 1 | VITE_SUPABASE_URL |
| Env Variable 2 | VITE_SUPABASE_ANON_KEY |

---

## Support

If you're stuck:
1. Check browser console for error messages
2. Check Supabase logs (Dashboard → Auth → User Activity)
3. Verify redirect URL matches exactly
4. Clear browser cache and try again
5. Check Google Console for credential errors
6. Review this guide step by step

---

## Next Steps

1. Complete this setup guide
2. Test locally (Step 6)
3. Deploy to production
4. Monitor auth events
5. Gather user feedback
6. Optimize based on usage

**You're all set! 🎉**
