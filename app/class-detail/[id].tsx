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
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Calendar, Clock, MapPin, Users, Globe, DollarSign, Star, CircleCheck as CheckCircle } from 'lucide-react-native';
import TeacherAvatar from '@/components/TeacherAvatar';
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
        .eq('status', 'confirmed');

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
        .single();

      if (data) {
        setExistingBooking(data);
      }
    } catch (error) {
      // No existing booking found, which is fine
    }
  };

  const syncParticipantCount = async () => {
    if (!id || !yogaClass) return;

    try {
      // Get actual count from bookings
      const { count, error: countError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', id)
        .eq('status', 'confirmed');

      if (countError) throw countError;

      const actualCount = count || 0;
      setActualParticipantCount(actualCount);

      // Update the yoga_classes table if there's a discrepancy
      if (actualCount !== yogaClass.current_participants) {
        const { error: updateError } = await supabase
          .from('yoga_classes')
          .update({ current_participants: actualCount })
          .eq('id', id);

        if (updateError) throw updateError;

        // Update local state
        setYogaClass(prev => prev ? {
          ...prev,
          current_participants: actualCount
        } : null);
      }
    } catch (error) {
      console.error('Error syncing participant count:', error);
    }
  };

  const handleBookClass = async () => {
    if (!profile?.id || !yogaClass) return;

    // Check if class is full based on actual count
    if (actualParticipantCount >= yogaClass.max_participants) {
      Alert.alert('Class Full', 'This class is already full.');
      return;
    }

    // Check if already booked
    if (existingBooking) {
      Alert.alert('Already Booked', 'You have already booked this class.');
      return;
    }

    setBooking(true);
    try {
      // Insert booking
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert([{
          student_id: profile.id,
          class_id: yogaClass.id,
          status: 'confirmed',
        }]);

      if (bookingError) throw bookingError;

      // Calculate new participant count
      const newParticipantCount = actualParticipantCount + 1;

      // Update class participant count in database
      const { error: updateError } = await supabase
        .from('yoga_classes')
        .update({ 
          current_participants: newParticipantCount 
        })
        .eq('id', yogaClass.id);

      if (updateError) throw updateError;

      // Update local state immediately
      setActualParticipantCount(newParticipantCount);
      setYogaClass(prev => prev ? {
        ...prev,
        current_participants: newParticipantCount
      } : null);

      // Refresh booking status
      await checkExistingBooking();

      // Show success message with participant count
      Alert.alert(
        'Booking Confirmed!', 
        `You are booked for this class (${newParticipantCount} participants enrolled)`,
        [
          { text: 'View My Bookings', onPress: () => router.push('/(tabs)/bookings') },
          { text: 'OK', onPress: () => router.back() }
        ]
      );
    } catch (error) {
      console.error('Error booking class:', error);
      Alert.alert('Booking Failed', 'Failed to book the class. Please try again.');
      
      // Refresh participant count in case of error
      await fetchActualParticipantCount();
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
    return actualParticipantCount >= (yogaClass?.max_participants || 0);
  };

  const isClassPast = () => {
    if (!yogaClass) return false;
    const classDateTime = new Date(`${yogaClass.date} ${yogaClass.time}`);
    return classDateTime < new Date();
  };

  const isOnline = () => {
    return yogaClass?.location.toLowerCase() === 'online';
  };

  // Sync participant count when component mounts or when returning from background
  useEffect(() => {
    if (yogaClass) {
      syncParticipantCount();
    }
  }, [yogaClass]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C4896F" />
          <Text style={styles.loadingText}>Loading class details...</Text>
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
        <Text style={styles.headerTitle}>Class Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

        {/* Teacher Info */}
        <View style={styles.teacherSection}>
          <Text style={styles.sectionTitle}>Instructor</Text>
          <View style={styles.teacherInfo}>
            <TeacherAvatar
              teacherId={yogaClass.teacher_id}
              teacherName={teacherName}
              avatarUrl={yogaClass.profiles?.avatar_url}
              size="LARGE"
            />
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

        {/* Class Details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Class Information</Text>
          
          <View style={styles.detailItem}>
            <Calendar size={20} color="#C4896F" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDate(yogaClass.date)}</Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Clock size={20} color="#C4896F" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Time & Duration</Text>
              <Text style={styles.detailValue}>
                {formatTime(yogaClass.time)} ({yogaClass.duration} minutes)
              </Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            {classOnline ? (
              <Globe size={20} color="#4CAF50" />
            ) : (
              <MapPin size={20} color="#C4896F" />
            )}
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={[
                styles.detailValue,
                classOnline && styles.onlineText
              ]}>
                {classOnline ? 'Online Class' : yogaClass.location}
              </Text>
              {classOnline && yogaClass.meeting_link && existingBooking && (
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
            <Users size={20} color="#C4896F" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Participants</Text>
              <View style={styles.participantInfo}>
                <Text style={[
                  styles.detailValue,
                  classFull && styles.fullText
                ]}>
                  {actualParticipantCount} / {yogaClass.max_participants}
                  {classFull && ' (Full)'}
                </Text>
                <View style={styles.participantIndicator}>
                  <View style={[
                    styles.participantBar,
                    { width: `${Math.min((actualParticipantCount / yogaClass.max_participants) * 100, 100)}%` }
                  ]} />
                </View>
              </View>
            </View>
          </View>

          <View style={styles.detailItem}>
            <DollarSign size={20} color="#C4896F" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Price</Text>
              <Text style={styles.priceValue}>${yogaClass.price}</Text>
            </View>
          </View>
        </View>

        {/* Description */}
        {yogaClass.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>About This Class</Text>
            <Text style={styles.description}>{yogaClass.description}</Text>
          </View>
        )}

        {/* Booking Status */}
        {existingBooking && (
          <View style={styles.bookingStatus}>
            <CheckCircle size={20} color="#4CAF50" />
            <View style={styles.bookingStatusContent}>
              <Text style={styles.bookingStatusText}>You're booked for this class!</Text>
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
              (classFull || !!existingBooking || booking) && styles.bookButtonDisabled
            ]}
            onPress={handleBookClass}
            disabled={classFull || !!existingBooking || booking}
          >
            {booking ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.bookButtonText}>
                {existingBooking 
                  ? 'Already Booked' 
                  : classFull 
                    ? 'Class Full' 
                    : `Book Now - $${yogaClass.price}`
                }
              </Text>
            )}
          </TouchableOpacity>
          {!existingBooking && !classFull && (
            <Text style={styles.spotsLeftText}>
              {yogaClass.max_participants - actualParticipantCount} spots left
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
  classHeader: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
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
    color: '#C4896F',
    fontWeight: '500',
    marginBottom: 12,
  },
  levelBadge: {
    backgroundColor: '#C4896F',
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
  teacherSection: {
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
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teacherDetails: {
    flex: 1,
    marginLeft: 16,
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
  detailsSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 8,
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
    backgroundColor: '#C4896F',
    borderRadius: 2,
  },
  onlineText: {
    color: '#4CAF50',
  },
  fullText: {
    color: '#FF6B6B',
  },
  priceValue: {
    fontSize: 20,
    color: '#C4896F',
    fontWeight: '700',
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
    backgroundColor: '#C4896F',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  bookButtonDisabled: {
    backgroundColor: '#CCC',
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