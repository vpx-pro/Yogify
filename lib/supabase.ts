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
          meeting_link?: string;
          image_url?: string;
          is_retreat: boolean;
          retreat_end_date?: string;
          retreat_image_url?: string;
          retreat_highlights?: string[];
          retreat_capacity?: number;
          is_virtual: boolean;
          early_bird_price?: number;
          early_bird_deadline?: string;
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
          meeting_link?: string;
          image_url?: string;
          is_retreat?: boolean;
          retreat_end_date?: string;
          retreat_image_url?: string;
          retreat_highlights?: string[];
          retreat_capacity?: number;
          is_virtual?: boolean;
          early_bird_price?: number;
          early_bird_deadline?: string;
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
          meeting_link?: string;
          image_url?: string;
          is_retreat?: boolean;
          retreat_end_date?: string;
          retreat_image_url?: string;
          retreat_highlights?: string[];
          retreat_capacity?: number;
          is_virtual?: boolean;
          early_bird_price?: number;
          early_bird_deadline?: string;
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
          payment_status: 'pending' | 'completed' | 'failed' | 'refunded';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          student_id: string;
          class_id: string;
          status: 'confirmed' | 'cancelled';
          payment_status?: 'pending' | 'completed' | 'failed' | 'refunded';
        };
        Update: {
          status?: 'confirmed' | 'cancelled';
          payment_status?: 'pending' | 'completed' | 'failed' | 'refunded';
          updated_at?: string;
        };
      };
    };
    Functions: {
      update_booking_payment_status: {
        Args: {
          booking_id: string;
          new_payment_status: 'pending' | 'completed' | 'failed' | 'refunded';
        };
        Returns: boolean;
      };
    };
  };
};