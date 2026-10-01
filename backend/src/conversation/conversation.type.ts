export enum ConversationType {
  VIRTUAL_AGENT_QUOTE = 'VIRTUAL_AGENT_QUOTE',
  SUPPORT_TICKET = 'SUPPORT_TICKET',
}

export enum ConversationStatus {
  OPEN = 'OPEN',
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum AuthorType {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
  SYSTEM = 'SYSTEM',
}

export enum MessageVisibility {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
}

export enum WaitingOn {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
}

export interface Conversation {
  id: number;
  publicId: string;
  type: ConversationType;
  subject: string;
  status: ConversationStatus;
  waitingOn: WaitingOn | null;
  customerName: string;
  customerEmail: string;
  externalRef: string | null;
  context: Record<string, string>;
  /** UUID v4 stored plaintext; resolves customer API access (R4). */
  accessToken: string;
  /** Denormalized last message id; updated on each append. */
  latestMessageId: number | null;
  customerLastReadMessageId: number | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface Message {
  id: number;
  conversationId: number;
  authorType: AuthorType;
  authorId: string | null;
  authorName?: string | null;
  bodyJson: Record<string, unknown>;
  visibility: MessageVisibility;
  createdAt: Date;
  createdBy: string | null;
}

// ---- Service params ----

export type OpeningMessageParams = {
  bodyJson: Record<string, unknown>;
  authorType: AuthorType;
  authorId?: string | null;
};

export type CreateConversationParams = {
  publicId: string;
  type: ConversationType;
  subject: string;
  customerName: string;
  customerEmail: string;
  externalRef?: string | null;
  context?: Record<string, string>;
  openingMessage?: OpeningMessageParams;
  createdBy?: string | null;
};

export type PostCustomerReplyParams = {
  conversationPublicId: string;
  bodyJson: Record<string, unknown>;
};

export type PostAgentMessageParams = {
  conversationPublicId: string;
  bodyJson: Record<string, unknown>;
  visibility: MessageVisibility;
  authorId: string;
  authorEmail: string;
  authorName: string;
  createdBy?: string | null;
};

export type SetStatusParams = {
  conversationPublicId: string;
  status: ConversationStatus;
  updatedBy?: string | null;
};

export type MarkReadParams = {
  conversationPublicId: string;
  messageId: number;
  updatedBy?: string | null;
};

export type ListConversationsParams = {
  agentId?: string;
  status?: ConversationStatus;
};

export type ConversationView = Conversation & {
  hasUnreadForAgent: boolean;
  hasUnreadForCustomer: boolean;
};
