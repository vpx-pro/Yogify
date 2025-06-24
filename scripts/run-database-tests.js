#!/usr/bin/env node

/**
 * Database Testing Runner
 * Executes comprehensive database tests and generates reports
 */

const DatabaseTester = require('./database-test');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('🚀 Yogify Database Testing Suite\n');
  console.log('Testing all CRUD operations, constraints, and performance...\n');
  
  const tester = new DatabaseTester();
  
  try {
    // Run all tests
    const report = await tester.runAllTests();
    
    // Generate detailed report file
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: report.totalTests,
        passedTests: report.passedTests,
        failedTests: report.failedTests,
        successRate: report.successRate
      },
      errors: report.errors,
      results: report.results,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ? 'configured' : 'missing'
      }
    };
    
    // Save report to file
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportFile = path.join(reportsDir, `database-test-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
    
    console.log(`\n📄 Detailed report saved to: ${reportFile}`);
    
    // Generate summary for CI/CD
    if (process.env.CI) {
      const summaryFile = path.join(reportsDir, 'test-summary.json');
      fs.writeFileSync(summaryFile, JSON.stringify({
        success: report.errors.length === 0,
        successRate: report.successRate,
        criticalErrors: report.errors.filter(e => e.operation.includes('CREATE') || e.operation.includes('CONNECTION')),
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    
    // Exit with appropriate code
    process.exit(report.errors.length > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('💥 Fatal error during testing:', error);
    
    // Save error report
    const errorReport = {
      timestamp: new Date().toISOString(),
      fatalError: error.message,
      stack: error.stack
    };
    
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const errorFile = path.join(reportsDir, `database-error-${Date.now()}.json`);
    fs.writeFileSync(errorFile, JSON.stringify(errorReport, null, 2));
    
    console.log(`\n📄 Error report saved to: ${errorFile}`);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  console.log('\n⚠️ Testing interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️ Testing terminated');
  process.exit(1);
});

// Run tests
runTests();