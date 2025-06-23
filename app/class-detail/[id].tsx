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
import { ArrowLeft, Calendar, Clock, MapPin, User, Users, Globe, DollarSign, Star, CircleCheck as CheckCircle } from 'lucide-react-native';
import type { Database } from '@/lib/supabase';

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'] & {
  profiles: {
    full_name: string;
    avatar_url?: string;
  };
};

type Booking = Database['public']['Tables']['bookings']['Row'];

export default function ClassDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const [yogaClass, setYogaClass] = useState<YogaClass | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [existingBooking, setExistingBooking] = useState<Booking | null>(null);

  useEffect(() => {
    if (id) {
      fetchClassDetails();
      checkExistingBooking();
    }
  }, [id]);

  const fetchClassDetails = async () => {
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

  const handleBookClass = async () => {
    if (!profile?.id || !yogaClass) return;

    // Check if class is full
    if (yogaClass.current_participants >= yogaClass.max_participants) {
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

      // Update class participant count
      const { error: updateError } = await supabase
        .from('yoga_classes')
        .update({ 
          current_participants: yogaClass.current_participants + 1 
        })
        .eq('id', yogaClass.id);

      if (updateError) throw updateError;

      // Update local state
      setYogaClass(prev => prev ? {
        ...prev,
        current_participants: prev.current_participants + 1
      } : null);

      // Refresh booking status
      checkExistingBooking();

      Alert.alert(
        'Booking Confirmed!', 
        'Your class has been booked successfully. You can view it in your bookings.',
        [
          { text: 'OK', onPress: () => router.back() }
        ]
      );
    } catch (error) {
      console.error('Error booking class:', error);
      Alert.alert('Booking Failed', 'Failed to book the class. Please try again.');
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
    return yogaClass ? yogaClass.current_participants >= yogaClass.max_participants : false;
  };

  const isClassPast = () => {
    if (!yogaClass) return false;
    const classDateTime = new Date(`${yogaClass.date} ${yogaClass.time}`);
    return classDateTime < new Date();
  };

  const isOnline = () => {
    return yogaClass?.location.toLowerCase() === 'online';
  };

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

  if (!yogaClass) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Class not found.</Text>
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
            <View style={styles.teacherAvatar}>
              <User size={24} color="white" />
            </View>
            <View style={styles.teacherDetails}>
              <Text style={styles.teacherName}>
                {yogaClass.profiles?.full_name || 'Unknown Teacher'}
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
              <Text style={[
                styles.detailValue,
                classFull && styles.fullText
              ]}>
                {yogaClass.current_participants} / {yogaClass.max_participants}
                {classFull && ' (Full)'}
              </Text>
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
            <Text style={styles.bookingStatusText}>You're booked for this class!</Text>
          </View>
        )}
      </ScrollView>

      {/* Book Now Button */}
      {profile?.role === 'student' && !classPast && (
        <View style={styles.bookingSection}>
          <TouchableOpacity
            style={[
              styles.bookButton,
              (classFull || existingBooking || booking) && styles.bookButtonDisabled
            ]}
            onPress={handleBookClass}
            disabled={classFull || existingBooking || booking}
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
    paddingBottom: 120,
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
  teacherAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#C4896F',
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
  bookingStatusText: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
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
});