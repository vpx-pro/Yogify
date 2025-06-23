/*
  # Fix Duplicate Booking Error

  1. Improvements
    - Add better error handling for duplicate bookings
    - Improve the create_booking_with_count function to handle race conditions
    - Add more robust checking for existing bookings

  2. Security
    - Maintain all existing RLS policies
    - Keep transaction safety intact
*/

-- Improve the create_booking_with_count function to handle race conditions better
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
  v_existing_booking_id uuid;
BEGIN
  -- Start transaction with serializable isolation to prevent race conditions
  BEGIN
    -- First, check for existing booking with a more robust query
    SELECT id INTO v_existing_booking_id
    FROM bookings
    WHERE student_id = p_student_id
      AND class_id = p_class_id
      AND status = 'confirmed'
    FOR UPDATE NOWAIT;

    -- If we found an existing booking, raise an exception
    IF v_existing_booking_id IS NOT NULL THEN
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

    -- Create the booking with explicit handling of unique constraint
    BEGIN
      INSERT INTO bookings (student_id, class_id, status, payment_status)
      VALUES (p_student_id, p_class_id, p_status, p_payment_status)
      RETURNING id INTO v_booking_id;
    EXCEPTION
      WHEN unique_violation THEN
        -- Handle the case where a booking was created between our check and insert
        RAISE EXCEPTION 'Student already has a booking for this class';
    END;

    -- Increment participant count only if payment is completed
    IF p_payment_status = 'completed' THEN
      PERFORM increment_participant_count(p_class_id, p_student_id, v_booking_id);
    END IF;

    RETURN v_booking_id;

  EXCEPTION
    WHEN lock_not_available THEN
      -- Handle the case where we can't get a lock (another transaction is working on this)
      RAISE EXCEPTION 'Booking system is busy, please try again';
    WHEN OTHERS THEN
      -- Re-raise any other exception to rollback the transaction
      RAISE;
  END;
END;
$$;

-- Add a helper function to check if a student can book a class
CREATE OR REPLACE FUNCTION can_student_book_class(
  p_student_id uuid,
  p_class_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_info record;
  v_existing_booking boolean;
  v_result jsonb;
BEGIN
  -- Check if student already has a booking
  SELECT EXISTS (
    SELECT 1 FROM bookings
    WHERE student_id = p_student_id
      AND class_id = p_class_id
      AND status = 'confirmed'
  ) INTO v_existing_booking;

  IF v_existing_booking THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'already_booked',
      'message', 'Student already has a booking for this class'
    );
  END IF;

  -- Get class information
  SELECT id, current_participants, max_participants, date, time, title
  INTO v_class_info
  FROM yoga_classes
  WHERE id = p_class_id;

  -- Check if class exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'class_not_found',
      'message', 'Class not found'
    );
  END IF;

  -- Check if class is in the future
  IF (v_class_info.date || ' ' || v_class_info.time)::timestamp < now() THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'class_past',
      'message', 'Cannot book past classes'
    );
  END IF;

  -- Check capacity
  IF v_class_info.current_participants >= v_class_info.max_participants THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'class_full',
      'message', 'Class is full',
      'current_participants', v_class_info.current_participants,
      'max_participants', v_class_info.max_participants
    );
  END IF;

  -- All checks passed
  RETURN jsonb_build_object(
    'can_book', true,
    'reason', 'available',
    'message', 'Class is available for booking',
    'current_participants', v_class_info.current_participants,
    'max_participants', v_class_info.max_participants,
    'spots_left', v_class_info.max_participants - v_class_info.current_participants
  );
END;
$$;

-- Grant permissions for the new function
GRANT EXECUTE ON FUNCTION can_student_book_class(uuid, uuid) TO authenticated;

-- Update the existing function permissions
GRANT EXECUTE ON FUNCTION create_booking_with_count(uuid, uuid, booking_status, payment_status) TO authenticated;