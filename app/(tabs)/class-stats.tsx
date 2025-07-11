import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { BarChart2, TrendingUp, Users, Calendar, Award, ChevronRight } from 'lucide-react-native';
import { ParticipantCountService } from '@/lib/participantCountService';

export default function ClassStatsScreen() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalClasses: 0,
    totalParticipants: 0,
    averageParticipants: 0,
    fullClasses: 0,
    utilizationRate: 0,
    upcomingClasses: 0,
    totalReviews: 0,
    averageRating: 0,
  });
  const [topClasses, setTopClasses] = useState<any[]>([]);

  useEffect(() => {
    if (profile?.id && profile.role === 'teacher') {
      fetchTeacherStats();
    }
  }, [profile]);

  const fetchTeacherStats = async () => {
    if (!profile?.id) return;
    
    setLoading(true);
    try {
      // Get participant stats
      const participantStats = await ParticipantCountService.getTeacherParticipantStats(profile.id);
      
      // Get upcoming classes count
      const today = new Date().toISOString().split('T')[0];
      const { count: upcomingCount, error: upcomingError } = await supabase
        .from('yoga_classes')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', profile.id)
        .gte('date', today);
        
      if (upcomingError) throw upcomingError;
      
      // Get rating stats
      const { data: ratingData, error: ratingError } = await supabase
        .from('teacher_ratings')
        .select('avg_rating, total_reviews')
        .eq('teacher_id', profile.id)
        .single();
        
      if (ratingError && ratingError.code !== 'PGRST116') throw ratingError;
      
      // Get top classes by attendance
      const { data: classesData, error: classesError } = await supabase
        .from('yoga_classes')
        .select('id, title, date, time, max_participants, current_participants')
        .eq('teacher_id', profile.id)
        .order('current_participants', { ascending: false })
        .limit(5);
        
      if (classesError) throw classesError;
      
      setStats({
        ...participantStats,
        upcomingClasses: upcomingCount || 0,
        totalReviews: ratingData?.total_reviews || 0,
        averageRating: ratingData?.avg_rating || 0,
      });
      
      setTopClasses(classesData || []);
    } catch (error) {
      console.error('Error fetching teacher stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Only show this screen for teachers
  if (profile?.role !== 'teacher') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>This feature is only available for teachers.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C27B5C" />
          <Text style={styles.loadingText}>Loading your stats...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Class Statistics</Text>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Cards */}
        <View style={styles.summaryCards}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconContainer}>
              <Calendar size={24} color="#C27B5C" />
            </View>
            <Text style={styles.summaryValue}>{stats.totalClasses}</Text>
            <Text style={styles.summaryLabel}>Total Classes</Text>
          </View>
          
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconContainer}>
              <Users size={24} color="#C27B5C" />
            </View>
            <Text style={styles.summaryValue}>{stats.totalParticipants}</Text>
            <Text style={styles.summaryLabel}>Students</Text>
          </View>
          
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconContainer}>
              <Award size={24} color="#C27B5C" />
            </View>
            <Text style={styles.summaryValue}>{stats.averageRating.toFixed(1)}</Text>
            <Text style={styles.summaryLabel}>Avg. Rating</Text>
          </View>
          
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconContainer}>
              <TrendingUp size={24} color="#C27B5C" />
            </View>
            <Text style={styles.summaryValue}>{stats.utilizationRate.toFixed(0)}%</Text>
            <Text style={styles.summaryLabel}>Utilization</Text>
          </View>
        </View>

        {/* Detailed Stats */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Performance Metrics</Text>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Average Class Size</Text>
            <Text style={styles.statValue}>
              {stats.averageParticipants.toFixed(1)} students
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Full Classes</Text>
            <Text style={styles.statValue}>
              {stats.fullClasses} classes
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Upcoming Classes</Text>
            <Text style={styles.statValue}>
              {stats.upcomingClasses} classes
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total Reviews</Text>
            <Text style={styles.statValue}>
              {stats.totalReviews} reviews
            </Text>
          </View>
        </View>

        {/* Top Classes */}
        <View style={styles.topClassesSection}>
          <Text style={styles.sectionTitle}>Top Classes by Attendance</Text>
          
          {topClasses.length > 0 ? (
            topClasses.map((cls, index) => (
              <View key={cls.id} style={styles.topClassItem}>
                <View style={styles.topClassRank}>
                  <Text style={styles.topClassRankText}>{index + 1}</Text>
                </View>
                <View style={styles.topClassInfo}>
                  <Text style={styles.topClassName}>{cls.title}</Text>
                  <Text style={styles.topClassDate}>
                    {new Date(cls.date).toLocaleDateString()} at {cls.time.substring(0, 5)}
                  </Text>
                </View>
                <View style={styles.topClassAttendance}>
                  <Text style={styles.topClassAttendanceText}>
                    {cls.current_participants}/{cls.max_participants}
                  </Text>
                  <Text style={styles.topClassAttendanceLabel}>
                    {Math.round((cls.current_participants / cls.max_participants) * 100)}%
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No class data available yet</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.actionButton}>
            <View style={styles.actionButtonContent}>
              <BarChart2 size={20} color="#C27B5C" />
              <Text style={styles.actionButtonText}>View Detailed Reports</Text>
            </View>
            <ChevronRight size={20} color="#C27B5C" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F6F1',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100, // Extra padding for tab bar
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  summaryCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  summaryIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F9F6F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  statLabel: {
    fontSize: 16,
    color: '#666',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  topClassesSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  topClassItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  topClassRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F9F6F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  topClassRankText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#C27B5C',
  },
  topClassInfo: {
    flex: 1,
  },
  topClassName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  topClassDate: {
    fontSize: 14,
    color: '#666',
  },
  topClassAttendance: {
    alignItems: 'flex-end',
  },
  topClassAttendanceText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  topClassAttendanceLabel: {
    fontSize: 14,
    color: '#C27B5C',
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  actionsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButtonText: {
    fontSize: 16,
    color: '#333',
  },
});