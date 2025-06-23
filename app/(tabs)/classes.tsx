import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Plus, Calendar, Clock, Users, MapPin, CreditCard as Edit, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import CreateClassModal from '@/components/CreateClassModal';
import type { Database } from '@/lib/supabase';

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'];

export default function ClassesScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<YogaClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});

  const isTeacher = profile?.role === 'teacher';

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (classes.length > 0) {
      fetchParticipantCounts();
    }
  }, [classes]);

  const fetchClasses = async () => {
    try {
      let query = supabase.from('yoga_classes').select('*');
      
      if (isTeacher) {
        query = query.eq('teacher_id', profile?.id);
      }
      
      const { data, error } = await query.order('date', { ascending: true });

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
      Alert.alert('Error', 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const fetchParticipantCounts = async () => {
    try {
      const classIds = classes.map(cls => cls.id);
      
      // Get actual participant counts from bookings (only confirmed bookings with completed payments)
      const { data, error } = await supabase
        .from('bookings')
        .select('class_id')
        .in('class_id', classIds)
        .eq('status', 'confirmed')
        .eq('payment_status', 'completed');

      if (error) throw error;

      // Count participants per class
      const counts: Record<string, number> = {};
      classIds.forEach(id => counts[id] = 0);
      
      data?.forEach(booking => {
        counts[booking.class_id] = (counts[booking.class_id] || 0) + 1;
      });

      setParticipantCounts(counts);

      // Update any classes where the stored count doesn't match actual count
      const updates = classes
        .filter(cls => counts[cls.id] !== cls.current_participants)
        .map(cls => ({
          id: cls.id,
          current_participants: counts[cls.id]
        }));

      if (updates.length > 0) {
        for (const update of updates) {
          await supabase
            .from('yoga_classes')
            .update({ current_participants: update.current_participants })
            .eq('id', update.id);
        }
        
        // Refresh classes to get updated data
        fetchClasses();
      }
    } catch (error) {
      console.error('Error fetching participant counts:', error);
    }
  };

  const createClass = async (classData: any) => {
    if (!profile?.id) return;

    setCreateLoading(true);
    try {
      const { error } = await supabase
        .from('yoga_classes')
        .insert([{
          ...classData,
          teacher_id: profile.id,
          current_participants: 0,
        }]);

      if (error) throw error;

      setShowCreateModal(false);
      fetchClasses();
      Alert.alert('Success', 'Class created successfully!');
    } catch (error) {
      console.error('Error creating class:', error);
      Alert.alert('Error', 'Failed to create class. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  const bookClass = async (classId: string) => {
    if (!profile?.id) return;

    try {
      // Check if already booked
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('id')
        .eq('student_id', profile.id)
        .eq('class_id', classId)
        .eq('status', 'confirmed')
        .single();

      if (existingBooking) {
        Alert.alert('Already Booked', 'You have already booked this class.');
        return;
      }

      // Get current participant count
      const currentCount = participantCounts[classId] || 0;
      const targetClass = classes.find(c => c.id === classId);
      
      if (!targetClass) return;

      if (currentCount >= targetClass.max_participants) {
        Alert.alert('Class Full', 'This class is already full.');
        return;
      }

      // Create booking with pending payment status
      const { error } = await supabase
        .from('bookings')
        .insert([{
          student_id: profile.id,
          class_id: classId,
          status: 'confirmed',
          payment_status: 'pending', // Default to pending payment
        }]);

      if (error) throw error;

      fetchClasses();
      Alert.alert(
        'Booking Created', 
        'Your booking has been created with pending payment status. Please complete payment to secure your spot.',
        [
          { text: 'View Details', onPress: () => router.push(`/class-detail/${classId}`) },
          { text: 'OK' }
        ]
      );
    } catch (error) {
      console.error('Error booking class:', error);
      Alert.alert('Error', 'Failed to book class. Please try again.');
    }
  };

  const deleteClass = async (classId: string) => {
    Alert.alert(
      'Delete Class',
      'Are you sure you want to delete this class? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('yoga_classes')
                .delete()
                .eq('id', classId);

              if (error) throw error;

              fetchClasses();
              Alert.alert('Success', 'Class deleted successfully');
            } catch (error) {
              console.error('Error deleting class:', error);
              Alert.alert('Error', 'Failed to delete class');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const isClassFull = (yogaClass: YogaClass) => {
    const actualCount = participantCounts[yogaClass.id] || yogaClass.current_participants;
    return actualCount >= yogaClass.max_participants;
  };

  const isClassPast = (dateString: string, timeString: string) => {
    const classDateTime = new Date(`${dateString} ${timeString}`);
    return classDateTime < new Date();
  };

  const getParticipantCount = (yogaClass: YogaClass) => {
    return participantCounts[yogaClass.id] ?? yogaClass.current_participants;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isTeacher ? 'My Classes' : 'Available Classes'}
        </Text>
        {isTeacher && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Plus size={24} color="white" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <Text style={styles.loadingText}>Loading classes...</Text>
        ) : classes.length > 0 ? (
          classes.map((yogaClass) => {
            const isPast = isClassPast(yogaClass.date, yogaClass.time);
            const isFull = isClassFull(yogaClass);
            const participantCount = getParticipantCount(yogaClass);
            
            return (
              <TouchableOpacity
                key={yogaClass.id}
                style={[
                  styles.classCard,
                  isPast && styles.pastClassCard
                ]}
                onPress={() => router.push(`/class-detail/${yogaClass.id}`)}
              >
                <View style={styles.classHeader}>
                  <Text style={styles.classTitle}>{yogaClass.title}</Text>
                  <View style={[
                    styles.levelBadge,
                    isPast && styles.pastLevelBadge
                  ]}>
                    <Text style={styles.levelText}>{yogaClass.level}</Text>
                  </View>
                </View>
                
                <Text style={styles.classType}>{yogaClass.type}</Text>
                
                {yogaClass.description && (
                  <Text style={styles.classDescription} numberOfLines={2}>
                    {yogaClass.description}
                  </Text>
                )}
                
                <View style={styles.classDetails}>
                  <View style={styles.detailItem}>
                    <Calendar size={16} color="#666" />
                    <Text style={styles.detailText}>{formatDate(yogaClass.date)}</Text>
                  </View>
                  
                  <View style={styles.detailItem}>
                    <Clock size={16} color="#666" />
                    <Text style={styles.detailText}>
                      {formatTime(yogaClass.time)} ({yogaClass.duration}min)
                    </Text>
                  </View>
                  
                  <View style={styles.detailItem}>
                    <Users size={16} color="#666" />
                    <Text style={[
                      styles.detailText,
                      isFull && styles.fullText
                    ]}>
                      {participantCount}/{yogaClass.max_participants}
                      {isFull && ' (Full)'}
                    </Text>
                  </View>
                  
                  <View style={styles.detailItem}>
                    <MapPin size={16} color="#666" />
                    <Text style={styles.detailText}>{yogaClass.location}</Text>
                  </View>
                </View>
                
                <View style={styles.classFooter}>
                  <Text style={styles.priceText}>${yogaClass.price}</Text>
                  {isTeacher ? (
                    <View style={styles.teacherActions}>
                      <TouchableOpacity 
                        style={styles.editButton}
                        onPress={() => {
                          // TODO: Implement edit functionality
                          Alert.alert('Coming Soon', 'Edit functionality will be available soon!');
                        }}
                      >
                        <Edit size={16} color="#C4896F" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.deleteButton}
                        onPress={() => deleteClass(yogaClass.id)}
                      >
                        <Trash2 size={16} color="#FF6B6B" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        (isFull || isPast) && styles.disabledButton
                      ]}
                      onPress={() => bookClass(yogaClass.id)}
                      disabled={isFull || isPast}
                    >
                      <Text style={styles.actionButtonText}>
                        {isPast ? 'Past' : isFull ? 'Full' : 'Book Now'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {isTeacher 
                ? 'No classes created yet. Create your first class!' 
                : 'No classes available at the moment.'
              }
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Create Class Modal */}
      <CreateClassModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={createClass}
        loading={createLoading}
      />
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
  addButton: {
    backgroundColor: '#C4896F',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
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
  pastClassCard: {
    opacity: 0.7,
    backgroundColor: '#F5F5F5',
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
    marginRight: 12,
  },
  levelBadge: {
    backgroundColor: '#C4896F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pastLevelBadge: {
    backgroundColor: '#999',
  },
  levelText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  classType: {
    fontSize: 14,
    color: '#C4896F',
    fontWeight: '500',
    marginBottom: 8,
  },
  classDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
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
  fullText: {
    color: '#FF6B6B',
    fontWeight: '500',
  },
  classFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#C4896F',
  },
  actionButton: {
    backgroundColor: '#C4896F',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  actionButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  disabledButton: {
    backgroundColor: '#CCC',
  },
  teacherActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFE5E5',
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
});