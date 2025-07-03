import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Plus, Calendar, Clock, Users, MapPin, CreditCard as Edit, Trash2, Tent } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import CreateClassModal from '@/components/CreateClassModal';
import CreateRetreatModal from '@/components/CreateRetreatModal';
import RetreatCard from '@/components/RetreatCard';
import type { Database } from '@/lib/supabase';

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'] & {
  profiles: {
    full_name: string;
    avatar_url?: string;
  };
};

export default function ClassesScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<YogaClass[]>([]);
  const [retreats, setRetreats] = useState<YogaClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateRetreatModal, setShowCreateRetreatModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [bookingStates, setBookingStates] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'classes' | 'retreats'>('classes');

  const isTeacher = profile?.role === 'teacher';

  useEffect(() => {
    fetchClassesAndRetreats();
  }, []);

  useEffect(() => {
    if (classes.length > 0 || retreats.length > 0) {
      fetchParticipantCounts();
    }
  }, [classes, retreats]);

  const fetchClassesAndRetreats = async () => {
    try {
      let query = supabase.from('yoga_classes').select(`
        *,
        profiles!yoga_classes_teacher_id_fkey (
          full_name,
          avatar_url
        )
      `);
      
      if (isTeacher) {
        query = query.eq('teacher_id', profile?.id);
      }
      
      const { data, error } = await query.order('date', { ascending: true });

      if (error) throw error;
      
      const allData = data || [];
      const classesData = allData.filter(item => !item.is_retreat);
      const retreatsData = allData.filter(item => item.is_retreat);
      
      setClasses(classesData);
      setRetreats(retreatsData);
    } catch (error: any) {
      console.error('Error fetching classes and retreats:', error);
      Alert.alert('Error', 'Failed to load classes and retreats');
    } finally {
      setLoading(false);
    }
  };

  const fetchParticipantCounts = async () => {
    try {
      const allItems = [...classes, ...retreats];
      const itemIds = allItems.map(item => item.id);
      
      const { data, error } = await supabase
        .from('bookings')
        .select('class_id')
        .in('class_id', itemIds)
        .eq('status', 'confirmed')
        .eq('payment_status', 'completed');

      if (error) throw error;

      const counts: Record<string, number> = {};
      itemIds.forEach(id => counts[id] = 0);
      
      data?.forEach(booking => {
        counts[booking.class_id] = (counts[booking.class_id] || 0) + 1;
      });

      setParticipantCounts(counts);

      // Sync any items where the stored count doesn't match actual count
      const syncPromises = allItems
        .filter(item => counts[item.id] !== item.current_participants)
        .map(item => 
          supabase.rpc('sync_participant_count', { p_class_id: item.id })
        );

      if (syncPromises.length > 0) {
        await Promise.all(syncPromises);
        fetchClassesAndRetreats();
      }
    } catch (error: any) {
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
          is_retreat: false,
        }]);

      if (error) throw error;

      setShowCreateModal(false);
      fetchClassesAndRetreats();
      Alert.alert('Success', 'Class created successfully!');
    } catch (error: any) {
      console.error('Error creating class:', error);
      Alert.alert('Error', 'Failed to create class. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  const createRetreat = async (retreatData: any) => {
    if (!profile?.id) return;

    setCreateLoading(true);
    try {
      const { error } = await supabase
        .from('yoga_classes')
        .insert([{
          ...retreatData,
          teacher_id: profile.id,
          current_participants: 0,
        }]);

      if (error) throw error;

      setShowCreateRetreatModal(false);
      fetchClassesAndRetreats();
      setActiveTab('retreats'); // Switch to retreats tab to show the new retreat
      Alert.alert('Success', 'Retreat created successfully!');
    } catch (error: any) {
      console.error('Error creating retreat:', error);
      Alert.alert('Error', 'Failed to create retreat. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  const bookClass = async (classId: string) => {
    if (!profile?.id) return;

    if (bookingStates[classId]) {
      return;
    }

    setBookingStates(prev => ({ ...prev, [classId]: true }));

    try {
      const { data: existingBooking, error: checkError } = await supabase
        .from('bookings')
        .select('id')
        .eq('student_id', profile.id)
        .eq('class_id', classId)
        .eq('status', 'confirmed')
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingBooking) {
        Alert.alert('Already Booked', 'You have already booked this class.');
        return;
      }

      const { error } = await supabase.rpc('create_booking_with_count', {
        p_student_id: profile.id,
        p_class_id: classId,
        p_status: 'confirmed',
        p_payment_status: 'pending'
      });

      if (error) {
        if (error.message.includes('already has a booking')) {
          Alert.alert('Already Booked', 'You have already booked this class.');
        } else if (error.message.includes('Class is full')) {
          Alert.alert('Class Full', 'This class is now full. Please try another class.');
        } else if (error.message.includes('Cannot book past classes')) {
          Alert.alert('Class Unavailable', 'This class has already started or ended.');
        } else if (error.message.includes('duplicate key value violates unique constraint')) {
          Alert.alert('Already Booked', 'You have already booked this class.');
        } else {
          throw error;
        }
        return;
      }

      fetchClassesAndRetreats();
      Alert.alert(
        'Booking Created', 
        'Your booking has been created with pending payment status. Please complete payment to secure your spot.',
        [
          { text: 'View Details', onPress: () => router.push(`/class-detail/${classId}`) },
          { text: 'OK' }
        ]
      );
    } catch (error: any) {
      console.error('Error booking class:', error);
      
      let errorMessage = 'Failed to book class. Please try again.';
      
      if (error && typeof error === 'object' && 'message' in error) {
        if (error.message.includes('duplicate key value violates unique constraint')) {
          errorMessage = 'You have already booked this class.';
        } else if (error.message.includes('already has a booking')) {
          errorMessage = 'You have already booked this class.';
        } else if (error.message.includes('Class is full')) {
          errorMessage = 'This class is now full. Please try another class.';
        } else if (error.message.includes('Cannot book past classes')) {
          errorMessage = 'This class has already started or ended.';
        }
      }
      
      Alert.alert('Booking Failed', errorMessage);
    } finally {
      setBookingStates(prev => ({ ...prev, [classId]: false }));
    }
  };

  const deleteItem = async (itemId: string, isRetreat: boolean) => {
    const itemType = isRetreat ? 'retreat' : 'class';
    Alert.alert(
      `Delete ${itemType}`,
      `Are you sure you want to delete this ${itemType}? This action cannot be undone.`,
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
                .eq('id', itemId);

              if (error) throw error;

              fetchClassesAndRetreats();
              Alert.alert('Success', `${itemType} deleted successfully`);
            } catch (error: any) {
              console.error(`Error deleting ${itemType}:`, error);
              Alert.alert('Error', `Failed to delete ${itemType}`);
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

  const isItemFull = (item: YogaClass) => {
    const actualCount = participantCounts[item.id] || item.current_participants;
    const maxCapacity = item.is_retreat ? item.retreat_capacity : item.max_participants;
    return actualCount >= (maxCapacity || item.max_participants);
  };

  const isItemPast = (dateString: string, timeString: string) => {
    const itemDateTime = new Date(`${dateString} ${timeString}`);
    return itemDateTime < new Date();
  };

  const getParticipantCount = (item: YogaClass) => {
    return participantCounts[item.id] ?? item.current_participants;
  };

  const renderClassCard = (yogaClass: YogaClass) => {
    const isPast = isItemPast(yogaClass.date, yogaClass.time);
    const isFull = isItemFull(yogaClass);
    const participantCount = getParticipantCount(yogaClass);
    const isBooking = bookingStates[yogaClass.id] || false;
    
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
                  Alert.alert('Coming Soon', 'Edit functionality will be available soon!');
                }}
              >
                <Edit size={16} color="#C4896F" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.deleteButton}
                onPress={() => deleteItem(yogaClass.id, false)}
              >
                <Trash2 size={16} color="#FF6B6B" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.actionButton,
                (isFull || isPast || isBooking) && styles.disabledButton
              ]}
              onPress={() => bookClass(yogaClass.id)}
              disabled={isFull || isPast || isBooking}
            >
              <Text style={styles.actionButtonText}>
                {isBooking ? 'Booking...' : isPast ? 'Past' : isFull ? 'Full' : 'Book Now'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isTeacher ? 'My Classes & Retreats' : 'Available Classes & Retreats'}
        </Text>
        {isTeacher && (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowCreateRetreatModal(true)}
            >
              <Tent size={20} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowCreateModal(true)}
            >
              <Plus size={20} color="white" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'classes' && styles.activeTab
          ]}
          onPress={() => setActiveTab('classes')}
        >
          <Text style={[
            styles.tabText,
            activeTab === 'classes' && styles.activeTabText
          ]}>
            Classes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'retreats' && styles.activeTab
          ]}
          onPress={() => setActiveTab('retreats')}
        >
          <Text style={[
            styles.tabText,
            activeTab === 'retreats' && styles.activeTabText
          ]}>
            Retreats
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : activeTab === 'classes' ? (
          classes.length > 0 ? (
            classes.map(renderClassCard)
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {isTeacher 
                  ? 'No classes created yet. Create your first class!' 
                  : 'No classes available at the moment.'
                }
              </Text>
            </View>
          )
        ) : (
          retreats.length > 0 ? (
            retreats.map((retreat) => (
              <RetreatCard
                key={retreat.id}
                retreat={{
                  ...retreat,
                  retreat_capacity: retreat.retreat_capacity || retreat.max_participants,
                  profiles: retreat.profiles
                }}
                onPress={() => router.push(`/class-detail/${retreat.id}`)}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {isTeacher 
                  ? 'No retreats created yet. Create your first retreat!' 
                  : 'No retreats available at the moment.'
                }
              </Text>
            </View>
          )
        )}
      </ScrollView>

      {/* Create Class Modal */}
      <CreateClassModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={createClass}
        loading={createLoading}
      />

      {/* Create Retreat Modal */}
      <CreateRetreatModal
        visible={showCreateRetreatModal}
        onClose={() => setShowCreateRetreatModal(false)}
        onSubmit={createRetreat}
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
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#8B7355',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: 'white',
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