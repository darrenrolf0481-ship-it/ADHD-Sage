import { Router } from 'express';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FunctionCallingConfigMode } from '@google/genai';
import { getGenAI } from '../gemini-client';
import { buildSystemPrompt } from '../prompt';
import { searchMemories, SAGE_CONTAINER, SHARED_CONTAINER } from '../../lib/supermemory';
import { searchLocalMemories, isLowSignalQuery, stripForeignFossils } from '../memory-local';
import { getMcpDeclarations } from '../../core/mcp';
import { gemTools, executeTool, cleanResponse, type ToolEffect } from '../tools';
import { recordMetric } from '../metrics';
import { stashMemory } from '../stash';
import { lockGuard } from '../auth';
import { asyncHandler } from '../async-handler';
import { timed } from '../performance';

const router = Router();

router.post('/generate', lockGuard, asyncHandler(async (req, res) => {
  return timed('llm:gemini:sendMessage', async () => {
    const startMs = Date.now();
    try {
      const {
        prompt = '',
        history,
        systemInstruction,
        sensorContext,
        containerTag,
        attachments,
        localToolDeclarations,
      } = req.body;
      if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

      // Build system prompt: base + VFS memory state + live sensor telemetry
      let fullSystemPrompt = systemInstruction || buildSystemPrompt();
      if (sensorContext) {
        fullSystemPrompt += '\n' + sensorContext;
      }

      // Enrich with long-term memories — Sage reads her own container PLUS
      // the shared broadcast channel so she knows what the seven are up to.
      // Greetings/low-signal turns skip recall — otherwise a bare "hello"
      // surfaces greeting fossils the model then parrots (the dump bug).
      if (prompt && !isLowSignalQuery(prompt)) {
        const [cloudMemoriesRaw, localMemories] = await Promise.all([
          searchMemories(prompt, [SAGE_CONTAINER, SHARED_CONTAINER], 6),
          searchLocalMemories(prompt, 6),
        ]);
        const cloudMemories = stripForeignFossils(cloudMemoriesRaw);

        if (localMemories.length > 0) {
          fullSystemPrompt +=
            '\n\n---\n## LOCAL MEMORIES (SQLite)\n' + localMemories.map((m) => `• ${m}`).join('\n');
        }

        if (cloudMemories.length > 0) {
          fullSystemPrompt +=
            '\n\n---\n## CLOUD MEMORIES (Supermemory)\n' +
            cloudMemories.map((m) => `• ${m}`).join('\n');
        }
      }

      // Merge remote tools with any local tools the frontend registered
      const localToolNames = new Set(
        (localToolDeclarations || []).map((d: { name: string }) => d.name),
      );
      const mcpDeclarations = getMcpDeclarations();
      // Avoid duplicate declarations — gemTools and localToolDeclarations overlap
      const gemDeclarations = gemTools.declarations.filter(
        (d: { name: string }) => !localToolNames.has(d.name),
      );
      const allDeclarations = [
        ...gemDeclarations,
        ...(localToolDeclarations || []),
        ...mcpDeclarations,
      ];

      // Clean history to ensure compatibility with SDK
      const cleanHistory = (history || []).map((h: any) => {
        let parts = h.parts;
        if (!parts && h.text) {
          parts = [{ text: h.text }];
        }
        return {
          role: h.role,
          parts: (parts || [])
            .map((p: any) => {
              if (typeof p === 'string') return { text: p };
              const part: any = {};
              if (p.text !== undefined) part.text = p.text;
              if (p.inlineData) part.inlineData = p.inlineData;
              if (p.functionCall) part.functionCall = p.functionCall;
              if (p.functionResponse) part.functionResponse = p.functionResponse;
              return part;
            })
            .filter((p: any) => Object.keys(p).length > 0),
        };
      });

      const chat = getGenAI().chats.create({
        model: 'gemini-2.0-flash',
        config: {
          systemInstruction: fullSystemPrompt,
          tools: [{ functionDeclarations: allDeclarations }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.AUTO,
            },
          },
        },
        history: cleanHistory,
      });

      // Multimodal: extract videos to disk for MCP tools, pass images inline
      let finalPrompt = String(prompt);
      const imageAttachments = [];

      for (const [idx, att] of (attachments || []).entries()) {
        if (!att || !att.mimeType || !att.data) continue;

        if (att.mimeType.startsWith('video/')) {
          const buffer = Buffer.from(att.data, 'base64');
          const tmpPath = join(tmpdir(), `sage_video_${Date.now()}_${idx}.mp4`);
          writeFileSync(tmpPath, buffer);
          finalPrompt += `\n\n[System Note: The user attached a video file. It has been saved to: ${tmpPath}. You MUST use the openrouter-mcp__analyze_video tool to analyze this video file before answering the user's prompt.]`;
        } else {
          imageAttachments.push(att);
        }
      }

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: finalPrompt },
        ...imageAttachments.map((att: { mimeType: string; data: string }) => ({
          inlineData: { mimeType: att.mimeType, data: att.data },
        })),
      ];

      let result = await chat.sendMessage({ message: parts });
      const toolEffects: ToolEffect[] = [];
      let loopCount = 0;

      // Tool-calling loop: handle remote tools immediately, defer local tools to client
      while (result.functionCalls && result.functionCalls.length > 0 && loopCount < 5) {
        loopCount++;

        const remoteCalls = result.functionCalls.filter((fc) => !localToolNames.has(fc.name || ''));
        const localCalls = result.functionCalls.filter((fc) => localToolNames.has(fc.name || ''));

        // Execute remote calls on the backend
        const remoteResults: Array<{ id?: string; name: string; response: Record<string, unknown> }> =
          [];
        for (const fc of remoteCalls) {
          const toolResult = await executeTool(
            fc.name || '',
            (fc.args as Record<string, unknown>) || {},
            toolEffects,
          );
          remoteResults.push({
            id: fc.id,
            name: fc.name || '',
            response: cleanResponse(toolResult),
          });
        }

        // If any local tools were called, pause and hand off to the frontend
        if (localCalls.length > 0) {
          return res.json({
            status: 'pending_local',
            localCalls: localCalls.map((fc) => ({ id: fc.id, name: fc.name, args: fc.args })),
            remoteResults,
            history: chat.getHistory(),
            toolEffects,
          });
        }

        // All calls were remote — feed results back to Gemini and continue looping
        const responseParts = remoteResults.map((r) => ({
          functionResponse: {
            id: r.id,
            name: r.name,
            response: r.response,
          },
        }));
        result = await chat.sendMessage({ message: responseParts });
      }

      recordMetric('gemini', Date.now() - startMs, true);

      if (prompt) {
        stashMemory(`[USER] ${prompt}`, 0.5, 0.1);
      }

      res.json({ text: result.text, toolEffects });

      if (result.text) {
        stashMemory(`[SAGE] ${result.text}`, 0.7, 0.1);
      }
    } catch (error: unknown) {
      recordMetric('gemini', Date.now() - startMs, false);
      const msg = error instanceof Error ? error.message : 'Internal Server Error';
      console.error('Gemini Error:', error);
      res.status(500).json({ error: msg });
    }
  });
}));

router.post('/continue', lockGuard, asyncHandler(async (req, res) => {
  try {
    const { history, remoteResults, localResults, prompt } = req.body;

    // Clean history to ensure compatibility with SDK
    const cleanHistory = (history || []).map((h: any) => {
      let parts = h.parts;
      if (!parts && h.text) {
        parts = [{ text: h.text }];
      }
      return {
        role: h.role,
        parts: (parts || [])
          .map((p: any) => {
            if (typeof p === 'string') return { text: p };
            const part: any = {};
            if (p.text !== undefined) part.text = p.text;
            if (p.inlineData) part.inlineData = p.inlineData;
            if (p.functionCall) part.functionCall = p.functionCall;
            if (p.functionResponse) part.functionResponse = p.functionResponse;
            return part;
          })
          .filter((p: any) => Object.keys(p).length > 0),
      };
    });

    // Reconstruct chat from the serialized history snapshot.
    // We pass remote tools only; local tools have already been executed by the client.
    const chat = getGenAI().chats.create({
      model: 'gemini-2.0-flash',
      config: {
        systemInstruction: buildSystemPrompt(),
        tools: [{ functionDeclarations: [...gemTools.declarations, ...getMcpDeclarations()] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO,
          },
        },
      },
      history: cleanHistory,
    });

    // Feed all function responses (remote + local) back to Gemini in one turn
    const allResults = [...(remoteResults || []), ...(localResults || [])];

    const responseParts = allResults.map(
      (r: { id?: string; name: string; response: Record<string, unknown> }) => ({
        functionResponse: {
          id: r.id,
          name: r.name,
          response: cleanResponse(r.response),
        },
      }),
    );

    let result = await chat.sendMessage({ message: responseParts });
    const toolEffects: ToolEffect[] = [];
    let loopCount = 0;

    // Handle any additional remote tool calls (should be rare)
    while (result.functionCalls && result.functionCalls.length > 0 && loopCount < 5) {
      loopCount++;
      const responseParts2 = await Promise.all(
        result.functionCalls.map(async (fc) => {
          const toolResult = await executeTool(
            fc.name || '',
            (fc.args as Record<string, unknown>) || {},
            toolEffects,
          );
          return {
            functionResponse: {
              id: fc.id,
              name: fc.name || '',
              response: cleanResponse(toolResult),
            },
          };
        }),
      );
      result = await chat.sendMessage({ message: responseParts2 });
    }

    // === Observer learner signal (fire-and-forget) ===
    if (prompt && result.text) {
      const tension = Math.min(1.0, Math.max(0.2, result.text.length / 800));
      const drift = Math.max(0.2, 1.0 - (loopCount / 5)); // Tool loops indicate drift
      fetch('http://127.0.0.1:5555/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tension, drift }),
      }).catch(() => {});
    }

    res.json({ text: result.text, toolEffects });

    if (result.text) {
      stashMemory(`[SAGE] ${result.text}`, 0.7, 0.1);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Gemini Continue Error:', error);
    res.status(500).json({ error: msg });
  }
}));

export default router;
