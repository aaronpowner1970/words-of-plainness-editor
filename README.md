# Words of Plainness Editorial Canvas

A custom AI-powered editorial tool for ministry writings, featuring inline suggestions, collaborative brainstorming, and persistent storage.

## Features

- **Live AI Analysis**: Claude-powered editorial suggestions across 5 focus areas
- **Inline Suggestions**: Accept/dismiss changes with margin controls
- **Collaborative Chat**: Brainstorm and discuss editorial decisions
- **Persistent Storage**: Auto-saves your work locally and to cloud
- **Multiple Export Formats**: RTF (Word), Google Docs, HTML, Markdown, Plain Text

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+ ([download](https://nodejs.org/))
- Anthropic API key ([get one](https://console.anthropic.com/))

### Setup

1. **Clone or extract this folder**

2. **Install dependencies**
   ```bash
   cd words-of-plainness-editor
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```
   Open http://localhost:5173 in your browser.

---

## Deploy to Vercel (Recommended)

### One-Click Deploy

1. Push this folder to a GitHub repository

2. Go to [vercel.com](https://vercel.com) and sign in with GitHub

3. Click "New Project" → Import your repository

4. **Add Environment Variable**:
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your API key from console.anthropic.com

5. Click "Deploy"

Your editor will be live at `https://your-project.vercel.app`

### Manual Deploy (Vercel CLI)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (will prompt for env vars)
vercel

# Deploy to production
vercel --prod
```

---

## Deploy to Other Platforms

### Netlify

1. Create `netlify.toml` in project root:
   ```toml
   [build]
     command = "npm run build"
     publish = "dist"
   
   [functions]
     directory = "netlify/functions"
   ```

2. Move `api/claude.js` to `netlify/functions/claude.js` and adapt the handler format

3. Set `ANTHROPIC_API_KEY` in Netlify dashboard → Site settings → Environment variables

### Self-Hosted (Node.js Server)

See `server.example.js` for a simple Express server setup.

---

## Project Structure

```
words-of-plainness-editor/
├── api/
│   └── claude.js          # Serverless API proxy for Claude
├── src/
│   ├── main.jsx           # React entry point
│   ├── App.jsx            # Main app component
│   ├── index.css          # Global styles
│   ├── components/
│   │   └── Editor.jsx     # Main editor component
│   └── lib/
│       └── storage.js     # Persistent storage utilities
├── index.html             # HTML template
├── package.json           # Dependencies
├── vite.config.js         # Vite configuration
├── vercel.json            # Vercel deployment config
└── .env.example           # Environment template
```

---

## Persistent Storage

The editor automatically saves:
- **Current document content** (auto-saves every 30 seconds)
- **Chat history** (preserved between sessions)
- **Editorial preferences** (selected modes, etc.)

### Storage Backends

1. **Local Storage** (default): Works immediately, stored in browser
2. **Vercel KV** (optional): Cloud-synced across devices

To enable Vercel KV:
1. In Vercel dashboard, go to Storage → Create Database → KV
2. Connect it to your project
3. The app will automatically detect and use it

---

## Customization

### Adding Editorial Modes

Edit `src/components/Editor.jsx`, find `EDITORIAL_MODES` array:

```javascript
const EDITORIAL_MODES = [
  { id: 'your-mode', name: 'Display Name', icon: '✦', description: 'What it does' },
  // ...
];
```

Then add corresponding prompt in `getModePrompt()` function.

### Styling

- Main styles: `src/index.css`
- Component styles: Inline in `Editor.jsx` (easily extractable to CSS modules)

### API Configuration

Edit `api/claude.js` to:
- Change the model (default: claude-sonnet-4-20250514)
- Adjust token limits
- Add rate limiting
- Enable additional features

---

## Security Notes

- **Never commit `.env`** — it's in `.gitignore`
- The API key is only used server-side (in `/api/claude.js`)
- Client-side code never sees your API key
- Consider adding authentication if deploying publicly

### Adding Basic Auth (Optional)

For password protection, add to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "WWW-Authenticate",
          "value": "Basic realm=\"Words of Plainness\""
        }
      ]
    }
  ]
}
```

Or use Vercel's built-in password protection (Pro plan).

---

## Troubleshooting

### "API Error: 401"
- Check your `ANTHROPIC_API_KEY` is set correctly
- Verify the key is active at console.anthropic.com

### "Network Error" in development
- Make sure you're using `npm run dev` (not opening HTML directly)
- Check the API proxy is running (should see `/api/claude` requests in terminal)

### Storage not persisting
- Check browser allows localStorage for the domain
- Try clearing localStorage and refreshing
- Check browser console for errors

---

## Support

Built for Aaron's Words of Plainness ministry project.

For issues or feature requests, document them in the project's issue tracker or discuss directly with Claude.
