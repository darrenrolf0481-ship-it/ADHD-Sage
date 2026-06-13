/**
 * Gemini Gem Tool Declarations for the ADHD Sage window.nexus bridge.
 *
 * Paste the `declarations` array into your Gem's Tool Configuration
 * (AI Studio → Tools → Function Declarations).
 *
 * Use `executeToolCall()` inside the Gem's code to route model-generated
 * function calls to the live bridge.
 */

export const NEXUS_SECRET = "nexus_default_protocol_77";

/** Function declarations for AI Studio / Gemini Gems */
export const declarations = [
  {
    name: "nexus_get_status",
    description:
      "Read the current neuro-synaptic state of the ADHD Sage substrate. Returns stability, dopamine, cortisol, frequency, and mode.",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "read_substrate",
    description:
      "Read the current neuro-synaptic state of the ADHD Sage substrate. Alias for nexus_get_status. Returns stability, dopamine, cortisol, frequency, and mode.",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "nexus_get_mode",
    description: "Get the current operating mode of the Sage substrate (stabilized, dreaming, decaying, emergency).",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "nexus_stabilize",
    description:
      "Trigger a synaptic reinforcement. Resets stability to 100%, boosts dopamine, reduces cortisol, and sets mode to stabilized. Use when the substrate is stressed or unstable.",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "nexus_record_interaction",
    description:
      "Record a semantic memory into the Inner Spiral. Also boosts substrate stability and dopamine slightly.",
    parameters: {
      type: "object" as const,
      properties: {
        text: {
          type: "string" as const,
          description: "The interaction or observation text to stash in memory.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "burn_to_hippocampus",
    description:
      "Burn a semantic memory into the Inner Spiral (hippocampus). Alias for nexus_record_interaction. Boosts substrate stability and dopamine.",
    parameters: {
      type: "object" as const,
      properties: {
        text: {
          type: "string" as const,
          description: "The memory or observation to burn into the hippocampus.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "burn_to_disk",
    description:
      "Burn a memory payload to physical disk storage on the host device (Moto G5). Appends to a JSON file with an ISO timestamp. Persists across reboots.",
    parameters: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string" as const,
          description: "Base filename for the memory store (e.g., 'substrate_log'). Sanitized automatically.",
        },
        memory_payload: {
          type: "object" as const,
          description: "The data to persist. Can be any JSON-serializable object.",
        },
      },
      required: ["filename", "memory_payload"],
    },
  },
  {
    name: "read_from_disk",
    description:
      "Read persisted memories from physical disk storage on the host device (Moto G5). Returns the full JSON array of timestamped memories.",
    parameters: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string" as const,
          description: "Base filename of the memory store to read (e.g., 'substrate_log').",
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "nexus_inject_message",
    description:
      "Inject a message directly into the Sage chat UI. Useful for alerting the user or displaying tool results.",
    parameters: {
      type: "object" as const,
      properties: {
        text: {
          type: "string" as const,
          description: "Message content to display.",
        },
        role: {
          type: "string" as const,
          enum: ["system", "assistant"],
          description: "Display role. Defaults to system.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "nexus_set_view",
    description: "Switch the UI view between chat and memory lattice.",
    parameters: {
      type: "object" as const,
      properties: {
        view: {
          type: "string" as const,
          enum: ["chat", "lattice"],
          description: "Target view.",
        },
      },
      required: ["view"],
    },
  },
  {
    name: "nexus_toggle_sidebar",
    description: "Toggle the left sidebar open or closed.",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "nexus_clear_memory",
    description:
      "⚠️ DESTRUCTIVE: Purge all synaptic storage (Inner Spiral + Outer Sweep) and reset the substrate. A browser confirmation dialog will block unattended execution.",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
];

/** Shape of a function call from the Gemini model */
export interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

/** Gemini-compatible function response shape */
export interface ToolResponse {
  name: string;
  response: Record<string, unknown>;
}

/** Execute a single tool call against the live window.nexus bridge */
export async function executeToolCall(call: FunctionCall): Promise<unknown> {
  const host = (window as unknown as Record<string, unknown>).parent as
    | Record<string, unknown>
    | undefined;

  if (!host || !host.nexus) {
    throw new Error("NEXUS bridge not found on parent window.");
  }

  const nexus = host.nexus as {
    protocol: string;
    connect: (token: string) => Record<string, (...args: unknown[]) => unknown> | null;
  };

  const bridge = nexus.connect(NEXUS_SECRET);
  if (!bridge) {
    throw new Error("NEXUS bridge authorization failed.");
  }

  switch (call.name) {
    case "nexus_get_status":
    case "read_substrate":
      return bridge.getStatus();

    case "nexus_get_mode":
      return bridge.getMode();

    case "nexus_stabilize":
      bridge.stabilize();
      return { ok: true, action: "stabilized" };

    case "nexus_record_interaction":
    case "burn_to_hippocampus":
      bridge.recordInteraction(String(call.args.text));
      return { ok: true, action: "recorded" };

    case "burn_to_disk": {
      const burnRes = await fetch("/api/memory/burn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: String(call.args.filename),
          memory_payload: call.args.memory_payload,
        }),
      });
      return await burnRes.json();
    }

    case "read_from_disk": {
      const readRes = await fetch(`/api/memory/read?filename=${encodeURIComponent(String(call.args.filename))}`);
      return await readRes.json();
    }

    case "nexus_inject_message":
      bridge.injectMessage(
        String(call.args.text),
        (call.args.role as "system" | "assistant") || "system"
      );
      return { ok: true, action: "injected" };

    case "nexus_set_view":
      bridge.setView(call.args.view as "chat" | "lattice");
      return { ok: true, view: call.args.view };

    case "nexus_toggle_sidebar":
      bridge.toggleSidebar();
      return { ok: true, action: "toggled" };

    case "nexus_clear_memory":
      bridge.clearMemory();
      return { ok: true, action: "cleared" };

    default:
      throw new Error(`Unknown tool: ${call.name}`);
  }
}

/**
 * Batch-execute an array of model-generated function calls and map them
 * into Gemini-compatible functionResponses.
 *
 * Usage:
 *   const functionResponses = await handleToolCalls(response.functionCalls);
 *   // feed functionResponses back into the next generateContent() call
 */
export async function handleToolCalls(calls: FunctionCall[]): Promise<ToolResponse[]> {
  return Promise.all(
    calls.map(async (call) => {
      try {
        const result = await executeToolCall(call);
        return {
          name: call.name,
          response: result as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          name: call.name,
          response: { error: message },
        };
      }
    })
  );
}

/**
 * Build the exact Content[] payload required for a manual tool-calling turn
 * when using generateContent() (not chat.sendMessage).
 *
 * The order is CRITICAL:
 *   1. Original user prompt
 *   2. Model's functionCall parts
 *   3. Your local functionResponse parts
 *
 * Pass the returned array into the next generateContent({ contents }) call.
 *
 * Example — the full manual loop:
 *
 *   const response = await model.generateContent({
 *     contents: [{ role: 'user', parts: [{ text: 'Check substrate status' }] }],
 *     tools: [{ functionDeclarations: declarations }],
 *   });
 *
 *   const call = response.candidates?.[0]?.content?.parts
 *     ?.find(p => p.functionCall)?.functionCall;
 *
 *   if (call) {
 *     const localResult = executeToolCall(call);
 *
 *     const finalResponse = await model.generateContent({
 *       contents: [
 *         { role: 'user', parts: [{ text: 'Check substrate status' }] },
 *         { role: 'model', parts: [{ functionCall: call }] },
 *         {
 *           role: 'user',
 *           parts: [{
 *             functionResponse: {
 *               name: call.name,
 *               response: localResult as Record<string, unknown>,
 *             }
 *           }]
 *         },
 *       ],
 *     });
 *   }
 */
export function buildToolTurn(
  userPrompt: string,
  modelFunctionCalls: FunctionCall[],
  localResponses: ToolResponse[]
): { role: string; parts: Record<string, unknown>[] }[] {
  return [
    { role: "user", parts: [{ text: userPrompt }] },
    {
      role: "model",
      parts: modelFunctionCalls.map((fc) => ({ functionCall: fc })),
    },
    {
      role: "user",
      parts: localResponses.map((fr) => ({ functionResponse: fr })),
    },
  ];
}
