import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, RefreshControl, Modal } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Clock, MapPin, Globe, Eye, X, Mail, User, Tent } from 'lucide-react-native';
import type { Database } from '@/lib/supabase';
import EmptyStateIllustration from '@/components/EmptyStateIllustration';

type ClassWithBookings = Database['public']['Tables']['yoga_classes']['Row'] & {
  bookings: Array<{
    id: string;
    student_id: string;
    payment_status: string;
    profiles: {
      full_name: string;
      email: string;
    };
  }>;
};

type StudentInfo = {
  id: string;
  full_name: string;
  email: string;
  payment_status: string;
};

export default function MyScheduleScreen() {
  const { profile } = useAuth();
  const [upcomingClasses, setUpcomingClasses] = useState<ClassWithBookings[]>([]);
  const [upcomingRetreats, setUpcomingRetreats] = useState<ClassWithBookings[]>([]);
  const [pastClasses, setPastClasses] = useState<ClassWithBookings[]>([]);
  const [pastRetreats, setPastRetreats] = useState<ClassWithBookings[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ClassWithBookings | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'classes' | 'retreats'>('classes');

  useEffect(() => {
    if (profile?.id && profile?.role === 'teacher') {
      fetchClassesAndRetreats();
    }
  }, [profile]);

  const fetchClassesAndRetreats = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('yoga_classes')
        .select(`
          *,
          bookings!inner (
            id,
            student_id,
            payment_status,
            profiles!bookings_student_id_fkey (
              full_name,
              email
            )
          )
        `)
        .eq('teacher_id', profile.id)
        .eq('bookings.status', 'confirmed')
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;

      const now = new Date();
      const upcomingClassesData: ClassWithBookings[] = [];
      const upcomingRetreatsData: ClassWithBookings[] = [];
      const pastClassesData: ClassWithBookings[] = [];
      const pastRetreatsData: ClassWithBookings[] = [];

      data?.forEach((item) => {
        // For retreats, use end_date if available
        const itemEndDate = item.is_retreat && item.retreat_end_date 
          ? new Date(`${item.retreat_end_date} ${item.time}`) 
          : new Date(`${item.date} ${item.time}`);
          
        const isPast = itemEndDate < now;
        
        if (item.is_retreat) {
          if (isPast) {
            pastRetreatsData.push(item);
          } else {
            upcomingRetreatsData.push(item);
          }
        } else {
          if (isPast) {
            pastClassesData.push(item);
          } else {
            upcomingClassesData.push(item);
          }
        }
      });

      // Sort past items by date (most recent first)
      pastClassesData.sort((a, b) => {
        const dateA = new Date(`${a.date} ${a.time}`);
        const dateB = new Date(`${b.date} ${b.time}`);
        return dateB.getTime() - dateA.getTime();
      });
      
      pastRetreatsData.sort((a, b) => {
        const dateA = new Date(`${a.date} ${a.time}`);
        const dateB = new Date(`${b.date} ${b.time}`);
        return dateB.getTime() - dateA.getTime();
      });

      setUpcomingClasses(upcomingClassesData);
      setUpcomingRetreats(upcomingRetreatsData);
      setPastClasses(pastClassesData);
      setPastRetreats(pastRetreatsData);
    } catch (error) {
      console.error('Error fetching classes and retreats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchClassesAndRetreats();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const classDate = date.toDateString();
    const todayDate = today.toDateString();
    const tomorrowDate = tomorrow.toDateString();

    if (classDate === todayDate) return 'Today';
    if (classDate === tomorrowDate) return 'Tomorrow';
    
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateRange = (startDate: string, endDate?: string) => {
    if (!endDate) return formatDate(startDate);
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}`;
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }
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

  const getBookingStats = (classItem: ClassWithBookings) => {
    const totalBookings = classItem.bookings.length;
    const paidBookings = classItem.bookings.filter(b => b.payment_status === 'completed').length;
    const pendingPayments = classItem.bookings.filter(b => b.payment_status === 'pending').length;
    
    return { totalBookings, paidBookings, pendingPayments };
  };

  const showStudentList = (classItem: ClassWithBookings) => {
    setSelectedItem(classItem);
    setShowStudentModal(true);
  };

  const renderStudentModal = () => {
    if (!selectedItem) return null;

    const students: StudentInfo[] = selectedItem.bookings.map(booking => ({
      id: booking.student_id,
      full_name: booking.profiles.full_name,
      email: booking.profiles.email,
      payment_status: booking.payment_status,
    }));

    return (
      <Modal
        visible={showStudentModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStudentModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Students Enrolled</Text>
            <TouchableOpacity
              onPress={() => setShowStudentModal(false)}
              style={styles.closeButton}
            >
              <X size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalClassInfo}>
            <Text style={styles.modalClassName}>{selectedItem.title}</Text>
            <Text style={styles.modalClassDate}>
              {selectedItem.is_retreat 
                ? formatDateRange(selectedItem.date, selectedItem.retreat_end_date)
                : formatDate(selectedItem.date)
              } at {formatTime(selectedItem.time)}
            </Text>
          </View>

          <ScrollView style={styles.studentList}>
            {students.map((student, index) => (
              <View key={student.id} style={styles.studentCard}>
                <View style={styles.studentInfo}>
                  <View style={styles.studentAvatar}>
                    <User size={20} color="white" />
                  </View>
                  <View style={styles.studentDetails}>
                    <Text style={styles.studentName}>{student.full_name}</Text>
                    <View style={styles.studentEmail}>
                      <Mail size={14} color="#666" />
                      <Text style={styles.studentEmailText}>{student.email}</Text>
                    </View>
                  </View>
                </View>
                <View style={[
                  styles.paymentBadge,
                  student.payment_status === 'completed' ? styles.paidBadge : styles.pendingBadge
                ]}>
                  <Text style={[
                    styles.paymentBadgeText,
                    student.payment_status === 'completed' ? styles.paidText : styles.pendingText
                  ]}>
                    {student.payment_status === 'completed' ? 'Paid' : 'Pending'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderClassCard = (classItem: ClassWithBookings, isPast: boolean = false) => {
    const isOnline = classItem.is_virtual || classItem.location.toLowerCase() === 'online';
    const { totalBookings, paidBookings, pendingPayments } = getBookingStats(classItem);
    const isRetreat = classItem.is_retreat;

    return (
      <View key={classItem.id} style={[styles.classCard, isPast && styles.pastClassCard]}>
        <View style={styles.classHeader}>
          <Text style={styles.classTitle}>{classItem.title}</Text>
          <View style={styles.badgeContainer}>
            {isRetreat && (
              <View style={styles.retreatBadge}>
                <Tent size={12} color="white" />
                <Text style={styles.retreatText}>Retreat</Text>
              </View>
            )}
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>{classItem.level}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.classType}>{classItem.type}</Text>

        <View style={styles.classDetails}>
          <View style={styles.detailItem}>
            <Calendar size={16} color="#666" />
            <Text style={styles.detailText}>
              {isRetreat 
                ? formatDateRange(classItem.date, classItem.retreat_end_date)
                : formatDate(classItem.date)
              }
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Clock size={16} color="#666" />
            <Text style={styles.detailText}>
              {formatTime(classItem.time)}
              {!isRetreat && ` (${classItem.duration}min)`}
            </Text>
          </View>

          <View style={styles.detailItem}>
            {isOnline ? (
              <Globe size={16} color="#4CAF50" />
            ) : (
              <MapPin size={16} color="#666" />
            )}
            <Text style={[
              styles.detailText,
              isOnline && styles.onlineText
            ]}>
              {isOnline ? 'Online Experience' : classItem.location}
            </Text>
          </View>
        </View>

        {/* Booking Statistics */}
        <View style={styles.bookingStats}>
          <View style={styles.statItem}>
            <User size={16} color="#8B7355" />
            <Text style={styles.statText}>
              {totalBookings}/{isRetreat ? classItem.retreat_capacity : classItem.max_participants} enrolled
            </Text>
          </View>
          
          <View style={styles.statItem}>
            <Text style={styles.paidCount}>{paidBookings} paid</Text>
            {pendingPayments > 0 && (
              <Text style={styles.pendingCount}>• {pendingPayments} pending</Text>
            )}
          </View>
        </View>

        <View style={styles.classFooter}>
          <Text style={styles.priceText}>€{classItem.price}</Text>
          {totalBookings > 0 && (
            <TouchableOpacity
              style={styles.viewStudentsButton}
              onPress={() => showStudentList(classItem)}
            >
              <Eye size={16} color="#8B7355" />
              <Text style={styles.viewStudentsText}>View Students</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
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
          <Text style={styles.loadingText}>Loading your schedule...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Schedule</Text>
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
          <Tent size={16} color={activeTab === 'retreats' ? 'white' : '#666'} />
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
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'classes' ? (
          <>
            {/* Upcoming Classes */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming Classes</Text>
              {upcomingClasses.length > 0 ? (
                upcomingClasses.map((classItem) => renderClassCard(classItem, false))
              ) : (
                <EmptyStateIllustration
                  type="classes"
                  message="No upcoming classes scheduled"
                  subMessage="Create a new class to get started!"
                  action={
                    <TouchableOpacity
                      style={styles.createButton}
                      onPress={() => alert('Create class functionality coming soon!')}
                    >
                      <Text style={styles.createButtonText}>Create Class</Text>
                    </TouchableOpacity>
                  }
                />
              )}
            </View>

            {/* Past Classes */}
            {pastClasses.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Past Classes</Text>
                {pastClasses.slice(0, 5).map((classItem) => renderClassCard(classItem, true))}
                {pastClasses.length > 5 && (
                  <Text style={styles.moreItemsText}>
                    + {pastClasses.length - 5} more past classes
                  </Text>
                )}
              </View>
            )}
          </>
        ) : (
          <>
            {/* Upcoming Retreats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming Retreats</Text>
              {upcomingRetreats.length > 0 ? (
                upcomingRetreats.map((retreatItem) => renderClassCard(retreatItem, false))
              ) : (
                <EmptyStateIllustration
                  type="retreats"
                  message="No upcoming retreats scheduled"
                  subMessage="Create a new retreat to get started!"
                  action={
                    <TouchableOpacity
                      style={styles.createButton}
                      onPress={() => alert('Create retreat functionality coming soon!')}
                    >
                      <Text style={styles.createButtonText}>Create Retreat</Text>
                    </TouchableOpacity>
                  }
                />
              )}
            </View>

            {/* Past Retreats */}
            {pastRetreats.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Past Retreats</Text>
                {pastRetreats.slice(0, 5).map((retreatItem) => renderClassCard(retreatItem, true))}
                {pastRetreats.length > 5 && (
                  <Text style={styles.moreItemsText}>
                    + {pastRetreats.length - 5} more past retreats
                  </Text>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {renderStudentModal()}
    </SafeAreaView>
  );
}

// Add new styles
const styles = StyleSheet.create({
  ...styles,
  createButton: {
    backgroundColor: '#C27B5C',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 12,
  },
  createButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
});

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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 4,
    marginTop: 16,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#C27B5C',
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
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  classCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  pastClassCard: {
    opacity: 0.8,
    backgroundColor: '#F9F9F9',
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
  badgeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  retreatBadge: {
    backgroundColor: '#C27B5C',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  retreatText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
  },
  levelBadge: {
    backgroundColor: '#8B7355',
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
  classType: {
    fontSize: 14,
    color: '#8B7355',
    fontWeight: '500',
    marginBottom: 16,
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
  onlineText: {
    color: '#4CAF50',
    fontWeight: '500',
  },
  bookingStats: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  statText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  paidCount: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  pendingCount: {
    fontSize: 12,
    color: '#FF9800',
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
    color: '#C27B5C',
  },
  viewStudentsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewStudentsText: {
    fontSize: 12,
    color: '#C27B5C',
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
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  moreItemsText: {
    fontSize: 14,
    color: '#C27B5C',
    textAlign: 'center',
    marginTop: 8,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F4EDE4',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  modalClassInfo: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalClassName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  modalClassDate: {
    fontSize: 14,
    color: '#666',
  },
  studentList: {
    flex: 1,
    padding: 20,
  },
  studentCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8B7355',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  studentEmail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  studentEmailText: {
    fontSize: 12,
    color: '#666',
  },
  paymentBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  paidBadge: {
    backgroundColor: '#E8F5E8',
  },
  pendingBadge: {
    backgroundColor: '#FFF3E0',
  },
  paymentBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  paidText: {
    color: '#4CAF50',
  },
  pendingText: {
    color: '#FF9800',
  },
});