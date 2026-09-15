// src/types.ts
export type ChatStatus = 'active' | 'ended';

export interface Profile {
  id: string;
  username: string;
  created_at: string;
}

export interface Chat {
  id: string;
  user_a: string;
  user_b: string;
  status: ChatStatus;
  created_at: string;
  ended_at: string | null;
}

export interface Message {
  id: number;
  chat_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Block {
  user_id: string;
  blocked_user_id: string;
  created_at: string;
}

export interface Report {
  id: number;
  reporter_id: string;
  reported_user_id: string;
  chat_id: string | null;
  reason: string;
  created_at: string;
}

export interface MatchQueueEntry {
  user_id: string;
  joined_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: { id: string; username: string };
        Update: { id?: string; username?: string };
        Relationships: [];
      };
      chats: {
        Row: Chat;
        Insert: { id?: string; user_a: string; user_b: string; status?: ChatStatus; created_at?: string; ended_at?: string | null };
        Update: { user_a?: string; user_b?: string; status?: ChatStatus; ended_at?: string | null };
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: { id?: number; chat_id: string; sender_id: string; body: string; created_at?: string };
        Update: { chat_id?: string; sender_id?: string; body?: string };
        Relationships: [];
      };
      blocks: {
        Row: Block;
        Insert: { user_id: string; blocked_user_id: string; created_at?: string };
        Update: { user_id?: string; blocked_user_id?: string };
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: { id?: number; reporter_id: string; reported_user_id: string; chat_id?: string | null; reason: string; created_at?: string };
        Update: { reporter_id?: string; reported_user_id?: string; chat_id?: string | null; reason?: string };
        Relationships: [];
      };
      match_queue: {
        Row: MatchQueueEntry;
        Insert: { user_id: string; joined_at?: string };
        Update: { user_id?: string; joined_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      find_match: { Args: Record<string, never>; Returns: Chat | null };
      end_chat: { Args: { p_chat_id: string }; Returns: undefined };
      leave_match_queue: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
