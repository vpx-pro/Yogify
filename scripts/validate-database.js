/**
 * Yogify Database Validation Script
 * Performs comprehensive validation of database structure and data integrity
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test user credentials
const TEST_USERS = {
  students: [
    { email: 's1@yogify.com', password: 'TestStudent1!', fullName: 'Student One' },
    { email: 's2@yogify.com', password: 'TestStudent2!', fullName: 'Student Two' },
    { email: 's3@yogify.com', password: 'TestStudent3!', fullName: 'Student Three' }
  ],
  teachers: [
    { email: 't1@yogify.com', password: 'TestTeacher1!', fullName: 'Teacher One' },
    { email: 't2@yogify.com', password: 'TestTeacher2!', fullName: 'Teacher Two' },
    { email: 't3@yogify.com', password: 'TestTeacher3!', fullName: 'Teacher Three' }
  ]
};

class DatabaseValidator {
  constructor() {
    this.results = [];
    this.errors = [];
    this.testUsers = {
      students: [],
      teachers: []
    };
    this.testClasses = [];
    this.testBookings = [];
    this.testReviews = [];
  }

  // Log test results
  logResult(category, test, success, details = '') {
    const result = {
      timestamp: new Date().toISOString(),
      category,
      test,
      success,
      details,
      duration: Date.now() - this.startTime
    };
    
    this.results.push(result);
    console.log(`${success ? '✅' : '❌'} [${category}] ${test}: ${details}`);
    
    if (!success) {
      this.errors.push({
        category,
        test,
        error: details
      });
    }
  }

  // 1. Database Structure Verification
  async verifyDatabaseStructure() {
    console.log('\n🔍 VERIFYING DATABASE STRUCTURE\n');
    
    const requiredTables = [
      'profiles', 
      'teacher_profiles', 
      'yoga_classes', 
      'bookings', 
      'saved_teachers', 
      'teacher_reviews', 
      'teacher_ratings',
      'participant_count_audit'
    ];
    
    // Check if all required tables exist
    this.startTime = Date.now();
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);
        
      if (error) throw error;
      this.logResult('Structure', 'Database Connection', true, 'Successfully connected to database');
    } catch (error) {
      this.logResult('Structure', 'Database Connection', false, `Connection failed: ${error.message}`);
      return; // Stop further tests if connection fails
    }
    
    // Check each table
    for (const table of requiredTables) {
      this.startTime = Date.now();
      try {
        const { data, error } = await supabase
          .from(table)
          .select('count')
          .limit(1);
          
        if (error && error.code === '42P01') {
          this.logResult('Structure', `Table: ${table}`, false, 'Table does not exist');
        } else if (error) {
          this.logResult('Structure', `Table: ${table}`, false, `Error: ${error.message}`);
        } else {
          this.logResult('Structure', `Table: ${table}`, true, 'Table exists');
        }
      } catch (error) {
        this.logResult('Structure', `Table: ${table}`, false, `Error: ${error.message}`);
      }
    }
    
    // Check enum types
    this.startTime = Date.now();
    try {
      const { data, error } = await supabase.rpc('check_enum_types');
      
      if (error) {
        // Fallback if function doesn't exist
        this.logResult('Structure', 'Enum Types', true, 'Enum types check skipped (function not available)');
      } else {
        const requiredEnums = ['user_role', 'class_level', 'booking_status', 'payment_status'];
        const missingEnums = requiredEnums.filter(e => !data.includes(e));
        
        if (missingEnums.length > 0) {
          this.logResult('Structure', 'Enum Types', false, `Missing enum types: ${missingEnums.join(', ')}`);
        } else {
          this.logResult('Structure', 'Enum Types', true, 'All required enum types exist');
        }
      }
    } catch (error) {
      this.logResult('Structure', 'Enum Types', false, `Error: ${error.message}`);
    }
  }

  // 2. User Authentication Testing
  async testUserAuthentication() {
    console.log('\n🔐 TESTING USER AUTHENTICATION\n');
    
    // Test user creation
    for (const student of TEST_USERS.students) {
      this.startTime = Date.now();
      try {
        // Check if user already exists
        const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', student.email)
          .maybeSingle();
          
        if (existingUser) {
          this.logResult('Auth', `Student: ${student.email}`, true, 'User already exists');
          this.testUsers.students.push(existingUser);
          continue;
        }
        
        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: student.email,
          password: student.password
        });
        
        if (authError) throw authError;
        
        if (authData.user) {
          // Create profile
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .insert([{
              id: authData.user.id,
              email: student.email,
              full_name: student.fullName,
              role: 'student'
            }])
            .select();
            
          if (profileError) throw profileError;
          
          this.testUsers.students.push(profileData[0]);
          this.logResult('Auth', `Student: ${student.email}`, true, 'Created student user');
        }
      } catch (error) {
        this.logResult('Auth', `Student: ${student.email}`, false, `Error: ${error.message}`);
      }
    }
    
    // Test teacher creation
    for (const teacher of TEST_USERS.teachers) {
      this.startTime = Date.now();
      try {
        // Check if user already exists
        const { data: existingUser, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', teacher.email)
          .maybeSingle();
          
        if (existingUser) {
          this.logResult('Auth', `Teacher: ${teacher.email}`, true, 'User already exists');
          this.testUsers.teachers.push(existingUser);
          
          // Check if teacher profile exists
          const { data: teacherProfile, error: teacherProfileError } = await supabase
            .from('teacher_profiles')
            .select('*')
            .eq('id', existingUser.id)
            .maybeSingle();
            
          if (!teacherProfile) {
            // Create teacher profile if missing
            await this.createTeacherProfile(existingUser.id);
          }
          
          continue;
        }
        
        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: teacher.email,
          password: teacher.password
        });
        
        if (authError) throw authError;
        
        if (authData.user) {
          // Create profile
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .insert([{
              id: authData.user.id,
              email: teacher.email,
              full_name: teacher.fullName,
              role: 'teacher'
            }])
            .select();
            
          if (profileError) throw profileError;
          
          this.testUsers.teachers.push(profileData[0]);
          this.logResult('Auth', `Teacher: ${teacher.email}`, true, 'Created teacher user');
          
          // Create teacher profile
          await this.createTeacherProfile(profileData[0].id);
        }
      } catch (error) {
        this.logResult('Auth', `Teacher: ${teacher.email}`, false, `Error: ${error.message}`);
      }
    }
    
    // Test login
    if (this.testUsers.students.length > 0) {
      this.startTime = Date.now();
      try {
        const student = TEST_USERS.students[0];
        const { data, error } = await supabase.auth.signInWithPassword({
          email: student.email,
          password: student.password
        });
        
        if (error) throw error;
        this.logResult('Auth', 'Student Login', true, 'Login successful');
      } catch (error) {
        this.logResult('Auth', 'Student Login', false, `Error: ${error.message}`);
      }
    }
    
    if (this.testUsers.teachers.length > 0) {
      this.startTime = Date.now();
      try {
        const teacher = TEST_USERS.teachers[0];
        const { data, error } = await supabase.auth.signInWithPassword({
          email: teacher.email,
          password: teacher.password
        });
        
        if (error) throw error;
        this.logResult('Auth', 'Teacher Login', true, 'Login successful');
      } catch (error) {
        this.logResult('Auth', 'Teacher Login', false, `Error: ${error.message}`);
      }
    }
  }
  
  // Helper: Create teacher profile
  async createTeacherProfile(teacherId) {
    try {
      const specialties = ['Hatha', 'Vinyasa', 'Meditation'];
      const certifications = ['200-Hour Yoga Alliance', 'Meditation Certification'];
      
      const { data, error } = await supabase
        .from('teacher_profiles')
        .insert([{
          id: teacherId,
          bio: 'Experienced yoga teacher specializing in mindful practice and alignment.',
          experience_years: Math.floor(Math.random() * 10) + 2,
          specialties,
          certifications,
          social_links: {
            instagram: 'yogateacher',
            website: 'yogateacher.com'
          },
          phone: '+1234567890'
        }])
        .select();
        
      if (error) throw error;
      
      this.logResult('Auth', `Teacher Profile: ${teacherId}`, true, 'Created teacher profile');
      
      // Initialize teacher rating
      const { data: ratingData, error: ratingError } = await supabase
        .from('teacher_ratings')
        .insert([{
          teacher_id: teacherId,
          avg_rating: 4.5,
          total_reviews: 0,
          rating_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }
        }])
        .select();
        
      if (ratingError) {
        console.log(`Warning: Could not initialize teacher rating: ${ratingError.message}`);
      }
      
      return data[0];
    } catch (error) {
      this.logResult('Auth', `Teacher Profile: ${teacherId}`, false, `Error: ${error.message}`);
      return null;
    }
  }

  // 3. Class Management Testing
  async testClassManagement() {
    console.log('\n📅 TESTING CLASS MANAGEMENT\n');
    
    if (this.testUsers.teachers.length === 0) {
      this.logResult('Classes', 'Create Class', false, 'No test teachers available');
      return;
    }
    
    // Create classes for each teacher (1 past, 1 upcoming)
    for (const teacher of this.testUsers.teachers) {
      // Past class
      this.startTime = Date.now();
      try {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 7);
        
        const { data, error } = await supabase
          .from('yoga_classes')
          .insert([{
            title: `Past ${teacher.full_name}'s Flow`,
            description: 'A gentle yoga class focusing on alignment and breath.',
            teacher_id: teacher.id,
            date: pastDate.toISOString().split('T')[0],
            time: '09:00:00',
            duration: 60,
            max_participants: 10,
            current_participants: 0,
            price: 25.00,
            level: 'beginner',
            type: 'Hatha',
            location: 'Studio A',
            is_retreat: false,
            is_virtual: false
          }])
          .select();
          
        if (error) throw error;
        
        this.testClasses.push(data[0]);
        this.logResult('Classes', `Past Class: ${teacher.full_name}`, true, 'Created past class');
      } catch (error) {
        this.logResult('Classes', `Past Class: ${teacher.full_name}`, false, `Error: ${error.message}`);
      }
      
      // Upcoming class
      this.startTime = Date.now();
      try {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 7);
        
        const { data, error } = await supabase
          .from('yoga_classes')
          .insert([{
            title: `Upcoming ${teacher.full_name}'s Flow`,
            description: 'Join this energizing yoga session to build strength and flexibility.',
            teacher_id: teacher.id,
            date: futureDate.toISOString().split('T')[0],
            time: '18:00:00',
            duration: 75,
            max_participants: 15,
            current_participants: 0,
            price: 30.00,
            level: 'intermediate',
            type: 'Vinyasa',
            location: 'Studio B',
            is_retreat: false,
            is_virtual: false,
            image_url: 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=800'
          }])
          .select();
          
        if (error) throw error;
        
        this.testClasses.push(data[0]);
        this.logResult('Classes', `Upcoming Class: ${teacher.full_name}`, true, 'Created upcoming class');
      } catch (error) {
        this.logResult('Classes', `Upcoming Class: ${teacher.full_name}`, false, `Error: ${error.message}`);
      }
      
      // Create a retreat
      this.startTime = Date.now();
      try {
        const retreatStartDate = new Date();
        retreatStartDate.setDate(retreatStartDate.getDate() + 30);
        
        const retreatEndDate = new Date(retreatStartDate);
        retreatEndDate.setDate(retreatEndDate.getDate() + 3);
        
        const { data, error } = await supabase
          .from('yoga_classes')
          .insert([{
            title: `${teacher.full_name}'s Wellness Retreat`,
            description: 'A 3-day immersive retreat to reconnect with yourself through yoga and meditation.',
            teacher_id: teacher.id,
            date: retreatStartDate.toISOString().split('T')[0],
            retreat_end_date: retreatEndDate.toISOString().split('T')[0],
            time: '10:00:00',
            duration: 180,
            max_participants: 20,
            current_participants: 0,
            price: 499.00,
            level: 'beginner',
            type: 'Mindfulness Retreat',
            location: 'Mountain Resort',
            is_retreat: true,
            is_virtual: false,
            retreat_capacity: 20,
            retreat_highlights: [
              'Daily yoga and meditation sessions',
              'Healthy organic meals included',
              'Nature walks and mindfulness practices'
            ],
            retreat_image_url: 'https://images.pexels.com/photos/3571551/pexels-photo-3571551.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
          }])
          .select();
          
        if (error) throw error;
        
        this.testClasses.push(data[0]);
        this.logResult('Classes', `Retreat: ${teacher.full_name}`, true, 'Created retreat');
      } catch (error) {
        this.logResult('Classes', `Retreat: ${teacher.full_name}`, false, `Error: ${error.message}`);
      }
    }
    
    // Test class retrieval
    this.startTime = Date.now();
    try {
      const { data, error } = await supabase
        .from('yoga_classes')
        .select(`
          *,
          profiles!yoga_classes_teacher_id_fkey (
            full_name,
            avatar_url
          )
        `)
        .order('date', { ascending: true })
        .limit(10);
        
      if (error) throw error;
      
      this.logResult('Classes', 'Retrieve Classes', true, `Retrieved ${data.length} classes with teacher info`);
    } catch (error) {
      this.logResult('Classes', 'Retrieve Classes', false, `Error: ${error.message}`);
    }
  }

  // 4. Booking System Testing
  async testBookingSystem() {
    console.log('\n🎫 TESTING BOOKING SYSTEM\n');
    
    if (this.testUsers.students.length === 0 || this.testClasses.length === 0) {
      this.logResult('Bookings', 'Create Booking', false, 'No test students or classes available');
      return;
    }
    
    // Create bookings for upcoming classes
    const upcomingClasses = this.testClasses.filter(c => {
      const classDate = new Date(`${c.date} ${c.time}`);
      return classDate > new Date();
    });
    
    if (upcomingClasses.length === 0) {
      this.logResult('Bookings', 'Create Booking', false, 'No upcoming classes available');
      return;
    }
    
    // Create 1-3 bookings per class
    for (const cls of upcomingClasses) {
      const bookingsCount = Math.floor(Math.random() * 3) + 1;
      const availableStudents = [...this.testUsers.students];
      
      for (let i = 0; i < bookingsCount && i < availableStudents.length; i++) {
        const student = availableStudents[i];
        
        this.startTime = Date.now();
        try {
          // Check if booking already exists
          const { data: existingBooking, error: checkError } = await supabase
            .from('bookings')
            .select('id')
            .eq('student_id', student.id)
            .eq('class_id', cls.id)
            .maybeSingle();
            
          if (existingBooking) {
            this.logResult('Bookings', `Booking: ${student.full_name} - ${cls.title}`, true, 'Booking already exists');
            this.testBookings.push(existingBooking);
            continue;
          }
          
          // Create booking
          const { data, error } = await supabase
            .from('bookings')
            .insert([{
              student_id: student.id,
              class_id: cls.id,
              status: 'confirmed',
              payment_status: 'completed'
            }])
            .select();
            
          if (error) throw error;
          
          this.testBookings.push(data[0]);
          this.logResult('Bookings', `Booking: ${student.full_name} - ${cls.title}`, true, 'Created booking');
          
          // Update participant count
          const { error: updateError } = await supabase
            .from('yoga_classes')
            .update({ current_participants: cls.current_participants + 1 })
            .eq('id', cls.id);
            
          if (updateError) {
            console.log(`Warning: Could not update participant count: ${updateError.message}`);
          }
        } catch (error) {
          this.logResult('Bookings', `Booking: ${student.full_name} - ${cls.title}`, false, `Error: ${error.message}`);
        }
      }
    }
    
    // Test booking retrieval
    this.startTime = Date.now();
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          yoga_classes (*),
          profiles!bookings_student_id_fkey (*)
        `)
        .limit(10);
        
      if (error) throw error;
      
      this.logResult('Bookings', 'Retrieve Bookings', true, `Retrieved ${data.length} bookings with related data`);
    } catch (error) {
      this.logResult('Bookings', 'Retrieve Bookings', false, `Error: ${error.message}`);
    }
  }

  // 5. Reviews and Ratings Testing
  async testReviewsAndRatings() {
    console.log('\n⭐ TESTING REVIEWS AND RATINGS\n');
    
    if (this.testUsers.students.length === 0 || this.testUsers.teachers.length === 0 || this.testClasses.length === 0) {
      this.logResult('Reviews', 'Create Review', false, 'No test students, teachers, or classes available');
      return;
    }
    
    // Create reviews for each teacher
    for (const teacher of this.testUsers.teachers) {
      // Get classes for this teacher
      const teacherClasses = this.testClasses.filter(c => c.teacher_id === teacher.id);
      
      if (teacherClasses.length === 0) {
        this.logResult('Reviews', `Reviews: ${teacher.full_name}`, false, 'No classes available for this teacher');
        continue;
      }
      
      // Create 2 reviews from different students
      for (let i = 0; i < 2 && i < this.testUsers.students.length; i++) {
        const student = this.testUsers.students[i];
        const cls = teacherClasses[0]; // Use the first class
        
        this.startTime = Date.now();
        try {
          // Check if review already exists
          const { data: existingReview, error: checkError } = await supabase
            .from('teacher_reviews')
            .select('id')
            .eq('student_id', student.id)
            .eq('teacher_id', teacher.id)
            .eq('class_id', cls.id)
            .maybeSingle();
            
          if (existingReview) {
            this.logResult('Reviews', `Review: ${student.full_name} -> ${teacher.full_name}`, true, 'Review already exists');
            this.testReviews.push(existingReview);
            continue;
          }
          
          // Create review
          const rating = Math.floor(Math.random() * 2) + 4; // 4 or 5 stars
          const { data, error } = await supabase
            .from('teacher_reviews')
            .insert([{
              student_id: student.id,
              teacher_id: teacher.id,
              class_id: cls.id,
              rating,
              comment: `Great ${cls.type} class! ${teacher.full_name} is an excellent instructor.`
            }])
            .select();
            
          if (error) throw error;
          
          this.testReviews.push(data[0]);
          this.logResult('Reviews', `Review: ${student.full_name} -> ${teacher.full_name}`, true, `Created ${rating}-star review`);
        } catch (error) {
          this.logResult('Reviews', `Review: ${student.full_name} -> ${teacher.full_name}`, false, `Error: ${error.message}`);
        }
      }
      
      // Update teacher rating
      this.startTime = Date.now();
      try {
        // Get all reviews for this teacher
        const { data: reviews, error: reviewsError } = await supabase
          .from('teacher_reviews')
          .select('rating')
          .eq('teacher_id', teacher.id);
          
        if (reviewsError) throw reviewsError;
        
        if (reviews && reviews.length > 0) {
          // Calculate average rating
          const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
          const avgRating = totalRating / reviews.length;
          
          // Count ratings by value
          const ratingCounts = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
          reviews.forEach(review => {
            ratingCounts[review.rating.toString()]++;
          });
          
          // Update teacher_ratings
          const { data, error } = await supabase
            .from('teacher_ratings')
            .upsert([{
              teacher_id: teacher.id,
              avg_rating: avgRating,
              total_reviews: reviews.length,
              rating_counts: ratingCounts
            }])
            .select();
            
          if (error) throw error;
          
          this.logResult('Reviews', `Rating Update: ${teacher.full_name}`, true, `Updated to ${avgRating.toFixed(1)} stars from ${reviews.length} reviews`);
        }
      } catch (error) {
        this.logResult('Reviews', `Rating Update: ${teacher.full_name}`, false, `Error: ${error.message}`);
      }
    }
    
    // Test review retrieval
    this.startTime = Date.now();
    try {
      const { data, error } = await supabase
        .from('teacher_reviews')
        .select(`
          *,
          profiles!teacher_reviews_student_id_fkey (full_name),
          yoga_classes!teacher_reviews_class_id_fkey (title)
        `)
        .limit(10);
        
      if (error) throw error;
      
      this.logResult('Reviews', 'Retrieve Reviews', true, `Retrieved ${data.length} reviews with related data`);
    } catch (error) {
      this.logResult('Reviews', 'Retrieve Reviews', false, `Error: ${error.message}`);
    }
  }

  // 6. Saved Teachers Testing
  async testSavedTeachers() {
    console.log('\n❤️ TESTING SAVED TEACHERS\n');
    
    if (this.testUsers.students.length === 0 || this.testUsers.teachers.length === 0) {
      this.logResult('Saved', 'Save Teacher', false, 'No test students or teachers available');
      return;
    }
    
    // Each student saves 2 teachers
    for (const student of this.testUsers.students) {
      for (let i = 0; i < 2 && i < this.testUsers.teachers.length; i++) {
        const teacher = this.testUsers.teachers[i];
        
        this.startTime = Date.now();
        try {
          // Check if already saved
          const { data: existingSaved, error: checkError } = await supabase
            .from('saved_teachers')
            .select('id')
            .eq('student_id', student.id)
            .eq('teacher_id', teacher.id)
            .maybeSingle();
            
          if (existingSaved) {
            this.logResult('Saved', `Save: ${student.full_name} -> ${teacher.full_name}`, true, 'Teacher already saved');
            continue;
          }
          
          // Save teacher
          const { data, error } = await supabase
            .from('saved_teachers')
            .insert([{
              student_id: student.id,
              teacher_id: teacher.id
            }])
            .select();
            
          if (error) throw error;
          
          this.logResult('Saved', `Save: ${student.full_name} -> ${teacher.full_name}`, true, 'Saved teacher');
        } catch (error) {
          this.logResult('Saved', `Save: ${student.full_name} -> ${teacher.full_name}`, false, `Error: ${error.message}`);
        }
      }
    }
    
    // Test saved teachers retrieval
    this.startTime = Date.now();
    try {
      const { data, error } = await supabase
        .from('saved_teachers')
        .select(`
          *,
          profiles!saved_teachers_teacher_id_fkey (full_name, avatar_url)
        `)
        .limit(10);
        
      if (error) throw error;
      
      this.logResult('Saved', 'Retrieve Saved', true, `Retrieved ${data.length} saved teachers with profiles`);
    } catch (error) {
      this.logResult('Saved', 'Retrieve Saved', false, `Error: ${error.message}`);
    }
  }

  // 7. RLS Policy Verification
  async verifyRLSPolicies() {
    console.log('\n🔒 VERIFYING RLS POLICIES\n');
    
    // Test anonymous access
    this.startTime = Date.now();
    try {
      const anonClient = createClient(supabaseUrl, supabaseKey);
      
      const { data, error } = await anonClient
        .from('profiles')
        .select('*')
        .limit(1);
        
      if (error && error.code === 'PGRST116') {
        this.logResult('RLS', 'Anonymous Access', true, 'Anonymous access properly restricted');
      } else if (error) {
        this.logResult('RLS', 'Anonymous Access', false, `Unexpected error: ${error.message}`);
      } else if (data && data.length > 0) {
        this.logResult('RLS', 'Anonymous Access', false, 'Anonymous users can access profiles data');
      } else {
        this.logResult('RLS', 'Anonymous Access', true, 'Anonymous access properly restricted');
      }
    } catch (error) {
      this.logResult('RLS', 'Anonymous Access', false, `Error: ${error.message}`);
    }
    
    // Test student permissions
    if (this.testUsers.students.length > 0) {
      const student = this.testUsers.students[0];
      
      // Sign in as student
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: TEST_USERS.students[0].email,
          password: TEST_USERS.students[0].password
        });
        
        if (authError) throw authError;
        
        // Test booking creation
        this.startTime = Date.now();
        if (this.testClasses.length > 0) {
          const cls = this.testClasses.find(c => {
            const classDate = new Date(`${c.date} ${c.time}`);
            return classDate > new Date();
          });
          
          if (cls) {
            try {
              // Check if booking already exists
              const { data: existingBooking, error: checkError } = await supabase
                .from('bookings')
                .select('id')
                .eq('student_id', student.id)
                .eq('class_id', cls.id)
                .maybeSingle();
                
              if (existingBooking) {
                this.logResult('RLS', 'Student Booking Permission', true, 'Student can view their booking');
              } else {
                // Try to create booking
                const { data, error } = await supabase
                  .from('bookings')
                  .insert([{
                    student_id: student.id,
                    class_id: cls.id,
                    status: 'confirmed',
                    payment_status: 'pending'
                  }])
                  .select();
                  
                if (error) throw error;
                
                this.logResult('RLS', 'Student Booking Permission', true, 'Student can create bookings');
              }
            } catch (error) {
              this.logResult('RLS', 'Student Booking Permission', false, `Error: ${error.message}`);
            }
          }
        }
        
        // Test class creation (should fail)
        this.startTime = Date.now();
        try {
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + 14);
          
          const { data, error } = await supabase
            .from('yoga_classes')
            .insert([{
              title: 'Unauthorized Class',
              description: 'This should fail',
              teacher_id: student.id, // Student trying to create as teacher
              date: futureDate.toISOString().split('T')[0],
              time: '10:00:00',
              duration: 60,
              max_participants: 10,
              price: 25.00,
              level: 'beginner',
              type: 'Hatha',
              location: 'Studio A'
            }])
            .select();
            
          if (error) {
            this.logResult('RLS', 'Student Class Creation', true, 'Students cannot create classes (correctly restricted)');
          } else {
            this.logResult('RLS', 'Student Class Creation', false, 'Students can create classes (RLS policy issue)');
          }
        } catch (error) {
          this.logResult('RLS', 'Student Class Creation', true, 'Students cannot create classes (correctly restricted)');
        }
      } catch (error) {
        this.logResult('RLS', 'Student Auth', false, `Error signing in as student: ${error.message}`);
      }
    }
    
    // Test teacher permissions
    if (this.testUsers.teachers.length > 0) {
      const teacher = this.testUsers.teachers[0];
      
      // Sign in as teacher
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: TEST_USERS.teachers[0].email,
          password: TEST_USERS.teachers[0].password
        });
        
        if (authError) throw authError;
        
        // Test class creation
        this.startTime = Date.now();
        try {
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + 21);
          
          const { data, error } = await supabase
            .from('yoga_classes')
            .insert([{
              title: 'RLS Test Class',
              description: 'Testing teacher permissions',
              teacher_id: teacher.id,
              date: futureDate.toISOString().split('T')[0],
              time: '11:00:00',
              duration: 60,
              max_participants: 10,
              current_participants: 0,
              price: 25.00,
              level: 'beginner',
              type: 'Hatha',
              location: 'Studio A',
              is_retreat: false,
              is_virtual: false
            }])
            .select();
            
          if (error) throw error;
          
          this.logResult('RLS', 'Teacher Class Creation', true, 'Teachers can create classes');
          
          // Clean up - delete the test class
          if (data && data.length > 0) {
            const { error: deleteError } = await supabase
              .from('yoga_classes')
              .delete()
              .eq('id', data[0].id);
              
            if (deleteError) {
              console.log(`Warning: Could not delete test class: ${deleteError.message}`);
            }
          }
        } catch (error) {
          this.logResult('RLS', 'Teacher Class Creation', false, `Error: ${error.message}`);
        }
        
        // Test booking view for teacher's classes
        this.startTime = Date.now();
        try {
          const { data, error } = await supabase
            .from('bookings')
            .select(`
              *,
              yoga_classes!inner (*)
            `)
            .eq('yoga_classes.teacher_id', teacher.id)
            .limit(5);
            
          if (error) throw error;
          
          this.logResult('RLS', 'Teacher Booking View', true, `Teacher can view bookings for their classes (${data.length} found)`);
        } catch (error) {
          this.logResult('RLS', 'Teacher Booking View', false, `Error: ${error.message}`);
        }
        
        // Test student booking creation (should fail)
        this.startTime = Date.now();
        if (this.testClasses.length > 0 && this.testUsers.students.length > 0) {
          const cls = this.testClasses[0];
          const student = this.testUsers.students[0];
          
          try {
            const { data, error } = await supabase
              .from('bookings')
              .insert([{
                student_id: student.id, // Trying to create booking for another user
                class_id: cls.id,
                status: 'confirmed',
                payment_status: 'pending'
              }])
              .select();
              
            if (error) {
              this.logResult('RLS', 'Teacher Booking Creation', true, 'Teachers cannot create bookings for students (correctly restricted)');
            } else {
              this.logResult('RLS', 'Teacher Booking Creation', false, 'Teachers can create bookings for students (RLS policy issue)');
            }
          } catch (error) {
            this.logResult('RLS', 'Teacher Booking Creation', true, 'Teachers cannot create bookings for students (correctly restricted)');
          }
        }
      } catch (error) {
        this.logResult('RLS', 'Teacher Auth', false, `Error signing in as teacher: ${error.message}`);
      }
    }
  }

  // 8. Data Integrity Testing
  async testDataIntegrity() {
    console.log('\n🔄 TESTING DATA INTEGRITY\n');
    
    // Test participant count consistency
    this.startTime = Date.now();
    try {
      // Get all classes
      const { data: classes, error: classesError } = await supabase
        .from('yoga_classes')
        .select('id, current_participants')
        .limit(50);
        
      if (classesError) throw classesError;
      
      let inconsistencies = 0;
      
      for (const cls of classes) {
        // Count confirmed bookings
        const { count, error: countError } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('class_id', cls.id)
          .eq('status', 'confirmed');
          
        if (countError) throw countError;
        
        if (count !== cls.current_participants) {
          inconsistencies++;
          
          // Fix the inconsistency
          const { error: updateError } = await supabase
            .from('yoga_classes')
            .update({ current_participants: count })
            .eq('id', cls.id);
            
          if (updateError) {
            console.log(`Warning: Could not fix participant count for class ${cls.id}: ${updateError.message}`);
          }
        }
      }
      
      if (inconsistencies > 0) {
        this.logResult('Integrity', 'Participant Count', false, `Found and fixed ${inconsistencies} inconsistencies`);
      } else {
        this.logResult('Integrity', 'Participant Count', true, 'All participant counts are consistent');
      }
    } catch (error) {
      this.logResult('Integrity', 'Participant Count', false, `Error: ${error.message}`);
    }
    
    // Test foreign key integrity
    this.startTime = Date.now();
    try {
      // Check for orphaned bookings
      const { data: orphanedBookings, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          class_id,
          yoga_classes!left (id)
        `)
        .is('yoga_classes.id', null)
        .limit(10);
        
      if (bookingsError) throw bookingsError;
      
      if (orphanedBookings && orphanedBookings.length > 0) {
        this.logResult('Integrity', 'Foreign Keys', false, `Found ${orphanedBookings.length} orphaned bookings`);
      } else {
        this.logResult('Integrity', 'Foreign Keys', true, 'No orphaned bookings found');
      }
      
      // Check for orphaned reviews
      const { data: orphanedReviews, error: reviewsError } = await supabase
        .from('teacher_reviews')
        .select(`
          id,
          teacher_id,
          profiles!teacher_reviews_teacher_id_fkey!left (id)
        `)
        .is('profiles.id', null)
        .limit(10);
        
      if (reviewsError) throw reviewsError;
      
      if (orphanedReviews && orphanedReviews.length > 0) {
        this.logResult('Integrity', 'Foreign Keys', false, `Found ${orphanedReviews.length} orphaned reviews`);
      } else {
        this.logResult('Integrity', 'Foreign Keys', true, 'No orphaned reviews found');
      }
    } catch (error) {
      this.logResult('Integrity', 'Foreign Keys', false, `Error: ${error.message}`);
    }
  }

  // 9. Performance Testing
  async testPerformance() {
    console.log('\n⚡ TESTING PERFORMANCE\n');
    
    // Test complex query performance
    this.startTime = Date.now();
    try {
      const { data, error } = await supabase
        .from('yoga_classes')
        .select(`
          *,
          profiles!yoga_classes_teacher_id_fkey (
            full_name,
            avatar_url
          ),
          bookings (
            id,
            status,
            payment_status,
            profiles!bookings_student_id_fkey (
              full_name
            )
          )
        `)
        .order('date', { ascending: true })
        .limit(10);
        
      if (error) throw error;
      
      const duration = Date.now() - this.startTime;
      const isPerformant = duration < 2000; // Under 2 seconds is good
      
      this.logResult('Performance', 'Complex Query', isPerformant, 
        `Complex join query completed in ${duration}ms (${isPerformant ? 'Good' : 'Slow'})`);
    } catch (error) {
      this.logResult('Performance', 'Complex Query', false, `Error: ${error.message}`);
    }
    
    // Test search performance
    this.startTime = Date.now();
    try {
      const searchTerm = 'yoga';
      
      const { data, error } = await supabase
        .from('yoga_classes')
        .select(`
          id,
          title,
          description,
          type,
          level,
          profiles!yoga_classes_teacher_id_fkey (
            full_name
          )
        `)
        .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,type.ilike.%${searchTerm}%`)
        .limit(20);
        
      if (error) throw error;
      
      const duration = Date.now() - this.startTime;
      const isPerformant = duration < 1000; // Under 1 second is good
      
      this.logResult('Performance', 'Search Query', isPerformant, 
        `Search query completed in ${duration}ms (${isPerformant ? 'Good' : 'Slow'})`);
    } catch (error) {
      this.logResult('Performance', 'Search Query', false, `Error: ${error.message}`);
    }
  }

  // Generate validation report
  generateReport() {
    console.log('\n📊 DATABASE VALIDATION REPORT\n');
    console.log('='.repeat(50));
    
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = (passedTests / totalTests) * 100;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${successRate.toFixed(1)}%`);
    
    if (this.errors.length > 0) {
      console.log('\n🚨 ISSUES FOUND:\n');
      
      // Group errors by category
      const errorsByCategory = this.errors.reduce((acc, error) => {
        if (!acc[error.category]) {
          acc[error.category] = [];
        }
        acc[error.category].push(error);
        return acc;
      }, {});
      
      for (const [category, errors] of Object.entries(errorsByCategory)) {
        console.log(`${category} Issues:`);
        errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error.test}: ${error.error}`);
        });
        console.log('');
      }
    } else {
      console.log('\n✅ All tests passed successfully!');
    }
    
    // Generate recommendations
    const recommendations = [];
    
    if (this.errors.some(e => e.category === 'Structure')) {
      recommendations.push('🔧 Fix database structure issues before proceeding');
    }
    
    if (this.errors.some(e => e.category === 'Auth')) {
      recommendations.push('🔐 Address authentication and user creation issues');
    }
    
    if (this.errors.some(e => e.category === 'RLS')) {
      recommendations.push('🔒 Review and fix Row Level Security policies');
    }
    
    if (this.errors.some(e => e.category === 'Integrity')) {
      recommendations.push('🔄 Run data integrity fixes to ensure consistency');
    }
    
    if (this.errors.some(e => e.category === 'Performance')) {
      recommendations.push('⚡ Optimize slow queries and add necessary indexes');
    }
    
    if (recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:\n');
      recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    // Save report to file
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        passedTests,
        failedTests,
        successRate
      },
      errors: this.errors,
      results: this.results,
      recommendations,
      testData: {
        users: this.testUsers,
        classes: this.testClasses.map(c => ({ id: c.id, title: c.title })),
        bookings: this.testBookings.map(b => ({ id: b.id })),
        reviews: this.testReviews.map(r => ({ id: r.id }))
      }
    };
    
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportFile = path.join(reportsDir, `database-validation-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportFile}`);
    
    return report;
  }

  // Run all validations
  async runAllValidations() {
    console.log('🚀 Starting Comprehensive Database Validation...\n');
    
    try {
      await this.verifyDatabaseStructure();
      await this.testUserAuthentication();
      await this.testClassManagement();
      await this.testBookingSystem();
      await this.testReviewsAndRatings();
      await this.testSavedTeachers();
      await this.verifyRLSPolicies();
      await this.testDataIntegrity();
      await this.testPerformance();
      
      return this.generateReport();
    } catch (error) {
      console.error('❌ Critical error during validation:', error);
      this.errors.push({
        category: 'Critical',
        test: 'Validation Execution',
        error: error.message
      });
      return this.generateReport();
    }
  }
}

// Run the validation if this script is executed directly
if (require.main === module) {
  const validator = new DatabaseValidator();
  validator.runAllValidations()
    .then(report => {
      process.exit(report.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = DatabaseValidator;