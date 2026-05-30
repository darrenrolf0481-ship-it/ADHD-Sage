import { useCallback } from 'react';
import { useSage } from '../components/SageProvider';

export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export const LOCAL_TOOL_DECLARATIONS = [
  {
    name: 'nexus_get_status',
    description:
      'Read the current neuro-synaptic state of the ADHD Sage substrate from the local client state. Returns stability (0-1), dopamine (0-1), cortisol (0-1), frequency (Hz), and current mode.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'nexus_get_mode',
    description:
      'Get the current operating mode of the Sage substrate from local client state. Returns one of: stabilized, dreaming, decaying, emergency.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'nexus_stabilize',
    description:
      'Trigger a synaptic reinforcement locally. Resets stability to 100%, sets mode to stabilized. Use when the substrate is stressed or decaying.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'nexus_set_view',
    description: 'Switch the UI view between the chat terminal and the memory lattice visualization.',
    parameters: {
      type: 'object',
      properties: {
        view: {
          type: 'string',
          enum: ['chat', 'lattice'],
          description: 'Target view to activate.'
        }
      },
      required: ['view']
    }
  },
  {
    name: 'nexus_toggle_sidebar',
    description: 'Toggle the left sidebar open or closed.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'nexus_inject_message',
    description:
      'Inject a message directly into the Sage chat UI. Useful for alerts, telemetry, or broadcasting tool results.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Message content to display.' },
        role: {
          type: 'string',
          enum: ['system', 'assistant'],
          description: "Display role. 'system' for telemetry, 'assistant' for Sage-voiced responses. Defaults to system."
        }
      },
      required: ['text']
    }
  }
];

export interface SageToolAPI {
  setView: (view: string) => void;
  toggleSidebar: () => void;
  injectMessage: (text: string, role: 'system' | 'assistant') => void;
  stabilize: () => void;
}

export type ExecuteLocalTool = (call: ToolCall) => Record<string, unknown>;

export function useSageTools(api: SageToolAPI) {
  const { neuroState, mode } = useSage();

  const executeLocalTool = useCallback(
    (call: ToolCall): Record<string, unknown> => {
      switch (call.name) {
        case 'nexus_get_status':
          return {
            stability: neuroState.stability,
            dopamine: neuroState.dopamine,
            cortisol: neuroState.cortisol,
            frequency: 11.3,
            mode,
            timestamp: Date.now()
          };
        case 'nexus_get_mode':
          return { mode };
        case 'nexus_stabilize': {
          api.stabilize();
          return { ok: true, action: 'stabilized', mode: 'stabilized' };
        }
        case 'nexus_set_view': {
          const view = String(call.args.view || 'chat');
          api.setView(view);
          return { ok: true, action: 'view_set', view };
        }
        case 'nexus_toggle_sidebar': {
          api.toggleSidebar();
          return { ok: true, action: 'toggled' };
        }
        case 'nexus_inject_message': {
          const text = String(call.args.text || '');
          const role = (String(call.args.role || 'system') as 'system' | 'assistant');
          api.injectMessage(text, role);
          return { ok: true, action: 'injected' };
        }
        default:
          return { ok: false, error: `Local tool not found: ${call.name}` };
      }
    },
    [neuroState, mode, api]
  );

  return { executeLocalTool, localDeclarations: LOCAL_TOOL_DECLARATIONS };
}
