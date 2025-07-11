import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
  FlatList,
  TextInput,
  Dimensions,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Globe, 
  Filter, 
  User, 
  Tent, 
  Search, 
  Heart, 
  X, 
  ChevronDown, 
  Star, 
  SlidersHorizontal 
} from 'lucide-react-native';
import RetreatCard from '@/components/RetreatCard';
import TeacherAvatar from '@/components/TeacherAvatar';
import DateRangePicker from '@/components/DateRangePicker';
import EmptyStateIllustration from '@/components/EmptyStateIllustration';
import type { Database } from '@/lib/supabase';

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'] & {
  profiles: {
    full_name: string;
    avatar_url?: string;
  };
  is_favorite?: boolean;
  average_rating?: number;
};

type FilterState = {
  type: string;
  level: string;
  dateRange: {
    startDate: Date | null;
    endDate: Date | null;
  };
  mode: string; // 'all', 'in-person', 'virtual'
  priceRange: [number, number];
  duration: string; // 'all', '1-3', '4-7', '7+'
  searchQuery: string;
};

const YOGA_TYPES = ['All', 'Hatha', 'Vinyasa', 'Ashtanga', 'Bikram', 'Hot Yoga', 'Yin Yoga', 'Restorative', 'Power Yoga', 'Kundalini', 'Iyengar'];
const LEVELS = ['All', 'beginner', 'intermediate', 'advanced'];
const RETREAT_TYPES = ['All', 'Mindfulness Retreat', 'Yoga & Meditation', 'Wellness Escape', 'Spiritual Journey', 'Detox Retreat', 'Adventure Yoga', 'Healing Retreat', 'Silent Retreat'];

const { width } = Dimensions.get('window');
const CARD_WIDTH = width < 768 ? width - 40 : (width - 60) / 2;
const GRID_SPACING = 16;

export default function ExploreScreen() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<YogaClass[]>([]);
  const [retreats, setRetreats] = useState<YogaClass[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<YogaClass[]>([]);
  const [filteredRetreats, setFilteredRetreats] = useState<YogaClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'classes' | 'retreats'>('classes');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [favoriteTeachers, setFavoriteTeachers] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    type: 'All',
    level: 'All',
    dateRange: {
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Next 7 days
    },
    mode: 'all',
    priceRange: [0, 1000],
    duration: 'all',
    searchQuery: ''
  });

  useEffect(() => {
    if (!authLoading && profile?.role === 'student') {
      fetchClassesAndRetreats();
      fetchFavoriteTeachers();
    }
  }, [authLoading, profile]);

  useEffect(() => {
    applyFilters();
  }, [classes, retreats, filters, activeTab, favoriteTeachers]);

  useEffect(() => {
    if (classes.length > 0 || retreats.length > 0) {
      fetchParticipantCounts();
    }
  }, [classes, retreats]);

  const fetchClassesAndRetreats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('yoga_classes')
        .select(`
          *,
          profiles!yoga_classes_teacher_id_fkey (
            full_name,
            avatar_url
          )
        `)
        .gte('date', today)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;
      
      const allData = data || [];
      const classesData = allData.filter(item => !item.is_retreat);
      const retreatsData = allData.filter(item => item.is_retreat);
      
      // Fetch average ratings for teachers
      const teacherIds = [...new Set(allData.map(item => item.teacher_id))];
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('teacher_ratings')
        .select('teacher_id, avg_rating')
        .in('teacher_id', teacherIds);
      
      if (!ratingsError && ratingsData) {
        const ratingsMap = ratingsData.reduce((acc, curr) => {
          acc[curr.teacher_id] = curr.avg_rating;
          return acc;
        }, {} as Record<string, number>);
        
        // Add ratings to classes and retreats
        const classesWithRatings = classesData.map(cls => ({
          ...cls,
          average_rating: ratingsMap[cls.teacher_id] || 0
        }));
        
        const retreatsWithRatings = retreatsData.map(retreat => ({
          ...retreat,
          average_rating: ratingsMap[retreat.teacher_id] || 0
        }));
        
        setClasses(classesWithRatings);
        setRetreats(retreatsWithRatings);
      } else {
        setClasses(classesData);
        setRetreats(retreatsData);
      }
    } catch (error) {
      console.error('Error fetching classes and retreats:', error);
      Alert.alert('Error', 'Failed to load classes and retreats. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchFavoriteTeachers = async () => {
    if (!profile?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('saved_teachers')
        .select('teacher_id')
        .eq('student_id', profile.id);
        
      if (error) throw error;
      
      setFavoriteTeachers(data?.map(item => item.teacher_id) || []);
    } catch (error) {
      console.error('Error fetching favorite teachers:', error);
    }
  };

  const toggleFavoriteTeacher = async (teacherId: string) => {
    if (!profile?.id) {
      Alert.alert('Sign In Required', 'Please sign in to save favorite teachers');
      return;
    }
    
    try {
      const isFavorite = favoriteTeachers.includes(teacherId);
      
      // Optimistic update
      setFavoriteTeachers(prev => 
        isFavorite 
          ? prev.filter(id => id !== teacherId)
          : [...prev, teacherId]
      );
      
      if (isFavorite) {
        // Remove from favorites
        const { error } = await supabase
          .from('saved_teachers')
          .delete()
          .eq('student_id', profile.id)
          .eq('teacher_id', teacherId);
          
        if (error) throw error;
      } else {
        // Use the secure function to add favorite
        const { error } = await supabase.rpc('save_teacher_for_student', {
          student_id_param: profile.id,
          teacher_id_param: teacherId
        });
          
        if (error) throw error;
      }
    } catch (error) {
      console.error('Error toggling favorite teacher:', error);
      
      // Revert optimistic update on error
      fetchFavoriteTeachers();
      
      Alert.alert('Error', 'Failed to update favorite teachers. Please try again.');
    }
  };

  const fetchParticipantCounts = async () => {
    try {
      const allItems = [...classes, ...retreats];
      const itemIds = allItems.map(item => item.id);
      
      const { data, error } = await supabase
        .from('bookings')
        .select('class_id')
        .in('class_id', itemIds)
        .eq('status', 'confirmed');

      if (error) throw error;

      const counts: Record<string, number> = {};
      itemIds.forEach(id => counts[id] = 0);
      
      data?.forEach(booking => {
        counts[booking.class_id] = (counts[booking.class_id] || 0) + 1;
      });

      setParticipantCounts(counts);

      // Sync any items where the stored count doesn't match actual count
      const syncPromises = allItems
        .filter(item => counts[item.id] !== item.current_participants)
        .map(item => 
          supabase.rpc('sync_participant_count', { class_id_param: item.id })
        );

      if (syncPromises.length > 0) {
        await Promise.all(syncPromises);
        fetchClassesAndRetreats();
      }
    } catch (error: any) {
      console.error('Error fetching participant counts:', error);
    }
  };

  const applyFilters = () => {
    const sourceData = activeTab === 'classes' ? classes : retreats;
    let filtered = [...sourceData];

    // Apply search query
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(query) || 
        item.description.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.profiles.full_name.toLowerCase().includes(query) ||
        item.location.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (filters.type !== 'All') {
      filtered = filtered.filter(item => item.type === filters.type);
    }

    // Filter by level
    if (filters.level !== 'All') {
      filtered = filtered.filter(item => item.level === filters.level);
    }

    // Filter by mode (in-person/virtual)
    if (filters.mode === 'in-person') {
      filtered = filtered.filter(item => !item.is_virtual);
    } else if (filters.mode === 'virtual') {
      filtered = filtered.filter(item => item.is_virtual);
    }

    // Filter by price range
    filtered = filtered.filter(item => {
      const price = item.price;
      return price >= filters.priceRange[0] && price <= filters.priceRange[1];
    });

    // Filter by duration (for retreats)
    if (activeTab === 'retreats' && filters.duration !== 'all') {
      filtered = filtered.filter(item => {
        if (!item.retreat_end_date) return filters.duration === '1-3';
        
        const start = new Date(item.date);
        const end = new Date(item.retreat_end_date);
        const duration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        
        switch (filters.duration) {
          case '1-3': return duration >= 1 && duration <= 3;
          case '4-7': return duration >= 4 && duration <= 7;
          case '7+': return duration > 7;
          default: return true;
        }
      });
    }

    // Filter by date range
    if (filters.dateRange.startDate && filters.dateRange.endDate) {
      const startDate = new Date(filters.dateRange.startDate);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(filters.dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);
      
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= startDate && itemDate <= endDate;
      });
    }

    // Add favorite status to filtered items
    filtered = filtered.map(item => ({
      ...item,
      is_favorite: favoriteTeachers.includes(item.teacher_id)
    }));

    if (activeTab === 'classes') {
      setFilteredClasses(filtered);
    } else {
      setFilteredRetreats(filtered);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchClassesAndRetreats();
    fetchFavoriteTeachers();
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

  const isClassFull = (yogaClass: YogaClass) => {
    const actualCount = participantCounts[yogaClass.id] || yogaClass.current_participants;
    const maxCapacity = yogaClass.is_retreat ? yogaClass.retreat_capacity : yogaClass.max_participants;
    return actualCount >= (maxCapacity || yogaClass.max_participants);
  };

  const getParticipantCount = (yogaClass: YogaClass) => {
    return participantCounts[yogaClass.id] ?? yogaClass.current_participants;
  };

  const handleClassPress = (classId: string) => {
    router.push(`/class-detail/${classId}`);
  };

  const handleTeacherPress = (teacherId: string) => {
    router.push(`/teacher-profile/${teacherId}`);
  };

  const clearFilters = () => {
    setFilters({
      type: 'All', 
      level: 'All', 
      dateRange: {
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      mode: 'all',
      priceRange: [0, 1000],
      duration: 'all',
      searchQuery: ''
    });
  };

  const renderFilterDropdown = (
    title: string,
    options: string[],
    selectedValue: string,
    onSelect: (value: string) => void
  ) => (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterOptions}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.filterOption,
              selectedValue === option && styles.filterOptionActive
            ]}
            onPress={() => onSelect(option)}
          >
            <Text style={[
              styles.filterOptionText,
              selectedValue === option && styles.filterOptionTextActive
            ]}>
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderModeFilter = () => (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>Mode</Text>
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[
            styles.modeButton,
            filters.mode === 'all' && styles.modeButtonActive
          ]}
          onPress={() => setFilters(prev => ({ ...prev, mode: 'all' }))}
        >
          <Text style={[
            styles.modeButtonText,
            filters.mode === 'all' && styles.modeButtonTextActive
          ]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeButton,
            filters.mode === 'in-person' && styles.modeButtonActive
          ]}
          onPress={() => setFilters(prev => ({ ...prev, mode: 'in-person' }))}
        >
          <MapPin size={16} color={filters.mode === 'in-person' ? 'white' : '#666'} />
          <Text style={[
            styles.modeButtonText,
            filters.mode === 'in-person' && styles.modeButtonTextActive
          ]}>
            In-Person
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeButton,
            filters.mode === 'virtual' && styles.modeButtonActive
          ]}
          onPress={() => setFilters(prev => ({ ...prev, mode: 'virtual' }))}
        >
          <Globe size={16} color={filters.mode === 'virtual' ? 'white' : '#666'} />
          <Text style={[
            styles.modeButtonText,
            filters.mode === 'virtual' && styles.modeButtonTextActive
          ]}>
            Virtual
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDurationFilter = () => (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>Duration</Text>
      <View style={styles.durationToggle}>
        <TouchableOpacity
          style={[
            styles.durationButton,
            filters.duration === 'all' && styles.durationButtonActive
          ]}
          onPress={() => setFilters(prev => ({ ...prev, duration: 'all' }))}
        >
          <Text style={[
            styles.durationButtonText,
            filters.duration === 'all' && styles.durationButtonTextActive
          ]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.durationButton,
            filters.duration === '1-3' && styles.durationButtonActive
          ]}
          onPress={() => setFilters(prev => ({ ...prev, duration: '1-3' }))}
        >
          <Text style={[
            styles.durationButtonText,
            filters.duration === '1-3' && styles.durationButtonTextActive
          ]}>
            1-3 Days
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.durationButton,
            filters.duration === '4-7' && styles.durationButtonActive
          ]}
          onPress={() => setFilters(prev => ({ ...prev, duration: '4-7' }))}
        >
          <Text style={[
            styles.durationButtonText,
            filters.duration === '4-7' && styles.durationButtonTextActive
          ]}>
            4-7 Days
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.durationButton,
            filters.duration === '7+' && styles.durationButtonActive
          ]}
          onPress={() => setFilters(prev => ({ ...prev, duration: '7+' }))}
        >
          <Text style={[
            styles.durationButtonText,
            filters.duration === '7+' && styles.durationButtonTextActive
          ]}>
            7+ Days
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDateFilter = () => (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>Date Range</Text>
      <TouchableOpacity 
        style={styles.dateRangeButton}
        onPress={() => setShowDatePicker(true)}
      >
        <Calendar size={16} color="#666" />
        <Text style={styles.dateRangeText}>
          {filters.dateRange.startDate?.toLocaleDateString()} - {filters.dateRange.endDate?.toLocaleDateString()}
        </Text>
        <ChevronDown size={16} color="#666" />
      </TouchableOpacity>
      
      <DateRangePicker
        isVisible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onSave={(range) => {
          setFilters(prev => ({
            ...prev,
            dateRange: range
          }));
          setShowDatePicker(false);
        }}
        initialRange={filters.dateRange}
      />
    </View>
  );

  const renderClassCard = (yogaClass: YogaClass, index: number) => {
    const isFull = isClassFull(yogaClass);
    const isOnline = yogaClass.is_virtual || yogaClass.location.toLowerCase() === 'online';
    const participantCount = getParticipantCount(yogaClass);
    const teacherName = yogaClass.profiles?.full_name || 'Unknown Teacher';
    const isFavorite = favoriteTeachers.includes(yogaClass.teacher_id);
    
    if (viewMode === 'grid') {
      return (
        <TouchableOpacity
          key={yogaClass.id}
          style={[
            styles.gridCard,
            isFull && styles.gridCardDisabled,
            { marginRight: index % 2 === 0 ? GRID_SPACING : 0 }
          ]}
          onPress={() => handleClassPress(yogaClass.id)}
          disabled={isFull}
        >
          {/* Class Image */}
          <View style={styles.gridImageContainer}>
            <Image
              source={{ 
                uri: yogaClass.image_url || 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=800'
              }}
              style={styles.gridImage}
              resizeMode="cover"
            />
            {isFull && (
              <View style={styles.fullOverlay}>
                <Text style={styles.fullOverlayText}>Full</Text>
              </View>
            )}
            <TouchableOpacity 
              style={styles.favoriteButton}
              onPress={(e) => {
                e.stopPropagation();
                toggleFavoriteTeacher(yogaClass.teacher_id);
              }}
            >
              <Heart 
                size={20} 
                color={isFavorite ? '#FF6B6B' : 'white'} 
                fill={isFavorite ? '#FF6B6B' : 'transparent'} 
              />
            </TouchableOpacity>
          </View>

          <View style={styles.gridCardContent}>
            {/* Teacher Info */}
            <TouchableOpacity 
              style={styles.teacherInfo}
              onPress={(e) => {
                e.stopPropagation();
                handleTeacherPress(yogaClass.teacher_id);
              }}
            >
              <TeacherAvatar
                teacherId={yogaClass.teacher_id}
                teacherName={teacherName}
                avatarUrl={yogaClass.profiles?.avatar_url}
                size="SMALL"
              />
              <View style={styles.teacherDetails}>
                <Text style={styles.teacherName} numberOfLines={1}>
                  {teacherName}
                </Text>
                <View style={styles.ratingContainer}>
                  <Star size={12} color="#FFD700" fill="#FFD700" />
                  <Text style={styles.ratingText}>
                    {yogaClass.average_rating?.toFixed(1) || '4.8'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <Text style={styles.gridClassTitle} numberOfLines={1}>
              {yogaClass.title}
            </Text>
            
            <View style={styles.gridClassDetails}>
              <View style={styles.gridDetailItem}>
                <Calendar size={12} color="#666" />
                <Text style={styles.gridDetailText}>{formatDate(yogaClass.date)}</Text>
              </View>
              
              <View style={styles.gridDetailItem}>
                <Clock size={12} color="#666" />
                <Text style={styles.gridDetailText}>{formatTime(yogaClass.time)}</Text>
              </View>
              
              <View style={styles.gridDetailItem}>
                {isOnline ? (
                  <Globe size={12} color="#4CAF50" />
                ) : (
                  <MapPin size={12} color="#666" />
                )}
                <Text style={[
                  styles.gridDetailText,
                  isOnline && styles.onlineText
                ]}>
                  {isOnline ? 'Online' : yogaClass.location}
                </Text>
              </View>
            </View>

            <View style={styles.gridCardFooter}>
              <Text style={styles.gridPriceText}>${yogaClass.price}</Text>
              <View style={styles.capacityContainer}>
                <Text style={[
                  styles.capacityText,
                  isFull && styles.fullText
                ]}>
                  {participantCount}/{yogaClass.max_participants}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    } else {
      // List view
      return (
        <TouchableOpacity
          key={yogaClass.id}
          style={[styles.listCard, isFull && styles.listCardDisabled]}
          onPress={() => handleClassPress(yogaClass.id)}
          disabled={isFull}
        >
          {/* Class Image */}
          <View style={styles.listImageContainer}>
            <Image
              source={{ 
                uri: yogaClass.image_url || 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=800'
              }}
              style={styles.listImage}
              resizeMode="cover"
            />
            {isFull && (
              <View style={styles.fullOverlay}>
                <Text style={styles.fullOverlayText}>Full</Text>
              </View>
            )}
          </View>

          <View style={styles.listCardContent}>
            <View style={styles.listCardHeader}>
              <View style={styles.listCardTitleContainer}>
                <Text style={styles.listClassTitle} numberOfLines={1}>
                  {yogaClass.title}
                </Text>
                <Text style={styles.listClassType}>{yogaClass.type}</Text>
              </View>
              
              <TouchableOpacity 
                onPress={(e) => {
                  e.stopPropagation();
                  toggleFavoriteTeacher(yogaClass.teacher_id);
                }}
              >
                <Heart 
                  size={20} 
                  color={isFavorite ? '#FF6B6B' : '#CCC'} 
                  fill={isFavorite ? '#FF6B6B' : 'transparent'} 
                />
              </TouchableOpacity>
            </View>

            {/* Teacher Info */}
            <TouchableOpacity 
              style={styles.listTeacherInfo}
              onPress={(e) => {
                e.stopPropagation();
                handleTeacherPress(yogaClass.teacher_id);
              }}
            >
              <TeacherAvatar
                teacherId={yogaClass.teacher_id}
                teacherName={teacherName}
                avatarUrl={yogaClass.profiles?.avatar_url}
                size="SMALL"
              />
              <View style={styles.teacherDetails}>
                <Text style={styles.teacherName} numberOfLines={1}>
                  {teacherName}
                </Text>
                <View style={styles.ratingContainer}>
                  <Star size={12} color="#FFD700" fill="#FFD700" />
                  <Text style={styles.ratingText}>
                    {yogaClass.average_rating?.toFixed(1) || '4.8'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
            
            <View style={styles.listClassDetails}>
              <View style={styles.listDetailItem}>
                <Calendar size={14} color="#666" />
                <Text style={styles.listDetailText}>{formatDate(yogaClass.date)}</Text>
              </View>
              
              <View style={styles.listDetailItem}>
                <Clock size={14} color="#666" />
                <Text style={styles.listDetailText}>{formatTime(yogaClass.time)}</Text>
              </View>
              
              <View style={styles.listDetailItem}>
                {isOnline ? (
                  <Globe size={14} color="#4CAF50" />
                ) : (
                  <MapPin size={14} color="#666" />
                )}
                <Text style={[
                  styles.listDetailText,
                  isOnline && styles.onlineText
                ]}>
                  {isOnline ? 'Online' : yogaClass.location}
                </Text>
              </View>
            </View>

            <View style={styles.listCardFooter}>
              <Text style={styles.listPriceText}>${yogaClass.price}</Text>
              <View style={styles.capacityContainer}>
                <Text style={[
                  styles.capacityText,
                  isFull && styles.fullText
                ]}>
                  {participantCount}/{yogaClass.max_participants}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    }
  };

  // Show loading state while auth is loading
  if (authLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C4896F" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Only show this screen for students - moved after all hooks
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
          <ActivityIndicator size="large" color="#C4896F" />
          <Text style={styles.loadingText}>Loading classes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Explore</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.viewModeButton}
            onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          >
            <SlidersHorizontal size={20} color="#8B7355" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Filter size={20} color="#8B7355" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Search size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search classes, teachers, or locations..."
            value={filters.searchQuery}
            onChangeText={(text) => setFilters(prev => ({ ...prev, searchQuery: text }))}
            placeholderTextColor="#999"
          />
          {filters.searchQuery ? (
            <TouchableOpacity
              onPress={() => setFilters(prev => ({ ...prev, searchQuery: '' }))}
            >
              <X size={20} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>
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

      {showFilters && (
        <View style={styles.filtersContainer}>
          {renderModeFilter()}
          
          {renderFilterDropdown(
            activeTab === 'classes' ? 'Type' : 'Retreat Type',
            activeTab === 'classes' ? YOGA_TYPES : RETREAT_TYPES,
            filters.type,
            (type) => setFilters(prev => ({ ...prev, type }))
          )}
          
          {renderFilterDropdown(
            'Level',
            LEVELS,
            filters.level,
            (level) => setFilters(prev => ({ ...prev, level }))
          )}
          
          {renderDateFilter()}

          {activeTab === 'retreats' && renderDurationFilter()}
          
          <TouchableOpacity
            style={styles.clearFiltersButton}
            onPress={clearFilters}
          >
            <Text style={styles.clearFiltersText}>Clear All Filters</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={activeTab === 'classes' ? filteredClasses : filteredRetreats}
        renderItem={({ item, index }) => 
          activeTab === 'classes' 
            ? renderClassCard(item, index)
            : <RetreatCard
                key={item.id}
                retreat={{
                  ...item,
                  retreat_capacity: item.retreat_capacity || item.max_participants,
                  profiles: item.profiles,
                  is_favorite: favoriteTeachers.includes(item.teacher_id)
                }}
                onPress={() => handleClassPress(item.id)}
                onFavoritePress={() => toggleFavoriteTeacher(item.teacher_id)}
              />
        }
        keyExtractor={item => item.id}
        numColumns={viewMode === 'grid' && width >= 768 ? 2 : 1}
        key={viewMode === 'grid' && width >= 768 ? 'grid' : 'list'}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <Text style={styles.resultsCount}>
            {activeTab === 'classes' 
              ? `${filteredClasses.length} class${filteredClasses.length !== 1 ? 'es' : ''} found`
              : `${filteredRetreats.length} retreat${filteredRetreats.length !== 1 ? 's' : ''} found`
            }
          </Text>
        )}
        ListEmptyComponent={() => (
          <EmptyStateIllustration
            type="search"
            message={`No ${activeTab} found matching your filters`}
            subMessage="Try adjusting your search criteria or explore different options"
            action={
            <TouchableOpacity
              style={styles.clearFiltersButton}
              onPress={clearFilters}
            >
              <Text style={styles.clearFiltersText}>Clear Filters</Text>
            </TouchableOpacity>
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F6F1',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  viewModeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  filterButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
    paddingVertical: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 4,
    marginTop: 16,
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
    backgroundColor: '#C27B5C',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: 'white',
  },
  filtersContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filterGroup: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  filterOptions: {
    flexDirection: 'row',
  },
  filterOption: {
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  filterOptionActive: {
    backgroundColor: '#8B7355',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterOptionTextActive: {
    color: 'white',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: '#C27B5C',
  },
  modeButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: 'white',
  },
  durationToggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  durationButton: {
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  durationButtonActive: {
    backgroundColor: '#C27B5C',
  },
  durationButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  durationButtonTextActive: {
    color: 'white',
  },
  dateRangeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateRangeText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  clearFiltersButton: {
    backgroundColor: '#C27B5C',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'center',
    marginTop: 8,
  },
  clearFiltersText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  resultsCount: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
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
  },
  // Grid Card Styles
  gridCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    overflow: 'hidden',
    width: width < 768 ? '100%' : (width - 60) / 2,
  },
  gridCardDisabled: {
    opacity: 0.7,
  },
  gridImageContainer: {
    position: 'relative',
    height: 180,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  fullOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullOverlayText: {
    fontSize: 18,
    color: 'white',
    fontWeight: '600',
    backgroundColor: 'rgba(255, 107, 107, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  favoriteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 20,
    padding: 8,
  },
  gridCardContent: {
    padding: 16,
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  teacherDetails: {
    marginLeft: 8,
    flex: 1,
  },
  teacherName: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    color: '#666',
  },
  gridClassTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  gridClassDetails: {
    gap: 6,
    marginBottom: 12,
  },
  gridDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gridDetailText: {
    fontSize: 12,
    color: '#666',
  },
  onlineText: {
    color: '#4CAF50',
    fontWeight: '500',
  },
  gridCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridPriceText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#C27B5C',
  },
  capacityContainer: {
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  capacityText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  fullText: {
    color: '#FF6B6B',
  },
  // List Card Styles
  listCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  listCardDisabled: {
    opacity: 0.7,
  },
  listImageContainer: {
    width: 120,
    height: '100%',
  },
  listImage: {
    width: '100%',
    height: '100%',
  },
  listCardContent: {
    flex: 1,
    padding: 16,
  },
  listCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  listCardTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  listClassTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  listClassType: {
    fontSize: 12,
    color: '#8B7355',
    fontWeight: '500',
  },
  listTeacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  listClassDetails: {
    gap: 4,
    marginBottom: 8,
  },
  listDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listDetailText: {
    fontSize: 12,
    color: '#666',
  },
  listCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listPriceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#C27B5C',
  },
});