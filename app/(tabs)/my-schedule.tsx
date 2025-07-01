import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, RefreshControl, Modal } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Clock, Users, MapPin, Globe, Eye, X, Mail, User } from 'lucide-react-native';
import type { Database } from '@/lib/supabase';

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
  const [pastClasses, setPastClasses] = useState<ClassWithBookings[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassWithBookings | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);

  useEffect(() => {
    if (profile?.id && profile?.role === 'teacher') {
      fetchClasses();
    }
  }, [profile]);

  const fetchClasses = async () => {
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
      const upcoming: ClassWithBookings[] = [];
      const past: ClassWithBookings[] = [];

      data?.forEach((classItem) => {
        const classDateTime = new Date(`${classItem.date} ${classItem.time}`);
        if (classDateTime > now) {
          upcoming.push(classItem);
        } else {
          past.push(classItem);
        }
      });

      // Sort past classes by date (most recent first)
      past.sort((a, b) => {
        const dateA = new Date(`${a.date} ${a.time}`);
        const dateB = new Date(`${b.date} ${b.time}`);
        return dateB.getTime() - dateA.getTime();
      });

      setUpcomingClasses(upcoming);
      setPastClasses(past);
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchClasses();
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
    setSelectedClass(classItem);
    setShowStudentModal(true);
  };

  const renderStudentModal = () => {
    if (!selectedClass) return null;

    const students: StudentInfo[] = selectedClass.bookings.map(booking => ({
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
            <Text style={styles.modalClassName}>{selectedClass.title}</Text>
            <Text style={styles.modalClassDate}>
              {formatDate(selectedClass.date)} at {formatTime(selectedClass.time)}
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
    const isOnline = classItem.location.toLowerCase() === 'online';
    const { totalBookings, paidBookings, pendingPayments } = getBookingStats(classItem);

    return (
      <View key={classItem.id} style={[styles.classCard, isPast && styles.pastClassCard]}>
        <View style={styles.classHeader}>
          <Text style={styles.classTitle}>{classItem.title}</Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>{classItem.level}</Text>
          </View>
        </View>

        <Text style={styles.classType}>{classItem.type}</Text>

        <View style={styles.classDetails}>
          <View style={styles.detailItem}>
            <Calendar size={16} color="#666" />
            <Text style={styles.detailText}>{formatDate(classItem.date)}</Text>
          </View>

          <View style={styles.detailItem}>
            <Clock size={16} color="#666" />
            <Text style={styles.detailText}>
              {formatTime(classItem.time)} ({classItem.duration}min)
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
              {isOnline ? 'Online Class' : classItem.location}
            </Text>
          </View>
        </View>

        {/* Booking Statistics */}
        <View style={styles.bookingStats}>
          <View style={styles.statItem}>
            <Users size={16} color="#C4896F" />
            <Text style={styles.statText}>
              {totalBookings}/{classItem.max_participants} enrolled
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
          <Text style={styles.priceText}>${classItem.price}</Text>
          {totalBookings > 0 && (
            <TouchableOpacity
              style={styles.viewStudentsButton}
              onPress={() => showStudentList(classItem)}
            >
              <Eye size={16} color="#C4896F" />
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

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Upcoming Classes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming Classes</Text>
          {upcomingClasses.length > 0 ? (
            upcomingClasses.map((classItem) => renderClassCard(classItem, false))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No upcoming classes scheduled.</Text>
              <Text style={styles.emptySubtext}>Create a new class to get started!</Text>
            </View>
          )}
        </View>

        {/* Past Classes */}
        {pastClasses.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Past Classes</Text>
            {pastClasses.slice(0, 10).map((classItem) => renderClassCard(classItem, true))}
          </View>
        )}
      </ScrollView>

      {renderStudentModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
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
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
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
  levelBadge: {
    backgroundColor: '#C4896F',
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
    color: '#C4896F',
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
    color: '#C4896F',
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
    color: '#C4896F',
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
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F8F8',
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
    backgroundColor: '#C4896F',
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