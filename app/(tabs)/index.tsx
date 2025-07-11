import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Clock, Users, MapPin, AlertCircle } from 'lucide-react-native';
import TeacherAvatar from '@/components/TeacherAvatar';
import { AvatarService } from '@/lib/avatarService';
import { formatDate, formatTime } from '@/lib/utils';
import type { Database } from '@/lib/supabase';

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'] & {
  profiles: {
    full_name: string;
    avatar_url?: string;
  };
};

export default function HomeScreen() {
  const { profile } = useAuth();
  const [upcomingClasses, setUpcomingClasses] = useState<YogaClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUpcomingClasses();
  }, []);

  useEffect(() => {
    if (upcomingClasses.length > 0) {
      preloadTeacherAvatars();
    }
  }, [upcomingClasses]);

  const fetchUpcomingClasses = async () => {
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
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(5);

      if (error) {
        console.error('Error fetching classes:', error);
        return;
      }

      setUpcomingClasses(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const preloadTeacherAvatars = async () => {
    for (const yogaClass of upcomingClasses) {
      if (yogaClass.profiles?.avatar_url) {
        await AvatarService.preloadAvatar(yogaClass.profiles.avatar_url);
      }
    }
  };

  const isTeacher = profile?.role === 'teacher';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>
            Hello, {profile?.full_name?.split(' ')[0] || 'User'}! 👋
          </Text>
          <Text style={styles.subtitle}>
            {isTeacher 
              ? 'Ready to inspire your students today?' 
              : 'Ready for your yoga practice today?'
            }
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Classes</Text>
          
          {loading ? (
            <Text style={styles.loadingText}>Loading classes...</Text>
          ) : upcomingClasses.length > 0 ? (
            upcomingClasses.map((yogaClass) => {
              const teacherName = yogaClass.profiles?.full_name || 'Unknown Teacher';
              
              return (
                <View key={yogaClass.id} style={styles.classCard}>
                  <View style={styles.classHeader}>
                    <Text style={styles.classTitle}>{yogaClass.title}</Text>
                    <View style={styles.levelBadge}>
                      <Text style={styles.levelText}>{yogaClass.level}</Text>
                    </View>
                  </View>
                  
                  <Text style={styles.classDescription} numberOfLines={2}>
                    {yogaClass.description}
                  </Text>

                  {/* Teacher Info */}
                  <View style={styles.teacherInfo}>
                    <TeacherAvatar
                      teacherId={yogaClass.teacher_id}
                      teacherName={teacherName}
                      avatarUrl={yogaClass.profiles?.avatar_url}
                      size="SMALL"
                    />
                    <Text style={styles.teacherName}>
                      {teacherName}
                    </Text>
                  </View>
                  
                  <View style={styles.classDetails}>
                    <View style={styles.detailItem}>
                      <Calendar size={16} color="#666" />
                      <Text style={styles.detailText}>{yogaClass.date}</Text>
                    </View>
                    
                    <View style={styles.detailItem}>
                      <Clock size={16} color="#666" />
                      <Text style={styles.detailText}>{yogaClass.time}</Text>
                    </View>
                    
                    <View style={styles.detailItem}>
                      <Users size={16} color="#666" />
                      <Text style={styles.detailText}>
                        {yogaClass.current_participants}/{yogaClass.max_participants}
                      </Text>
                    </View>
                    
                    <View style={styles.detailItem}>
                      <MapPin size={16} color="#666" />
                      <Text style={styles.detailText}>{yogaClass.location}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.classFooter}>
                    <Text style={styles.priceText}>{'$' + yogaClass.price}</Text>
                    <TouchableOpacity style={styles.actionButton}>
                      style={styles.actionButton}
                      onPress={() => router.push(`/class-detail/${yogaClass.id}`)}>
                        {isTeacher ? 'View' : 'Book Now'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {isTeacher 
                  ? 'No classes scheduled. Create your first class!' 
                  : 'No upcoming classes available.'
                }
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <View style={styles.quickActions}>
            {isTeacher ? (
              <>
                <TouchableOpacity 
                  style={styles.quickActionCard}
                  onPress={() => router.push('/(tabs)/classes')}>
                  <Text style={styles.quickActionTitle}>Create Class</Text>
                  <Text style={styles.quickActionSubtitle}>Schedule a new yoga session</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.quickActionCard}
                  onPress={() => router.push('/(tabs)/my-schedule')}>
                  <Text style={styles.quickActionTitle}>View Students</Text>
                  <Text style={styles.quickActionSubtitle}>See your enrolled students</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity 
                  style={styles.quickActionCard}
                  onPress={() => router.push('/(tabs)/explore')}>
                  <Text style={styles.quickActionTitle}>Find Classes</Text>
                  <Text style={styles.quickActionSubtitle}>Browse available sessions</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.quickActionCard}
                  onPress={() => {
                    Alert.alert(
                      'Coming Soon',
                      'The progress tracking feature will be available in the next update!',
                      [{ text: 'OK' }]
                    );
                  }}>
                  <Text style={styles.quickActionTitle}>My Progress</Text>
                  <Text style={styles.quickActionSubtitle}>Track your yoga journey</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
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
  scrollContent: {
    paddingBottom: 100, // Extra padding to account for tab bar
  },
  header: {
    padding: 20,
    paddingTop: 40,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  classCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  classHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  classTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  levelBadge: {
    backgroundColor: '#C27B5C',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  levelText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  classDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  teacherName: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    marginLeft: 8,
  },
  classDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#666',
  },
  classFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#C27B5C',
  },
  actionButton: {
    backgroundColor: '#C27B5C',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  actionButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  quickActions: {
    gap: 12,
  },
  quickActionCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  quickActionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
});