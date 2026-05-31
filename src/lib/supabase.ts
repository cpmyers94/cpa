import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Database = {
  public: {
    Tables: {
      households: {
        Row: { id: string; name: string; invite_code: string; created_at: string };
        Insert: { name?: string };
        Update: { name?: string };
      };
      household_members: {
        Row: { id: string; household_id: string; user_id: string; role: string; created_at: string };
        Insert: { household_id: string; user_id: string; role?: string };
        Update: never;
      };
      settings: {
        Row: {
          id: string; household_id: string; income: number; schedule_type: string;
          semi_day1: number; semi_day2: number; bi_anchor: string | null;
          cust_weekdays: string[]; cust_freq: string; cust_anchor: string | null;
          snowball_extra: number; bnpl_extra: number; updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['settings']['Row']>;
        Update: Partial<Database['public']['Tables']['settings']['Row']>;
      };
      bills: {
        Row: { id: string; household_id: string; name: string; cat: string; amount: number; due_day: number | null; pc_idx: number; note: string; sort_order: number; created_at: string };
        Insert: Omit<Database['public']['Tables']['bills']['Row'], 'id' | 'created_at'>;
        Update: Partial<Omit<Database['public']['Tables']['bills']['Row'], 'id' | 'household_id' | 'created_at'>>;
      };
      debts: {
        Row: { id: string; household_id: string; name: string; balance: number; apr: number; min_payment: number; color: string; created_at: string };
        Insert: Omit<Database['public']['Tables']['debts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Omit<Database['public']['Tables']['debts']['Row'], 'id' | 'household_id' | 'created_at'>>;
      };
      bnpl_plans: {
        Row: { id: string; household_id: string; name: string; provider: string; balance: number; payment: number; made: number; total: number; due_day: number | null; apr: number; color: string; note: string; family_covered: boolean; created_at: string };
        Insert: Omit<Database['public']['Tables']['bnpl_plans']['Row'], 'id' | 'created_at'>;
        Update: Partial<Omit<Database['public']['Tables']['bnpl_plans']['Row'], 'id' | 'household_id' | 'created_at'>>;
      };
      paid_status: {
        Row: { id: string; household_id: string; month_key: string; item_id: string; paid: boolean; created_at: string };
        Insert: Omit<Database['public']['Tables']['paid_status']['Row'], 'id' | 'created_at'>;
        Update: { paid: boolean };
      };
      month_notes: {
        Row: { id: string; household_id: string; month_key: string; content: string; updated_at: string };
        Insert: Omit<Database['public']['Tables']['month_notes']['Row'], 'id' | 'updated_at'>;
        Update: { content: string };
      };
      windfalls: {
        Row: { id: string; household_id: string; label: string; amount: number; note: string; created_at: string };
        Insert: Omit<Database['public']['Tables']['windfalls']['Row'], 'id' | 'created_at'>;
        Update: Partial<Omit<Database['public']['Tables']['windfalls']['Row'], 'id' | 'household_id' | 'created_at'>>;
      };
    };
    Functions: {
      create_household: { Args: { household_name?: string }; Returns: Database['public']['Tables']['households']['Row'] };
      join_household: { Args: { code: string }; Returns: Database['public']['Tables']['households']['Row'] };
    };
  };
};
