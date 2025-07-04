import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Globe, DollarSign, Star, CircleCheck as CheckCircle, User, Tent } from 'lucide-react-native';
import type { Database } from '@/lib/supabase';

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'] & {
  profiles: {
    full_name: string;
    avatar_url?: string;
  };
};

type Booking = Database['public']['Tables']['bookings']['Row'];

export default function ClassDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const [yogaClass, setYogaClass] = useState<YogaClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [existingBooking, setExistingBooking] = useState<Booking | null>(null);
  const [actualParticipantCount, setActualParticipantCount] = useState(0);

  // Ensure id is a valid string
  const id = typeof params.id === 'string' ? params.id : null;

  useEffect(() => {
    if (id) {
      fetchClassDetails();
      checkExistingBooking();
      fetchActualParticipantCount();
    } else {
      setLoading(false);
    }
  }, [id]);

  const fetchClassDetails = async () => {
    if (!id) return;
    
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
        .eq('id', id)
        .single();

      if (error) throw error;
      setYogaClass(data);
    } catch (error) {
      console.error('Error fetching class details:', error);
      Alert.alert('Error', 'Failed to load class details.');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchActualParticipantCount = async () => {
    if (!id) return;

    try {
      const { count, error } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', id)
        .eq('status', 'confirmed')
        .eq('payment_status', 'completed');

      if (error) throw error;
      setActualParticipantCount(count || 0);
    } catch (error) {
      console.error('Error fetching participant count:', error);
      setActualParticipantCount(0);
    }
  };

  const checkExistingBooking = async () => {
    if (!profile?.id || !id) return;

    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('student_id', profile.id)
        .eq('class_id', id)
        .eq('status', 'confirmed')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setExistingBooking(data);
      }
    } catch (error) {
      console.error('Error checking existing booking:', error);
    }
  };

  const handleBookClass = async () => {
    if (!profile?.id || !yogaClass) return;

    // Check if class is full based on actual count
    const maxCapacity = yogaClass.is_retreat ? yogaClass.retreat_capacity : yogaClass.max_participants;
    if (actualParticipantCount >= (maxCapacity || yogaClass.max_participants)) {
      Alert.alert('Class Full', 'This class is already full.');
      return;
    }

    // Check if already booked
    if (existingBooking) {
      // Navigate to payment if booking exists but payment is pending
      if (existingBooking.payment_status === 'pending') {
        router.push({
          pathname: '/payment/[classId]',
          params: { 
            classId: yogaClass.id,
            bookingId: existingBooking.id 
          }
        });
        return;
      }
      
      Alert.alert('Already Booked', 'You have already booked this class.');
      return;
    }

    setBooking(true);
    try {
      // First check if we can book this class
      const { data: canBookData, error: canBookError } = await supabase.rpc('can_student_book_class', {
        p_student_id: profile.id,
        p_class_id: yogaClass.id
      });

      if (canBookError) throw canBookError;

      if (!canBookData.can_book) {
        let alertTitle = 'Cannot Book Class';
        let alertMessage = canBookData.message || 'Unable to book this class.';

        switch (canBookData.reason) {
          case 'already_booked':
            alertTitle = 'Already Booked';
            alertMessage = 'You have already booked this class.';
            await checkExistingBooking();
            break;
          case 'class_full':
            alertTitle = 'Class Full';
            alertMessage = 'This class is now full. Please try another class.';
            await fetchActualParticipantCount();
            break;
          case 'class_past':
            alertTitle = 'Class Unavailable';
            alertMessage = 'This class has already started or ended.';
            break;
          default:
            alertTitle = 'Booking Failed';
            break;
        }

        Alert.alert(alertTitle, alertMessage);
        return;
      }

      // Use the secure booking function that handles participant count management
      const { data, error } = await supabase.rpc('create_booking_with_count', {
        p_student_id: profile.id,
        p_class_id: yogaClass.id,
        p_status: 'confirmed',
        p_payment_status: 'pending'
      });

      if (error) {
        // Handle specific error cases
        if (error.message.includes('already has a booking')) {
          Alert.alert('Already Booked', 'You have already booked this class.');
          await checkExistingBooking();
          return;
        } else if (error.message.includes('Class is full')) {
          Alert.alert('Class Full', 'This class is now full. Please try another class.');
          await fetchActualParticipantCount();
          return;
        } else if (error.message.includes('Cannot book past classes')) {
          Alert.alert('Class Unavailable', 'This class has already started or ended.');
          return;
        } else if (error.message.includes('duplicate key value violates unique constraint')) {
          Alert.alert('Already Booked', 'You have already booked this class.');
          await checkExistingBooking();
          return;
        } else if (error.message.includes('Booking system is busy')) {
          Alert.alert('System Busy', 'The booking system is currently busy. Please try again in a moment.');
          return;
        }
        throw error;
      }

      // Refresh all data to ensure UI is in sync
      await Promise.all([
        fetchActualParticipantCount(),
        checkExistingBooking(),
        fetchClassDetails()
      ]);

      // Navigate to payment screen
      router.push({
        pathname: '/payment/[classId]',
        params: { 
          classId: yogaClass.id,
          bookingId: data 
        }
      });
    } catch (error) {
      console.error('Error booking class:', error);
      
      let errorMessage = 'Failed to book the class. Please try again.';
      
      if (error && typeof error === 'object' && 'message' in error) {
        if (error.message.includes('duplicate key value violates unique constraint')) {
          errorMessage = 'You have already booked this class.';
        } else if (error.message.includes('already has a booking')) {
          errorMessage = 'You have already booked this class.';
        } else if (error.message.includes('Class is full')) {
          errorMessage = 'This class is now full. Please try another class.';
        } else if (error.message.includes('Cannot book past classes')) {
          errorMessage = 'This class has already started or ended.';
        } else if (error.message.includes('Booking system is busy')) {
          errorMessage = 'The booking system is currently busy. Please try again in a moment.';
        }
      }
      
      Alert.alert('Booking Failed', errorMessage);
      
      // Refresh data to ensure UI is in sync
      await Promise.all([
        fetchActualParticipantCount(),
        checkExistingBooking()
      ]);
    } finally {
      setBooking(false);
    }
  };

  const handleJoinOnlineClass = () => {
    if (yogaClass?.meeting_link) {
      Linking.openURL(yogaClass.meeting_link).catch(() => {
        Alert.alert('Error', 'Unable to open the meeting link.');
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateRange = () => {
    if (!yogaClass?.retreat_end_date) return formatDate(yogaClass?.date || '');
    
    const start = new Date(yogaClass.date);
    const end = new Date(yogaClass.retreat_end_date);
    
    const startMonth = start.toLocaleDateString('en-US', { month: 'long' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'long' });
    const startDay = start.getDate();
    const endDay = end.getDate();
    const year = start.getFullYear();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}, ${year}`;
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
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

  const isClassFull = () => {
    if (!yogaClass) return false;
    const maxCapacity = yogaClass.is_retreat ? yogaClass.retreat_capacity : yogaClass.max_participants;
    return actualParticipantCount >= (maxCapacity || yogaClass.max_participants);
  };

  const isClassPast = () => {
    if (!yogaClass) return false;
    const classDateTime = new Date(`${yogaClass.date} ${yogaClass.time}`);
    return classDateTime < new Date();
  };

  const isOnline = () => {
    return yogaClass?.is_virtual || yogaClass?.location.toLowerCase() === 'online';
  };

  const isEarlyBirdActive = () => {
    if (!yogaClass?.early_bird_deadline) return false;
    return new Date(yogaClass.early_bird_deadline) >= new Date();
  };

  const getCurrentPrice = () => {
    if (!yogaClass) return 0;
    return isEarlyBirdActive() && yogaClass.early_bird_price 
      ? yogaClass.early_bird_price 
      : yogaClass.price;
  };

  const getDuration = () => {
    if (!yogaClass?.retreat_end_date) return 1;
    const start = new Date(yogaClass.date);
    const end = new Date(yogaClass.retreat_end_date);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C4896F" />
          <Text style={styles.loadingText}>Loading details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!id || !yogaClass) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {!id ? 'Invalid class ID.' : 'Class not found.'}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const classPast = isClassPast();
  const classFull = isClassFull();
  const classOnline = isOnline();
  const teacherName = yogaClass.profiles?.full_name || 'Unknown Teacher';
  const isRetreat = yogaClass.is_retreat;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isRetreat ? 'Retreat Details' : 'Class Details'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Class/Retreat Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ 
              uri: isRetreat 
                ? (yogaClass.retreat_image_url || 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=800')
                : (yogaClass.image_url || 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=800')
            }}
            style={styles.classImage}
            resizeMode="cover"
          />
          {isRetreat && (
            <View style={styles.durationBadgeContainer}>
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{getDuration()}-Day Retreat</Text>
              </View>
            </View>
          )}
        </View>

        {/* Teacher Info */}
        <View style={styles.teacherSection}>
          <View style={styles.teacherInfo}>
            <View style={styles.teacherAvatar}>
              <User size={24} color="white" />
            </View>
            <View style={styles.teacherDetails}>
              <Text style={styles.teacherName}>
                {teacherName}
              </Text>
              <View style={styles.teacherRating}>
                <Star size={14} color="#FFD700" fill="#FFD700" />
                <Text style={styles.ratingText}>4.8 (127 reviews)</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Class Header */}
        <View style={styles.classHeader}>
          <View style={styles.classHeaderContent}>
            <Text style={styles.classTitle}>{yogaClass.title}</Text>
            <Text style={styles.classType}>{yogaClass.type}</Text>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>{yogaClass.level}</Text>
            </View>
          </View>
        </View>

        {/* Class Details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>{isRetreat ? 'Retreat Information' : 'Class Information'}</Text>
          
          <View style={styles.detailItem}>
            <Calendar size={20} color="#8B7355" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>{isRetreat ? 'Dates' : 'Date'}</Text>
              <Text style={styles.detailValue}>{isRetreat ? formatDateRange() : formatDate(yogaClass.date)}</Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Clock size={20} color="#8B7355" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Start Time</Text>
              <Text style={styles.detailValue}>
                {formatTime(yogaClass.time)}
                {!isRetreat && ` (${yogaClass.duration} minutes)`}
              </Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            {classOnline ? (
              <Globe size={20} color="#4CAF50" />
            ) : (
              <MapPin size={20} color="#8B7355" />
            )}
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={[
                styles.detailValue,
                classOnline && styles.onlineText
              ]}>
                {classOnline ? 'Online Experience' : yogaClass.location}
              </Text>
              {classOnline && yogaClass.meeting_link && existingBooking && existingBooking.payment_status === 'completed' && (
                <TouchableOpacity
                  style={styles.joinButton}
                  onPress={handleJoinOnlineClass}
                >
                  <Text style={styles.joinButtonText}>Join Meeting</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.detailItem}>
            <Users size={20} color="#8B7355" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Participants</Text>
              <View style={styles.participantInfo}>
                <Text style={[
                  styles.detailValue,
                  classFull && styles.fullText
                ]}>
                  {actualParticipantCount} / {isRetreat ? yogaClass.retreat_capacity : yogaClass.max_participants}
                  {classFull && ' (Full)'}
                </Text>
                <View style={styles.participantIndicator}>
                  <View style={[
                    styles.participantBar,
                    { 
                      width: `${Math.min((actualParticipantCount / (isRetreat ? yogaClass.retreat_capacity : yogaClass.max_participants)) * 100, 100)}%` 
                    }
                  ]} />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.detailItem}>
            <DollarSign size={20} color="#8B7355" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Price</Text>
              <View style={styles.priceContainer}>
                {isEarlyBirdActive() && yogaClass.early_bird_price && (
                  <>
                    <Text style={styles.earlyBirdLabel}>Early Bird Price</Text>
                    <Text style={styles.priceValue}>€{yogaClass.early_bird_price}</Text>
                    <Text style={styles.regularPriceLabel}>Regular Price: €{yogaClass.price}</Text>
                  </>
                )}
                {(!isEarlyBirdActive() || !yogaClass.early_bird_price) && (
                  <Text style={styles.priceValue}>€{yogaClass.price}</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Retreat Highlights */}
        {isRetreat && yogaClass.retreat_highlights && yogaClass.retreat_highlights.length > 0 && (
          <View style={styles.highlightsSection}>
            <Text style={styles.sectionTitle}>Retreat Highlights</Text>
            <View style={styles.highlightsList}>
              {yogaClass.retreat_highlights.map((highlight, index) => (
                <View key={index} style={styles.highlightItem}>
                  <View style={styles.highlightBullet} />
                  <Text style={styles.highlightText}>{highlight}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Description */}
        {yogaClass.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>About This {isRetreat ? 'Retreat' : 'Class'}</Text>
            <Text style={styles.description}>{yogaClass.description}</Text>
          </View>
        )}

        {/* Booking Status */}
        {existingBooking && (
          <View style={styles.bookingStatus}>
            <CheckCircle size={20} color="#4CAF50" />
            <View style={styles.bookingStatusContent}>
              <Text style={styles.bookingStatusText}>
                {existingBooking.payment_status === 'completed' 
                  ? `You're booked for this ${isRetreat ? 'retreat' : 'class'}!` 
                  : "Booking created - Payment pending"
                }
              </Text>
              <Text style={styles.participantCountText}>
                {actualParticipantCount} participants enrolled
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Book Now Button */}
      {profile?.role === 'student' && !classPast && (
        <View style={styles.bookingSection}>
          <TouchableOpacity
            style={[
              styles.bookButton,
              (classFull || booking) && styles.bookButtonDisabled,
              existingBooking && existingBooking.payment_status === 'pending' && styles.bookButtonPending
            ]}
            onPress={handleBookClass}
            disabled={(classFull && !existingBooking) || booking}
          >
            {booking ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.bookButtonText}>
                {existingBooking 
                  ? existingBooking.payment_status === 'pending'
                    ? 'Complete Payment'
                    : 'Already Booked'
                  : classFull 
                    ? `${isRetreat ? 'Retreat' : 'Class'} Full` 
                    : `Book Now - €${getCurrentPrice()}`
                }
              </Text>
            )}
          </TouchableOpacity>
          {!existingBooking && !classFull && (
            <Text style={styles.spotsLeftText}>
              {(isRetreat ? yogaClass.retreat_capacity : yogaClass.max_participants) - actualParticipantCount} spots left
            </Text>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4EDE4',
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
    backgroundColor: '#8B7355',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  imageContainer: {
    height: 250,
    position: 'relative',
  },
  classImage: {
    width: '100%',
    height: '100%',
  },
  durationBadgeContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  durationBadge: {
    backgroundColor: 'rgba(139, 115, 85, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  durationText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
  },
  teacherSection: {
    backgroundColor: 'white',
    padding: 20,
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#8B7355',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  teacherDetails: {
    flex: 1,
  },
  teacherName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  teacherRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    color: '#666',
  },
  classHeader: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 8,
  },
  classHeaderContent: {
    alignItems: 'flex-start',
  },
  classTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  classType: {
    fontSize: 16,
    color: '#8B7355',
    fontWeight: '500',
    marginBottom: 12,
  },
  levelBadge: {
    backgroundColor: '#8B7355',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  levelText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  detailsSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  detailContent: {
    flex: 1,
    marginLeft: 16,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  participantInfo: {
    flex: 1,
  },
  participantIndicator: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  participantBar: {
    height: '100%',
    backgroundColor: '#8B7355',
    borderRadius: 2,
  },
  onlineText: {
    color: '#4CAF50',
  },
  fullText: {
    color: '#FF6B6B',
  },
  priceContainer: {
    marginTop: 4,
  },
  earlyBirdLabel: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '500',
    marginBottom: 2,
  },
  priceValue: {
    fontSize: 20,
    color: '#8B7355',
    fontWeight: '700',
  },
  regularPriceLabel: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
    textDecorationLine: 'line-through',
  },
  joinButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  joinButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  highlightsSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 8,
  },
  highlightsList: {
    marginTop: 8,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  highlightBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8B7355',
    marginTop: 6,
    marginRight: 12,
  },
  highlightText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
    lineHeight: 22,
  },
  descriptionSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 8,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  bookingStatus: {
    backgroundColor: '#E8F5E8',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bookingStatusContent: {
    flex: 1,
  },
  bookingStatusText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 2,
  },
  participantCountText: {
    fontSize: 14,
    color: '#4CAF50',
    opacity: 0.8,
  },
  bookingSection: {
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
  bookButton: {
    backgroundColor: '#8B7355',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  bookButtonDisabled: {
    backgroundColor: '#CCC',
  },
  bookButtonPending: {
    backgroundColor: '#FF9800',
  },
  bookButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  spotsLeftText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
});