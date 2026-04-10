# Firebase Password Reset Email Setup Guide

## Issue: Not Receiving Password Reset Emails

### Quick Checks:

1. **Check Spam/Junk Folder**
   - Firebase emails often go to spam initially
   - Look for emails from `noreply@dev-journal-20.firebaseapp.com`

2. **Wait 5-10 Minutes**
   - Sometimes emails are delayed
   - Check both inbox and spam after waiting

---

## Firebase Console Configuration Steps:

### Step 1: Verify Email/Password Authentication is Enabled

1. Go to: https://console.firebase.google.com/
2. Select your project: `dev-journal-20`
3. Click **Authentication** in left sidebar
4. Click **Sign-in method** tab
5. Ensure **Email/Password** is **Enabled**

### Step 2: Configure Email Templates

1. In **Authentication** section
2. Click **Templates** tab (top of page)
3. Click **Password reset** template
4. You should see:
   - **From name**: Firebase (or customize it to "Dev Journal")
   - **From email**: `noreply@dev-journal-20.firebaseapp.com`
   - **Reply-to email**: (optional - add your support email)
   - **Subject**: Reset your password for %APP_NAME%
   - **Body**: Template with reset link

5. **Customize the template** (optional but recommended):
   ```
   Subject: Reset your Dev Journal password
   
   Body:
   Hello,
   
   Follow this link to reset your Dev Journal password:
   %LINK%
   
   If you didn't ask to reset your password, you can ignore this email.
   
   Thanks,
   Dev Journal Team
   ```

6. Click **Save**

### Step 3: Verify Authorized Domains

1. In **Authentication** section
2. Click **Settings** tab
3. Scroll to **Authorized domains**
4. Ensure these domains are listed:
   - `dev-journal-20.firebaseapp.com`
   - `dev-035.github.io`
   - `localhost` (for testing)

5. If `dev-035.github.io` is missing:
   - Click **Add domain**
   - Enter: `dev-035.github.io`
   - Click **Add**

### Step 4: Check Firebase Project Settings

1. Click **Project Settings** (gear icon, top left)
2. Under **General** tab
3. Verify **Public-facing name**: "Dev Journal" (or your preferred name)
4. This name appears in password reset emails

---

## Testing the Email:

### Method 1: Test with Your Email
1. Sign in to your app with your account
2. Go to Profile → Security → Reset via Email
3. Check:
   - Inbox (wait 2-3 minutes)
   - Spam/Junk folder
   - Promotions tab (if using Gmail)

### Method 2: Check Browser Console for Errors
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Click "Reset via Email"
4. Look for any error messages
5. If you see errors, note the error code

---

## Common Error Codes:

- `auth/too-many-requests`: Wait 15-30 minutes and try again
- `auth/user-not-found`: User doesn't exist in Firebase
- `auth/invalid-email`: Email format is invalid
- `auth/network-request-failed`: Internet connection issue

---

## Alternative: Use "Forgot Password" on Login Screen

If the Profile page reset isn't working, you can also:

1. Sign out from your account
2. Go to Login screen
3. Click **"Forgot password?"** link
4. Enter your email
5. Click to send reset email

This uses the same Firebase function but from a different entry point.

---

## Still Not Working?

### Check Firebase Quota:
1. Go to Firebase Console
2. Click **Usage** in left sidebar
3. Check if you've exceeded email sending limits
4. Free tier: 100 emails/day

### Whitelist Firebase Email:
Add these to your email whitelist:
- `noreply@dev-journal-20.firebaseapp.com`
- `*.firebaseapp.com`

### Contact Firebase Support:
If none of the above works, there might be an issue with your Firebase project configuration that requires Firebase support.

---

## For Development/Testing:

You can also test password reset using Firebase CLI:
```bash
firebase auth:export users.json --project dev-journal-20
```

This will show you all registered users and their email verification status.
