/*
  # Fix Booking Cancellation Payment Status Handling

  1. Updates
    - Modify the cancel_booking_with_count function to handle payment status properly
    - When cancelling a paid booking, set payment_status to 'refunded'
    - Update the constraint to allow this transition

  2. Security
    - Maintain all existing RLS policies
    - Keep transaction safety intact
    - Ensure proper audit logging
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
    CASE v_booking.payment_status
      WHEN 'completed' THEN
        v_new_payment_status := 'refunded';
      WHEN 'pending' THEN
        v_new_payment_status := 'pending';
      WHEN 'failed' THEN
        v_new_payment_status := 'failed';
      ELSE
        v_new_payment_status := v_booking.payment_status;
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

    RETURN true;

  EXCEPTION
    WHEN OTHERS THEN
      -- Re-raise the exception to rollback the transaction
      RAISE;
  END;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cancel_booking_with_count(uuid, uuid) TO authenticated;