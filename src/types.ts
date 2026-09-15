// src/types.ts
export type ChatStatus = 'IDLE' | 'SEARCHING' | 'MATCHED' | 'CONNECTED' | 'ENDED' | 'ERROR';
export interface Profile { id: string; username: string; created_at: string; }
export interface Chat { id: string; user_a: string; user_b: string; status: string; created_at: string; ended_at: string | null; }
export interface Message { id: number; chat_id: string; sender_id: string; body: string; created_at: string; }
export interface Database { public: { Tables: { profiles: { Row: Profile; Insert: { id: string; username: string }; Update: { username?: string } }; chats: { Row: Chat; Insert: Partial<Chat> & Pick<Chat,'user_a'|'user_b'>; Update: Partial<Chat> }; messages: { Row: Message; Insert: Omit<Message,'id'|'created_at'> & { id?: number }; Update: Partial<Message> }; blocks: { Row: {user_id:string;blocked_user_id:string;created_at:string}; Insert:{user_id:string;blocked_user_id:string} }; reports:{Row:Record<string,unknown>;Insert:Record<string,unknown>}; match_queue:{Row:{user_id:string;joined_at:string};Insert:{user_id:string}} } } }
