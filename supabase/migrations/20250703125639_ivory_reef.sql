/*
  # Fix participant counts and booking functions

  1. Changes
    - Adds functions to manage participant counts
    - Fixes booking creation and cancellation
    - Adds validation for booking operations
    - Ensures data integrity between bookings and class participant counts

  2. Security
    - Adds RLS policies for participant_count_audit table
    - Ensures all operations maintain data integrity
*/

-- Function to create a booking with participant count management
CREATE OR REPLACE FUNCTION create_booking_with_count(
  p_student_id UUID,
  p_class_id UUID,
  p_status booking_status DEFAULT 'confirmed',
  p_payment_status payment_status DEFAULT 'pending'
)
RETURNS UUID AS $$
DECLARE
  v_class_record RECORD;
  v_booking_id UUID;
  v_old_count INTEGER;
  v_new_count INTEGER;
BEGIN
  -- Check if class exists and get current count
  SELECT * INTO v_class_record
  FROM yoga_classes
  WHERE id = p_class_id
  FOR UPDATE; -- Lock the row to prevent race conditions
  
  IF v_class_record IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  
  -- Check if class is in the past
  IF (v_class_record.date || ' ' || v_class_record.time)::timestamp < now() THEN
    RAISE EXCEPTION 'Cannot book past classes';
  END IF;
  
  -- Check if class is full
  IF v_class_record.current_participants >= 
     COALESCE(v_class_record.retreat_capacity, v_class_record.max_participants) THEN
    RAISE EXCEPTION 'Class is full';
  END IF;
  
  -- Check if student already has a booking
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE student_id = p_student_id
    AND class_id = p_class_id
    AND status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'Student already has a booking for this class';
  END IF;
  
  -- Store old count for audit
  v_old_count := v_class_record.current_participants;
  
  -- Create booking
  INSERT INTO bookings (
    student_id,
    class_id,
    status,
    payment_status
  ) VALUES (
    p_student_id,
    p_class_id,
    p_status,
    p_payment_status
  )
  RETURNING id INTO v_booking_id;
  
  -- Only increment count for confirmed bookings
  IF p_status = 'confirmed' THEN
    -- Update participant count
    UPDATE yoga_classes
    SET current_participants = current_participants + 1
    WHERE id = p_class_id
    RETURNING current_participants INTO v_new_count;
    
    -- Add audit record
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
      'increment',
      v_old_count,
      v_new_count,
      v_booking_id,
      'booking_created'
    );
  END IF;
  
  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;

-- Function to cancel a booking with participant count management
CREATE OR REPLACE FUNCTION cancel_booking_with_count(
  p_booking_id UUID,
  p_student_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_booking_record RECORD;
  v_class_record RECORD;
  v_old_count INTEGER;
  v_new_count INTEGER;
BEGIN
  -- Get booking
  SELECT * INTO v_booking_record
  FROM bookings
  WHERE id = p_booking_id
  AND student_id = p_student_id
  FOR UPDATE; -- Lock the row to prevent race conditions
  
  IF v_booking_record IS NULL THEN
    RAISE EXCEPTION 'Booking not found or not owned by this student';
  END IF;
  
  -- Check if booking is already cancelled
  IF v_booking_record.status = 'cancelled' THEN
    RAISE EXCEPTION 'Booking is already cancelled';
  END IF;
  
  -- Get class and lock for update
  SELECT * INTO v_class_record
  FROM yoga_classes
  WHERE id = v_booking_record.class_id
  FOR UPDATE;
  
  IF v_class_record IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  
  -- Store old count for audit
  v_old_count := v_class_record.current_participants;
  
  -- Update booking status
  UPDATE bookings
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_booking_id;
  
  -- Decrement participant count
  UPDATE yoga_classes
  SET current_participants = GREATEST(0, current_participants - 1)
  WHERE id = v_booking_record.class_id
  RETURNING current_participants INTO v_new_count;
  
  -- Add audit record
  INSERT INTO participant_count_audit (
    class_id,
    student_id,
    action,
    old_count,
    new_count,
    booking_id,
    reason
  ) VALUES (
    v_booking_record.class_id,
    p_student_id,
    'decrement',
    v_old_count,
    v_new_count,
    p_booking_id,
    'booking_cancelled'
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to update booking payment status
CREATE OR REPLACE FUNCTION update_booking_payment_status(
  booking_id UUID,
  new_payment_status payment_status
)
RETURNS BOOLEAN AS $$
DECLARE
  v_booking_record RECORD;
BEGIN
  -- Get booking
  SELECT * INTO v_booking_record
  FROM bookings
  WHERE id = booking_id
  FOR UPDATE; -- Lock the row to prevent race conditions
  
  IF v_booking_record IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  
  -- Validate status transition
  IF v_booking_record.status = 'cancelled' AND new_payment_status = 'completed' THEN
    RAISE EXCEPTION 'Cannot set payment status to completed for cancelled bookings';
  END IF;
  
  -- Update payment status
  UPDATE bookings
  SET payment_status = new_payment_status,
      updated_at = now()
  WHERE id = booking_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to sync participant count for a class
CREATE OR REPLACE FUNCTION sync_participant_count(
  p_class_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_class_record RECORD;
  v_actual_count INTEGER;
  v_old_count INTEGER;
  v_new_count INTEGER;
BEGIN
  -- Get class and lock for update
  SELECT * INTO v_class_record
  FROM yoga_classes
  WHERE id = p_class_id
  FOR UPDATE;
  
  IF v_class_record IS NULL THEN
    RAISE EXCEPTION 'Class not found';
  END IF;
  
  -- Count confirmed bookings
  SELECT COUNT(*) INTO v_actual_count
  FROM bookings
  WHERE class_id = p_class_id
  AND status = 'confirmed';
  
  -- Store old count for audit
  v_old_count := v_class_record.current_participants;
  
  -- Only update if counts differ
  IF v_old_count != v_actual_count THEN
    -- Update participant count
    UPDATE yoga_classes
    SET current_participants = v_actual_count
    WHERE id = p_class_id
    RETURNING current_participants INTO v_new_count;
    
    -- Add audit record
    INSERT INTO participant_count_audit (
      class_id,
      action,
      old_count,
      new_count,
      reason
    ) VALUES (
      p_class_id,
      'sync',
      v_old_count,
      v_new_count,
      'manual_sync'
    );
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to validate all participant counts
CREATE OR REPLACE FUNCTION validate_all_participant_counts()
RETURNS TABLE(
  class_id UUID,
  old_count INTEGER,
  new_count INTEGER,
  fixed BOOLEAN
) AS $$
DECLARE
  v_class_record RECORD;
  v_actual_count INTEGER;
BEGIN
  FOR v_class_record IN 
    SELECT id, current_participants
    FROM yoga_classes
    ORDER BY date DESC
    LIMIT 100
  LOOP
    -- Count confirmed bookings
    SELECT COUNT(*) INTO v_actual_count
    FROM bookings
    WHERE class_id = v_class_record.id
    AND status = 'confirmed';
    
    -- Check if counts differ
    IF v_class_record.current_participants != v_actual_count THEN
      -- Update participant count
      UPDATE yoga_classes
      SET current_participants = v_actual_count
      WHERE id = v_class_record.id;
      
      -- Add audit record
      INSERT INTO participant_count_audit (
        class_id,
        action,
        old_count,
        new_count,
        reason
      ) VALUES (
        v_class_record.id,
        'validation',
        v_class_record.current_participants,
        v_actual_count,
        'automated_validation'
      );
      
      -- Return result
      class_id := v_class_record.id;
      old_count := v_class_record.current_participants;
      new_count := v_actual_count;
      fixed := TRUE;
      RETURN NEXT;
    ELSE
      -- Return result (not fixed)
      class_id := v_class_record.id;
      old_count := v_class_record.current_participants;
      new_count := v_actual_count;
      fixed := FALSE;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a student can book a class
CREATE OR REPLACE FUNCTION can_student_book_class(
  p_student_id UUID,
  p_class_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_class_record RECORD;
  v_booking_record RECORD;
  result JSONB;
BEGIN
  -- Check if class exists
  SELECT * INTO v_class_record
  FROM yoga_classes
  WHERE id = p_class_id;
  
  IF v_class_record IS NULL THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'class_not_found',
      'message', 'Class not found'
    );
  END IF;
  
  -- Check if class is in the past
  IF (v_class_record.date || ' ' || v_class_record.time)::timestamp < now() THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'class_past',
      'message', 'Cannot book past classes'
    );
  END IF;
  
  -- Check if class is full
  IF v_class_record.current_participants >= 
     COALESCE(v_class_record.retreat_capacity, v_class_record.max_participants) THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'class_full',
      'message', 'Class is full'
    );
  END IF;
  
  -- Check if student already has a booking
  SELECT * INTO v_booking_record
  FROM bookings
  WHERE student_id = p_student_id
  AND class_id = p_class_id
  AND status = 'confirmed';
  
  IF v_booking_record IS NOT NULL THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'already_booked',
      'message', 'You have already booked this class',
      'booking_id', v_booking_record.id
    );
  END IF;
  
  -- All checks passed
  RETURN jsonb_build_object(
    'can_book', true,
    'class_title', v_class_record.title,
    'class_date', v_class_record.date,
    'class_time', v_class_record.time,
    'current_participants', v_class_record.current_participants,
    'max_participants', COALESCE(v_class_record.retreat_capacity, v_class_record.max_participants)
  );
END;
$$ LANGUAGE plpgsql;

-- Make sure RLS is enabled on participant_count_audit
ALTER TABLE IF EXISTS public.participant_count_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for participant_count_audit
DROP POLICY IF EXISTS "Teachers can view their class participant audits" ON public.participant_count_audit;
CREATE POLICY "Teachers can view their class participant audits" 
ON public.participant_count_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM yoga_classes
    WHERE yoga_classes.id = participant_count_audit.class_id
    AND yoga_classes.teacher_id = auth.uid()
  )
);

-- Ensure all classes have correct participant counts
SELECT * FROM validate_all_participant_counts();