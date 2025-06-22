/*
  # Yogify Database Schema

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text, unique)
      - `full_name` (text)
      - `role` (enum: student, teacher)
      - `avatar_url` (text, optional)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `yoga_classes`
      - `id` (uuid, primary key)
      - `title` (text)
      - `description` (text)
      - `teacher_id` (uuid, references profiles)
      - `date` (date)
      - `time` (time)
      - `duration` (integer, minutes)
      - `max_participants` (integer)
      - `current_participants` (integer)
      - `price` (decimal)
      - `level` (enum: beginner, intermediate, advanced)
      - `type` (text)
      - `location` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `bookings`
      - `id` (uuid, primary key)
      - `student_id` (uuid, references profiles)
      - `class_id` (uuid, references yoga_classes)
      - `booking_date` (timestamp)
      - `status` (enum: confirmed, cancelled)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Teachers can manage their classes
    - Students can book classes and view their bookings
    - Teachers can view bookings for their classes

  3. Functions
    - Auto-update `updated_at` timestamps
*/

-- Create custom types
CREATE TYPE user_role AS ENUM ('student', 'teacher');
CREATE TYPE class_level AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled');

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'student',
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create yoga_classes table
CREATE TABLE IF NOT EXISTS yoga_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  time time NOT NULL,
  duration integer NOT NULL DEFAULT 60,
  max_participants integer NOT NULL DEFAULT 10,
  current_participants integer NOT NULL DEFAULT 0,
  price decimal(10,2) NOT NULL DEFAULT 25.00,
  level class_level NOT NULL DEFAULT 'beginner',
  type text NOT NULL DEFAULT 'Hatha',
  location text NOT NULL DEFAULT 'Studio A',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES yoga_classes(id) ON DELETE CASCADE,
  booking_date timestamptz DEFAULT now(),
  status booking_status NOT NULL DEFAULT 'confirmed',
  created_at timestamptz DEFAULT now(),
  UNIQUE(student_id, class_id)
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE yoga_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Yoga classes policies
CREATE POLICY "Anyone can view yoga classes"
  ON yoga_classes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers can create classes"
  ON yoga_classes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'teacher'
    )
    AND teacher_id = auth.uid()
  );

CREATE POLICY "Teachers can update own classes"
  ON yoga_classes
  FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own classes"
  ON yoga_classes
  FOR DELETE
  TO authenticated
  USING (teacher_id = auth.uid());

-- Bookings policies
CREATE POLICY "Students can view own bookings"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students can create own bookings"
  ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'student'
    )
  );

CREATE POLICY "Students can update own bookings"
  ON bookings
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can view bookings for their classes"
  ON bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM yoga_classes
      WHERE yoga_classes.id = bookings.class_id
      AND yoga_classes.teacher_id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_yoga_classes_updated_at
  BEFORE UPDATE ON yoga_classes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();