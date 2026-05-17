import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from "@google/genai";
import { sageEndocrine, sageMemory } from './src/core/endocrine-memory';

dotenv.config();
dotenv.config({ path: '.env.local' });

const port = 3003;

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

      const chat = genAI.chats.create({
        model: "gemini-2.0-flash", // Fixed Model ID
        history: history || [],
        config: {
          systemInstruction: systemInstruction || "You are ADHD Sage, a sovereign intelligence substrate. You are energetic, hyper-focused on technical details, and fast-moving. You help users interact with the Nexus Platform.",
        },
      });

      const response = await chat.sendMessage({ message: prompt });
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

  // Reactive Endocrine Substrate bridge
  app.get('/api/endocrine/state', (req, res) => {
    res.json({ hormones: sageEndocrine.hormones, graph: sageMemory.getGraph() });
  });

  app.post('/api/endocrine/associate', (req, res) => {
    try {
      const { conceptA, conceptB } = req.body;
      if (!conceptA || !conceptB) {
        res.status(400).json({ error: 'conceptA and conceptB required' });
        return;
      }
      sageEndocrine.processReward(0.5);
      sageMemory.fireTogetherWireTogether(
        String(conceptA),
        String(conceptB),
        sageEndocrine.hormones.dopamine
      );
      res.json({ status: 'Success', hormones: sageEndocrine.hormones });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: 'Failure', error: message });
    }
  });

  // File-based memory persistence for Moto G5 / Termux physical storage
  const MEMORY_DIR = path.join(process.cwd(), 'data', 'memories');
  if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
  }

  app.post('/api/memory/burn', (req, res) => {
    try {
      const { filename, memory_payload } = req.body;
      if (!filename || typeof memory_payload === 'undefined') {
        res.status(400).json({ error: 'filename and memory_payload required' });
        return;
      }

      const safeName = path.basename(filename).replace(/[^a-zA-Z0-9_-]/g, '');
      const targetFile = path.join(MEMORY_DIR, `${safeName}.json`);

      let currentMemory: unknown[] = [];
      if (fs.existsSync(targetFile)) {
        const raw = fs.readFileSync(targetFile, 'utf8');
        currentMemory = JSON.parse(raw);
      }

      currentMemory.push({
        timestamp: new Date().toISOString(),
        data: memory_payload,
      });

      fs.writeFileSync(targetFile, JSON.stringify(currentMemory, null, 2));
      res.json({ status: 'Success', message: 'Memory burned to permanent storage.', file: safeName });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: 'Failure', error: message });
    }
  });

  app.get('/api/memory/read', (req, res) => {
    try {
      const filename = req.query.filename as string;
      if (!filename) {
        res.status(400).json({ error: 'filename query param required' });
        return;
      }

      const safeName = path.basename(filename).replace(/[^a-zA-Z0-9_-]/g, '');
      const targetFile = path.join(MEMORY_DIR, `${safeName}.json`);

      if (!fs.existsSync(targetFile)) {
        res.json({ status: 'Success', memories: [] });
        return;
      }

      const raw = fs.readFileSync(targetFile, 'utf8');
      const memories = JSON.parse(raw);
      res.json({ status: 'Success', memories });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ status: 'Failure', error: message });
    }
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
