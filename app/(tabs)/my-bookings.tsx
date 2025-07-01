import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, RefreshControl } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Clock, MapPin, Globe, CreditCard, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Tent } from 'lucide-react-native';
import type { Database } from '@/lib/supabase';

type BookingWithClass = Database['public']['Tables']['bookings']['Row'] & {
  yoga_classes: Database['public']['Tables']['yoga_classes']['Row'] & {
    profiles: {
      full_name: string;
      avatar_url?: string;
    };
  };
};

export default function MyBookingsScreen() {
  const { profile } = useAuth();
  const [upcomingClasses, setUpcomingClasses] = useState<BookingWithClass[]>([]);
  const [upcomingRetreats, setUpcomingRetreats] = useState<BookingWithClass[]>([]);
  const [pastClasses, setPastClasses] = useState<BookingWithClass[]>([]);
  const [pastRetreats, setPastRetreats] = useState<BookingWithClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'classes' | 'retreats'>('classes');

  useEffect(() => {
    if (profile?.id && profile?.role === 'student') {
      fetchBookings();
    }
  }, [profile]);

  const fetchBookings = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          yoga_classes (
            *,
            profiles!yoga_classes_teacher_id_fkey (
              full_name,
              avatar_url
            )
          )
        `)
        .eq('student_id', profile.id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const upcomingClassesData: BookingWithClass[] = [];
      const upcomingRetreatsData: BookingWithClass[] = [];
      const pastClassesData: BookingWithClass[] = [];
      const pastRetreatsData: BookingWithClass[] = [];

      data?.forEach((booking) => {
        // For retreats, use end_date if available
        const itemEndDate = booking.yoga_classes.is_retreat && booking.yoga_classes.retreat_end_date 
          ? new Date(`${booking.yoga_classes.retreat_end_date} ${booking.yoga_classes.time}`) 
          : new Date(`${booking.yoga_classes.date} ${booking.yoga_classes.time}`);
          
        const isPast = itemEndDate < now;
        
        if (booking.yoga_classes.is_retreat) {
          if (isPast) {
            pastRetreatsData.push(booking);
          } else {
            upcomingRetreatsData.push(booking);
          }
        } else {
          if (isPast) {
            pastClassesData.push(booking);
          } else {
            upcomingClassesData.push(booking);
          }
        }
      });

      // Sort upcoming by date (earliest first)
      upcomingClassesData.sort((a, b) => {
        const dateA = new Date(`${a.yoga_classes.date} ${a.yoga_classes.time}`);
        const dateB = new Date(`${b.yoga_classes.date} ${b.yoga_classes.time}`);
        return dateA.getTime() - dateB.getTime();
      });

      upcomingRetreatsData.sort((a, b) => {
        const dateA = new Date(`${a.yoga_classes.date} ${a.yoga_classes.time}`);
        const dateB = new Date(`${b.yoga_classes.date} ${b.yoga_classes.time}`);
        return dateA.getTime() - dateB.getTime();
      });

      // Sort past by date (most recent first)
      pastClassesData.sort((a, b) => {
        const dateA = new Date(`${a.yoga_classes.date} ${a.yoga_classes.time}`);
        const dateB = new Date(`${b.yoga_classes.date} ${b.yoga_classes.time}`);
        return dateB.getTime() - dateA.getTime();
      });

      pastRetreatsData.sort((a, b) => {
        const dateA = new Date(`${a.yoga_classes.date} ${a.yoga_classes.time}`);
        const dateB = new Date(`${b.yoga_classes.date} ${b.yoga_classes.time}`);
        return dateB.getTime() - dateA.getTime();
      });

      setUpcomingClasses(upcomingClassesData);
      setUpcomingRetreats(upcomingRetreatsData);
      setPastClasses(pastClassesData);
      setPastRetreats(pastRetreatsData);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
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

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'pending': return '#FF9800';
      case 'failed': return '#FF6B6B';
      case 'refunded': return '#9C27B0';
      default: return '#666';
    }
  };

  const getPaymentStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Paid';
      case 'pending': return 'Payment Pending';
      case 'failed': return 'Payment Failed';
      case 'refunded': return 'Refunded';
      default: return status;
    }
  };

  const renderBookingCard = (booking: BookingWithClass, isPast: boolean = false) => {
    const isOnline = booking.yoga_classes.is_virtual || booking.yoga_classes.location.toLowerCase() === 'online';
    const teacherName = booking.yoga_classes.profiles?.full_name || 'Unknown Teacher';
    const isRetreat = booking.yoga_classes.is_retreat;

    return (
      <View key={booking.id} style={[styles.bookingCard, isPast && styles.pastBookingCard]}>
        <View style={styles.bookingHeader}>
          <View style={styles.bookingTitleContainer}>
            <Text style={styles.classTitle}>{booking.yoga_classes.title}</Text>
            {isRetreat && (
              <View style={styles.retreatBadge}>
                <Tent size={12} color="white" />
                <Text style={styles.retreatText}>Retreat</Text>
              </View>
            )}
          </View>
          <View style={styles.statusContainer}>
            {isPast && (
              <View style={styles.completedBadge}>
                <CheckCircle size={12} color="white" />
                <Text style={styles.completedText}>Completed</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.teacherName}>with {teacherName}</Text>
        <Text style={styles.classType}>{booking.yoga_classes.type} • {booking.yoga_classes.level}</Text>

        <View style={styles.classDetails}>
          <View style={styles.detailItem}>
            <Calendar size={16} color="#666" />
            <Text style={styles.detailText}>
              {isRetreat 
                ? formatDateRange(booking.yoga_classes.date, booking.yoga_classes.retreat_end_date)
                : formatDate(booking.yoga_classes.date)
              }
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Clock size={16} color="#666" />
            <Text style={styles.detailText}>
              {formatTime(booking.yoga_classes.time)}
              {!isRetreat && ` (${booking.yoga_classes.duration}min)`}
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
              {isOnline ? 'Online Experience' : booking.yoga_classes.location}
            </Text>
          </View>
        </View>

        {/* Payment Status */}
        <View style={styles.paymentSection}>
          <View style={styles.paymentStatus}>
            <CreditCard size={16} color={getPaymentStatusColor(booking.payment_status)} />
            <Text style={[
              styles.paymentStatusText,
              { color: getPaymentStatusColor(booking.payment_status) }
            ]}>
              {getPaymentStatusText(booking.payment_status)}
            </Text>
          </View>

          {booking.payment_status === 'failed' && (
            <View style={styles.failedPaymentNotice}>
              <AlertCircle size={16} color="#FF6B6B" />
              <Text style={styles.failedPaymentText}>
                Payment failed. Please contact support.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bookingFooter}>
          <Text style={styles.priceText}>€{booking.yoga_classes.price}</Text>
          <Text style={styles.bookingDate}>
            Booked {new Date(booking.created_at).toLocaleDateString()}
          </Text>
        </View>
      </View>
    );
  };

  // Only show this screen for students
  if (profile?.role !== 'student') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>This feature is only available for students.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading your bookings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Bookings</Text>
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
                upcomingClasses.map((booking) => renderBookingCard(booking, false))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No upcoming classes booked.</Text>
                  <Text style={styles.emptySubtext}>Book a class to get started!</Text>
                </View>
              )}
            </View>

            {/* Past Classes */}
            {pastClasses.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Past Classes</Text>
                {pastClasses.map((booking) => renderBookingCard(booking, true))}
              </View>
            )}
          </>
        ) : (
          <>
            {/* Upcoming Retreats */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Upcoming Retreats</Text>
              {upcomingRetreats.length > 0 ? (
                upcomingRetreats.map((booking) => renderBookingCard(booking, false))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No upcoming retreats booked.</Text>
                  <Text style={styles.emptySubtext}>Book a retreat to get started!</Text>
                </View>
              )}
            </View>

            {/* Past Retreats */}
            {pastRetreats.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Past Retreats</Text>
                {pastRetreats.map((booking) => renderBookingCard(booking, true))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4EDE4',
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
  bookingCard: {
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
  pastBookingCard: {
    opacity: 0.8,
    backgroundColor: '#F9F9F9',
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookingTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  classTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  retreatBadge: {
    backgroundColor: '#8B7355',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  retreatText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '500',
  },
  statusContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  completedText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
  },
  teacherName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
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
  paymentSection: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  paymentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentStatusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  failedPaymentNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFE5E5',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  failedPaymentText: {
    fontSize: 12,
    color: '#FF6B6B',
    flex: 1,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8B7355',
  },
  bookingDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
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
});