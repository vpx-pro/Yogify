/**
 * Database Health Monitoring Service
 * Provides real-time monitoring and health checks for the database
 */

import { supabase } from './supabase';
import type { Database } from './supabase';

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  details: string;
  timestamp: string;
}

export interface DatabaseMetrics {
  connectionStatus: 'connected' | 'disconnected' | 'error';
  responseTime: number;
  activeConnections?: number;
  queryPerformance: {
    averageResponseTime: number;
    slowQueries: number;
  };
  errorRate: number;
  lastError?: string;
}

export class DatabaseHealthService {
  private static instance: DatabaseHealthService;
  private healthChecks: HealthCheck[] = [];
  private metrics: DatabaseMetrics = {
    connectionStatus: 'disconnected',
    responseTime: 0,
    queryPerformance: {
      averageResponseTime: 0,
      slowQueries: 0
    },
    errorRate: 0
  };

  static getInstance(): DatabaseHealthService {
    if (!DatabaseHealthService.instance) {
      DatabaseHealthService.instance = new DatabaseHealthService();
    }
    return DatabaseHealthService.instance;
  }

  // Perform basic connectivity check
  async checkConnection(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);

      const responseTime = Date.now() - startTime;

      if (error) {
        return {
          service: 'database_connection',
          status: 'unhealthy',
          responseTime,
          details: `Connection failed: ${error.message}`,
          timestamp: new Date().toISOString()
        };
      }

      const status = responseTime < 1000 ? 'healthy' : responseTime < 3000 ? 'degraded' : 'unhealthy';

      return {
        service: 'database_connection',
        status,
        responseTime,
        details: `Connection successful (${responseTime}ms)`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service: 'database_connection',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        details: `Connection error: ${(error as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Check database functions
  async checkDatabaseFunctions(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Test a simple function call
      const { data, error } = await supabase.rpc('can_student_book_class', {
        p_student_id: '00000000-0000-0000-0000-000000000000',
        p_class_id: '00000000-0000-0000-0000-000000000000'
      });

      const responseTime = Date.now() - startTime;

      if (error && !error.message.includes('not found')) {
        return {
          service: 'database_functions',
          status: 'unhealthy',
          responseTime,
          details: `Function error: ${error.message}`,
          timestamp: new Date().toISOString()
        };
      }

      return {
        service: 'database_functions',
        status: 'healthy',
        responseTime,
        details: `Functions operational (${responseTime}ms)`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service: 'database_functions',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        details: `Function error: ${(error as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Check RLS policies
  async checkRLSPolicies(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Try to access a protected table without authentication
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .limit(1);

      const responseTime = Date.now() - startTime;

      // If we get data without authentication, RLS might not be working
      if (data && data.length > 0) {
        return {
          service: 'rls_policies',
          status: 'degraded',
          responseTime,
          details: 'RLS may not be properly configured - data accessible without auth',
          timestamp: new Date().toISOString()
        };
      }

      // If we get an auth error, RLS is working
      if (error && (error.code === '42501' || error.message.includes('permission'))) {
        return {
          service: 'rls_policies',
          status: 'healthy',
          responseTime,
          details: `RLS policies active (${responseTime}ms)`,
          timestamp: new Date().toISOString()
        };
      }

      return {
        service: 'rls_policies',
        status: 'degraded',
        responseTime,
        details: 'RLS status unclear',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service: 'rls_policies',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        details: `RLS check error: ${(error as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Check query performance
  async checkQueryPerformance(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Run a complex query to test performance
      const { data, error } = await supabase
        .from('yoga_classes')
        .select(`
          *,
          profiles!yoga_classes_teacher_id_fkey (full_name, avatar_url)
        `)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .limit(20);

      const responseTime = Date.now() - startTime;

      if (error) {
        return {
          service: 'query_performance',
          status: 'unhealthy',
          responseTime,
          details: `Query failed: ${error.message}`,
          timestamp: new Date().toISOString()
        };
      }

      const status = responseTime < 500 ? 'healthy' : responseTime < 2000 ? 'degraded' : 'unhealthy';

      return {
        service: 'query_performance',
        status,
        responseTime,
        details: `Complex query completed (${responseTime}ms, ${data?.length || 0} records)`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service: 'query_performance',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        details: `Query error: ${(error as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Run comprehensive health check
  async runHealthCheck(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    checks: HealthCheck[];
    summary: string;
  }> {
    console.log('🏥 Running database health check...');

    const checks = await Promise.all([
      this.checkConnection(),
      this.checkDatabaseFunctions(),
      this.checkRLSPolicies(),
      this.checkQueryPerformance()
    ]);

    this.healthChecks = [...this.healthChecks, ...checks].slice(-50); // Keep last 50 checks

    // Determine overall health
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    let summary: string;

    if (unhealthyCount > 0) {
      overall = 'unhealthy';
      summary = `${unhealthyCount} critical issue(s) detected`;
    } else if (degradedCount > 0) {
      overall = 'degraded';
      summary = `${degradedCount} performance issue(s) detected`;
    } else {
      overall = 'healthy';
      summary = 'All systems operational';
    }

    // Update metrics
    this.updateMetrics(checks);

    console.log(`🏥 Health check complete: ${overall.toUpperCase()} - ${summary}`);

    return { overall, checks, summary };
  }

  // Update internal metrics
  private updateMetrics(checks: HealthCheck[]): void {
    const connectionCheck = checks.find(c => c.service === 'database_connection');
    
    if (connectionCheck) {
      this.metrics.connectionStatus = connectionCheck.status === 'healthy' ? 'connected' : 
                                     connectionCheck.status === 'degraded' ? 'connected' : 'error';
      this.metrics.responseTime = connectionCheck.responseTime;
      
      if (connectionCheck.status === 'unhealthy') {
        this.metrics.lastError = connectionCheck.details;
      }
    }

    // Calculate average response time
    const responseTimes = checks.map(c => c.responseTime);
    this.metrics.queryPerformance.averageResponseTime = 
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    // Count slow queries (>2000ms)
    this.metrics.queryPerformance.slowQueries = checks.filter(c => c.responseTime > 2000).length;

    // Calculate error rate
    const errorCount = checks.filter(c => c.status === 'unhealthy').length;
    this.metrics.errorRate = (errorCount / checks.length) * 100;
  }

  // Get current metrics
  getMetrics(): DatabaseMetrics {
    return { ...this.metrics };
  }

  // Get recent health checks
  getRecentHealthChecks(limit: number = 10): HealthCheck[] {
    return this.healthChecks.slice(-limit);
  }

  // Monitor database health continuously
  startHealthMonitoring(intervalMs: number = 60000): () => void {
    console.log(`🔄 Starting database health monitoring (interval: ${intervalMs}ms)`);
    
    const interval = setInterval(() => {
      this.runHealthCheck().catch(error => {
        console.error('Health check failed:', error);
      });
    }, intervalMs);

    // Return cleanup function
    return () => {
      console.log('⏹️ Stopping database health monitoring');
      clearInterval(interval);
    };
  }

  // Test specific database operation
  async testOperation(operation: 'create' | 'read' | 'update' | 'delete', table: string): Promise<HealthCheck> {
    const startTime = Date.now();
    const service = `${operation}_${table}`;

    try {
      switch (operation) {
        case 'read':
          const { data, error } = await supabase
            .from(table as any)
            .select('*')
            .limit(1);
          
          if (error) throw error;
          break;

        case 'create':
          // This would need specific test data for each table
          throw new Error('Create operation testing requires specific implementation');

        case 'update':
          // This would need specific test data for each table
          throw new Error('Update operation testing requires specific implementation');

        case 'delete':
          // This would need specific test data for each table
          throw new Error('Delete operation testing requires specific implementation');
      }

      const responseTime = Date.now() - startTime;
      return {
        service,
        status: responseTime < 1000 ? 'healthy' : 'degraded',
        responseTime,
        details: `${operation.toUpperCase()} operation successful`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        service,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        details: `${operation.toUpperCase()} operation failed: ${(error as Error).message}`,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
export const databaseHealth = DatabaseHealthService.getInstance();