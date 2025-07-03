import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Linking,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft,
  Heart,
  Star,
  Calendar,
  Clock,
  MapPin,
  Globe,
  Instagram,
  Facebook,
  Twitter,
  Award,
  Mail,
  Phone,
  ExternalLink,
  User
} from 'lucide-react-native';
import TeacherAvatar from '@/components/TeacherAvatar';
import type { Database } from '@/lib/supabase';

type TeacherProfile = Database['public']['Tables']['profiles']['Row'] & {
  bio?: string;
  experience_years?: number;
  specialties?: string[];
  certifications?: string[];
  social_links?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    website?: string;
  };
  phone?: string;
};

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'];

type Review = {
  id: string;
  student_id: string;
  teacher_id: string;
  class_id: string;
  rating: number;
  comment: string;
  created_at: string;
  student_name: string;
  student_avatar?: string;
  class_title?: string;
};

const { width } = Dimensions.get('window');
const CARD_WIDTH = width < 768 ? width - 40 : (width - 80) / 3;

export default function TeacherProfileScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const teacherId = typeof params.id === 'string' ? params.id : '';
  
  const [teacher, setTeacher] = useState<TeacherProfile | null>(null);
  const [upcomingClasses, setUpcomingClasses] = useState<YogaClass[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loadingFavorite, setLoadingFavorite] = useState(false);
  const [activeTab, setActiveTab] = useState<'classes' | 'reviews'>('classes');

  useEffect(() => {
    if (teacherId) {
      fetchTeacherProfile();
      fetchUpcomingClasses();
      fetchReviews();
      checkIfFavorite();
    }
  }, [teacherId]);

  const fetchTeacherProfile = async () => {
    try {
      // First get the basic profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', teacherId)
        .eq('role', 'teacher')
        .single();

      if (profileError) throw profileError;
      
      // Then get the teacher profile details
      const { data: teacherProfileData, error: teacherProfileError } = await supabase
        .from('teacher_profiles')
        .select('*')
        .eq('id', teacherId)
        .maybeSingle();
      
      if (teacherProfileError && teacherProfileError.code !== 'PGRST116') throw teacherProfileError;
      
      // Combine the data
      const teacherData = {
        ...profileData,
        bio: teacherProfileData?.bio || '',
        experience_years: teacherProfileData?.experience_years || 0,
        specialties: teacherProfileData?.specialties || [],
        certifications: teacherProfileData?.certifications || [],
        social_links: teacherProfileData?.social_links || {},
        phone: teacherProfileData?.phone || ''
      };
      
      setTeacher(teacherData);
    } catch (error) {
      console.error('Error fetching teacher profile:', error);
    }
  };

  const fetchUpcomingClasses = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('yoga_classes')
        .select('*')
        .eq('teacher_id', teacherId)
        .gte('date', today)
        .order('date', { ascending: true })
        .order('time', { ascending: true })
        .limit(10);

      if (error) throw error;
      setUpcomingClasses(data || []);
    } catch (error) {
      console.error('Error fetching upcoming classes:', error);
    }
  };

  const fetchReviews = async () => {
    try {
      const { data, error } = await supabase
        .from('teacher_reviews')
        .select(`
          *,
          profiles!teacher_reviews_student_id_fkey (
            full_name,
            avatar_url
          ),
          yoga_classes!teacher_reviews_class_id_fkey (
            title
          )
        `)
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Calculate average rating
      if (data && data.length > 0) {
        const total = data.reduce((sum, review) => sum + review.rating, 0);
        setAverageRating(total / data.length);
        
        // Format reviews
        const formattedReviews = data.map(review => ({
          id: review.id,
          student_id: review.student_id,
          teacher_id: review.teacher_id,
          class_id: review.class_id,
          rating: review.rating,
          comment: review.comment,
          created_at: review.created_at,
          student_name: review.profiles?.full_name || 'Anonymous Student',
          student_avatar: review.profiles?.avatar_url,
          class_title: review.yoga_classes?.title
        }));
        
        setReviews(formattedReviews);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkIfFavorite = async () => {
    if (!profile?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('saved_teachers')
        .select('id')
        .eq('student_id', profile.id)
        .eq('teacher_id', teacherId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      setIsFavorite(!!data);
    } catch (error) {
      console.error('Error checking favorite status:', error);
    }
  };

  const toggleFavorite = async () => {
    if (!profile?.id) {
      Alert.alert('Sign In Required', 'Please sign in to save favorite teachers');
      return;
    }
    
    setLoadingFavorite(true);
    
    try {
      // Optimistic update
      setIsFavorite(!isFavorite);
      
      if (isFavorite) {
        // Remove from favorites
        const { error } = await supabase
          .from('saved_teachers')
          .delete()
          .eq('student_id', profile.id)
          .eq('teacher_id', teacherId);
          
        if (error) throw error;
      } else {
        // Check if entry already exists to avoid duplicate key error
        const { data: existingData, error: checkError } = await supabase
          .from('saved_teachers')
          .select('id')
          .eq('student_id', profile.id)
          .eq('teacher_id', teacherId)
          .maybeSingle();
          
        if (checkError && checkError.code !== 'PGRST116') throw checkError;
        
        // Only insert if no existing entry
        if (!existingData) {
          const { error } = await supabase
            .from('saved_teachers')
            .insert({
              student_id: profile.id,
              teacher_id: teacherId
            });
            
          if (error) throw error;
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      
      // Revert optimistic update on error
      setIsFavorite(!isFavorite);
      Alert.alert('Error', 'Failed to update favorite status. Please try again.');
    } finally {
      setLoadingFavorite(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
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

  const formatReviewDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} ${years === 1 ? 'year' : 'years'} ago`;
    }
  };

  const openLink = (url: string) => {
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    Linking.openURL(url);
  };

  const handleClassPress = (classId: string) => {
    router.push(`/class-detail/${classId}`);
  };

  const renderRatingStars = (rating: number, size: number = 16) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star 
            key={star} 
            size={size} 
            color="#FFD700" 
            fill={star <= rating ? "#FFD700" : "transparent"} 
          />
        ))}
      </View>
    );
  };

  const renderClassCard = (yogaClass: YogaClass) => {
    const isOnline = yogaClass.is_virtual || yogaClass.location.toLowerCase() === 'online';
    
    return (
      <TouchableOpacity 
        style={styles.classCard}
        onPress={() => handleClassPress(yogaClass.id)}
      >
        <View style={styles.classImageContainer}>
          <Image
            source={{ 
              uri: yogaClass.image_url || 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=400'
            }}
            style={styles.classImage}
            resizeMode="cover"
          />
          <View style={styles.classTypeTag}>
            <Text style={styles.classTypeText}>{yogaClass.type}</Text>
          </View>
        </View>
        
        <View style={styles.classCardContent}>
          <Text style={styles.classTitle} numberOfLines={1}>{yogaClass.title}</Text>
          
          <View style={styles.classDetails}>
            <View style={styles.classDetailItem}>
              <Calendar size={12} color="#666" />
              <Text style={styles.classDetailText}>{formatDate(yogaClass.date)}</Text>
            </View>
            
            <View style={styles.classDetailItem}>
              <Clock size={12} color="#666" />
              <Text style={styles.classDetailText}>{formatTime(yogaClass.time)}</Text>
            </View>
            
            <View style={styles.classDetailItem}>
              {isOnline ? (
                <Globe size={12} color="#4CAF50" />
              ) : (
                <MapPin size={12} color="#666" />
              )}
              <Text style={[
                styles.classDetailText,
                isOnline && styles.onlineText
              ]}>
                {isOnline ? 'Online' : yogaClass.location}
              </Text>
            </View>
          </View>
          
          <View style={styles.classFooter}>
            <Text style={styles.classPrice}>${yogaClass.price}</Text>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>{yogaClass.level}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderReviewCard = (review: Review) => {
    return (
      <View key={review.id} style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <View style={styles.reviewerInfo}>
            <View style={styles.reviewerAvatar}>
              {review.student_avatar ? (
                <Image 
                  source={{ uri: review.student_avatar }} 
                  style={styles.avatarImage} 
                />
              ) : (
                <User size={16} color="white" />
              )}
            </View>
            <View>
              <Text style={styles.reviewerName}>{review.student_name}</Text>
              <Text style={styles.reviewDate}>{formatReviewDate(review.created_at)}</Text>
            </View>
          </View>
          {renderRatingStars(review.rating, 14)}
        </View>
        
        {review.class_title && (
          <Text style={styles.reviewClassTitle}>
            Class: {review.class_title}
          </Text>
        )}
        
        <Text style={styles.reviewComment}>{review.comment}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B7355" />
          <Text style={styles.loadingText}>Loading teacher profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!teacher) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#333" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Teacher not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backToExploreButton}>
            <Text style={styles.backToExploreText}>Back to Explore</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#333" />
        </TouchableOpacity>
        {profile?.role === 'student' && (
          <TouchableOpacity 
            onPress={toggleFavorite} 
            style={styles.favoriteButton}
            disabled={loadingFavorite}
          >
            {loadingFavorite ? (
              <ActivityIndicator size="small" color="#FF6B6B" />
            ) : (
              <Heart 
                size={24} 
                color={isFavorite ? '#FF6B6B' : '#666'} 
                fill={isFavorite ? '#FF6B6B' : 'transparent'} 
              />
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Teacher Profile Header */}
        <View style={styles.profileHeader}>
          <TeacherAvatar
            teacherId={teacher.id}
            teacherName={teacher.full_name}
            avatarUrl={teacher.avatar_url}
            size="EXTRA_LARGE"
          />
          
          <View style={styles.profileInfo}>
            <Text style={styles.teacherName}>{teacher.full_name}</Text>
            
            <View style={styles.ratingContainer}>
              {renderRatingStars(averageRating)}
              <Text style={styles.ratingText}>
                {averageRating.toFixed(1)} ({reviews.length} reviews)
              </Text>
            </View>
            
            {teacher.experience_years && (
              <View style={styles.experienceTag}>
                <Text style={styles.experienceText}>
                  {teacher.experience_years} years experience
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Teacher Bio */}
        {teacher.bio && (
          <View style={styles.bioSection}>
            <Text style={styles.bioText}>{teacher.bio}</Text>
          </View>
        )}

        {/* Specialties */}
        {teacher.specialties && teacher.specialties.length > 0 && (
          <View style={styles.specialtiesSection}>
            <Text style={styles.sectionTitle}>Specialties</Text>
            <View style={styles.specialtiesTags}>
              {teacher.specialties.map((specialty, index) => (
                <View key={index} style={styles.specialtyTag}>
                  <Text style={styles.specialtyText}>{specialty}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Certifications */}
        {teacher.certifications && teacher.certifications.length > 0 && (
          <View style={styles.certificationsSection}>
            <Text style={styles.sectionTitle}>Certifications</Text>
            <View style={styles.certificationsList}>
              {teacher.certifications.map((certification, index) => (
                <View key={index} style={styles.certificationItem}>
                  <Award size={16} color="#8B7355" />
                  <Text style={styles.certificationText}>{certification}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Contact & Social */}
        <View style={styles.contactSection}>
          <Text style={styles.sectionTitle}>Contact & Social</Text>
          
          <View style={styles.contactList}>
            <TouchableOpacity 
              style={styles.contactItem}
              onPress={() => Linking.openURL(`mailto:${teacher.email}`)}
            >
              <Mail size={16} color="#8B7355" />
              <Text style={styles.contactText}>{teacher.email}</Text>
            </TouchableOpacity>
            
            {teacher.phone && (
              <TouchableOpacity 
                style={styles.contactItem}
                onPress={() => Linking.openURL(`tel:${teacher.phone}`)}
              >
                <Phone size={16} color="#8B7355" />
                <Text style={styles.contactText}>{teacher.phone}</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {teacher.social_links && Object.keys(teacher.social_links).length > 0 && (
            <View style={styles.socialLinks}>
              {teacher.social_links.instagram && (
                <TouchableOpacity 
                  style={styles.socialButton}
                  onPress={() => openLink(teacher.social_links?.instagram || '')}
                >
                  <Instagram size={20} color="white" />
                </TouchableOpacity>
              )}
              
              {teacher.social_links.facebook && (
                <TouchableOpacity 
                  style={styles.socialButton}
                  onPress={() => openLink(teacher.social_links?.facebook || '')}
                >
                  <Facebook size={20} color="white" />
                </TouchableOpacity>
              )}
              
              {teacher.social_links.twitter && (
                <TouchableOpacity 
                  style={styles.socialButton}
                  onPress={() => openLink(teacher.social_links?.twitter || '')}
                >
                  <Twitter size={20} color="white" />
                </TouchableOpacity>
              )}
              
              {teacher.social_links.website && (
                <TouchableOpacity 
                  style={styles.socialButton}
                  onPress={() => openLink(teacher.social_links?.website || '')}
                >
                  <ExternalLink size={20} color="white" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'classes' && styles.activeTab]}
            onPress={() => setActiveTab('classes')}
          >
            <Text style={[styles.tabText, activeTab === 'classes' && styles.activeTabText]}>
              Upcoming Classes
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'reviews' && styles.activeTab]}
            onPress={() => setActiveTab('reviews')}
          >
            <Text style={[styles.tabText, activeTab === 'reviews' && styles.activeTabText]}>
              Reviews ({reviews.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Classes Tab Content */}
        {activeTab === 'classes' && (
          <View style={styles.tabContent}>
            {upcomingClasses.length > 0 ? (
              <FlatList
                data={upcomingClasses}
                renderItem={({ item }) => renderClassCard(item)}
                keyExtractor={item => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.classesContainer}
                scrollEnabled={upcomingClasses.length > 3}
                numColumns={Math.min(3, upcomingClasses.length)}
                key={Math.min(3, upcomingClasses.length)}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No upcoming classes</Text>
              </View>
            )}
          </View>
        )}

        {/* Reviews Tab Content */}
        {activeTab === 'reviews' && (
          <View style={styles.tabContent}>
            {reviews.length > 0 ? (
              <View style={styles.reviewsContainer}>
                {reviews.map(review => renderReviewCard(review))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No reviews yet</Text>
              </View>
            )}
          </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: 'white',
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  favoriteButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
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
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  backToExploreButton: {
    backgroundColor: '#8B7355',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backToExploreText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  profileHeader: {
    backgroundColor: 'white',
    padding: 20,
    alignItems: 'center',
  },
  profileInfo: {
    alignItems: 'center',
    marginTop: 16,
  },
  teacherName: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    marginRight: 8,
  },
  ratingText: {
    fontSize: 14,
    color: '#666',
  },
  experienceTag: {
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  experienceText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  bioSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 8,
  },
  bioText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  specialtiesSection: {
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
  specialtiesTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specialtyTag: {
    backgroundColor: '#F4EDE4',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  specialtyText: {
    fontSize: 14,
    color: '#8B7355',
    fontWeight: '500',
  },
  certificationsSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 8,
  },
  certificationsList: {
    gap: 12,
  },
  certificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  certificationText: {
    fontSize: 14,
    color: '#333',
  },
  contactSection: {
    backgroundColor: 'white',
    padding: 20,
    marginTop: 8,
  },
  contactList: {
    gap: 12,
    marginBottom: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactText: {
    fontSize: 14,
    color: '#333',
  },
  socialLinks: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    backgroundColor: '#8B7355',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#8B7355',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#8B7355',
  },
  tabContent: {
    backgroundColor: 'white',
    padding: 20,
  },
  classesContainer: {
    gap: 16,
  },
  classCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    width: CARD_WIDTH,
    marginRight: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  classImageContainer: {
    height: 120,
    position: 'relative',
  },
  classImage: {
    width: '100%',
    height: '100%',
  },
  classTypeTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(139, 115, 85, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  classTypeText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '500',
  },
  classCardContent: {
    padding: 12,
  },
  classTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  classDetails: {
    gap: 4,
    marginBottom: 8,
  },
  classDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  classDetailText: {
    fontSize: 12,
    color: '#666',
  },
  onlineText: {
    color: '#4CAF50',
  },
  classFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  classPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B7355',
  },
  levelBadge: {
    backgroundColor: '#F4EDE4',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: 10,
    color: '#8B7355',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  reviewsContainer: {
    gap: 16,
  },
  reviewCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  reviewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8B7355',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  reviewDate: {
    fontSize: 12,
    color: '#999',
  },
  reviewClassTitle: {
    fontSize: 12,
    color: '#8B7355',
    fontWeight: '500',
    marginBottom: 8,
  },
  reviewComment: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});