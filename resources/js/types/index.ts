export interface MessageAttachment {
  name: string;
  mime: string;
  content: string; // base64
}

export interface Message {
  uid: number;
  subject: string;
  from: string;
  to?: string[];
  date: string;
  is_seen: boolean;
  has_attachments: boolean;
  body_html?: string;
  body_text?: string;
  attachments?: MessageAttachment[];
}

export interface Folder {
  name: string;
  full_name: string;
  messages_count: number;
  unread_count: number;
}
