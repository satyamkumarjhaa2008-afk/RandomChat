// src/database.types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; username: string; created_at: string };
        Insert: { id: string; username: string; created_at?: string };
        Update: { id?: string; username?: string; created_at?: string };
        Relationships: [];
      };
      chats: {
        Row: { id: string; user_a: string; user_b: string; status: 'active' | 'ended'; created_at: string; ended_at: string | null };
        Insert: { id?: string; user_a: string; user_b: string; status?: 'active' | 'ended'; created_at?: string; ended_at?: string | null };
        Update: { id?: string; user_a?: string; user_b?: string; status?: 'active' | 'ended'; created_at?: string; ended_at?: string | null };
        Relationships: [];
      };
      messages: {
        Row: { id: number; chat_id: string; sender_id: string; body: string; created_at: string };
        Insert: { id?: number; chat_id: string; sender_id: string; body: string; created_at?: string };
        Update: { id?: number; chat_id?: string; sender_id?: string; body?: string; created_at?: string };
        Relationships: [];
      };
      blocks: {
        Row: { user_id: string; blocked_user_id: string; created_at: string };
        Insert: { user_id: string; blocked_user_id: string; created_at?: string };
        Update: { user_id?: string; blocked_user_id?: string; created_at?: string };
        Relationships: [];
      };
      reports: {
        Row: { id: number; reporter_id: string; reported_user_id: string; chat_id: string | null; reason: string; created_at: string };
        Insert: { id?: number; reporter_id: string; reported_user_id: string; chat_id?: string | null; reason: string; created_at?: string };
        Update: { id?: number; reporter_id?: string; reported_user_id?: string; chat_id?: string | null; reason?: string; created_at?: string };
        Relationships: [];
      };
      match_queue: {
        Row: { user_id: string; joined_at: string };
        Insert: { user_id: string; joined_at?: string };
        Update: { user_id?: string; joined_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      find_match: { Args: Record<string, never>; Returns: { id: string; user_a: string; user_b: string; status: 'active' | 'ended'; created_at: string; ended_at: string | null } | null };
      end_chat: { Args: { p_chat_id: string }; Returns: undefined };
      leave_match_queue: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
