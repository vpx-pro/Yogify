/*
  # Add Missing Database Functions

  1. New Functions
    - `create_booking_with_count` - Creates booking and updates participant count
    - `cancel_booking_with_count` - Cancels booking and updates participant count  
    - `sync_participant_count` - Synchronizes participant count for a class
    - `validate_all_participant_counts` - Validates all class participant counts
    - `can_student_book_class` - Checks if student can book a class
    - `check_rls_enabled` - Utility to check RLS status
    - `get_table_indexes` - Utility to get table indexes
    - `get_table_triggers` - Utility to get table triggers
    - `validate_booking_operation` - Validates booking operations

  2. Security
    - All functions use proper security definer context
    - Participant count audit logging included
    - Proper error handling and validation

  3. Performance
    - Add missing indexes for better query performance
*/

-- Function to create booking with participant count management
CREATE OR REPLACE FUNCTION create_booking_with_count(
  p_student_id uuid,
  p_class_id uuid,
  p_status booking_status DEFAULT 'confirmed',
  p_payment_status payment_status DEFAULT 'pending'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking_id uuid;
  v_current_count integer;
  v_max_participants integer;
  v_class_date date;
  v_class_time time;
BEGIN
  -- Get class information
  SELECT current_participants, max_participants, date, time
  INTO v_current_count, v_max_participants, v_class_date, v_class_time
  FROM yoga_classes
  WHERE id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  -- Check if class is in the future
  IF v_class_date < CURRENT_DATE OR (v_class_date = CURRENT_DATE AND v_class_time < CURRENT_TIME) THEN
    RAISE EXCEPTION 'Cannot book past classes';
  END IF;

  -- Check capacity only for confirmed bookings with completed payment
  IF p_status = 'confirmed' AND p_payment_status = 'completed' THEN
    IF v_current_count >= v_max_participants THEN
      RAISE EXCEPTION 'Class is full';
    END IF;
  END IF;

  -- Check for existing booking
  IF EXISTS (
    SELECT 1 FROM bookings 
    WHERE student_id = p_student_id 
    AND class_id = p_class_id 
    AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'Student already has a booking for this class';
  END IF;

  -- Create the booking
  INSERT INTO bookings (student_id, class_id, status, payment_status)
  VALUES (p_student_id, p_class_id, p_status, p_payment_status)
  RETURNING id INTO v_booking_id;

  -- Update participant count if booking is confirmed and paid
  IF p_status = 'confirmed' AND p_payment_status = 'completed' THEN
    UPDATE yoga_classes 
    SET current_participants = current_participants + 1
    WHERE id = p_class_id;

    -- Log the participant count change
    INSERT INTO participant_count_audit (
      class_id, student_id, action, old_count, new_count, booking_id, reason
    ) VALUES (
      p_class_id, p_student_id, 'increment', v_current_count, v_current_count + 1, v_booking_id, 'Booking created'
    );
  END IF;

  RETURN v_booking_id;
END;
$$;

-- Function to cancel booking with participant count management
CREATE OR REPLACE FUNCTION cancel_booking_with_count(
  p_booking_id uuid,
  p_student_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_current_count integer;
  v_old_status booking_status;
  v_old_payment_status payment_status;
BEGIN
  -- Get booking information
  SELECT class_id, status, payment_status
  INTO v_class_id, v_old_status, v_old_payment_status
  FROM bookings
  WHERE id = p_booking_id AND student_id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or access denied';
  END IF;

  IF v_old_status = 'cancelled' THEN
    RAISE EXCEPTION 'Booking is already cancelled';
  END IF;

  -- Get current participant count
  SELECT current_participants INTO v_current_count
  FROM yoga_classes WHERE id = v_class_id;

  -- Cancel the booking
  UPDATE bookings 
  SET status = 'cancelled', payment_status = 'refunded'
  WHERE id = p_booking_id;

  -- Decrease participant count if booking was confirmed and paid
  IF v_old_status = 'confirmed' AND v_old_payment_status = 'completed' THEN
    UPDATE yoga_classes 
    SET current_participants = GREATEST(0, current_participants - 1)
    WHERE id = v_class_id;

    -- Log the participant count change
    INSERT INTO participant_count_audit (
      class_id, student_id, action, old_count, new_count, booking_id, reason
    ) VALUES (
      v_class_id, p_student_id, 'decrement', v_current_count, GREATEST(0, v_current_count - 1), p_booking_id, 'Booking cancelled'
    );
  END IF;

  RETURN true;
END;
$$;

-- Function to synchronize participant count for a class
CREATE OR REPLACE FUNCTION sync_participant_count(p_class_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual_count integer;
  v_current_count integer;
BEGIN
  -- Get current stored count
  SELECT current_participants INTO v_current_count
  FROM yoga_classes WHERE id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  -- Calculate actual count from bookings
  SELECT COUNT(*)
  INTO v_actual_count
  FROM bookings
  WHERE class_id = p_class_id 
  AND status = 'confirmed' 
  AND payment_status = 'completed';

  -- Update if different
  IF v_actual_count != v_current_count THEN
    UPDATE yoga_classes 
    SET current_participants = v_actual_count
    WHERE id = p_class_id;

    -- Log the sync
    INSERT INTO participant_count_audit (
      class_id, action, old_count, new_count, reason
    ) VALUES (
      p_class_id, 'sync', v_current_count, v_actual_count, 'Manual synchronization'
    );
  END IF;

  RETURN true;
END;
$$;

-- Function to validate all participant counts
CREATE OR REPLACE FUNCTION validate_all_participant_counts()
RETURNS TABLE(class_id uuid, old_count integer, new_count integer, fixed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH count_comparison AS (
    SELECT 
      yc.id as class_id,
      yc.current_participants as stored_count,
      COALESCE(b.actual_count, 0) as actual_count
    FROM yoga_classes yc
    LEFT JOIN (
      SELECT 
        class_id,
        COUNT(*) as actual_count
      FROM bookings
      WHERE status = 'confirmed' AND payment_status = 'completed'
      GROUP BY class_id
    ) b ON yc.id = b.class_id
  ),
  updates AS (
    UPDATE yoga_classes 
    SET current_participants = cc.actual_count
    FROM count_comparison cc
    WHERE yoga_classes.id = cc.class_id 
    AND yoga_classes.current_participants != cc.actual_count
    RETURNING yoga_classes.id, cc.stored_count, cc.actual_count
  )
  SELECT 
    cc.class_id,
    cc.stored_count as old_count,
    cc.actual_count as new_count,
    (cc.stored_count != cc.actual_count) as fixed
  FROM count_comparison cc;
END;
$$;

-- Function to check if student can book class
CREATE OR REPLACE FUNCTION can_student_book_class(
  p_student_id uuid,
  p_class_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
  v_current_count integer;
  v_max_participants integer;
  v_class_date date;
  v_class_time time;
  v_existing_booking_id uuid;
BEGIN
  -- Check for existing booking
  SELECT id INTO v_existing_booking_id
  FROM bookings
  WHERE student_id = p_student_id 
  AND class_id = p_class_id 
  AND status = 'confirmed';

  IF FOUND THEN
    SELECT json_build_object(
      'can_book', false,
      'reason', 'Student already has a booking for this class',
      'booking_id', v_existing_booking_id
    ) INTO v_result;
    RETURN v_result;
  END IF;

  -- Get class information
  SELECT current_participants, max_participants, date, time
  INTO v_current_count, v_max_participants, v_class_date, v_class_time
  FROM yoga_classes
  WHERE id = p_class_id;

  IF NOT FOUND THEN
    SELECT json_build_object(
      'can_book', false,
      'reason', 'Class not found'
    ) INTO v_result;
    RETURN v_result;
  END IF;

  -- Check if class is in the future
  IF v_class_date < CURRENT_DATE OR (v_class_date = CURRENT_DATE AND v_class_time < CURRENT_TIME) THEN
    SELECT json_build_object(
      'can_book', false,
      'reason', 'Cannot book past classes',
      'current_count', v_current_count,
      'max_participants', v_max_participants
    ) INTO v_result;
    RETURN v_result;
  END IF;

  -- Check capacity
  IF v_current_count >= v_max_participants THEN
    SELECT json_build_object(
      'can_book', false,
      'reason', 'Class is full',
      'current_count', v_current_count,
      'max_participants', v_max_participants
    ) INTO v_result;
    RETURN v_result;
  END IF;

  -- All checks passed
  SELECT json_build_object(
    'can_book', true,
    'current_count', v_current_count,
    'max_participants', v_max_participants
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Utility function to check RLS status
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
  WHERE relname = table_name AND relnamespace = 'public'::regnamespace;
  
  RETURN COALESCE(rls_enabled, false);
END;
$$;

-- Utility function to get table indexes
CREATE OR REPLACE FUNCTION get_table_indexes(schema_name text DEFAULT 'public')
RETURNS TABLE(tablename text, indexname text, indexdef text)
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
  WHERE t.schemaname = schema_name;
END;
$$;

-- Utility function to get table triggers
CREATE OR REPLACE FUNCTION get_table_triggers(schema_name text DEFAULT 'public')
RETURNS TABLE(table_name text, trigger_name text, event_manipulation text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ist.event_object_table::text,
    ist.trigger_name::text,
    ist.event_manipulation::text
  FROM information_schema.triggers ist
  WHERE ist.trigger_schema = schema_name;
END;
$$;

-- Function to validate booking operations
CREATE OR REPLACE FUNCTION validate_booking_operation(
  p_operation text,
  p_booking_id uuid DEFAULT NULL,
  p_new_payment_status payment_status DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  IF p_operation = 'payment_update' THEN
    IF p_booking_id IS NULL THEN
      SELECT json_build_object(
        'valid', false,
        'reason', 'Booking ID is required for payment update'
      ) INTO v_result;
      RETURN v_result;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = p_booking_id) THEN
      SELECT json_build_object(
        'valid', false,
        'reason', 'Booking not found'
      ) INTO v_result;
      RETURN v_result;
    END IF;

    SELECT json_build_object(
      'valid', true,
      'message', 'Payment update validation passed'
    ) INTO v_result;
    RETURN v_result;
  END IF;

  SELECT json_build_object(
    'valid', false,
    'reason', 'Unknown operation type'
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Add missing indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_class_payment ON bookings(class_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_student_payment ON bookings(student_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_participant_audit_created_at ON participant_count_audit(created_at);

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION create_booking_with_count TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking_with_count TO authenticated;
GRANT EXECUTE ON FUNCTION sync_participant_count TO authenticated;
GRANT EXECUTE ON FUNCTION validate_all_participant_counts TO authenticated;
GRANT EXECUTE ON FUNCTION can_student_book_class TO authenticated;
GRANT EXECUTE ON FUNCTION check_rls_enabled TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_indexes TO authenticated;
GRANT EXECUTE ON FUNCTION get_table_triggers TO authenticated;
GRANT EXECUTE ON FUNCTION validate_booking_operation TO authenticated;