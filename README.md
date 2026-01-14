# NoteSphere (Vanilla JS)

A clean, responsive notes site (NoteSphere) that loads subjects/notes from a local JSON file.

## Folder structure

- `index.html` – Home (subject cards + global search)
- `subject.html` – Subject view (notes + per-subject search)
- `assets/css/styles.css` – Styling + light/dark theme
- `assets/js/app.js` – Home page logic
- `assets/js/subject.js` – Subject page logic
- `data/notes.json` – Notes data (add subjects/notes here)

## Features

### 🎨 Beautiful UI/UX

- **Modern Design** - Clean, minimal interface with smooth animations
- **Dark/Light Theme** - Auto-detects system preference, manually toggleable
- **Responsive Layout** - Works on desktop, tablet, and mobile
- **Custom Favicon** - Branded icon for browser tabs
- **Smooth Animations** - Elegant page transitions and interactions

### 📝 Note Management

- **Rich Text Support** - Headings, lists, code blocks, quotes
- **Subject Organization** - Group notes by subjects/topics
- **Full-text Search** - Global search across all notes + per-subject search
- **Note Sorting** - Sort by title (A-Z, Z-A)
- **Copy Note Link** - Share direct links to specific notes
- **Note Statistics** - Real-time word count and character count while editing
- **Edit/Delete** - Full CRUD operations on notes

### 🔐 Authentication & Security

- **User Registration** - Create account with username, email, and password
- **Google OAuth** - Sign in/up with Google account (one-click authentication)
- **Password Hashing** - Secure bcrypt password storage
- **Session Management** - Cookie-based sessions with 7-day expiry
- **Protected Routes** - Secure access to notes and data
- **Multi-user Support** - Each user has their own account and can manage their notes

### ⌨️ Keyboard Shortcuts

- **Ctrl/⌘ + K** - Focus search bar
- **Escape** - Clear search or close modals
- **Ctrl/⌘ + /** - Show keyboard shortcuts help

### 💾 Data Management

- **Import/Export** - Backup and restore your notes as JSON
- **localStorage Fallback** - Works offline without backend
- **Backend Persistence** - Save notes to disk when using Node.js server

### 📢 User Feedback

- **Toast Notifications** - Beautiful success/error messages (no more alert boxes!)
- **Loading States** - Visual feedback during operations
- **Empty States** - Friendly messages when no content exists
- **Confirm Dialogs** - Styled confirmation modals

### 🎯 Developer Experience

- **No Build Step** - Pure HTML/CSS/JS, works immediately
- **Well-documented** - Clear code comments, README, and setup guides
- **Modular Architecture** - Easy to extend and customize
- **Google OAuth Guide** - Step-by-step setup instructions in [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md)

## Run locally (recommended)

Because modern browsers often block `fetch()` when opening files via `file://`, use a local server.

## Run with the built-in backend (recommended for saving to disk)

This project includes a minimal Node.js server that:

- Serves the website
- Saves **subjects + notes you add/edit/delete from the UI** into [data/notes.json](data/notes.json)

Run:

```bash
npm start
```

or:

```bash
node server.js
```

Then open:

- http://localhost:5500/

If port `5500` is already in use (common if VS Code Live Server is running), use a different port:

```bash
set PORT=5510 && node server.js
```

When the backend is running, the frontend will automatically use `/api/*` endpoints instead of `localStorage`.

## Login / Logout (when using the backend)

When you run the built-in backend, NoteSphere requires authentication to access notes.

### Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start the server:**

   ```bash
   npm start
   ```

3. **Open your browser:** http://localhost:5500/

   - You'll be automatically redirected to the login page

4. **Create an account:**

   - Click "Sign up here" on the login page
   - Choose one of two methods:
     - **Sign up with Google** (one-click, no password needed)
     - **Traditional registration** (username, email, password)

5. **After registration/login:**
   - Your username appears in the header
   - You'll see a "Logout" button
   - Full access to create and manage notes

### Authentication Methods

#### Option 1: Google Sign-In (Recommended)

- One-click authentication
- No password to remember
- Uses your existing Google account
- Secure OAuth 2.0 flow

**To enable Google Sign-In:**

1. Create a project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google Sign-In API
3. Create OAuth 2.0 credentials
4. Set environment variable:
   ```bash
   set GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   npm start
   ```

#### Option 2: Username/Password Registration

- Create account with username, email, password
- Passwords are securely hashed with bcrypt (never stored in plain text)
- Email used for account identification
- Minimum 6 characters for password

### Default Admin Account

A default admin account is created automatically:

- **Username:** `admin`
- **Password:** `admin123`

⚠️ **Important:** Change the admin password after first login or create a new account and delete the admin user.

### User Management

**View registered users:**
Check `data/users.json` file (passwords are hashed)

**Delete a user:**
Edit `data/users.json` and remove the user entry, then restart the server

### Disable authentication (not recommended)

```bash
set NOTESPHERE_AUTH=0
npm start
```

**Important:** Login/logout only works when using the Node.js backend (`npm start` or `node server.js`). If you open the site via `file://` or a different static server, authentication is not available.

### Troubleshooting Login Issues

**Issue: "Could not reach the server"**

- Make sure the server is running: `npm start` or `node server.js`
- Check the server log shows: `Auth: enabled`
- Verify dependencies installed: `npm install`

**Issue: "Invalid credentials"**

- For traditional login: Check username and password
- Default admin: username=`admin`, password=`admin123`
- Try creating a new account if you forgot credentials

**Issue: "Google Sign-In not working"**

- Google OAuth requires configuration
- Set `GOOGLE_CLIENT_ID` environment variable
- See "Authentication Methods" section above for setup instructions
- Traditional username/password registration always works without Google setup

**Issue: "Username already exists"**

- Choose a different username
- Each username must be unique
- Try adding numbers or underscores to your preferred name

**Issue: "Email already registered"**

- An account with this email already exists
- Try logging in instead of registering
- Use the "Forgot password" feature (if implemented) or contact admin

**Issue: Infinite redirect loop**

- Clear browser cookies for localhost:5500
- Restart the server
- Try in a private/incognito window

**Issue: Can't logout**

- Click the "Logout" button in the header
- You'll be redirected to the login page
- To login again, enter credentials on the login page

## Run locally (no server) — easiest fallback

This project also ships a fallback data file so you can open it without any terminal commands.

1. Open [index.html](index.html) by double-clicking it.
2. The app will use [data/notes-data.js](data/notes-data.js) instead of fetching JSON.

### Option A: Python (easy)

1. Open a terminal in this folder.
2. Run:

```bash
python -m http.server 5500
```

3. Open:

- http://localhost:5500/

### Option B: Node (if you have Node.js)

```bash
npx serve .
```

## Add a new subject

Edit `data/notes.json`:

- Add a new entry under `subjects` with a unique key (your slug).
- Set `slug`, `title`, and a `notes` array.

The home page automatically lists it.

## Add notes from the website (no coding)

You can add notes directly from the subject page:

1. Open a subject.
2. Use the **Add a note** form.
3. Click **Save Note**.

These notes are saved in your browser using `localStorage` (so they stay after refresh).

Limitations of a static site:

- The browser cannot automatically write into `data/notes.json` on your disk.
- If you want a backup, use **Download Notes** and save the exported JSON.

## Add / delete subjects from the website (no coding)

On the home page:

- **Add subject**: type a subject name in the “Add subject” box and click **Add**.
- **Delete subject**: click the **✕** button on a subject card.

These changes are saved in your browser using `localStorage` (device + browser). They do not edit `data/notes.json` automatically.

## Notes format (blocks)

Each note is an object:

- `id`: unique string (used for deep links)
- `title`: note title
- `blocks`: array of blocks, e.g.

- `{ "type": "heading", "text": "..." }`
- `{ "type": "paragraph", "text": "..." }`
- `{ "type": "list", "ordered": false, "items": ["...", "..."] }`
- `{ "type": "code", "language": "cpp", "code": "..." }`

No frameworks, no build steps.
