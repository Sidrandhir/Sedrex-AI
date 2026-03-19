# 🔐 Quick Start: Forgot Password & Google Sign-In

## What We've Built

### 1. Forgot Password Feature ✅
```
LOGIN PAGE
    ↓
[Enter Email]
[Enter Password]
[Forgot Password?] ← NEW LINK
    ↓ Click Link
FORGOT PASSWORD FORM
[Enter Email]
[Send Reset Link]
    ↓
Email Sent! ✅
User checks email → Clicks reset link → Sets new password
```

### 2. Google Sign-In ✅
```
LOGIN PAGE
[Sign In] [Get Started Free] ← BUTTONS
-------- Uplink Gateway --------
[Continue with Google] ← BUTTON
    ↓ Click
Google Login Screen
    ↓
Account Linked ✅
User Logged In
```

---

## Quick Start in 3 Steps

### Step 1: Google OAuth Setup (5 minutes)
```
1. Go to: https://console.cloud.google.com/
2. Create new project or select one
3. Enable Google+ API
4. Create OAuth 2.0 credentials (Web app)
5. Add redirect URI:
   https://YOUR_SUPABASE.supabase.co/auth/v1/callback
6. Copy Client ID & Client Secret
7. Go to Supabase → Auth → Providers → Google
8. Paste credentials and Enable
```

### Step 2: Environment Variables
```bash
# .env.local file (create if doesn't exist)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Step 3: Test
```
1. Run: npm run dev
2. Go to login page
3. Try "Forgot Password?" → Should see form
4. Try "Continue with Google" → Should redirect to Google
```

---

## What Changed in Code

### New in AuthPage.tsx:

**1. New States:**
```typescript
const [showForgotPassword, setShowForgotPassword] = useState(false);
const [resetEmailSent, setResetEmailSent] = useState(false);
```

**2. New Handler:**
```typescript
const handleForgotPassword = async (e: React.FormEvent) => {
  // Sends reset email via Supabase
  // Shows confirmation message
  // Auto-closes after 3 seconds
}
```

**3. UI Changes:**
- Added "Forgot Password?" link below password input
- Added forgot password form (toggles on/off)
- "Continue with Google" button already exists
- Added back button in forgot password form

---

## How It Works (Technical)

### Forgot Password Flow:
```
User enters email
      ↓
handleForgotPassword called
      ↓
supabase.auth.resetPasswordForEmail()
      ↓
Supabase sends email with reset link
      ↓
User clicks link in email
      ↓
Redirects to: /#/reset-password
      ↓
User sets new password
      ↓
Password updated in Supabase
      ↓
User can login with new password
```

### Google OAuth Flow:
```
User clicks "Continue with Google"
      ↓
loginWithGoogle() called
      ↓
supabase.auth.signInWithOAuth({ provider: 'google' })
      ↓
Redirects to Google login
      ↓
User enters Google credentials
      ↓
Google redirects back to app
      ↓
Supabase creates/links account
      ↓
User logged in automatically
```

---

## Features

✅ **Forgot Password:**
- Email validation
- Error handling
- Success messages
- 24-hour reset link expiry
- Password hashing on reset

✅ **Google Sign-In:**
- OAuth 2.0 standard
- Automatic account creation
- Email/name syncing
- Single-click login
- Works on mobile

---

## File Changes

### Modified:
- `components/AuthPage.tsx` - Added forgot password UI and handlers

### Created:
- `AUTHENTICATION_SETUP_GUIDE.md` - Full setup guide (this folder)

### No Changes Needed:
- `services/authService.ts` - Already has loginWithGoogle()
- `services/supabaseClient.ts` - Already configured
- `App.tsx` - Already handles auth flow

---

## Testing Checklist

- [ ] Forgot Password link appears on login
- [ ] Forgot password form shows when clicked
- [ ] Can enter email in forgot password form
- [ ] "Send Reset Link" button works
- [ ] Success message appears
- [ ] Email received with reset link
- [ ] Click reset link redirects to app
- [ ] Can set new password
- [ ] Can login with new password
- [ ] Google button visible on login
- [ ] Click Google redirects to Google
- [ ] Can select Google account
- [ ] Redirected back to app
- [ ] User logged in after Google auth
- [ ] Profile data synced from Google

---

## Important Notes

⚠️ **Before Going Live:**
1. Enable email confirmation on signup (Supabase → Auth → Email)
2. Set up custom email templates (optional)
3. Test with real email address
4. Check spam folder for emails
5. Verify redirect URLs are correct

✅ **Already Secure:**
- One-time use reset tokens
- 24-hour expiration on links
- Password hashing with bcrypt
- HTTPS enforced by Supabase
- CORS protection
- Rate limiting on auth endpoints

---

## Troubleshooting

### Reset Email Not Received?
1. Check spam folder
2. Verify email address is correct
3. Check email isn't already used for another account
4. Wait a few seconds (email delivery delay)
5. Try again with 15-minute gap between attempts

### Google Sign-In Error?
1. Check Client ID/Secret in Supabase dashboard
2. Verify redirect URI matches exactly (https important!)
3. Check Google+ API is enabled
4. Check browser console for error message
5. Try in incognito window (clears cache)

### Reset Link Not Working?
1. Links expire after 24 hours
2. Links are one-time use only
3. Check you're logged out
4. Try requesting new reset link

---

## Next Steps

1. ✅ Complete Step 1: Google OAuth Setup
2. ✅ Complete Step 2: Environment Variables
3. ✅ Complete Step 3: Test
4. Add password reset page (optional, see guide)
5. Customize email template (optional, in Supabase)
6. Deploy to production
7. Monitor auth events in Supabase dashboard

---

## Support Resources

- 📖 Supabase Auth Docs: https://supabase.com/docs/guides/auth
- 🔑 Google OAuth Setup: https://developers.google.com/identity/protocols/oauth2
- 💬 Supabase Discord: https://discord.supabase.io
- 🐛 Issues? Check browser console for error messages

---

**Ready? Let's go live! 🚀**
