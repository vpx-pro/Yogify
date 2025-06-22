import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: 'student' | 'teacher';
          avatar_url?: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role: 'student' | 'teacher';
          avatar_url?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: 'student' | 'teacher';
          avatar_url?: string;
          updated_at?: string;
        };
      };
      yoga_classes: {
        Row: {
          id: string;
          title: string;
          description: string;
          teacher_id: string;
          date: string;
          time: string;
          duration: number;
          max_participants: number;
          current_participants: number;
          price: number;
          level: 'beginner' | 'intermediate' | 'advanced';
          type: string;
          location: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          description: string;
          teacher_id: string;
          date: string;
          time: string;
          duration: number;
          max_participants: number;
          price: number;
          level: 'beginner' | 'intermediate' | 'advanced';
          type: string;
          location: string;
        };
        Update: {
          title?: string;
          description?: string;
          date?: string;
          time?: string;
          duration?: number;
          max_participants?: number;
          current_participants?: number;
          price?: number;
          level?: 'beginner' | 'intermediate' | 'advanced';
          type?: string;
          location?: string;
          updated_at?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          student_id: string;
          class_id: string;
          booking_date: string;
          status: 'confirmed' | 'cancelled';
          created_at: string;
        };
        Insert: {
          student_id: string;
          class_id: string;
          status: 'confirmed' | 'cancelled';
        };
        Update: {
          status?: 'confirmed' | 'cancelled';
        };
      };
    };
  };
};