/*
  # Participant Count Management System

  1. Database Functions
    - Secure booking creation with participant count management
    - Booking cancellation with count decrements
    - Participant count validation and synchronization
    
  2. Triggers
    - Automatic count updates on booking changes
    - Audit logging for all count changes
    
  3. Security
    - Row Level Security policies
    - Transaction safety
    - Concurrent booking protection
*/

-- Create audit log table for tracking participant count changes
CREATE TABLE IF NOT EXISTS participant_count_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES yoga_classes(id) ON DELETE CASCADE,
  student_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('increment', 'decrement', 'sync', 'validation')),
  old_count integer NOT NULL,
  new_count integer NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

-- Enable RLS on audit table
ALTER TABLE participant_count_audit ENABLE ROW LEVEL SECURITY;

-- Create policy for audit table (teachers can view their class audits)
CREATE POLICY "Teachers can view their class participant audits"
  ON participant_count_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM yoga_classes 
      WHERE yoga_classes.id = participant_count_audit.class_id 
      AND yoga_classes.teacher_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_participant_audit_class_id ON participant_count_audit(class_id);
CREATE INDEX IF NOT EXISTS idx_participant_audit_created_at ON participant_count_audit(created_at);

-- Function to log participant count changes
CREATE OR REPLACE FUNCTION log_participant_count_change(
  p_class_id uuid,
  p_student_id uuid,
  p_action text,
  p_old_count integer,
  p_new_count integer,
  p_booking_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO participant_count_audit (
    class_id,
    student_id,
    action,
    old_count,
    new_count,
    booking_id,
    reason
  ) VALUES (
    p_class_id,
    p_student_id,
    p_action,
    p_old_count,
    p_new_count,
    p_booking_id,
    p_reason
  );
END;
$$;

-- Function to safely increment participant count
CREATE OR REPLACE FUNCTION increment_participant_count(
  p_class_id uuid,
  p_student_id uuid,
  p_booking_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count integer;
  v_max_participants integer;
  v_new_count integer;
BEGIN
  -- Lock the class row to prevent concurrent modifications
  SELECT current_participants, max_participants
  INTO v_current_count, v_max_participants
  FROM yoga_classes
  WHERE id = p_class_id
  FOR UPDATE;

  -- Check if class exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  -- Check if adding participant would exceed capacity
  v_new_count := v_current_count + 1;
  IF v_new_count > v_max_participants THEN
    PERFORM log_participant_count_change(
      p_class_id,
      p_student_id,
      'validation',
      v_current_count,
      v_current_count,
      p_booking_id,
      'Increment rejected: would exceed max capacity'
    );
    RAISE EXCEPTION 'Class is full. Cannot add more participants.';
  END IF;

  -- Update the count
  UPDATE yoga_classes
  SET 
    current_participants = v_new_count,
    updated_at = now()
  WHERE id = p_class_id;

  -- Log the change
  PERFORM log_participant_count_change(
    p_class_id,
    p_student_id,
    'increment',
    v_current_count,
    v_new_count,
    p_booking_id,
    'Participant added via booking'
  );

  RETURN true;
END;
$$;

-- Function to safely decrement participant count
CREATE OR REPLACE FUNCTION decrement_participant_count(
  p_class_id uuid,
  p_student_id uuid,
  p_booking_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_count integer;
  v_new_count integer;
BEGIN
  -- Lock the class row to prevent concurrent modifications
  SELECT current_participants
  INTO v_current_count
  FROM yoga_classes
  WHERE id = p_class_id
  FOR UPDATE;

  -- Check if class exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  -- Ensure count doesn't go below zero
  v_new_count := GREATEST(0, v_current_count - 1);

  -- Update the count
  UPDATE yoga_classes
  SET 
    current_participants = v_new_count,
    updated_at = now()
  WHERE id = p_class_id;

  -- Log the change
  PERFORM log_participant_count_change(
    p_class_id,
    p_student_id,
    'decrement',
    v_current_count,
    v_new_count,
    p_booking_id,
    'Participant removed via booking cancellation'
  );

  RETURN true;
END;
$$;

-- Function to synchronize participant count with actual bookings
CREATE OR REPLACE FUNCTION sync_participant_count(p_class_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actual_count integer;
  v_current_count integer;
BEGIN
  -- Count confirmed bookings with completed payments
  SELECT COUNT(*)
  INTO v_actual_count
  FROM bookings
  WHERE class_id = p_class_id
    AND status = 'confirmed'
    AND payment_status = 'completed';

  -- Get current stored count
  SELECT current_participants
  INTO v_current_count
  FROM yoga_classes
  WHERE id = p_class_id
  FOR UPDATE;

  -- Check if class exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  -- Update if counts don't match
  IF v_actual_count != v_current_count THEN
    UPDATE yoga_classes
    SET 
      current_participants = v_actual_count,
      updated_at = now()
    WHERE id = p_class_id;

    -- Log the synchronization
    PERFORM log_participant_count_change(
      p_class_id,
      NULL,
      'sync',
      v_current_count,
      v_actual_count,
      NULL,
      'Count synchronized with actual bookings'
    );
  END IF;

  RETURN true;
END;
$$;

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
  v_class_info record;
BEGIN
  -- Start transaction
  BEGIN
    -- Check if student already has a booking for this class
    IF EXISTS (
      SELECT 1 FROM bookings
      WHERE student_id = p_student_id
        AND class_id = p_class_id
        AND status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'Student already has a booking for this class';
    END IF;

    -- Get class information and lock the row
    SELECT id, current_participants, max_participants, date, time
    INTO v_class_info
    FROM yoga_classes
    WHERE id = p_class_id
    FOR UPDATE;

    -- Check if class exists
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Class not found';
    END IF;

    -- Check if class is in the future
    IF (v_class_info.date || ' ' || v_class_info.time)::timestamp < now() THEN
      RAISE EXCEPTION 'Cannot book past classes';
    END IF;

    -- Check capacity (only for completed payments)
    IF p_payment_status = 'completed' THEN
      IF v_class_info.current_participants >= v_class_info.max_participants THEN
        RAISE EXCEPTION 'Class is full';
      END IF;
    END IF;

    -- Create the booking
    INSERT INTO bookings (student_id, class_id, status, payment_status)
    VALUES (p_student_id, p_class_id, p_status, p_payment_status)
    RETURNING id INTO v_booking_id;

    -- Increment participant count only if payment is completed
    IF p_payment_status = 'completed' THEN
      PERFORM increment_participant_count(p_class_id, p_student_id, v_booking_id);
    END IF;

    RETURN v_booking_id;

  EXCEPTION
    WHEN OTHERS THEN
      -- Re-raise the exception to rollback the transaction
      RAISE;
  END;
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
  v_booking record;
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

    -- Update booking status
    UPDATE bookings
    SET 
      status = 'cancelled',
      updated_at = now()
    WHERE id = p_booking_id;

    -- Decrement participant count only if payment was completed
    IF v_booking.payment_status = 'completed' THEN
      PERFORM decrement_participant_count(v_booking.class_id, p_student_id, p_booking_id);
    END IF;

    RETURN true;

  EXCEPTION
    WHEN OTHERS THEN
      -- Re-raise the exception to rollback the transaction
      RAISE;
  END;
END;
$$;

-- Trigger function to handle payment status changes
CREATE OR REPLACE FUNCTION handle_payment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only process if payment status actually changed
  IF OLD.payment_status != NEW.payment_status AND NEW.status = 'confirmed' THEN
    
    -- Payment completed: increment count
    IF OLD.payment_status != 'completed' AND NEW.payment_status = 'completed' THEN
      PERFORM increment_participant_count(NEW.class_id, NEW.student_id, NEW.id);
    
    -- Payment was completed but now failed/refunded: decrement count
    ELSIF OLD.payment_status = 'completed' AND NEW.payment_status IN ('failed', 'refunded') THEN
      PERFORM decrement_participant_count(NEW.class_id, NEW.student_id, NEW.id);
    
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for payment status changes
DROP TRIGGER IF EXISTS trigger_payment_status_change ON bookings;
CREATE TRIGGER trigger_payment_status_change
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION handle_payment_status_change();

-- Grant permissions
GRANT EXECUTE ON FUNCTION increment_participant_count(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_participant_count(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION sync_participant_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_booking_with_count(uuid, uuid, booking_status, payment_status) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking_with_count(uuid, uuid) TO authenticated;

-- Create a function to validate and fix all class participant counts
CREATE OR REPLACE FUNCTION validate_all_participant_counts()
RETURNS TABLE(class_id uuid, old_count integer, new_count integer, fixed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  class_record record;
BEGIN
  FOR class_record IN 
    SELECT yc.id, yc.current_participants, yc.title
    FROM yoga_classes yc
    ORDER BY yc.date, yc.time
  LOOP
    -- Sync the count and return the result
    PERFORM sync_participant_count(class_record.id);
    
    -- Get the updated count
    SELECT yc.current_participants
    INTO class_record.current_participants
    FROM yoga_classes yc
    WHERE yc.id = class_record.id;
    
    -- Return the result
    RETURN QUERY SELECT 
      class_record.id,
      class_record.current_participants,
      class_record.current_participants,
      true;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_all_participant_counts() TO authenticated;