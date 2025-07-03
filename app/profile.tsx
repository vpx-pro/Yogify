import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { User, Settings, CircleHelp as HelpCircle, LogOut, Mail, Calendar, Heart, Star, Award, CreditCard as Edit3, ChevronRight } from 'lucide-react-native';
import TeacherAvatar from '@/components/TeacherAvatar';

type SavedTeacher = {
  id: string;
  teacher_id: string;
  full_name: string;
  avatar_url?: string;
  avg_rating?: number;
};

export default function ProfileScreen() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [savedTeachers, setSavedTeachers] = useState<SavedTeacher[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile?.id && profile.role === 'student') {
      fetchSavedTeachers();
    }
  }, [profile]);

  const fetchSavedTeachers = async () => {
    if (!profile?.id) return;
    
    setLoading(true);
    try {
      // First get the saved teachers
      const { data: savedData, error: savedError } = await supabase
        .from('saved_teachers')
        .select(`
          id,
          teacher_id
        `)
        .eq('student_id', profile.id);

      if (savedError) {
        console.error('Error fetching saved teachers:', savedError);
        return;
      }
      
      if (!savedData || savedData.length === 0) {
        setSavedTeachers([]);
        setLoading(false);
        return;
      }
      
      // Then get the teacher profiles
      const teacherIds = savedData.map(item => item.teacher_id);
      const { data: teacherData, error: teacherError } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          avatar_url
        `)
        .in('id', teacherIds);
        
      if (teacherError) {
        console.error('Error fetching teacher profiles:', teacherError);
        return;
      }
      
      // Get ratings separately
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('teacher_ratings')
        .select(`
          teacher_id,
          avg_rating
        `)
        .in('teacher_id', teacherIds);
        
      if (ratingsError && ratingsError.code !== 'PGRST116') {
        console.error('Error fetching teacher ratings:', ratingsError);
      }
      
      // Combine the data
      const formattedTeachers = savedData.map(saved => {
        const teacherProfile = teacherData?.find(t => t.id === saved.teacher_id);
        const teacherRating = ratingsData?.find(r => r.teacher_id === saved.teacher_id);
        
        return {
          id: saved.id,
          teacher_id: saved.teacher_id,
          full_name: teacherProfile?.full_name || 'Unknown Teacher',
          avatar_url: teacherProfile?.avatar_url,
          avg_rating: teacherRating?.avg_rating
        };
      });
      
      setSavedTeachers(formattedTeachers);
    } catch (error) {
      console.error('Error fetching saved teachers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const handleViewTeacher = (teacherId: string) => {
    router.push(`/teacher-profile/${teacherId}`);
  };

  const handleEditProfile = () => {
    // This would navigate to a profile edit screen
    Alert.alert('Coming Soon', 'Profile editing will be available soon!');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
          <Edit3 size={20} color="#8B7355" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Info */}
        <View style={styles.profileSection}>
          <View style={styles.profileHeader}>
            {profile?.role === 'teacher' ? (
              <TeacherAvatar
                teacherId={profile?.id || ''}
                teacherName={profile?.full_name || 'User'}
                avatarUrl={profile?.avatar_url}
                size="LARGE"
              />
            ) : (
              <View style={styles.avatarContainer}>
                <User size={32} color="white" />
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{profile?.full_name || 'User'}</Text>
              <Text style={styles.profileEmail}>{profile?.email}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>
                  {profile?.role === 'teacher' ? 'Teacher' : 'Student'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Saved Teachers Section (for students) */}
        {profile?.role === 'student' && (
          <View style={styles.savedTeachersSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Favorite Teachers</Text>
              {savedTeachers.length > 0 && (
                <TouchableOpacity>
                  <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#8B7355" />
                <Text style={styles.loadingText}>Loading favorite teachers...</Text>
              </View>
            ) : savedTeachers.length > 0 ? (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.savedTeachersContainer}
              >
                {savedTeachers.map((teacher) => (
                  <TouchableOpacity 
                    key={teacher.id} 
                    style={styles.savedTeacherCard}
                    onPress={() => handleViewTeacher(teacher.teacher_id)}
                  >
                    <TeacherAvatar
                      teacherId={teacher.teacher_id}
                      teacherName={teacher.full_name}
                      avatarUrl={teacher.avatar_url}
                      size="MEDIUM"
                    />
                    <Text style={styles.savedTeacherName} numberOfLines={1}>
                      {teacher.full_name}
                    </Text>
                    {teacher.avg_rating && (
                      <View style={styles.savedTeacherRating}>
                        <Star size={12} color="#FFD700" fill="#FFD700" />
                        <Text style={styles.savedTeacherRatingText}>
                          {teacher.avg_rating.toFixed(1)}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Heart size={24} color="#CCC" />
                <Text style={styles.emptyText}>
                  You haven't saved any teachers yet
                </Text>
                <TouchableOpacity 
                  style={styles.exploreButton}
                  onPress={() => router.push('/(tabs)/explore')}
                >
                  <Text style={styles.exploreButtonText}>Explore Teachers</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Teacher Stats Section (for teachers) */}
        {profile?.role === 'teacher' && (
          <View style={styles.teacherStatsSection}>
            <Text style={styles.sectionTitle}>Your Stats</Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>4.8</Text>
                <Text style={styles.statLabel}>Rating</Text>
                <View style={styles.miniStars}>
                  <Star size={12} color="#FFD700" fill="#FFD700" />
                  <Star size={12} color="#FFD700" fill="#FFD700" />
                  <Star size={12} color="#FFD700" fill="#FFD700" />
                  <Star size={12} color="#FFD700" fill="#FFD700" />
                  <Star size={12} color="#FFD700" fill="#FFD700" />
                </View>
              </View>
              
              <View style={styles.statCard}>
                <Text style={styles.statValue}>127</Text>
                <Text style={styles.statLabel}>Reviews</Text>
              </View>
              
              <View style={styles.statCard}>
                <Text style={styles.statValue}>24</Text>
                <Text style={styles.statLabel}>Classes</Text>
              </View>
              
              <View style={styles.statCard}>
                <Text style={styles.statValue}>312</Text>
                <Text style={styles.statLabel}>Students</Text>
              </View>
            </View>
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Mail size={20} color="#666" />
              <Text style={styles.menuItemText}>Contact Information</Text>
            </View>
            <ChevronRight size={20} color="#CCC" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Calendar size={20} color="#666" />
              <Text style={styles.menuItemText}>My Schedule</Text>
            </View>
            <ChevronRight size={20} color="#CCC" />
          </TouchableOpacity>

          {profile?.role === 'teacher' && (
            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Award size={20} color="#666" />
                <Text style={styles.menuItemText}>Certifications</Text>
              </View>
              <ChevronRight size={20} color="#CCC" />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <Settings size={20} color="#666" />
              <Text style={styles.menuItemText}>Settings</Text>
            </View>
            <ChevronRight size={20} color="#CCC" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuItemLeft}>
              <HelpCircle size={20} color="#666" />
              <Text style={styles.menuItemText}>Help & Support</Text>
            </View>
            <ChevronRight size={20} color="#CCC" />
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color="#FF6B6B" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>Yogify v1.0.0</Text>
          <Text style={styles.appInfoText}>Find peace, balance, and strength</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  editButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 100, // Extra padding to account for tab bar
  },
  profileSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#C4896F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  savedTeachersSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  viewAllText: {
    fontSize: 14,
    color: '#8B7355',
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  savedTeachersContainer: {
    paddingBottom: 8,
  },
  savedTeacherCard: {
    alignItems: 'center',
    marginRight: 20,
    width: 80,
  },
  savedTeacherName: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
    textAlign: 'center',
  },
  savedTeacherRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  savedTeacherRatingText: {
    fontSize: 12,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  exploreButton: {
    backgroundColor: '#8B7355',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  exploreButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  teacherStatsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#8B7355',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  miniStars: {
    flexDirection: 'row',
    marginTop: 4,
  },
  menuSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 20,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  signOutText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '500',
  },
  appInfo: {
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 20,
  },
  appInfoText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});