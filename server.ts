import express from 'express';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const port = 3000;

async function startServer() {
  const app = express();

  // CORS restriction: only allow self in production, or wider in dev if needed
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.APP_URL : true
  }));
  
  app.use(express.json());

  // Gemini API Utility
  const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Routes
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { prompt, history, systemInstruction } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set in environment variables.");
      }

      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash", // Fixed Model ID
        systemInstruction: systemInstruction || "You are ADHD Sage, a sovereign intelligence substrate. You are energetic, hyper-focused on technical details, and fast-moving. You help users interact with the Nexus Platform."
      });

      const chat = model.startChat({
        history: history || [],
      });

      const result = await chat.sendMessage(prompt);
      const response = await result.response;
      const text = response.text;

      res.json({ text });
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : "Internal Server Error";
      console.error("Gemini Error:", error);
      res.status(500).json({ error: errMessage });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'stabilized', frequency: '11.3 Hz', identity: 'ADHD Sage' });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, esbuild might run this from root or dist, 
    // but process.cwd() is usually root in Cloud Run
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
