-- Drop existing function with return type issue
DROP FUNCTION IF EXISTS sync_participant_count(uuid);

-- Create secure function for participant count updates
CREATE OR REPLACE FUNCTION sync_participant_count(class_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  confirmed_count integer;
  old_count integer;
BEGIN
  -- Get current count before update
  SELECT current_participants INTO old_count
  FROM yoga_classes
  WHERE id = class_id_param;

  -- Count confirmed bookings with completed payments
  SELECT COUNT(*)
  INTO confirmed_count
  FROM bookings b
  WHERE b.class_id = class_id_param
    AND b.status = 'confirmed'
    AND b.payment_status = 'completed';

  -- Update the class participant count
  UPDATE yoga_classes
  SET current_participants = confirmed_count,
      updated_at = now()
  WHERE id = class_id_param;

  -- Log the sync operation
  INSERT INTO participant_count_audit (
    class_id,
    action,
    old_count,
    new_count,
    reason
  )
  VALUES (
    class_id_param,
    'sync',
    old_count,
    confirmed_count,
    'Automated sync via secure function'
  );
END;
$$;

-- Create secure function for teacher rating updates
CREATE OR REPLACE FUNCTION update_teacher_rating_secure(teacher_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  avg_rating_calc numeric(3,2);
  total_reviews_count integer;
  rating_counts_calc jsonb;
BEGIN
  -- Calculate average rating and total reviews
  SELECT 
    COALESCE(AVG(rating), 0)::numeric(3,2),
    COUNT(*)
  INTO avg_rating_calc, total_reviews_count
  FROM teacher_reviews
  WHERE teacher_id = teacher_id_param;

  -- Calculate rating distribution
  SELECT jsonb_build_object(
    '1', COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0),
    '2', COALESCE(SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END), 0),
    '3', COALESCE(SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END), 0),
    '4', COALESCE(SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END), 0),
    '5', COALESCE(SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END), 0)
  )
  INTO rating_counts_calc
  FROM teacher_reviews
  WHERE teacher_id = teacher_id_param;

  -- Update or insert teacher rating
  INSERT INTO teacher_ratings (
    teacher_id,
    avg_rating,
    total_reviews,
    rating_counts,
    updated_at
  )
  VALUES (
    teacher_id_param,
    avg_rating_calc,
    total_reviews_count,
    rating_counts_calc,
    now()
  )
  ON CONFLICT (teacher_id)
  DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    total_reviews = EXCLUDED.total_reviews,
    rating_counts = EXCLUDED.rating_counts,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Create function to safely create test bookings
CREATE OR REPLACE FUNCTION create_test_booking(
  student_id_param uuid,
  class_id_param uuid,
  payment_status_param payment_status DEFAULT 'completed'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  booking_id uuid;
BEGIN
  -- Insert the booking
  INSERT INTO bookings (
    student_id,
    class_id,
    status,
    payment_status,
    booking_date,
    created_at
  )
  VALUES (
    student_id_param,
    class_id_param,
    'confirmed',
    payment_status_param,
    now(),
    now()
  )
  RETURNING id INTO booking_id;

  -- Update participant count
  PERFORM sync_participant_count(class_id_param);

  RETURN booking_id;
END;
$$;

-- Create function to safely save teachers
CREATE OR REPLACE FUNCTION save_teacher_for_student(
  student_id_param uuid,
  teacher_id_param uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  saved_id uuid;
BEGIN
  INSERT INTO saved_teachers (
    student_id,
    teacher_id,
    created_at
  )
  VALUES (
    student_id_param,
    teacher_id_param,
    now()
  )
  ON CONFLICT (student_id, teacher_id) DO NOTHING
  RETURNING id INTO saved_id;

  RETURN saved_id;
END;
$$;

-- Create function to safely create teacher reviews
CREATE OR REPLACE FUNCTION create_teacher_review(
  student_id_param uuid,
  teacher_id_param uuid,
  class_id_param uuid,
  rating_param integer,
  comment_param text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  review_id uuid;
BEGIN
  -- Insert the review
  INSERT INTO teacher_reviews (
    student_id,
    teacher_id,
    class_id,
    rating,
    comment,
    created_at
  )
  VALUES (
    student_id_param,
    teacher_id_param,
    class_id_param,
    rating_param,
    comment_param,
    now()
  )
  ON CONFLICT (student_id, class_id) 
  DO UPDATE SET
    rating = EXCLUDED.rating,
    comment = EXCLUDED.comment,
    updated_at = now()
  RETURNING id INTO review_id;

  -- Update teacher rating
  PERFORM update_teacher_rating_secure(teacher_id_param);

  RETURN review_id;
END;
$$;

-- Fix bookings RLS policies
DROP POLICY IF EXISTS "Students can create own bookings" ON bookings;
CREATE POLICY "Students can create own bookings" ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'student'
    )
  );

-- Fix saved_teachers RLS policies
DROP POLICY IF EXISTS "Students can manage their saved teachers" ON saved_teachers;
CREATE POLICY "Students can manage their saved teachers" ON saved_teachers
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Fix teacher_ratings RLS policies (read-only for users)
DROP POLICY IF EXISTS "Anyone can view teacher ratings" ON teacher_ratings;
CREATE POLICY "Anyone can view teacher ratings" ON teacher_ratings
  FOR SELECT
  TO authenticated
  USING (true);

-- Fix teacher_reviews RLS policies
DROP POLICY IF EXISTS "Students can create and manage their reviews" ON teacher_reviews;
DROP POLICY IF EXISTS "Students can create their own reviews" ON teacher_reviews;
DROP POLICY IF EXISTS "Students can view and update their own reviews" ON teacher_reviews;
DROP POLICY IF EXISTS "Anyone can view teacher reviews" ON teacher_reviews;

-- Recreate teacher_reviews policies
CREATE POLICY "Students can create their own reviews" ON teacher_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'student'
    )
  );

CREATE POLICY "Students can view and update their own reviews" ON teacher_reviews
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Anyone can view teacher reviews" ON teacher_reviews
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant execute permissions on secure functions
GRANT EXECUTE ON FUNCTION sync_participant_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_teacher_rating_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_test_booking(uuid, uuid, payment_status) TO authenticated;
GRANT EXECUTE ON FUNCTION save_teacher_for_student(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_teacher_review(uuid, uuid, uuid, integer, text) TO authenticated;

-- Create trigger for automatic participant count sync
CREATE OR REPLACE FUNCTION trigger_sync_participant_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM sync_participant_count(NEW.class_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM sync_participant_count(OLD.class_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS auto_sync_participant_count ON bookings;

CREATE TRIGGER auto_sync_participant_count
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_sync_participant_count();

-- Ensure all classes have correct participant counts
DO $$
DECLARE
  class_record RECORD;
  actual_count INTEGER;
BEGIN
  FOR class_record IN 
    SELECT id, current_participants
    FROM yoga_classes
    ORDER BY date DESC
  LOOP
    -- Count confirmed bookings with completed payments
    SELECT COUNT(*) INTO actual_count
    FROM bookings b
    WHERE b.class_id = class_record.id
    AND b.status = 'confirmed'
    AND b.payment_status = 'completed';
    
    -- Update if counts differ
    IF class_record.current_participants != actual_count THEN
      UPDATE yoga_classes
      SET current_participants = actual_count
      WHERE id = class_record.id;
      
      RAISE NOTICE 'Fixed participant count for class %: % -> %', 
        class_record.id, class_record.current_participants, actual_count;
    END IF;
  END LOOP;
END;
$$;