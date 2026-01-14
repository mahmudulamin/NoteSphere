# Google OAuth Setup Guide

This guide explains how to enable Google Sign-In for NoteSphere.

## Prerequisites

- A Google account
- NoteSphere server running locally or deployed

## Step-by-Step Instructions

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Enter project name: `NoteSphere` (or your preferred name)
4. Click **"Create"**

### 2. Enable Google Sign-In API

1. In the Google Cloud Console, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google+ API"** or **"Google Identity"**
3. Click on it and press **"Enable"**

### 3. Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Choose **"External"** (unless you have a Google Workspace)
3. Click **"Create"**

4. Fill in required fields:
   - **App name:** NoteSphere
   - **User support email:** Your email
   - **Developer contact information:** Your email
5. Click **"Save and Continue"**

6. **Scopes:** Click **"Add or Remove Scopes"**

   - Select: `userinfo.email`
   - Select: `userinfo.profile`
   - Select: `openid`
   - Click **"Update"** → **"Save and Continue"**

7. **Test users:** (Optional during development)

   - Add your email addresses for testing
   - Click **"Save and Continue"**

8. Click **"Back to Dashboard"**

### 4. Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Choose **"Web application"**

4. Configure:

   - **Name:** NoteSphere Web Client
   - **Authorized JavaScript origins:**

     ```
     http://localhost:5500
     ```

     (Add your production URL later, e.g., `https://yourdomain.com`)

   - **Authorized redirect URIs:**
     ```
     http://localhost:5500/login.html
     http://localhost:5500/register.html
     ```
     (Add production URIs later)

5. Click **"Create"**

6. **Copy your credentials:**
   - You'll see a dialog with **Client ID** and **Client Secret**
   - Keep these safe!

### 5. Configure NoteSphere

#### Set Environment Variables

**Windows (cmd):**

```cmd
set GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
set GOOGLE_CLIENT_SECRET=your-client-secret-here
npm start
```

**Windows (PowerShell):**

```powershell
$env:GOOGLE_CLIENT_ID="your-client-id-here.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET="your-client-secret-here"
npm start
```

**Linux/Mac:**

```bash
export GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=your-client-secret-here
npm start
```

#### Or Create .env File (Recommended)

1. Create a file named `.env` in the NoteSphere root directory
2. Add your credentials:
   ```
   GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   ```
3. Install dotenv: `npm install dotenv`
4. Update `server.js` to load .env at the top:
   ```javascript
   require("dotenv").config();
   ```

### 6. Test Google Sign-In

1. Restart the NoteSphere server
2. Go to http://localhost:5500/login.html
3. Click **"Sign in with Google"**
4. Choose your Google account
5. Grant permissions
6. You should be automatically logged in!

## Troubleshooting

### "Error: Invalid OAuth client"

- Check your Client ID is correct
- Verify the origin URL matches exactly (http://localhost:5500)
- Make sure there are no extra spaces in the environment variable

### "Error: redirect_uri_mismatch"

- The redirect URI must be added to "Authorized redirect URIs" in Google Cloud Console
- Make sure the URL matches exactly (including http/https, port, path)

### "Google Sign-In button not showing"

- Check browser console for errors
- Verify GOOGLE_CLIENT_ID environment variable is set
- Try clearing browser cache and cookies

### "Error: invalid_client"

- Your Client Secret may be incorrect
- Verify both Client ID and Secret are set correctly
- Try regenerating credentials in Google Cloud Console

## Production Deployment

When deploying to production:

1. Update **Authorized JavaScript origins:**

   ```
   https://yourdomain.com
   ```

2. Update **Authorized redirect URIs:**

   ```
   https://yourdomain.com/login.html
   https://yourdomain.com/register.html
   ```

3. Set environment variables on your server:

   ```bash
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```

4. Consider publishing your OAuth consent screen (under "OAuth consent screen" → "Publish App")

## Security Best Practices

- ✅ Never commit `.env` file to Git (add to `.gitignore`)
- ✅ Use different OAuth credentials for development and production
- ✅ Regularly rotate your Client Secret
- ✅ Only add necessary scopes
- ✅ Monitor OAuth usage in Google Cloud Console
- ✅ Enable 2FA on your Google account used for Cloud Console

## Additional Resources

- [Google Sign-In Documentation](https://developers.google.com/identity/sign-in/web)
- [OAuth 2.0 Overview](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)

---

**Need help?** Check the main [README.md](README.md) or create an issue on GitHub.
