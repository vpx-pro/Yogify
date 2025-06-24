/*
  # Fix All Database Operations and Constraints

  1. Updates
    - Fix booking cancellation to properly handle payment status transitions
    - Ensure all database functions work correctly with constraints
    - Add better error handling and validation

  2. Security
    - Maintain all existing RLS policies
    - Keep transaction safety intact
    - Preserve audit logging
*/

-- Update the cancel_booking_with_count function to handle payment status properly
CREATE OR REPLACE FUNCTION cancel_booking_with_count(
  p_booking_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking record;
  v_new_payment_status payment_status;
BEGIN
  -- Start transaction
  BEGIN
    -- Get booking information and lock the row
    SELECT id, student_id, class_id, status, payment_status
    INTO v_booking
    FROM bookings
    WHERE id = p_booking_id
      AND student_id = p_student_id
      AND status = 'confirmed'
    FOR UPDATE;

    -- Check if booking exists and belongs to student
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking not found or already cancelled';
    END IF;

    -- Determine the appropriate payment status for cancellation
    -- This ensures compliance with the bookings_payment_status_check constraint
    CASE v_booking.payment_status
      WHEN 'completed' THEN
        v_new_payment_status := 'refunded';
      WHEN 'pending' THEN
        v_new_payment_status := 'pending';
      WHEN 'failed' THEN
        v_new_payment_status := 'failed';
      ELSE
        -- For any other status, default to pending
        v_new_payment_status := 'pending';
    END CASE;

    -- Update booking status and payment status
    UPDATE bookings
    SET 
      status = 'cancelled',
      payment_status = v_new_payment_status,
      updated_at = now()
    WHERE id = p_booking_id;

    -- Decrement participant count only if payment was completed
    IF v_booking.payment_status = 'completed' THEN
      PERFORM decrement_participant_count(v_booking.class_id, p_student_id, p_booking_id);
    END IF;

    -- Log the cancellation
    PERFORM log_participant_count_change(
      v_booking.class_id,
      p_student_id,
      'decrement',
      0, -- We don't have the old count here, but the decrement function will log it
      0, -- We don't have the new count here, but the decrement function will log it
      p_booking_id,
      CASE v_booking.payment_status
        WHEN 'completed' THEN 'Booking cancelled - payment refunded'
        ELSE 'Booking cancelled - no payment to refund'
      END
    );

    RETURN true;

  EXCEPTION
    WHEN OTHERS THEN
      -- Re-raise the exception to rollback the transaction
      RAISE;
  END;
END;
$$;

-- Update the update_booking_payment_status function to handle edge cases better
CREATE OR REPLACE FUNCTION update_booking_payment_status(
  booking_id uuid,
  new_payment_status payment_status
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  booking_record bookings%ROWTYPE;
  is_valid boolean := false;
BEGIN
  -- Get the booking record
  SELECT * INTO booking_record
  FROM bookings
  WHERE id = booking_id;

  -- Check if booking exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Check if booking is cancelled - cancelled bookings have different rules
  IF booking_record.status = 'cancelled' THEN
    -- For cancelled bookings, only allow: pending, failed, refunded
    CASE booking_record.payment_status
      WHEN 'pending' THEN
        is_valid := new_payment_status IN ('failed', 'refunded');
      WHEN 'failed' THEN
        is_valid := new_payment_status IN ('pending', 'refunded');
      WHEN 'refunded' THEN
        is_valid := false; -- No transitions allowed from refunded
      WHEN 'completed' THEN
        is_valid := new_payment_status = 'refunded'; -- Can only refund completed payments
    END CASE;
  ELSE
    -- For confirmed bookings, use original logic
    CASE booking_record.payment_status
      WHEN 'pending' THEN
        is_valid := new_payment_status IN ('completed', 'failed');
      WHEN 'completed' THEN
        is_valid := new_payment_status = 'refunded';
      WHEN 'failed' THEN
        is_valid := new_payment_status IN ('pending', 'completed');
      WHEN 'refunded' THEN
        is_valid := false; -- No transitions allowed from refunded
    END CASE;
  END IF;

  -- Update if valid transition
  IF is_valid THEN
    UPDATE bookings
    SET payment_status = new_payment_status,
        updated_at = now()
    WHERE id = booking_id;
    
    RETURN true;
  ELSE
    RAISE EXCEPTION 'Invalid payment status transition from % to % for booking status %', 
      booking_record.payment_status, new_payment_status, booking_record.status;
  END IF;
END;
$$;

-- Create a function to safely handle booking status changes
CREATE OR REPLACE FUNCTION update_booking_status(
  p_booking_id uuid,
  p_new_status booking_status,
  p_student_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking record;
  v_new_payment_status payment_status;
BEGIN
  -- Get booking information
  SELECT id, student_id, class_id, status, payment_status
  INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
    AND (p_student_id IS NULL OR student_id = p_student_id)
  FOR UPDATE;

  -- Check if booking exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or access denied';
  END IF;

  -- Handle status transitions
  IF v_booking.status = 'confirmed' AND p_new_status = 'cancelled' THEN
    -- Use the cancel_booking_with_count function for proper cancellation
    RETURN cancel_booking_with_count(p_booking_id, v_booking.student_id);
  ELSIF v_booking.status = 'cancelled' AND p_new_status = 'confirmed' THEN
    -- Reactivating a cancelled booking
    UPDATE bookings
    SET status = p_new_status,
        updated_at = now()
    WHERE id = p_booking_id;
    
    -- If payment was completed, increment participant count
    IF v_booking.payment_status = 'completed' THEN
      PERFORM increment_participant_count(v_booking.class_id, v_booking.student_id, p_booking_id);
    END IF;
    
    RETURN true;
  ELSE
    -- Simple status update
    UPDATE bookings
    SET status = p_new_status,
        updated_at = now()
    WHERE id = p_booking_id;
    
    RETURN true;
  END IF;
END;
$$;

-- Create a comprehensive booking validation function
CREATE OR REPLACE FUNCTION validate_booking_operation(
  p_operation text,
  p_booking_id uuid DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_class_id uuid DEFAULT NULL,
  p_new_status booking_status DEFAULT NULL,
  p_new_payment_status payment_status DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb := '{}';
  v_booking record;
  v_class record;
  v_errors text[] := '{}';
  v_warnings text[] := '{}';
BEGIN
  -- Validate based on operation type
  CASE p_operation
    WHEN 'create' THEN
      -- Validate class booking
      IF p_student_id IS NULL OR p_class_id IS NULL THEN
        v_errors := array_append(v_errors, 'Student ID and Class ID are required for booking creation');
      ELSE
        -- Check if student already has a booking
        IF EXISTS (
          SELECT 1 FROM bookings
          WHERE student_id = p_student_id
            AND class_id = p_class_id
            AND status = 'confirmed'
        ) THEN
          v_errors := array_append(v_errors, 'Student already has a booking for this class');
        END IF;

        -- Check class capacity and timing
        SELECT * INTO v_class
        FROM yoga_classes
        WHERE id = p_class_id;

        IF NOT FOUND THEN
          v_errors := array_append(v_errors, 'Class not found');
        ELSE
          -- Check if class is in the future
          IF (v_class.date || ' ' || v_class.time)::timestamp < now() THEN
            v_errors := array_append(v_errors, 'Cannot book past classes');
          END IF;

          -- Check capacity
          IF v_class.current_participants >= v_class.max_participants THEN
            v_errors := array_append(v_errors, 'Class is full');
          ELSIF v_class.current_participants >= (v_class.max_participants * 0.9) THEN
            v_warnings := array_append(v_warnings, 'Class is almost full');
          END IF;
        END IF;
      END IF;

    WHEN 'cancel' THEN
      -- Validate booking cancellation
      IF p_booking_id IS NULL OR p_student_id IS NULL THEN
        v_errors := array_append(v_errors, 'Booking ID and Student ID are required for cancellation');
      ELSE
        SELECT * INTO v_booking
        FROM bookings
        WHERE id = p_booking_id AND student_id = p_student_id;

        IF NOT FOUND THEN
          v_errors := array_append(v_errors, 'Booking not found or access denied');
        ELSIF v_booking.status = 'cancelled' THEN
          v_errors := array_append(v_errors, 'Booking is already cancelled');
        END IF;
      END IF;

    WHEN 'payment_update' THEN
      -- Validate payment status update
      IF p_booking_id IS NULL OR p_new_payment_status IS NULL THEN
        v_errors := array_append(v_errors, 'Booking ID and new payment status are required');
      ELSE
        SELECT * INTO v_booking
        FROM bookings
        WHERE id = p_booking_id;

        IF NOT FOUND THEN
          v_errors := array_append(v_errors, 'Booking not found');
        ELSE
          -- Check valid payment transitions based on booking status
          IF v_booking.status = 'cancelled' THEN
            IF NOT (
              (v_booking.payment_status = 'pending' AND p_new_payment_status IN ('failed', 'refunded')) OR
              (v_booking.payment_status = 'failed' AND p_new_payment_status IN ('pending', 'refunded')) OR
              (v_booking.payment_status = 'completed' AND p_new_payment_status = 'refunded')
            ) THEN
              v_errors := array_append(v_errors, 
                format('Invalid payment transition from %s to %s for cancelled booking', 
                       v_booking.payment_status, p_new_payment_status));
            END IF;
          ELSE
            IF NOT (
              (v_booking.payment_status = 'pending' AND p_new_payment_status IN ('completed', 'failed')) OR
              (v_booking.payment_status = 'completed' AND p_new_payment_status = 'refunded') OR
              (v_booking.payment_status = 'failed' AND p_new_payment_status IN ('pending', 'completed'))
            ) THEN
              v_errors := array_append(v_errors, 
                format('Invalid payment transition from %s to %s for confirmed booking', 
                       v_booking.payment_status, p_new_payment_status));
            END IF;
          END IF;
        END IF;
      END IF;

    ELSE
      v_errors := array_append(v_errors, 'Unknown operation type');
  END CASE;

  -- Build result
  v_result := jsonb_build_object(
    'valid', array_length(v_errors, 1) IS NULL,
    'errors', v_errors,
    'warnings', v_warnings,
    'operation', p_operation,
    'timestamp', now()
  );

  RETURN v_result;
END;
$$;

-- Grant permissions for new functions
GRANT EXECUTE ON FUNCTION cancel_booking_with_count(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_booking_payment_status(uuid, payment_status) TO authenticated;
GRANT EXECUTE ON FUNCTION update_booking_status(uuid, booking_status, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_booking_operation(text, uuid, uuid, uuid, booking_status, payment_status) TO authenticated;

-- Create helper functions for database health checks
CREATE OR REPLACE FUNCTION check_rls_enabled(table_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rls_enabled boolean;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class
  WHERE relname = table_name
    AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  
  RETURN COALESCE(rls_enabled, false);
END;
$$;

CREATE OR REPLACE FUNCTION get_table_indexes(schema_name text DEFAULT 'public')
RETURNS TABLE(
  tablename text,
  indexname text,
  indexdef text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.tablename::text,
    t.indexname::text,
    t.indexdef::text
  FROM pg_indexes t
  WHERE t.schemaname = schema_name
  ORDER BY t.tablename, t.indexname;
END;
$$;

CREATE OR REPLACE FUNCTION get_table_triggers(schema_name text DEFAULT 'public')
RETURNS TABLE(
  table_name text,
  trigger_name text,
  event_manipulation text,
  action_timing text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.event_object_table::text,
    t.trigger_name::text,
    t.event_manipulation::text,
    t.action_timing::text
  FROM information_schema.triggers t
  WHERE t.trigger_schema = schema_name
  ORDER BY t.event_object_table, t.trigger_name;
END;
$$;

-- Grant permissions for helper functions
GRANT EXECUTE ON FUNCTION check_rls_enabled(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_indexes(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_triggers(text) TO authenticated;