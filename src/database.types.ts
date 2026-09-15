// src/database.types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' };
  public: {
    Tables: {
      blocks: {
        Row: { blocked_user_id: string; created_at: string; user_id: string };
        Insert: { blocked_user_id: string; created_at?: string; user_id: string };
        Update: { blocked_user_id?: string; created_at?: string; user_id?: string };
        Relationships: [];
      };
      call_events: {
        Row: { chat_id: string; created_at: string; event_type: string; id: number; sender_id: string };
        Insert: { chat_id: string; created_at?: string; event_type: string; id?: never; sender_id: string };
        Update: { chat_id?: string; created_at?: string; event_type?: string; id?: never; sender_id?: string };
        Relationships: [{ foreignKeyName: 'call_events_chat_id_fkey'; columns: ['chat_id']; isOneToOne: false; referencedRelation: 'chats'; referencedColumns: ['id'] }];
      };
      chats: {
        Row: { created_at: string; ended_at: string | null; id: string; status: string; user_a: string; user_b: string };
        Insert: { created_at?: string; ended_at?: string | null; id?: string; status?: string; user_a: string; user_b: string };
        Update: { created_at?: string; ended_at?: string | null; id?: string; status?: string; user_a?: string; user_b?: string };
        Relationships: [];
      };
      match_queue: {
        Row: { joined_at: string; user_id: string };
        Insert: { joined_at?: string; user_id: string };
        Update: { joined_at?: string; user_id?: string };
        Relationships: [];
      };
      messages: {
        Row: { body: string; chat_id: string; created_at: string; id: number; sender_id: string };
        Insert: { body: string; chat_id: string; created_at?: string; id?: number; sender_id: string };
        Update: { body?: string; chat_id?: string; created_at?: string; id?: number; sender_id?: string };
        Relationships: [{ foreignKeyName: 'messages_chat_id_fkey'; columns: ['chat_id']; isOneToOne: false; referencedRelation: 'chats'; referencedColumns: ['id'] }];
      };
      profiles: {
        Row: { created_at: string; id: string; username: string };
        Insert: { created_at?: string; id: string; username: string };
        Update: { created_at?: string; id?: string; username?: string };
        Relationships: [];
      };
      reports: {
        Row: { chat_id: string | null; created_at: string; id: number; reason: string; reported_user_id: string; reporter_id: string };
        Insert: { chat_id?: string | null; created_at?: string; id?: never; reason: string; reported_user_id: string; reporter_id: string };
        Update: { chat_id?: string | null; created_at?: string; id?: never; reason?: string; reported_user_id?: string; reporter_id?: string };
        Relationships: [{ foreignKeyName: 'reports_chat_id_fkey'; columns: ['chat_id']; isOneToOne: false; referencedRelation: 'chats'; referencedColumns: ['id'] }];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      end_chat: { Args: { p_chat_id: string }; Returns: undefined };
      find_match: { Args: never; Returns: { created_at: string; ended_at: string | null; id: string; status: string; user_a: string; user_b: string } | null; SetofOptions: { from: '*'; to: 'chats'; isOneToOne: true; isSetofReturn: false } };
      leave_match_queue: { Args: never; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<Name extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][Name] extends { Row: infer Row } ? Row : never;
export type TablesInsert<Name extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][Name] extends { Insert: infer Insert } ? Insert : never;
export type TablesUpdate<Name extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][Name] extends { Update: infer Update } ? Update : never;
export type Enums<Name extends keyof DefaultSchema['Enums']> = DefaultSchema['Enums'][Name];
export type CompositeTypes<Name extends keyof DefaultSchema['CompositeTypes']> = DefaultSchema['CompositeTypes'][Name];

export const Constants = { public: { Enums: {} } } as const;
