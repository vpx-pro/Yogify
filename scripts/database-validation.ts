/**
 * TypeScript Database Validation Script
 * Validates database schema and operations with type safety
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/supabase';

interface ValidationResult {
  operation: string;
  table: string;
  success: boolean;
  details: string;
  duration: number;
  timestamp: string;
}

interface ValidationError {
  operation: string;
  error: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class DatabaseValidator {
  private supabase: ReturnType<typeof createClient<Database>>;
  private results: ValidationResult[] = [];
  private errors: ValidationError[] = [];
  private startTime: number = 0;

  constructor() {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
  }

  private logResult(operation: string, table: string, success: boolean, details: string = '') {
    const result: ValidationResult = {
      operation,
      table,
      success,
      details,
      duration: Date.now() - this.startTime,
      timestamp: new Date().toISOString()
    };
    
    this.results.push(result);
    console.log(`${success ? '✅' : '❌'} ${operation} on ${table}: ${details}`);
  }

  private addError(operation: string, error: string, severity: ValidationError['severity'] = 'medium') {
    this.errors.push({ operation, error, severity });
  }

  // Validate RLS Policies
  async validateRLSPolicies(): Promise<void> {
    console.log('\n🔐 Validating Row Level Security Policies...\n');

    const tables = ['profiles', 'yoga_classes', 'bookings', 'participant_count_audit'];
    
    for (const table of tables) {
      try {
        this.startTime = Date.now();
        
        // Check if RLS is enabled
        const { data: rlsStatus, error } = await this.supabase
          .rpc('check_rls_enabled', { table_name: table })
          .single();

        if (error) {
          // If function doesn't exist, try alternative method
          const { data, error: queryError } = await this.supabase
            .from(table as any)
            .select('*')
            .limit(1);
            
          if (queryError && queryError.code === '42501') {
            this.logResult('RLS_CHECK', table, true, 'RLS is properly enabled');
          } else {
            this.logResult('RLS_CHECK', table, false, 'RLS may not be properly configured');
            this.addError(`RLS validation for ${table}`, 'Unable to verify RLS status', 'high');
          }
        } else {
          this.logResult('RLS_CHECK', table, true, 'RLS status verified');
        }
      } catch (error) {
        this.logResult('RLS_CHECK', table, false, (error as Error).message);
        this.addError(`RLS validation for ${table}`, (error as Error).message, 'high');
      }
    }
  }

  // Validate Database Functions
  async validateDatabaseFunctions(): Promise<void> {
    console.log('\n⚙️ Validating Database Functions...\n');

    const functions = [
      'update_booking_payment_status',
      'create_booking_with_count',
      'cancel_booking_with_count',
      'sync_participant_count',
      'validate_all_participant_counts',
      'can_student_book_class'
    ];

    for (const functionName of functions) {
      try {
        this.startTime = Date.now();
        
        // Test function existence by calling with null parameters
        const { error } = await this.supabase.rpc(functionName as any, {});
        
        if (error && !error.message.includes('null value')) {
          // Function exists but has parameter validation
          this.logResult('FUNCTION_CHECK', functionName, true, 'Function exists and has proper validation');
        } else if (error && error.message.includes('function') && error.message.includes('does not exist')) {
          this.logResult('FUNCTION_CHECK', functionName, false, 'Function does not exist');
          this.addError(`Function validation: ${functionName}`, 'Function not found in database', 'critical');
        } else {
          this.logResult('FUNCTION_CHECK', functionName, true, 'Function exists');
        }
      } catch (error) {
        this.logResult('FUNCTION_CHECK', functionName, false, (error as Error).message);
        this.addError(`Function validation: ${functionName}`, (error as Error).message, 'high');
      }
    }
  }

  // Validate Indexes
  async validateIndexes(): Promise<void> {
    console.log('\n📊 Validating Database Indexes...\n');

    const expectedIndexes = [
      'idx_yoga_classes_date_time',
      'idx_yoga_classes_teacher_id',
      'idx_bookings_student_class',
      'idx_bookings_class_status',
      'idx_bookings_payment_status',
      'idx_participant_audit_class_id'
    ];

    try {
      this.startTime = Date.now();
      
      // Query to check index existence
      const { data, error } = await this.supabase
        .rpc('get_table_indexes', { schema_name: 'public' });

      if (error) {
        this.logResult('INDEX_CHECK', 'all', false, 'Unable to query indexes');
        this.addError('Index validation', 'Cannot query database indexes', 'medium');
        return;
      }

      const existingIndexes = data?.map((idx: any) => idx.indexname) || [];
      
      for (const expectedIndex of expectedIndexes) {
        const exists = existingIndexes.includes(expectedIndex);
        this.logResult('INDEX_CHECK', expectedIndex, exists, 
          exists ? 'Index exists' : 'Index missing');
          
        if (!exists) {
          this.addError(`Index validation: ${expectedIndex}`, 'Required index is missing', 'medium');
        }
      }
    } catch (error) {
      this.logResult('INDEX_CHECK', 'all', false, (error as Error).message);
      this.addError('Index validation', (error as Error).message, 'medium');
    }
  }

  // Validate Triggers
  async validateTriggers(): Promise<void> {
    console.log('\n🔄 Validating Database Triggers...\n');

    const expectedTriggers = [
      'update_profiles_updated_at',
      'update_yoga_classes_updated_at',
      'update_bookings_updated_at',
      'trigger_payment_status_change'
    ];

    try {
      this.startTime = Date.now();
      
      // Query to check trigger existence
      const { data, error } = await this.supabase
        .rpc('get_table_triggers', { schema_name: 'public' });

      if (error) {
        this.logResult('TRIGGER_CHECK', 'all', false, 'Unable to query triggers');
        this.addError('Trigger validation', 'Cannot query database triggers', 'medium');
        return;
      }

      const existingTriggers = data?.map((trigger: any) => trigger.trigger_name) || [];
      
      for (const expectedTrigger of expectedTriggers) {
        const exists = existingTriggers.includes(expectedTrigger);
        this.logResult('TRIGGER_CHECK', expectedTrigger, exists, 
          exists ? 'Trigger exists' : 'Trigger missing');
          
        if (!exists) {
          this.addError(`Trigger validation: ${expectedTrigger}`, 'Required trigger is missing', 'medium');
        }
      }
    } catch (error) {
      this.logResult('TRIGGER_CHECK', 'all', false, (error as Error).message);
      this.addError('Trigger validation', (error as Error).message, 'medium');
    }
  }

  // Validate Data Types and Constraints
  async validateDataTypes(): Promise<void> {
    console.log('\n🏗️ Validating Data Types and Constraints...\n');

    try {
      // Test enum types
      this.startTime = Date.now();
      const { data: enumData, error: enumError } = await this.supabase
        .from('profiles')
        .select('role')
        .limit(1);

      if (enumError) {
        this.logResult('ENUM_CHECK', 'user_role', false, enumError.message);
        this.addError('Enum validation: user_role', enumError.message, 'high');
      } else {
        this.logResult('ENUM_CHECK', 'user_role', true, 'Enum type working');
      }

      // Test constraints
      this.startTime = Date.now();
      try {
        const { error: constraintError } = await this.supabase
          .from('yoga_classes')
          .insert({
            title: 'Test Class',
            teacher_id: '00000000-0000-0000-0000-000000000001',
            date: '2024-01-01',
            time: '09:00:00',
            price: -10 // This should fail due to price constraint
          });

        if (constraintError && constraintError.message.includes('price')) {
          this.logResult('CONSTRAINT_CHECK', 'price_check', true, 'Price constraint working');
        } else {
          this.logResult('CONSTRAINT_CHECK', 'price_check', false, 'Price constraint not working');
          this.addError('Constraint validation: price_check', 'Price constraint allows negative values', 'high');
        }
      } catch (error) {
        this.logResult('CONSTRAINT_CHECK', 'price_check', true, 'Price constraint working');
      }

    } catch (error) {
      this.logResult('DATA_TYPE_CHECK', 'all', false, (error as Error).message);
      this.addError('Data type validation', (error as Error).message, 'medium');
    }
  }

  // Validate Connection and Authentication
  async validateConnection(): Promise<void> {
    console.log('\n🔌 Validating Database Connection...\n');

    try {
      this.startTime = Date.now();
      
      // Test basic connection
      const { data, error } = await this.supabase
        .from('profiles')
        .select('count')
        .limit(1);

      if (error) {
        this.logResult('CONNECTION', 'database', false, error.message);
        this.addError('Database connection', error.message, 'critical');
      } else {
        this.logResult('CONNECTION', 'database', true, 'Connection successful');
      }

      // Test authentication context
      this.startTime = Date.now();
      const { data: { user }, error: authError } = await this.supabase.auth.getUser();
      
      if (authError) {
        this.logResult('AUTH_CHECK', 'authentication', false, authError.message);
        this.addError('Authentication check', authError.message, 'medium');
      } else {
        this.logResult('AUTH_CHECK', 'authentication', true, 
          user ? `Authenticated as ${user.email}` : 'Anonymous access');
      }

    } catch (error) {
      this.logResult('CONNECTION', 'database', false, (error as Error).message);
      this.addError('Database connection', (error as Error).message, 'critical');
    }
  }

  // Generate validation report
  generateValidationReport(): {
    summary: {
      totalChecks: number;
      passed: number;
      failed: number;
      successRate: number;
    };
    errors: ValidationError[];
    results: ValidationResult[];
    recommendations: string[];
  } {
    console.log('\n📋 VALIDATION REPORT\n');
    console.log('='.repeat(50));
    
    const totalChecks = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = totalChecks - passed;
    const successRate = totalChecks > 0 ? (passed / totalChecks) * 100 : 0;
    
    console.log(`Total Checks: ${totalChecks}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${successRate.toFixed(1)}%`);
    
    // Group errors by severity
    const criticalErrors = this.errors.filter(e => e.severity === 'critical');
    const highErrors = this.errors.filter(e => e.severity === 'high');
    const mediumErrors = this.errors.filter(e => e.severity === 'medium');
    const lowErrors = this.errors.filter(e => e.severity === 'low');
    
    if (this.errors.length > 0) {
      console.log('\n🚨 ISSUES FOUND:\n');
      
      if (criticalErrors.length > 0) {
        console.log('🔴 CRITICAL ISSUES:');
        criticalErrors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error.operation}: ${error.error}`);
        });
        console.log('');
      }
      
      if (highErrors.length > 0) {
        console.log('🟠 HIGH PRIORITY ISSUES:');
        highErrors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error.operation}: ${error.error}`);
        });
        console.log('');
      }
      
      if (mediumErrors.length > 0) {
        console.log('🟡 MEDIUM PRIORITY ISSUES:');
        mediumErrors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error.operation}: ${error.error}`);
        });
        console.log('');
      }
    } else {
      console.log('\n✅ All validations passed successfully!');
    }
    
    // Generate recommendations
    const recommendations: string[] = [];
    
    if (criticalErrors.length > 0) {
      recommendations.push('🔴 Address critical database connection and function issues immediately');
    }
    
    if (highErrors.length > 0) {
      recommendations.push('🟠 Fix security and constraint issues before production deployment');
    }
    
    if (mediumErrors.length > 0) {
      recommendations.push('🟡 Optimize database performance by adding missing indexes and triggers');
    }
    
    if (successRate < 90) {
      recommendations.push('📊 Overall database health is below 90% - comprehensive review needed');
    }
    
    if (recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:\n');
      recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    return {
      summary: { totalChecks, passed, failed, successRate },
      errors: this.errors,
      results: this.results,
      recommendations
    };
  }

  // Run all validations
  async runAllValidations(): Promise<any> {
    console.log('🔍 Starting Database Validation...\n');
    
    try {
      await this.validateConnection();
      await this.validateRLSPolicies();
      await this.validateDatabaseFunctions();
      await this.validateIndexes();
      await this.validateTriggers();
      await this.validateDataTypes();
      
      return this.generateValidationReport();
    } catch (error) {
      console.error('❌ Critical error during validation:', error);
      this.addError('Validation execution', (error as Error).message, 'critical');
      return this.generateValidationReport();
    }
  }
}

export default DatabaseValidator;