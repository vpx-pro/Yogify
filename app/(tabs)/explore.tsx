import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  RefreshControl,
  ActivityIndicator,
  Alert 
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Clock, MapPin, User, Globe, Filter } from 'lucide-react-native';
import type { Database } from '@/lib/supabase';

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'] & {
  profiles: {
    full_name: string;
    avatar_url?: string;
  };
};

type FilterState = {
  type: string;
  level: string;
  date: string;
};

const YOGA_TYPES = ['All', 'Hatha', 'Vinyasa', 'Ashtanga', 'Bikram', 'Hot Yoga', 'Yin Yoga', 'Restorative', 'Power Yoga', 'Kundalini', 'Iyengar'];
const LEVELS = ['All', 'beginner', 'intermediate', 'advanced'];

export default function ExploreScreen() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<YogaClass[]>([]);
  const [filteredClasses, setFilteredClasses] = useState<YogaClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    type: 'All',
    level: 'All',
    date: 'All'
  });

  useEffect(() => {
    if (!authLoading && profile?.role === 'student') {
      fetchClasses();
    }
  }, [authLoading, profile]);

  useEffect(() => {
    applyFilters();
  }, [classes, filters]);

  const fetchClasses = async () => {
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
      
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
      Alert.alert('Error', 'Failed to load classes. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...classes];

    // Filter by type
    if (filters.type !== 'All') {
      filtered = filtered.filter(cls => cls.type === filters.type);
    }

    // Filter by level
    if (filters.level !== 'All') {
      filtered = filtered.filter(cls => cls.level === filters.level);
    }

    // Filter by date
    if (filters.date !== 'All') {
      const today = new Date();
      const filterDate = new Date(today);
      
      switch (filters.date) {
        case 'Today':
          filterDate.setDate(today.getDate());
          break;
        case 'Tomorrow':
          filterDate.setDate(today.getDate() + 1);
          break;
        case 'This Week':
          filterDate.setDate(today.getDate() + 7);
          filtered = filtered.filter(cls => {
            const classDate = new Date(cls.date);
            return classDate <= filterDate;
          });
          break;
      }
      
      if (filters.date === 'Today' || filters.date === 'Tomorrow') {
        const targetDate = filterDate.toISOString().split('T')[0];
        filtered = filtered.filter(cls => cls.date === targetDate);
      }
    }

    setFilteredClasses(filtered);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchClasses();
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
    return yogaClass.current_participants >= yogaClass.max_participants;
  };

  const handleClassPress = (classId: string) => {
    router.push(`/class-detail/${classId}`);
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
        <Text style={styles.title}>Explore Classes</Text>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Filter size={20} color="#C4896F" />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.filtersContainer}>
          {renderFilterDropdown(
            'Type',
            YOGA_TYPES,
            filters.type,
            (type) => setFilters(prev => ({ ...prev, type }))
          )}
          
          {renderFilterDropdown(
            'Level',
            LEVELS,
            filters.level,
            (level) => setFilters(prev => ({ ...prev, level }))
          )}
          
          {renderFilterDropdown(
            'Date',
            ['All', 'Today', 'Tomorrow', 'This Week'],
            filters.date,
            (date) => setFilters(prev => ({ ...prev, date }))
          )}
        </View>
      )}

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredClasses.length > 0 ? (
          <>
            <Text style={styles.resultsCount}>
              {filteredClasses.length} class{filteredClasses.length !== 1 ? 'es' : ''} found
            </Text>
            
            {filteredClasses.map((yogaClass) => {
              const isFull = isClassFull(yogaClass);
              const isOnline = yogaClass.location.toLowerCase() === 'online';
              
              return (
                <TouchableOpacity
                  key={yogaClass.id}
                  style={[styles.classCard, isFull && styles.classCardDisabled]}
                  onPress={() => handleClassPress(yogaClass.id)}
                  disabled={isFull}
                >
                  <View style={styles.classHeader}>
                    <View style={styles.classHeaderLeft}>
                      <Text style={styles.classTitle}>{yogaClass.title}</Text>
                      <Text style={styles.classType}>{yogaClass.type}</Text>
                    </View>
                    <View style={[
                      styles.levelBadge,
                      isFull && styles.levelBadgeDisabled
                    ]}>
                      <Text style={styles.levelText}>{yogaClass.level}</Text>
                    </View>
                  </View>

                  <View style={styles.teacherInfo}>
                    <View style={styles.teacherAvatar}>
                      <User size={16} color="white" />
                    </View>
                    <Text style={styles.teacherName}>
                      {yogaClass.profiles?.full_name || 'Unknown Teacher'}
                    </Text>
                  </View>

                  <View style={styles.classDetails}>
                    <View style={styles.detailItem}>
                      <Calendar size={16} color="#666" />
                      <Text style={styles.detailText}>{formatDate(yogaClass.date)}</Text>
                    </View>
                    
                    <View style={styles.detailItem}>
                      <Clock size={16} color="#666" />
                      <Text style={styles.detailText}>
                        {formatTime(yogaClass.time)} ({yogaClass.duration}min)
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
                        {isOnline ? 'Online Class' : yogaClass.location}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.classFooter}>
                    <Text style={styles.priceText}>${yogaClass.price}</Text>
                    <View style={styles.participantsInfo}>
                      <Text style={[
                        styles.participantsText,
                        isFull && styles.fullText
                      ]}>
                        {yogaClass.current_participants}/{yogaClass.max_participants}
                        {isFull && ' (Full)'}
                      </Text>
                    </View>
                  </View>

                  {isFull && (
                    <View style={styles.fullOverlay}>
                      <Text style={styles.fullOverlayText}>Class Full</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No classes found matching your filters.
            </Text>
            <TouchableOpacity
              style={styles.clearFiltersButton}
              onPress={() => setFilters({ type: 'All', level: 'All', date: 'All' })}
            >
              <Text style={styles.clearFiltersText}>Clear Filters</Text>
            </TouchableOpacity>
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
  filterButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
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
    backgroundColor: '#C4896F',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterOptionTextActive: {
    color: 'white',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
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
  classCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    position: 'relative',
  },
  classCardDisabled: {
    opacity: 0.7,
  },
  classHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  classHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  classTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  classType: {
    fontSize: 14,
    color: '#C4896F',
    fontWeight: '500',
  },
  levelBadge: {
    backgroundColor: '#C4896F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  levelBadgeDisabled: {
    backgroundColor: '#999',
  },
  levelText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  teacherAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#C4896F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  teacherName: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
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
  classFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#C4896F',
  },
  participantsInfo: {
    alignItems: 'flex-end',
  },
  participantsText: {
    fontSize: 12,
    color: '#666',
  },
  fullText: {
    color: '#FF6B6B',
    fontWeight: '500',
  },
  fullOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullOverlayText: {
    fontSize: 16,
    color: '#FF6B6B',
    fontWeight: '600',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  clearFiltersButton: {
    backgroundColor: '#C4896F',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  clearFiltersText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
});