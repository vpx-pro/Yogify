/*
  # Add Payment Status to Bookings

  1. New Columns
    - Add `payment_status` enum column to bookings table
    - Add `updated_at` timestamp column to bookings table

  2. Indexes
    - Add indexes for payment status queries
    - Add composite indexes for efficient lookups

  3. Constraints
    - Add validation for payment status transitions
    - Ensure payment status aligns with booking status

  4. Functions
    - Create secure function for payment status updates
    - Add trigger for updated_at timestamp

  5. Security
    - Update RLS policies for payment status management
    - Allow students to update their own booking payment status
*/

-- Create payment status enum type only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
  END IF;
END $$;

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

-- Add indexes for payment status queries
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_student_payment ON bookings(student_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_class_payment ON bookings(class_id, payment_status);

-- Update existing booking records to have 'pending' status
UPDATE bookings 
SET payment_status = 'pending' 
WHERE payment_status IS NULL;

-- Add constraint to ensure payment status is valid for booking status
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

-- Create trigger function for updated_at on bookings
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

-- Drop the problematic RLS policy if it exists
DROP POLICY IF EXISTS "Students can update payment status for own bookings" ON bookings;

-- Create a simpler RLS policy for payment status updates
-- This policy allows students to update their own bookings
-- The validation logic is handled by the secure function above
CREATE POLICY "Students can update own booking payment status"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());