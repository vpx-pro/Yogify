/*
  # Add Payment Status to Bookings

  1. New Columns
    - Add `payment_status` to bookings table with enum type
    - Default value: 'pending'
    - Options: 'pending', 'completed', 'failed', 'refunded'

  2. Updates
    - Add index for payment status queries
    - Update existing records to have 'pending' status
    - Add constraints for data validation

  3. Security
    - Update RLS policies to handle payment status
    - Ensure proper access control for payment operations
*/

-- Create payment status enum type
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- Add payment_status column to bookings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE bookings ADD COLUMN payment_status payment_status NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- Add index for payment status queries
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_student_payment ON bookings(student_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_class_payment ON bookings(class_id, payment_status);

-- Update existing booking records to have 'pending' status
-- This ensures all existing confirmed bookings are marked as pending payment
UPDATE bookings 
SET payment_status = 'pending' 
WHERE payment_status IS NULL;

-- Add constraint to ensure payment status is valid for booking status
-- Cancelled bookings should not have completed payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'bookings_payment_status_check'
  ) THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check 
    CHECK (
      (status = 'cancelled' AND payment_status IN ('pending', 'failed', 'refunded')) OR
      (status = 'confirmed' AND payment_status IN ('pending', 'completed', 'failed'))
    );
  END IF;
END $$;

-- Update RLS policies to handle payment status
-- Students can view their own bookings regardless of payment status
-- Teachers can view bookings for their classes regardless of payment status
-- Payment status updates should be handled by secure functions or admin users

-- Add policy for payment status updates (restrictive - only allow specific operations)
CREATE POLICY "Students can update payment status for own bookings"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (
    student_id = auth.uid() AND
    -- Only allow transitioning from pending to completed/failed
    (
      (OLD.payment_status = 'pending' AND NEW.payment_status IN ('completed', 'failed')) OR
      -- Allow refund transitions for completed payments
      (OLD.payment_status = 'completed' AND NEW.payment_status = 'refunded')
    )
  );

-- Create function to handle payment status updates with validation
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

  -- Validate payment status transitions
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

  -- Update if valid transition
  IF is_valid THEN
    UPDATE bookings
    SET payment_status = new_payment_status,
        updated_at = now()
    WHERE id = booking_id;
    
    RETURN true;
  ELSE
    RAISE EXCEPTION 'Invalid payment status transition from % to %', 
      booking_record.payment_status, new_payment_status;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_booking_payment_status(uuid, payment_status) TO authenticated;

-- Add updated_at column to bookings if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create trigger for updated_at on bookings
CREATE OR REPLACE FUNCTION update_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_bookings_updated_at();