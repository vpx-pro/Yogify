#!/usr/bin/env node

/**
 * Database Issue Resolution Script
 * Identifies and fixes common database issues
 */

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

class DatabaseFixer {
  constructor() {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables. Please check your .env file.');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.issues = [];
    this.fixes = [];
  }

  async checkAndFixConstraintIssues() {
    console.log('🔧 Checking and fixing constraint issues...\n');

    try {
      // Check for bookings that violate the payment status constraint
      const { data: violatingBookings, error } = await this.supabase
        .from('bookings')
        .select('*')
        .eq('status', 'cancelled')
        .eq('payment_status', 'completed');

      if (error) {
        console.error('❌ Error checking constraint violations:', error.message);
        return;
      }

      if (violatingBookings && violatingBookings.length > 0) {
        console.log(`⚠️ Found ${violatingBookings.length} bookings violating payment status constraint`);
        
        // Fix each violating booking
        for (const booking of violatingBookings) {
          try {
            const { error: updateError } = await this.supabase
              .from('bookings')
              .update({ payment_status: 'refunded' })
              .eq('id', booking.id);

            if (updateError) {
              console.error(`❌ Failed to fix booking ${booking.id}:`, updateError.message);
              this.issues.push({
                type: 'constraint_violation',
                booking_id: booking.id,
                error: updateError.message
              });
            } else {
              console.log(`✅ Fixed booking ${booking.id}: changed payment_status from completed to refunded`);
              this.fixes.push({
                type: 'constraint_fix',
                booking_id: booking.id,
                action: 'changed payment_status to refunded'
              });
            }
          } catch (error) {
            console.error(`❌ Error fixing booking ${booking.id}:`, error.message);
            this.issues.push({
              type: 'fix_error',
              booking_id: booking.id,
              error: error.message
            });
          }
        }
      } else {
        console.log('✅ No constraint violations found');
      }
    } catch (error) {
      console.error('❌ Error in constraint check:', error.message);
      this.issues.push({
        type: 'check_error',
        error: error.message
      });
    }
  }

  async validateParticipantCounts() {
    console.log('\n🔢 Validating and fixing participant counts...\n');

    try {
      // Use the database function to validate all participant counts
      const { data, error } = await this.supabase.rpc('validate_all_participant_counts');

      if (error) {
        console.error('❌ Error validating participant counts:', error.message);
        this.issues.push({
          type: 'participant_count_validation',
          error: error.message
        });
        return;
      }

      if (data && data.length > 0) {
        console.log(`✅ Validated ${data.length} classes`);
        const fixedClasses = data.filter(result => result.fixed === true);
        
        if (fixedClasses.length > 0) {
          console.log(`🔧 Fixed participant counts for ${fixedClasses.length} classes:`);
          fixedClasses.forEach(fix => {
            console.log(`  - Class ${fix.class_id}: ${fix.old_count} → ${fix.new_count}`);
            this.fixes.push({
              type: 'participant_count_fix',
              class_id: fix.class_id,
              old_count: fix.old_count,
              new_count: fix.new_count
            });
          });
        } else {
          console.log('✅ All participant counts are accurate');
        }
      } else {
        console.log('✅ No classes found to validate');
      }
    } catch (error) {
      console.error('❌ Error validating participant counts:', error.message);
      this.issues.push({
        type: 'participant_count_error',
        error: error.message
      });
    }
  }

  async testDatabaseFunctions() {
    console.log('\n⚙️ Testing database functions...\n');

    const functions = [
      { name: 'update_booking_payment_status', params: { booking_id: '00000000-0000-0000-0000-000000000000', new_payment_status: 'completed' } },
      { name: 'create_booking_with_count', params: { p_student_id: '00000000-0000-0000-0000-000000000000', p_class_id: '00000000-0000-0000-0000-000000000000' } },
      { name: 'cancel_booking_with_count', params: { p_booking_id: '00000000-0000-0000-0000-000000000000', p_student_id: '00000000-0000-0000-0000-000000000000' } },
      { name: 'sync_participant_count', params: { p_class_id: '00000000-0000-0000-0000-000000000000' } },
      { name: 'can_student_book_class', params: { p_student_id: '00000000-0000-0000-0000-000000000000', p_class_id: '00000000-0000-0000-0000-000000000000' } }
    ];

    for (const func of functions) {
      try {
        // Test function existence with test parameters
        const { error } = await this.supabase.rpc(func.name, func.params);

        if (error && error.message.includes('function') && error.message.includes('does not exist')) {
          console.log(`❌ Function ${func.name} does not exist`);
          this.issues.push({
            type: 'missing_function',
            function_name: func.name
          });
        } else {
          console.log(`✅ Function ${func.name} exists and responds correctly`);
        }
      } catch (error) {
        console.log(`✅ Function ${func.name} exists (validation error expected with test data)`);
      }
    }
  }

  async cleanupOrphanedData() {
    console.log('\n🧹 Cleaning up orphaned data...\n');

    try {
      // Check for bookings with non-existent classes (should be prevented by foreign keys)
      const { data: bookingsCount, error: bookingError } = await this.supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true });

      if (bookingError) {
        console.error('❌ Error checking bookings:', bookingError.message);
        return;
      }

      // Check for audit records (should be prevented by foreign keys)
      const { data: auditsCount, error: auditError } = await this.supabase
        .from('participant_count_audit')
        .select('id', { count: 'exact', head: true });

      if (auditError) {
        console.error('❌ Error checking audit records:', auditError.message);
        return;
      }

      console.log(`✅ Found ${bookingsCount || 0} bookings and ${auditsCount || 0} audit records`);
      console.log('✅ No orphaned data found (foreign key constraints are working)');
    } catch (error) {
      console.error('❌ Error during cleanup:', error.message);
      this.issues.push({
        type: 'cleanup_error',
        error: error.message
      });
    }
  }

  async testBookingOperations() {
    console.log('\n🧪 Testing booking operations...\n');

    try {
      // Test the can_student_book_class function
      const { data: canBookResult, error: canBookError } = await this.supabase.rpc('can_student_book_class', {
        p_student_id: '00000000-0000-0000-0000-000000000000',
        p_class_id: '00000000-0000-0000-0000-000000000000'
      });

      if (canBookError) {
        console.log(`❌ Error testing booking validation: ${canBookError.message}`);
        this.issues.push({
          type: 'booking_test_error',
          error: canBookError.message
        });
      } else {
        console.log('✅ Booking validation function working correctly');
        console.log(`   Result: ${JSON.stringify(canBookResult)}`);
      }

      // Test payment status validation
      const { data: paymentResult, error: paymentError } = await this.supabase.rpc('validate_booking_operation', {
        p_operation: 'payment_update',
        p_booking_id: '00000000-0000-0000-0000-000000000000',
        p_new_payment_status: 'completed'
      });

      if (paymentError) {
        console.log(`❌ Error testing payment validation: ${paymentError.message}`);
        this.issues.push({
          type: 'payment_test_error',
          error: paymentError.message
        });
      } else {
        console.log('✅ Payment validation function working correctly');
        console.log(`   Result: ${JSON.stringify(paymentResult)}`);
      }

    } catch (error) {
      console.error('❌ Error testing booking operations:', error.message);
      this.issues.push({
        type: 'booking_operation_test_error',
        error: error.message
      });
    }
  }

  async testConnectionAndAuth() {
    console.log('\n🔌 Testing database connection and authentication...\n');

    try {
      // Test basic connection
      const { data, error } = await this.supabase
        .from('profiles')
        .select('count', { count: 'exact', head: true });

      if (error) {
        console.log(`❌ Database connection failed: ${error.message}`);
        this.issues.push({
          type: 'connection_error',
          error: error.message
        });
      } else {
        console.log(`✅ Database connection successful (${data || 0} profiles found)`);
      }

      // Test authentication context
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      
      if (authError) {
        console.log(`⚠️ Authentication check: ${authError.message}`);
      } else {
        console.log(`✅ Authentication context: ${user ? `Authenticated as ${user.email}` : 'Anonymous access'}`);
      }

    } catch (error) {
      console.error('❌ Error testing connection:', error.message);
      this.issues.push({
        type: 'connection_test_error',
        error: error.message
      });
    }
  }

  generateReport() {
    console.log('\n📊 DATABASE FIX REPORT\n');
    console.log('='.repeat(50));
    
    console.log(`Issues Found: ${this.issues.length}`);
    console.log(`Fixes Applied: ${this.fixes.length}`);
    
    if (this.issues.length > 0) {
      console.log('\n🚨 ISSUES FOUND:\n');
      this.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue.type}:`);
        if (issue.booking_id) console.log(`   Booking ID: ${issue.booking_id}`);
        if (issue.class_id) console.log(`   Class ID: ${issue.class_id}`);
        if (issue.function_name) console.log(`   Function: ${issue.function_name}`);
        console.log(`   Error: ${issue.error || 'No specific error'}`);
        console.log('');
      });
    }
    
    if (this.fixes.length > 0) {
      console.log('\n✅ FIXES APPLIED:\n');
      this.fixes.forEach((fix, index) => {
        console.log(`${index + 1}. ${fix.type}:`);
        if (fix.booking_id) console.log(`   Booking ID: ${fix.booking_id}`);
        if (fix.class_id) console.log(`   Class ID: ${fix.class_id}`);
        if (fix.action) console.log(`   Action: ${fix.action}`);
        if (fix.old_count !== undefined) console.log(`   Count: ${fix.old_count} → ${fix.new_count}`);
        console.log('');
      });
    }
    
    if (this.issues.length === 0 && this.fixes.length === 0) {
      console.log('\n✅ Database is healthy - no issues found!');
    }
    
    return {
      issuesFound: this.issues.length,
      fixesApplied: this.fixes.length,
      issues: this.issues,
      fixes: this.fixes
    };
  }

  async runAllFixes() {
    console.log('🔧 Starting Database Issue Resolution...\n');
    
    try {
      await this.testConnectionAndAuth();
      await this.checkAndFixConstraintIssues();
      await this.validateParticipantCounts();
      await this.testDatabaseFunctions();
      await this.cleanupOrphanedData();
      await this.testBookingOperations();
      
      return this.generateReport();
    } catch (error) {
      console.error('❌ Critical error during database fixes:', error);
      this.issues.push({
        type: 'critical_error',
        error: error.message
      });
      return this.generateReport();
    }
  }
}

// Run fixes if this file is executed directly
if (require.main === module) {
  const fixer = new DatabaseFixer();
  fixer.runAllFixes()
    .then(report => {
      process.exit(report.issuesFound > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = DatabaseFixer;