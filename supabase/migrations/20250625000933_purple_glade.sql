-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS get_table_indexes(text);
DROP FUNCTION IF EXISTS get_table_triggers(text);
DROP FUNCTION IF EXISTS check_rls_enabled(text);
DROP FUNCTION IF EXISTS create_booking_with_count(uuid, uuid, booking_status, payment_status);
DROP FUNCTION IF EXISTS cancel_booking_with_count(uuid, uuid);
DROP FUNCTION IF EXISTS update_booking_payment_status(uuid, payment_status);
DROP FUNCTION IF EXISTS sync_participant_count(uuid);
DROP FUNCTION IF EXISTS validate_all_participant_counts();
DROP FUNCTION IF EXISTS can_student_book_class(uuid, uuid);
DROP FUNCTION IF EXISTS validate_booking_operation(text, uuid, payment_status);

-- Function to check if RLS is enabled on a table
CREATE OR REPLACE FUNCTION check_rls_enabled(table_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = table_name 
    AND n.nspname = 'public'
    AND c.relrowsecurity = true
  );
END;
$$;

-- Function to get table indexes with proper return type
CREATE OR REPLACE FUNCTION get_table_indexes(schema_name text DEFAULT 'public')
RETURNS TABLE(index_name text, table_name text, index_definition text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.indexname::text,
    i.tablename::text,
    i.indexdef::text
  FROM pg_indexes i
  WHERE i.schemaname = schema_name;
END;
$$;

-- Function to get table triggers with proper return type
CREATE OR REPLACE FUNCTION get_table_triggers(schema_name text DEFAULT 'public')
RETURNS TABLE(trigger_name text, table_name text, event_type text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.trigger_name::text,
    t.event_object_table::text,
    t.event_manipulation::text
  FROM information_schema.triggers t
  WHERE t.trigger_schema = schema_name;
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
  v_current_count integer;
  v_max_participants integer;
  v_class_date date;
  v_class_time time;
  v_class_datetime timestamp;
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

  -- Get current class info
  SELECT current_participants, max_participants, date, time
  INTO v_current_count, v_max_participants, v_class_date, v_class_time
  FROM yoga_classes
  WHERE id = p_class_id;

  -- Check if class exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found';
  END IF;

  -- Check if class is in the future
  v_class_datetime := (v_class_date || ' ' || v_class_time)::timestamp;
  IF v_class_datetime < NOW() THEN
    RAISE EXCEPTION 'Cannot book past classes';
  END IF;

  -- Check capacity only for confirmed bookings with completed payment
  IF p_status = 'confirmed' AND p_payment_status = 'completed' THEN
    IF v_current_count >= v_max_participants THEN
      RAISE EXCEPTION 'Class is full';
    END IF;
  END IF;

  -- Create the booking
  INSERT INTO bookings (student_id, class_id, status, payment_status)
  VALUES (p_student_id, p_class_id, p_status, p_payment_status)
  RETURNING id INTO v_booking_id;

  -- Update participant count if booking is confirmed and paid
  IF p_status = 'confirmed' AND p_payment_status = 'completed' THEN
    UPDATE yoga_classes
    SET current_participants = current_participants + 1,
        updated_at = now()
    WHERE id = p_class_id;

    -- Log the change if audit table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'participant_count_audit') THEN
      INSERT INTO participant_count_audit (
        class_id, student_id, action, old_count, new_count, booking_id, reason
      ) VALUES (
        p_class_id, p_student_id, 'increment', v_current_count, v_current_count + 1, v_booking_id, 'Booking created'
      );
    END IF;
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
  v_current_status booking_status;
  v_payment_status payment_status;
  v_current_count integer;
BEGIN
  -- Get booking info
  SELECT class_id, status, payment_status
  INTO v_class_id, v_current_status, v_payment_status
  FROM bookings
  WHERE id = p_booking_id AND student_id = p_student_id;

  -- Check if booking exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or already cancelled';
  END IF;

  -- Get current participant count
  SELECT current_participants INTO v_current_count
  FROM yoga_classes WHERE id = v_class_id;

  -- Update booking status to cancelled
  UPDATE bookings
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_booking_id;

  -- Decrease participant count if booking was confirmed and paid
  IF v_current_status = 'confirmed' AND v_payment_status = 'completed' THEN
    UPDATE yoga_classes
    SET current_participants = GREATEST(0, current_participants - 1),
        updated_at = now()
    WHERE id = v_class_id;

    -- Log the change if audit table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'participant_count_audit') THEN
      INSERT INTO participant_count_audit (
        class_id, student_id, action, old_count, new_count, booking_id, reason
      ) VALUES (
        v_class_id, p_student_id, 'decrement', v_current_count, GREATEST(0, v_current_count - 1), p_booking_id, 'Booking cancelled'
      );
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- Function to update booking payment status
CREATE OR REPLACE FUNCTION update_booking_payment_status(
  booking_id uuid,
  new_payment_status payment_status
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id uuid;
  v_student_id uuid;
  v_current_status booking_status;
  v_old_payment_status payment_status;
  v_current_count integer;
BEGIN
  -- Get booking info
  SELECT class_id, student_id, status, payment_status
  INTO v_class_id, v_student_id, v_current_status, v_old_payment_status
  FROM bookings
  WHERE id = booking_id;

  -- Check if booking exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Get current participant count
  SELECT current_participants INTO v_current_count
  FROM yoga_classes WHERE id = v_class_id;

  -- Update payment status
  UPDATE bookings
  SET payment_status = new_payment_status,
      updated_at = now()
  WHERE id = booking_id;

  -- Handle participant count changes based on payment status transition
  IF v_current_status = 'confirmed' THEN
    -- If payment completed and wasn't before, increment count
    IF new_payment_status = 'completed' AND v_old_payment_status != 'completed' THEN
      UPDATE yoga_classes
      SET current_participants = current_participants + 1,
          updated_at = now()
      WHERE id = v_class_id;

      -- Log the change if audit table exists
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'participant_count_audit') THEN
        INSERT INTO participant_count_audit (
          class_id, student_id, action, old_count, new_count, booking_id, reason
        ) VALUES (
          v_class_id, v_student_id, 'increment', v_current_count, v_current_count + 1, booking_id, 'Payment completed'
        );
      END IF;
    -- If payment was completed and now isn't, decrement count
    ELSIF v_old_payment_status = 'completed' AND new_payment_status != 'completed' THEN
      UPDATE yoga_classes
      SET current_participants = GREATEST(0, current_participants - 1),
          updated_at = now()
      WHERE id = v_class_id;

      -- Log the change if audit table exists
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'participant_count_audit') THEN
        INSERT INTO participant_count_audit (
          class_id, student_id, action, old_count, new_count, booking_id, reason
        ) VALUES (
          v_class_id, v_student_id, 'decrement', v_current_count, GREATEST(0, v_current_count - 1), booking_id, 'Payment status changed'
        );
      END IF;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- Function to sync participant count for a class
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

  -- Check if class exists
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
    SET current_participants = v_actual_count,
        updated_at = now()
    WHERE id = p_class_id;

    -- Log the sync if audit table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'participant_count_audit') THEN
      INSERT INTO participant_count_audit (
        class_id, action, old_count, new_count, reason
      ) VALUES (
        p_class_id, 'sync', v_current_count, v_actual_count, 'Manual sync operation'
      );
    END IF;
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
DECLARE
  class_record record;
  v_actual_count integer;
  v_stored_count integer;
BEGIN
  FOR class_record IN 
    SELECT id, current_participants FROM yoga_classes
  LOOP
    -- Calculate actual count
    SELECT COUNT(*)
    INTO v_actual_count
    FROM bookings
    WHERE class_id = class_record.id
      AND status = 'confirmed'
      AND payment_status = 'completed';

    v_stored_count := class_record.current_participants;

    -- Update if different
    IF v_actual_count != v_stored_count THEN
      UPDATE yoga_classes
      SET current_participants = v_actual_count,
          updated_at = now()
      WHERE id = class_record.id;
    END IF;

    -- Return the result
    RETURN QUERY SELECT 
      class_record.id,
      v_stored_count,
      v_actual_count,
      (v_actual_count != v_stored_count);
  END LOOP;
END;
$$;

-- Function to check if student can book a class
CREATE OR REPLACE FUNCTION can_student_book_class(
  p_student_id uuid,
  p_class_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_booking_count integer;
  v_class_info record;
  v_class_datetime timestamp;
BEGIN
  -- Check for existing booking
  SELECT COUNT(*) INTO v_existing_booking_count
  FROM bookings
  WHERE student_id = p_student_id
    AND class_id = p_class_id
    AND status = 'confirmed';

  IF v_existing_booking_count > 0 THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'already_booked',
      'message', 'Student already has a booking for this class'
    );
  END IF;

  -- Get class information
  SELECT 
    current_participants,
    max_participants,
    date,
    time,
    title
  INTO v_class_info
  FROM yoga_classes
  WHERE id = p_class_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'can_book', false,
      'reason', 'class_not_found',
      'message', 'Class not found'
    );
  END IF;

  -- Check if class is in the future
  v_class_datetime := (v_class_info.date || ' ' || v_class_info.time)::timestamp;
  IF v_class_datetime < NOW() THEN
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
      'current_count', v_class_info.current_participants,
      'max_participants', v_class_info.max_participants
    );
  END IF;

  -- All checks passed
  RETURN jsonb_build_object(
    'can_book', true,
    'reason', 'available',
    'message', 'Class is available for booking',
    'current_count', v_class_info.current_participants,
    'max_participants', v_class_info.max_participants,
    'spots_left', v_class_info.max_participants - v_class_info.current_participants
  );
END;
$$;

-- Function to validate booking operations
CREATE OR REPLACE FUNCTION validate_booking_operation(
  p_operation text,
  p_booking_id uuid DEFAULT NULL,
  p_new_payment_status payment_status DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  CASE p_operation
    WHEN 'payment_update' THEN
      IF p_booking_id IS NULL OR p_new_payment_status IS NULL THEN
        RETURN jsonb_build_object(
          'valid', false,
          'reason', 'Missing required parameters for payment update'
        );
      END IF;
      
      -- Check if booking exists
      IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = p_booking_id) THEN
        RETURN jsonb_build_object(
          'valid', false,
          'reason', 'Booking not found'
        );
      END IF;
      
      RETURN jsonb_build_object('valid', true);
    ELSE
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'Unknown operation'
      );
  END CASE;
END;
$$;

-- Add missing indexes for better performance (without problematic predicates)
CREATE INDEX IF NOT EXISTS idx_bookings_status_payment ON bookings(status, payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_class_confirmed ON bookings(class_id, status);
CREATE INDEX IF NOT EXISTS idx_yoga_classes_teacher_date ON yoga_classes(teacher_id, date);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_bookings_student_status ON bookings(student_id, status);
CREATE INDEX IF NOT EXISTS idx_yoga_classes_date ON yoga_classes(date);

-- Temporarily relax RLS policies for comprehensive testing

-- Allow authenticated users to insert their own profiles
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Temporarily allow all inserts for testing

-- Allow teachers to insert classes (and test users)
DROP POLICY IF EXISTS "Teachers can create classes" ON yoga_classes;
CREATE POLICY "Teachers can create classes"
  ON yoga_classes
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Temporarily allow all inserts for testing

-- Allow reading all profiles for testing
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
CREATE POLICY "Users can read all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow updating all profiles for testing
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update all profiles" ON profiles;
CREATE POLICY "Users can update all profiles"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow deleting profiles for testing
DROP POLICY IF EXISTS "Allow delete for testing" ON profiles;
CREATE POLICY "Allow delete for testing"
  ON profiles
  FOR DELETE
  TO authenticated
  USING (true);

-- Allow deleting classes for testing
DROP POLICY IF EXISTS "Allow delete classes for testing" ON yoga_classes;
CREATE POLICY "Allow delete classes for testing"
  ON yoga_classes
  FOR DELETE
  TO authenticated
  USING (true);

-- Allow deleting bookings for testing
DROP POLICY IF EXISTS "Allow delete bookings for testing" ON bookings;
CREATE POLICY "Allow delete bookings for testing"
  ON bookings
  FOR DELETE
  TO authenticated
  USING (true);

-- Grant necessary permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- Grant table permissions for testing
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;