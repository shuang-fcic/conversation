import { DomainError } from 'src/common/error/domain.error';

export class ConversationNotFoundError extends DomainError {
  constructor(publicId?: string) {
    super('Conversation not found', { publicId });
  }
}

export class InvalidAccessTokenError extends DomainError {
  constructor() {
    super('Invalid or missing conversation access token');
  }
}

export class ConversationClosedError extends DomainError {
  constructor(publicId?: string) {
    super('Conversation is closed', { publicId });
  }
}

export class MessageBodyTooLargeError extends DomainError {
  constructor(byteLength: number, maxBytes: number) {
    super('Message body exceeds the size limit', { byteLength, maxBytes });
  }
}
