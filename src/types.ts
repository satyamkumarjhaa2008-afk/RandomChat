// src/types.ts
export type { Database } from './database.types';

export type ChatStatus = 'active' | 'ended';
export interface Profile { id: string; username: string; created_at: string; }
export interface Chat { id: string; user_a: string; user_b: string; status: ChatStatus; created_at: string; ended_at: string | null; }
export interface Message { id: number; chat_id: string; sender_id: string; body: string; created_at: string; }
export interface Block { user_id: string; blocked_user_id: string; created_at: string; }
export interface Report { id: number; reporter_id: string; reported_user_id: string; chat_id: string | null; reason: string; created_at: string; }
export interface MatchQueueEntry { user_id: string; joined_at: string; }
