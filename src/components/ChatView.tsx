import React from 'react';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import type { Attachment, ChatMessage } from '../types';

interface ChatViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  input: string;
  setInput: (value: string) => void;
  pendingAttachments: Attachment[];
  setPendingAttachments: (attachments: Attachment[] | ((prev: Attachment[]) => Attachment[])) => void;
  onSend: () => void;
  onAttach: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  isLoading,
  input,
  setInput,
  pendingAttachments,
  setPendingAttachments,
  onSend,
  onAttach,
}) => {
  return (
    <div className="flex-1 min-h-0 relative overflow-hidden">
      <MessageList
        messages={messages}
        isLoading={isLoading}
        view="chat"
        pendingAttachmentsCount={pendingAttachments.length}
      />
      <ChatInput
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        pendingAttachments={pendingAttachments}
        setPendingAttachments={setPendingAttachments}
        onSend={onSend}
        onAttach={onAttach}
      />
    </div>
  );
};
