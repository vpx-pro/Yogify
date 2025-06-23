/**
 * Participant Count Service
 * Provides utilities for managing and synchronizing class participant counts
 */

import { supabase } from './supabase';

export interface ParticipantCountAudit {
  id: string;
  class_id: string;
  student_id?: string;
  action: 'increment' | 'decrement' | 'sync' | 'validation';
  old_count: number;
  new_count: number;
  booking_id?: string;
  reason?: string;
  created_at: string;
  created_by?: string;
}

export interface CountValidationResult {
  class_id: string;
  old_count: number;
  new_count: number;
  fixed: boolean;
}

export class ParticipantCountService {
  /**
   * Create a booking with automatic participant count management
   */
  static async createBookingWithCount(
    studentId: string,
    classId: string,
    status: 'confirmed' | 'cancelled' = 'confirmed',
    paymentStatus: 'pending' | 'completed' | 'failed' | 'refunded' = 'pending'
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_booking_with_count', {
      p_student_id: studentId,
      p_class_id: classId,
      p_status: status,
      p_payment_status: paymentStatus
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Cancel a booking with automatic participant count management
   */
  static async cancelBookingWithCount(
    bookingId: string,
    studentId: string
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('cancel_booking_with_count', {
      p_booking_id: bookingId,
      p_student_id: studentId
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Synchronize participant count for a specific class
   */
  static async syncParticipantCount(classId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('sync_participant_count', {
      p_class_id: classId
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /**
   * Validate and fix all class participant counts
   */
  static async validateAllParticipantCounts(): Promise<CountValidationResult[]> {
    const { data, error } = await supabase.rpc('validate_all_participant_counts');

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Get participant count audit log for a class
   */
  static async getParticipantCountAudit(
    classId: string,
    limit: number = 50
  ): Promise<ParticipantCountAudit[]> {
    const { data, error } = await supabase
      .from('participant_count_audit')
      .select('*')
      .eq('class_id', classId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  /**
   * Get real-time participant count for a class
   */
  static async getRealTimeParticipantCount(classId: string): Promise<number> {
    const { count, error } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'confirmed')
      .eq('payment_status', 'completed');

    if (error) {
      throw new Error(error.message);
    }

    return count || 0;
  }

  /**
   * Subscribe to participant count changes for a class
   */
  static subscribeToParticipantCountChanges(
    classId: string,
    callback: (count: number) => void
  ) {
    // Subscribe to bookings changes for the specific class
    const subscription = supabase
      .channel(`participant_count_${classId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `class_id=eq.${classId}`
        },
        async () => {
          // Recalculate participant count when bookings change
          try {
            const count = await this.getRealTimeParticipantCount(classId);
            callback(count);
          } catch (error) {
            console.error('Error getting real-time participant count:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'yoga_classes',
          filter: `id=eq.${classId}`
        },
        (payload) => {
          // Update when the class participant count is updated
          if (payload.new && 'current_participants' in payload.new) {
            callback(payload.new.current_participants as number);
          }
        }
      )
      .subscribe();

    return subscription;
  }

  /**
   * Unsubscribe from participant count changes
   */
  static unsubscribeFromParticipantCountChanges(subscription: any) {
    if (subscription) {
      supabase.removeChannel(subscription);
    }
  }

  /**
   * Validate booking constraints before creation
   */
  static async validateBookingConstraints(
    studentId: string,
    classId: string
  ): Promise<{
    canBook: boolean;
    reason?: string;
    currentCount?: number;
    maxParticipants?: number;
  }> {
    try {
      // Check if student already has a booking
      const { data: existingBooking, error: bookingError } = await supabase
        .from('bookings')
        .select('id')
        .eq('student_id', studentId)
        .eq('class_id', classId)
        .eq('status', 'confirmed')
        .maybeSingle();

      if (bookingError && bookingError.code !== 'PGRST116') {
        throw bookingError;
      }

      if (existingBooking) {
        return {
          canBook: false,
          reason: 'Student already has a booking for this class'
        };
      }

      // Get class information
      const { data: classData, error: classError } = await supabase
        .from('yoga_classes')
        .select('current_participants, max_participants, date, time')
        .eq('id', classId)
        .single();

      if (classError) {
        throw classError;
      }

      // Check if class is in the future
      const classDateTime = new Date(`${classData.date} ${classData.time}`);
      if (classDateTime < new Date()) {
        return {
          canBook: false,
          reason: 'Cannot book past classes',
          currentCount: classData.current_participants,
          maxParticipants: classData.max_participants
        };
      }

      // Check capacity
      if (classData.current_participants >= classData.max_participants) {
        return {
          canBook: false,
          reason: 'Class is full',
          currentCount: classData.current_participants,
          maxParticipants: classData.max_participants
        };
      }

      return {
        canBook: true,
        currentCount: classData.current_participants,
        maxParticipants: classData.max_participants
      };
    } catch (error) {
      console.error('Error validating booking constraints:', error);
      return {
        canBook: false,
        reason: 'Failed to validate booking constraints'
      };
    }
  }

  /**
   * Get participant count statistics for a teacher's classes
   */
  static async getTeacherParticipantStats(teacherId: string): Promise<{
    totalClasses: number;
    totalParticipants: number;
    averageParticipants: number;
    fullClasses: number;
    utilizationRate: number;
  }> {
    const { data: classes, error } = await supabase
      .from('yoga_classes')
      .select('current_participants, max_participants')
      .eq('teacher_id', teacherId);

    if (error) {
      throw new Error(error.message);
    }

    if (!classes || classes.length === 0) {
      return {
        totalClasses: 0,
        totalParticipants: 0,
        averageParticipants: 0,
        fullClasses: 0,
        utilizationRate: 0
      };
    }

    const totalClasses = classes.length;
    const totalParticipants = classes.reduce((sum, cls) => sum + cls.current_participants, 0);
    const totalCapacity = classes.reduce((sum, cls) => sum + cls.max_participants, 0);
    const fullClasses = classes.filter(cls => cls.current_participants >= cls.max_participants).length;
    
    return {
      totalClasses,
      totalParticipants,
      averageParticipants: totalParticipants / totalClasses,
      fullClasses,
      utilizationRate: totalCapacity > 0 ? (totalParticipants / totalCapacity) * 100 : 0
    };
  }
}