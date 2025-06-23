import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  BackHandler,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CircleCheck as CheckCircle, Calendar, Clock, ArrowRight } from 'lucide-react-native';

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    classId: string;
    bookingId: string;
    classTitle: string;
    instructorName: string;
    classDate: string;
    classTime: string;
    price: string;
  }>();

  const [scaleAnim] = useState(new Animated.Value(0));
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  useEffect(() => {
    // Prevent back navigation
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);

    // Start animations
    startAnimations();

    return () => backHandler.remove();
  }, []);

  const startAnimations = () => {
    // Checkmark animation
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.2,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Content fade in
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        delay: 300,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    return `${hours}:${minutes}`;
  };

  const handleGoToBookings = () => {
    router.replace('/(tabs)/bookings');
  };

  const handleViewClassDetails = () => {
    router.replace(`/class-detail/${params.classId}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Animation */}
        <View style={styles.animationContainer}>
          <Animated.View 
            style={[
              styles.checkmarkContainer,
              { transform: [{ scale: scaleAnim }] }
            ]}
          >
            <CheckCircle size={80} color="#4CAF50" />
          </Animated.View>
        </View>

        {/* Success Content */}
        <Animated.View 
          style={[
            styles.textContainer,
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <Text style={styles.successTitle}>Payment Successful!</Text>
          <Text style={styles.successSubtitle}>
            Your yoga class has been booked and paid for.
          </Text>
        </Animated.View>

        {/* Class Details */}
        <Animated.View 
          style={[
            styles.detailsCard,
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <Text style={styles.detailsTitle}>Class Details</Text>
          
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Class</Text>
            <Text style={styles.detailValue}>{params.classTitle}</Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Instructor</Text>
            <Text style={styles.detailValue}>{params.instructorName}</Text>
          </View>

          <View style={styles.detailItem}>
            <Calendar size={16} color="#666" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Scheduled</Text>
              <Text style={styles.detailValue}>
                {formatDate(params.classDate)}
              </Text>
            </View>
          </View>

          <View style={styles.detailItem}>
            <Clock size={16} color="#666" />
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>
                {formatTime(params.classTime)}
              </Text>
            </View>
          </View>

          <View style={styles.priceDivider} />
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Amount Paid</Text>
            <Text style={styles.priceValue}>${params.price}</Text>
          </View>
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View 
          style={[
            styles.buttonContainer,
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleGoToBookings}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Go to My Bookings</Text>
            <ArrowRight size={20} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleViewClassDetails}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>View Class Details</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Confirmation Message */}
        <Animated.View 
          style={[
            styles.confirmationContainer,
            { opacity: fadeAnim }
          ]}
        >
          <Text style={styles.confirmationText}>
            A confirmation email has been sent to your registered email address.
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  animationContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  checkmarkContainer: {
    backgroundColor: '#E8F5E8',
    borderRadius: 60,
    padding: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  detailsCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    minHeight: 24,
  },
  detailContent: {
    flex: 1,
    marginLeft: 12,
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
    flex: 1,
  },
  priceDivider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  priceValue: {
    fontSize: 20,
    color: '#4CAF50',
    fontWeight: '700',
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 30,
  },
  primaryButton: {
    backgroundColor: '#C4896F',
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#C4896F',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#C4896F',
    fontWeight: '600',
  },
  confirmationContainer: {
    alignItems: 'center',
  },
  confirmationText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
});