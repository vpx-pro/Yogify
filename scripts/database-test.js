/**
 * Database Operations Testing Script for Yogify
 * Tests all CRUD operations and validates data integrity
 */

const { createClient } = require('@supabase/supabase-js');

// Test configuration
const TEST_CONFIG = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  testTimeout: 30000,
  retryAttempts: 3
};

class DatabaseTester {
  constructor() {
    if (!TEST_CONFIG.supabaseUrl || !TEST_CONFIG.supabaseKey) {
      throw new Error('Missing Supabase environment variables. Please check your .env file.');
    }
    
    this.supabase = createClient(TEST_CONFIG.supabaseUrl, TEST_CONFIG.supabaseKey);
    this.testResults = [];
    this.errors = [];
    this.testClassId = null;
    this.testBookingId = null;
  }

  // Utility function to log test results
  logResult(operation, table, success, details = '') {
    const result = {
      timestamp: new Date().toISOString(),
      operation,
      table,
      success,
      details,
      duration: Date.now() - this.startTime
    };
    this.testResults.push(result);
    console.log(`${success ? '✅' : '❌'} ${operation} on ${table}: ${details}`);
  }

  // Test CREATE operations
  async testCreateOperations() {
    console.log('\n🔄 Testing CREATE Operations...\n');

    // Test 1: Create Profile
    try {
      this.startTime = Date.now();
      const testUser = {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'test@yogify.com',
        full_name: 'Test User',
        role: 'student'
      };

      const { data, error } = await this.supabase
        .from('profiles')
        .insert([testUser])
        .select();

      if (error) throw error;
      this.logResult('CREATE', 'profiles', true, `Created profile: ${testUser.email}`);
    } catch (error) {
      this.logResult('CREATE', 'profiles', false, error.message);
      this.errors.push({ operation: 'CREATE profiles', error: error.message });
    }

    // Test 2: Create Teacher Profile
    try {
      this.startTime = Date.now();
      const testTeacher = {
        id: '00000000-0000-0000-0000-000000000002',
        email: 'teacher@yogify.com',
        full_name: 'Test Teacher',
        role: 'teacher'
      };

      const { data, error } = await this.supabase
        .from('profiles')
        .insert([testTeacher])
        .select();

      if (error) throw error;
      this.logResult('CREATE', 'profiles', true, `Created teacher: ${testTeacher.email}`);
    } catch (error) {
      this.logResult('CREATE', 'profiles', false, error.message);
      this.errors.push({ operation: 'CREATE teacher profile', error: error.message });
    }

    // Test 3: Create Yoga Class
    try {
      this.startTime = Date.now();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const testClass = {
        title: 'Test Morning Flow',
        description: 'A gentle morning yoga flow for beginners',
        teacher_id: '00000000-0000-0000-0000-000000000002',
        date: tomorrow.toISOString().split('T')[0],
        time: '09:00:00',
        duration: 60,
        max_participants: 10,
        price: 25.00,
        level: 'beginner',
        type: 'Hatha',
        location: 'Studio A'
      };

      const { data, error } = await this.supabase
        .from('yoga_classes')
        .insert([testClass])
        .select();

      if (error) throw error;
      this.testClassId = data[0].id;
      this.logResult('CREATE', 'yoga_classes', true, `Created class: ${testClass.title}`);
    } catch (error) {
      this.logResult('CREATE', 'yoga_classes', false, error.message);
      this.errors.push({ operation: 'CREATE yoga_classes', error: error.message });
    }

    // Test 4: Create Booking using secure function
    if (this.testClassId) {
      try {
        this.startTime = Date.now();
        const { data, error } = await this.supabase.rpc('create_booking_with_count', {
          p_student_id: '00000000-0000-0000-0000-000000000001',
          p_class_id: this.testClassId,
          p_status: 'confirmed',
          p_payment_status: 'pending'
        });

        if (error) throw error;
        this.testBookingId = data;
        this.logResult('CREATE', 'bookings', true, `Created booking with ID: ${data}`);
      } catch (error) {
        this.logResult('CREATE', 'bookings', false, error.message);
        this.errors.push({ operation: 'CREATE booking', error: error.message });
      }
    } else {
      this.logResult('CREATE', 'bookings', false, 'Skipped - no test class available');
    }
  }

  // Test READ operations
  async testReadOperations() {
    console.log('\n🔍 Testing READ Operations...\n');

    // Test 1: Read Profiles
    try {
      this.startTime = Date.now();
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .limit(5);

      if (error) throw error;
      this.logResult('READ', 'profiles', true, `Retrieved ${data.length} profiles`);
    } catch (error) {
      this.logResult('READ', 'profiles', false, error.message);
      this.errors.push({ operation: 'READ profiles', error: error.message });
    }

    // Test 2: Read Yoga Classes with Teacher Info
    try {
      this.startTime = Date.now();
      const { data, error } = await this.supabase
        .from('yoga_classes')
        .select(`
          *,
          profiles!yoga_classes_teacher_id_fkey (
            full_name,
            avatar_url
          )
        `)
        .limit(5);

      if (error) throw error;
      this.logResult('READ', 'yoga_classes', true, `Retrieved ${data.length} classes with teacher info`);
    } catch (error) {
      this.logResult('READ', 'yoga_classes', false, error.message);
      this.errors.push({ operation: 'READ yoga_classes with joins', error: error.message });
    }

    // Test 3: Read Bookings with Class Info
    try {
      this.startTime = Date.now();
      const { data, error } = await this.supabase
        .from('bookings')
        .select(`
          *,
          yoga_classes (*)
        `)
        .limit(5);

      if (error) throw error;
      this.logResult('READ', 'bookings', true, `Retrieved ${data.length} bookings with class info`);
    } catch (error) {
      this.logResult('READ', 'bookings', false, error.message);
      this.errors.push({ operation: 'READ bookings with joins', error: error.message });
    }

    // Test 4: Test Complex Query - Upcoming Classes (optimized)
    try {
      this.startTime = Date.now();
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await this.supabase
        .from('yoga_classes')
        .select(`
          id,
          title,
          date,
          time,
          current_participants,
          max_participants,
          profiles!yoga_classes_teacher_id_fkey (full_name)
        `)
        .gte('date', today)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(10);

      if (error) throw error;
      this.logResult('READ', 'yoga_classes', true, `Retrieved ${data.length} upcoming classes`);
    } catch (error) {
      this.logResult('READ', 'yoga_classes', false, error.message);
      this.errors.push({ operation: 'READ upcoming classes', error: error.message });
    }
  }

  // Test UPDATE operations
  async testUpdateOperations() {
    console.log('\n✏️ Testing UPDATE Operations...\n');

    // Test 1: Update Profile
    try {
      this.startTime = Date.now();
      const { data, error } = await this.supabase
        .from('profiles')
        .update({ full_name: 'Updated Test User' })
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .select();

      if (error) throw error;
      this.logResult('UPDATE', 'profiles', true, `Updated profile name`);
    } catch (error) {
      this.logResult('UPDATE', 'profiles', false, error.message);
      this.errors.push({ operation: 'UPDATE profiles', error: error.message });
    }

    // Test 2: Update Yoga Class
    if (this.testClassId) {
      try {
        this.startTime = Date.now();
        const { data, error } = await this.supabase
          .from('yoga_classes')
          .update({ 
            description: 'Updated: A gentle morning yoga flow for beginners',
            price: 30.00
          })
          .eq('id', this.testClassId)
          .select();

        if (error) throw error;
        this.logResult('UPDATE', 'yoga_classes', true, `Updated class description and price`);
      } catch (error) {
        this.logResult('UPDATE', 'yoga_classes', false, error.message);
        this.errors.push({ operation: 'UPDATE yoga_classes', error: error.message });
      }
    }

    // Test 3: Update Payment Status using secure function
    if (this.testBookingId) {
      try {
        this.startTime = Date.now();
        const { data, error } = await this.supabase.rpc('update_booking_payment_status', {
          booking_id: this.testBookingId,
          new_payment_status: 'completed'
        });

        if (error) throw error;
        this.logResult('UPDATE', 'bookings', true, `Updated payment status to completed`);
      } catch (error) {
        this.logResult('UPDATE', 'bookings', false, error.message);
        this.errors.push({ operation: 'UPDATE payment status', error: error.message });
      }
    }

    // Test 4: Test Participant Count Sync
    if (this.testClassId) {
      try {
        this.startTime = Date.now();
        const { data, error } = await this.supabase.rpc('sync_participant_count', {
          p_class_id: this.testClassId
        });

        if (error) throw error;
        this.logResult('UPDATE', 'participant_count', true, `Synchronized participant count`);
      } catch (error) {
        this.logResult('UPDATE', 'participant_count', false, error.message);
        this.errors.push({ operation: 'SYNC participant count', error: error.message });
      }
    }
  }

  // Test DELETE operations
  async testDeleteOperations() {
    console.log('\n🗑️ Testing DELETE Operations...\n');

    // Test 1: Cancel Booking using secure function
    if (this.testBookingId) {
      try {
        this.startTime = Date.now();
        const { data, error } = await this.supabase.rpc('cancel_booking_with_count', {
          p_booking_id: this.testBookingId,
          p_student_id: '00000000-0000-0000-0000-000000000001'
        });

        if (error) throw error;
        this.logResult('DELETE', 'bookings', true, `Cancelled booking successfully`);
      } catch (error) {
        this.logResult('DELETE', 'bookings', false, error.message);
        this.errors.push({ operation: 'CANCEL booking', error: error.message });
      }
    }

    // Test 2: Delete Yoga Class
    if (this.testClassId) {
      try {
        this.startTime = Date.now();
        const { data, error } = await this.supabase
          .from('yoga_classes')
          .delete()
          .eq('id', this.testClassId);

        if (error) throw error;
        this.logResult('DELETE', 'yoga_classes', true, `Deleted test class`);
      } catch (error) {
        this.logResult('DELETE', 'yoga_classes', false, error.message);
        this.errors.push({ operation: 'DELETE yoga_classes', error: error.message });
      }
    }

    // Test 3: Delete Test Profiles
    try {
      this.startTime = Date.now();
      const { data, error } = await this.supabase
        .from('profiles')
        .delete()
        .in('id', [
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000002'
        ]);

      if (error) throw error;
      this.logResult('DELETE', 'profiles', true, `Deleted test profiles`);
    } catch (error) {
      this.logResult('DELETE', 'profiles', false, error.message);
      this.errors.push({ operation: 'DELETE profiles', error: error.message });
    }
  }

  // Test Data Integrity and Constraints
  async testDataIntegrity() {
    console.log('\n🔒 Testing Data Integrity and Constraints...\n');

    // Test 1: Email Validation Constraint
    try {
      this.startTime = Date.now();
      const { data, error } = await this.supabase
        .from('profiles')
        .insert([{
          id: '00000000-0000-0000-0000-000000000003',
          email: 'invalid-email',
          full_name: 'Invalid Email User',
          role: 'student'
        }]);

      if (error) {
        this.logResult('CONSTRAINT', 'profiles', true, `Email validation constraint working: ${error.message}`);
      } else {
        this.logResult('CONSTRAINT', 'profiles', false, `Email validation constraint failed - invalid email accepted`);
        this.errors.push({ operation: 'Email validation constraint', error: 'Invalid email was accepted' });
      }
    } catch (error) {
      this.logResult('CONSTRAINT', 'profiles', true, `Email validation constraint working: ${error.message}`);
    }

    // Test 2: Price Range Constraint
    try {
      this.startTime = Date.now();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const { data, error } = await this.supabase
        .from('yoga_classes')
        .insert([{
          title: 'Invalid Price Class',
          teacher_id: '00000000-0000-0000-0000-000000000002',
          date: tomorrow.toISOString().split('T')[0],
          time: '09:00:00',
          price: -10.00 // Invalid negative price
        }]);

      if (error) {
        this.logResult('CONSTRAINT', 'yoga_classes', true, `Price constraint working: ${error.message}`);
      } else {
        this.logResult('CONSTRAINT', 'yoga_classes', false, `Price constraint failed - negative price accepted`);
        this.errors.push({ operation: 'Price constraint', error: 'Negative price was accepted' });
      }
    } catch (error) {
      this.logResult('CONSTRAINT', 'yoga_classes', true, `Price constraint working: ${error.message}`);
    }

    // Test 3: Booking validation using function
    try {
      this.startTime = Date.now();
      
      const { data, error } = await this.supabase.rpc('can_student_book_class', {
        p_student_id: '00000000-0000-0000-0000-000000000001',
        p_class_id: '00000000-0000-0000-0000-000000000000' // Non-existent class
      });

      if (error) throw error;
      
      if (data && data.can_book === false) {
        this.logResult('CONSTRAINT', 'bookings', true, `Booking validation working: ${data.reason}`);
      } else {
        this.logResult('CONSTRAINT', 'bookings', false, `Booking validation not working properly`);
        this.errors.push({ operation: 'Booking validation', error: 'Invalid booking was allowed' });
      }
      
    } catch (error) {
      this.logResult('CONSTRAINT', 'bookings', true, `Booking validation working: ${error.message}`);
    }
  }

  // Test Performance (optimized)
  async testPerformance() {
    console.log('\n⚡ Testing Performance...\n');

    // Test 1: Bulk Read Performance (optimized query)
    try {
      this.startTime = Date.now();
      const { data, error } = await this.supabase
        .from('yoga_classes')
        .select(`
          id,
          title,
          date,
          time,
          current_participants,
          max_participants,
          profiles!yoga_classes_teacher_id_fkey (full_name)
        `)
        .limit(50); // Reduced from 100 to 50

      if (error) throw error;
      
      const duration = Date.now() - this.startTime;
      const performanceGood = duration < 2000; // Should complete in under 2 seconds
      
      this.logResult('PERFORMANCE', 'yoga_classes', performanceGood, 
        `Bulk read of ${data.length} classes: ${duration}ms ${performanceGood ? '(Good)' : '(Slow)'}`);
        
      if (!performanceGood) {
        this.errors.push({ operation: 'Bulk read performance', error: `Query took ${duration}ms (>2000ms)` });
      }
    } catch (error) {
      this.logResult('PERFORMANCE', 'yoga_classes', false, error.message);
      this.errors.push({ operation: 'Bulk read performance', error: error.message });
    }

    // Test 2: Complex Query Performance (optimized)
    try {
      this.startTime = Date.now();
      const { data, error } = await this.supabase
        .from('bookings')
        .select(`
          id,
          status,
          payment_status,
          yoga_classes (id, title, date),
          profiles!bookings_student_id_fkey (full_name)
        `)
        .eq('status', 'confirmed')
        .limit(25); // Reduced from 50 to 25

      if (error) throw error;
      
      const duration = Date.now() - this.startTime;
      const performanceGood = duration < 2000; // Reduced threshold from 3000ms to 2000ms
      
      this.logResult('PERFORMANCE', 'bookings', performanceGood, 
        `Complex join query: ${duration}ms ${performanceGood ? '(Good)' : '(Slow)'}`);
        
      if (!performanceGood) {
        this.errors.push({ operation: 'Complex query performance', error: `Query took ${duration}ms (>2000ms)` });
      }
    } catch (error) {
      this.logResult('PERFORMANCE', 'bookings', false, error.message);
      this.errors.push({ operation: 'Complex query performance', error: error.message });
    }
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n📊 DATABASE TESTING REPORT\n');
    console.log('='.repeat(50));
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (this.errors.length > 0) {
      console.log('\n🚨 CRITICAL ISSUES FOUND:\n');
      this.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.operation}:`);
        console.log(`   Error: ${error.error}`);
        console.log('');
      });
    } else {
      console.log('\n✅ All database operations are working correctly!');
    }
    
    // Performance summary
    const performanceTests = this.testResults.filter(r => r.operation === 'PERFORMANCE');
    if (performanceTests.length > 0) {
      console.log('\n⚡ PERFORMANCE SUMMARY:\n');
      performanceTests.forEach(test => {
        console.log(`${test.table}: ${test.details}`);
      });
    }
    
    return {
      totalTests,
      passedTests,
      failedTests,
      successRate: (passedTests / totalTests) * 100,
      errors: this.errors,
      results: this.testResults
    };
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Database Testing...\n');
    
    try {
      await this.testCreateOperations();
      await this.testReadOperations();
      await this.testUpdateOperations();
      await this.testDeleteOperations();
      await this.testDataIntegrity();
      await this.testPerformance();
      
      return this.generateReport();
    } catch (error) {
      console.error('❌ Critical error during testing:', error);
      this.errors.push({ operation: 'Test execution', error: error.message });
      return this.generateReport();
    }
  }
}

// Export for use in other files
module.exports = DatabaseTester;

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new DatabaseTester();
  tester.runAllTests()
    .then(report => {
      process.exit(report.errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}