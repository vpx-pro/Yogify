import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Clock, MapPin, X, CreditCard, CircleAlert as AlertCircle } from 'lucide-react-native';
import type { Database } from '@/lib/supabase';

type Booking = Database['public']['Tables']['bookings']['Row'] & {
  yoga_classes: Database['public']['Tables']['yoga_classes']['Row'];
};

export default function BookingsScreen() {
  const { profile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          yoga_classes (*)
        `)
        .eq('student_id', profile.id)
        .eq('status', 'confirmed')
        .order('booking_date', { ascending: false });

      if (error) throw error;
      setBookings(data || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const cancelBooking = async (bookingId: string, classId: string) => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              // Update booking status
              const { error: bookingError } = await supabase
                .from('bookings')
                .update({ status: 'cancelled' })
                .eq('id', bookingId);

              if (bookingError) throw bookingError;

              // Decrease class participant count only if payment was completed
              const targetBooking = bookings.find(b => b.id === bookingId);
              if (targetBooking && targetBooking.payment_status === 'completed') {
                const targetClass = targetBooking.yoga_classes;
                if (targetClass) {
                  await supabase
                    .from('yoga_classes')
                    .update({ current_participants: Math.max(0, targetClass.current_participants - 1) })
                    .eq('id', classId);
                }
              }

              fetchBookings();
              Alert.alert('Success', 'Booking cancelled successfully');
            } catch (error) {
              console.error('Error cancelling booking:', error);
              Alert.alert('Error', 'Failed to cancel booking');
            }
          },
        },
      ]
    );
  };

  const handlePayment = async (bookingId: string) => {
    try {
      // Simulate payment processing
      Alert.alert(
        'Process Payment',
        'This would integrate with a payment processor like RevenueCat or Stripe.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Simulate Success',
            onPress: async () => {
              try {
                // Update payment status using the secure function
                const { error } = await supabase.rpc('update_booking_payment_status', {
                  booking_id: bookingId,
                  new_payment_status: 'completed'
                });

                if (error) throw error;

                // Update participant count
                const booking = bookings.find(b => b.id === bookingId);
                if (booking) {
                  await supabase
                    .from('yoga_classes')
                    .update({ 
                      current_participants: booking.yoga_classes.current_participants + 1 
                    })
                    .eq('id', booking.class_id);
                }

                fetchBookings();
                Alert.alert('Success', 'Payment completed successfully!');
              } catch (error) {
                console.error('Error processing payment:', error);
                Alert.alert('Error', 'Payment failed. Please try again.');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error handling payment:', error);
      Alert.alert('Error', 'Failed to process payment');
    }
  };

  const isUpcoming = (date: string, time: string) => {
    const classDateTime = new Date(`${date} ${time}`);
    return classDateTime > new Date();
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Bookings</Text>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <Text style={styles.loadingText}>Loading bookings...</Text>
        ) : bookings.length > 0 ? (
          bookings.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <Text style={styles.classTitle}>{booking.yoga_classes.title}</Text>
                <View style={styles.statusContainer}>
                  <View style={[
                    styles.statusBadge,
                    isUpcoming(booking.yoga_classes.date, booking.yoga_classes.time) 
                      ? styles.upcomingBadge 
                      : styles.pastBadge
                  ]}>
                    <Text style={styles.statusText}>
                      {isUpcoming(booking.yoga_classes.date, booking.yoga_classes.time) 
                        ? 'Upcoming' 
                        : 'Completed'
                      }
                    </Text>
                  </View>
                </View>
              </View>
              
              <Text style={styles.classDescription} numberOfLines={2}>
                {booking.yoga_classes.description}
              </Text>
              
              <View style={styles.classDetails}>
                <View style={styles.detailItem}>
                  <Calendar size={16} color="#666" />
                  <Text style={styles.detailText}>{booking.yoga_classes.date}</Text>
                </View>
                
                <View style={styles.detailItem}>
                  <Clock size={16} color="#666" />
                  <Text style={styles.detailText}>
                    {booking.yoga_classes.time} ({booking.yoga_classes.duration}min)
                  </Text>
                </View>
                
                <View style={styles.detailItem}>
                  <MapPin size={16} color="#666" />
                  <Text style={styles.detailText}>{booking.yoga_classes.location}</Text>
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
                
                {booking.payment_status === 'pending' && (
                  <TouchableOpacity
                    style={styles.payButton}
                    onPress={() => handlePayment(booking.id)}
                  >
                    <Text style={styles.payButtonText}>Pay Now</Text>
                  </TouchableOpacity>
                )}

                {booking.payment_status === 'failed' && (
                  <View style={styles.failedPaymentNotice}>
                    <AlertCircle size={16} color="#FF6B6B" />
                    <Text style={styles.failedPaymentText}>
                      Payment failed. Please try again or contact support.
                    </Text>
                  </View>
                )}
              </View>
              
              <View style={styles.bookingFooter}>
                <Text style={styles.priceText}>${booking.yoga_classes.price}</Text>
                {isUpcoming(booking.yoga_classes.date, booking.yoga_classes.time) && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => cancelBooking(booking.id, booking.yoga_classes.id)}
                  >
                    <X size={16} color="#FF6B6B" />
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No bookings yet. Book your first yoga class!
            </Text>
          </View>
        )}
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
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 100, // Extra padding to account for tab bar
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
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
  bookingHeader: {
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
  statusContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  upcomingBadge: {
    backgroundColor: '#4CAF50',
  },
  pastBadge: {
    backgroundColor: '#999',
  },
  statusText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
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
  paymentSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
  },
  paymentStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  paymentStatusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  payButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  payButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  failedPaymentNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFE5E5',
    padding: 8,
    borderRadius: 6,
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
    color: '#C4896F',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFE5E5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#FF6B6B',
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
});