import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  BackHandler,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, CreditCard, Calendar, Clock, MapPin, User, Shield } from 'lucide-react-native';
import type { Database } from '@/lib/supabase';

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'] & {
  profiles: {
    full_name: string;
    avatar_url?: string;
  };
};

type Booking = Database['public']['Tables']['bookings']['Row'];

export default function PaymentScreen() {
  const params = useLocalSearchParams<{ classId: string; bookingId?: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const [yogaClass, setYogaClass] = useState<YogaClass | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classId = typeof params.classId === 'string' ? params.classId : null;
  const bookingId = typeof params.bookingId === 'string' ? params.bookingId : null;

  useEffect(() => {
    if (classId) {
      fetchClassAndBookingDetails();
    } else {
      setError('Invalid class ID');
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, []);

  const handleBackPress = () => {
    if (processing) {
      Alert.alert(
        'Payment in Progress',
        'Please wait for the payment to complete before going back.',
        [{ text: 'OK' }]
      );
      return true;
    }
    return false;
  };

  const fetchClassAndBookingDetails = async () => {
    if (!classId || !profile?.id) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch class details
      const { data: classData, error: classError } = await supabase
        .from('yoga_classes')
        .select(`
          *,
          profiles!yoga_classes_teacher_id_fkey (
            full_name,
            avatar_url
          )
        `)
        .eq('id', classId)
        .single();

      if (classError) throw classError;
      setYogaClass(classData);

      // Fetch or find existing booking
      let bookingData = null;
      if (bookingId) {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', bookingId)
          .eq('student_id', profile.id)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        bookingData = data;
      } else {
        // Look for existing booking
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('student_id', profile.id)
          .eq('class_id', classId)
          .eq('status', 'confirmed')
          .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        bookingData = data;
      }

      setBooking(bookingData);

      // If no booking exists and no bookingId provided, redirect back
      if (!bookingData && !bookingId) {
        Alert.alert(
          'No Booking Found',
          'Please book the class first before proceeding to payment.',
          [
            {
              text: 'OK',
              onPress: () => router.back()
            }
          ]
        );
        return;
      }

    } catch (error) {
      console.error('Error fetching details:', error);
      setError('Failed to load payment details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const processPayment = async () => {
    if (!booking || !yogaClass || !profile?.id) {
      setError('Missing required information for payment processing');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Simulate payment processing delay (1-3 seconds)
      const processingTime = Math.random() * 2000 + 1000;
      await new Promise(resolve => setTimeout(resolve, processingTime));

      // Simulate payment success/failure (95% success rate)
      const paymentSuccess = Math.random() > 0.05;

      if (!paymentSuccess) {
        throw new Error('Payment failed. Please check your payment method and try again.');
      }

      // Update payment status using the secure function
      const { error: updateError } = await supabase.rpc('update_booking_payment_status', {
        booking_id: booking.id,
        new_payment_status: 'completed'
      });

      if (updateError) {
        throw new Error(`Payment processing failed: ${updateError.message}`);
      }

      // Navigate to success screen
      router.replace({
        pathname: '/payment-success',
        params: {
          classId: yogaClass.id,
          bookingId: booking.id,
          classTitle: yogaClass.title,
          instructorName: yogaClass.profiles?.full_name || 'Unknown Instructor',
          classDate: yogaClass.date,
          classTime: yogaClass.time,
          price: yogaClass.price.toString()
        }
      });

    } catch (error) {
      console.error('Payment processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Payment failed. Please try again.';
      setError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const retryPayment = () => {
    setError(null);
    processPayment();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    return `${hours}:${minutes}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C4896F" />
          <Text style={styles.loadingText}>Loading payment details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!classId || !yogaClass) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {!classId ? 'Invalid class ID.' : 'Class not found.'}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const instructorName = yogaClass.profiles?.full_name || 'Unknown Instructor';
  const isOnline = yogaClass.location.toLowerCase() === 'online';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => router.back()}
          disabled={processing}
        >
          <ArrowLeft size={24} color={processing ? "#CCC" : "#333"} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Security Badge */}
        <View style={styles.securityBadge}>
          <Shield size={16} color="#4CAF50" />
          <Text style={styles.securityText}>Secure Payment</Text>
        </View>

        {/* Class Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ 
              uri: yogaClass.image_url || 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=800'
            }}
            style={styles.classImage}
            resizeMode="cover"
          />
        </View>

        {/* Class Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.classTitle}>{yogaClass.title}</Text>
          <Text style={styles.classType}>{yogaClass.type}</Text>

          {/* Instructor */}
          <View style={styles.detailRow}>
            <User size={20} color="#C4896F" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Instructor</Text>
              <Text style={styles.detailValue}>{instructorName}</Text>
            </View>
          </View>

          {/* Date & Time */}
          <View style={styles.detailRow}>
            <Calendar size={20} color="#C4896F" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Date & Time</Text>
              <Text style={styles.detailValue}>
                {formatDate(yogaClass.date)} at {formatTime(yogaClass.time)}
              </Text>
            </View>
          </View>

          {/* Location */}
          <View style={styles.detailRow}>
            <MapPin size={20} color="#C4896F" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={[
                styles.detailValue,
                isOnline && styles.onlineText
              ]}>
                {isOnline ? 'Online Class' : yogaClass.location}
              </Text>
            </View>
          </View>

          {/* Duration */}
          <View style={styles.detailRow}>
            <Clock size={20} color="#C4896F" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Duration</Text>
              <Text style={styles.detailValue}>{yogaClass.duration} minutes</Text>
            </View>
          </View>
        </View>

        {/* Payment Summary */}
        <View style={styles.paymentCard}>
          <Text style={styles.paymentTitle}>Payment Summary</Text>
          
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Class Fee</Text>
            <Text style={styles.paymentAmount}>${yogaClass.price}</Text>
          </View>
          
          <View style={styles.paymentDivider} />
          
          <View style={styles.paymentRow}>
            <Text style={styles.paymentTotalLabel}>Total Amount</Text>
            <Text style={styles.paymentTotalAmount}>${yogaClass.price}</Text>
          </View>
        </View>

        {/* Error Display */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorCardText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={retryPayment}
              disabled={processing}
            >
              <Text style={styles.retryButtonText}>Retry Payment</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Payment Method Info */}
        <View style={styles.paymentMethodCard}>
          <CreditCard size={20} color="#666" />
          <Text style={styles.paymentMethodText}>
            This is a demo payment. No actual charges will be made.
          </Text>
        </View>
      </ScrollView>

      {/* Confirm Payment Button */}
      <View style={styles.paymentSection}>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            processing && styles.confirmButtonDisabled
          ]}
          onPress={processPayment}
          disabled={processing}
          activeOpacity={0.8}
        >
          {processing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.confirmButtonText}>Processing Payment...</Text>
            </View>
          ) : (
            <Text style={styles.confirmButtonText}>
              Confirm Payment - ${yogaClass.price}
            </Text>
          )}
        </TouchableOpacity>
        
        <Text style={styles.disclaimerText}>
          By confirming, you agree to our terms and conditions
        </Text>
      </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerBackButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 140,
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
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#C4896F',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E8F5E8',
    marginHorizontal: 20,
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  securityText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  imageContainer: {
    height: 200,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  classImage: {
    width: '100%',
    height: '100%',
  },
  detailsCard: {
    backgroundColor: 'white',
    margin: 20,
    padding: 20,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  classTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  classType: {
    fontSize: 16,
    color: '#C4896F',
    fontWeight: '500',
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  detailContent: {
    flex: 1,
    marginLeft: 16,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  onlineText: {
    color: '#4CAF50',
  },
  paymentCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  paymentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentLabel: {
    fontSize: 16,
    color: '#666',
  },
  paymentAmount: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  paymentDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 12,
  },
  paymentTotalLabel: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
  },
  paymentTotalAmount: {
    fontSize: 20,
    color: '#C4896F',
    fontWeight: '700',
  },
  errorCard: {
    backgroundColor: '#FFE5E5',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFB3B3',
  },
  errorCardText: {
    fontSize: 14,
    color: '#D32F2F',
    marginBottom: 12,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  paymentMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  paymentMethodText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    lineHeight: 20,
  },
  paymentSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  confirmButton: {
    backgroundColor: '#C4896F',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  confirmButtonDisabled: {
    backgroundColor: '#CCC',
    elevation: 0,
    shadowOpacity: 0,
  },
  confirmButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
  },
});