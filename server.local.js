/**
 * Local Development Server
 * Run this alongside Vite for local API proxy
 * 
 * Usage: node server.local.js
 * (In a separate terminal from `npm run dev`)
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';

config(); // Load .env file

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Claude API Proxy
app.post('/api/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      error: 'API key not configured. Create a .env file with ANTHROPIC_API_KEY=your-key' 
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: req.body.model || 'claude-sonnet-4-20250514',
        max_tokens: req.body.max_tokens || 4000,
        system: req.body.system || '',
        messages: req.body.messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: `Anthropic API error: ${response.status}`,
        details: errorData 
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  Words of Plainness - Local API Server                     ║
║                                                            ║
║  API proxy running at http://localhost:${PORT}               ║
║                                                            ║
║  Now run \`npm run dev\` in another terminal               ║
║  to start the frontend at http://localhost:5173            ║
╚════════════════════════════════════════════════════════════╝
  `);
});
