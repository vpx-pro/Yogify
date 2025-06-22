import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Clock, MapPin, X } from 'lucide-react-native';
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

              // Decrease class participant count
              const targetClass = bookings.find(b => b.id === bookingId)?.yoga_classes;
              if (targetClass) {
                await supabase
                  .from('yoga_classes')
                  .update({ current_participants: Math.max(0, targetClass.current_participants - 1) })
                  .eq('id', classId);
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

  const isUpcoming = (date: string, time: string) => {
    const classDateTime = new Date(`${date} ${time}`);
    return classDateTime > new Date();
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