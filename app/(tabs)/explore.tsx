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
  Alert,
  Image 
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, Clock, MapPin, Globe, Filter, User, Tent } from 'lucide-react-native';
import RetreatCard from '@/components/RetreatCard';
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
  mode: string; // 'all', 'in-person', 'virtual'
  priceRange: [number, number];
  duration: string; // 'all', '1-3', '4-7', '7+'
};

const YOGA_TYPES = ['All', 'Hatha', 'Vinyasa', 'Ashtanga', 'Bikram', 'Hot Yoga', 'Yin Yoga', 'Restorative', 'Power Yoga', 'Kundalini', 'Iyengar'];
const LEVELS = ['All', 'beginner', 'intermediate', 'advanced'];
const RETREAT_TYPES = ['All', 'Mindfulness Retreat', 'Yoga & Meditation', 'Wellness Escape', 'Spiritual Journey', 'Detox Retreat', 'Adventure Yoga', 'Healing Retreat', 'Silent Retreat'];

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
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'classes' | 'retreats'>('classes');
  const [filters, setFilters] = useState<FilterState>({
    type: 'All',
    level: 'All',
    date: 'All',
    mode: 'all',
    priceRange: [0, 1000],
    duration: 'all'
  });

  useEffect(() => {
    if (!authLoading && profile?.role === 'student') {
      fetchClassesAndRetreats();
    }
  }, [authLoading, profile]);

  useEffect(() => {
    applyFilters();
  }, [classes, retreats, filters, activeTab]);

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
      
      setClasses(classesData);
      setRetreats(retreatsData);
    } catch (error) {
      console.error('Error fetching classes and retreats:', error);
      Alert.alert('Error', 'Failed to load classes and retreats. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
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
    } catch (error) {
      console.error('Error fetching participant counts:', error);
    }
  };

  const applyFilters = () => {
    const sourceData = activeTab === 'classes' ? classes : retreats;
    let filtered = [...sourceData];

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

    // Filter by date
    if (filters.date !== 'All') {
      const today =  new Date();
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
          filtered = filtered.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate <= filterDate;
          });
          break;
        case 'This Month':
          filterDate.setMonth(today.getMonth() + 1);
          filterDate.setDate(0); // Last day of current month
          filtered = filtered.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate <= filterDate;
          });
          break;
      }
      
      if (filters.date === 'Today' || filters.date === 'Tomorrow') {
        const targetDate = filterDate.toISOString().split('T')[0];
        filtered = filtered.filter(item => item.date === targetDate);
      }
    }

    if (activeTab === 'classes') {
      setFilteredClasses(filtered);
    } else {
      setFilteredRetreats(filtered);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchClassesAndRetreats();
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
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <Filter size={20} color="#C4896F" />
        </TouchableOpacity>
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
          
          {renderFilterDropdown(
            'Date',
            ['All', 'Today', 'Tomorrow', 'This Week', 'This Month'],
            filters.date,
            (date) => setFilters(prev => ({ ...prev, date }))
          )}

          {activeTab === 'retreats' && renderDurationFilter()}
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
        {activeTab === 'classes' ? (
          filteredClasses.length > 0 ? (
            <>
              <Text style={styles.resultsCount}>
                {filteredClasses.length} class{filteredClasses.length !== 1 ? 'es' : ''} found
              </Text>
              
              {filteredClasses.map((yogaClass) => {
                const isFull = isClassFull(yogaClass);
                const isOnline = yogaClass.is_virtual || yogaClass.location.toLowerCase() === 'online';
                const participantCount = getParticipantCount(yogaClass);
                const teacherName = yogaClass.profiles?.full_name || 'Unknown Teacher';
                
                return (
                  <TouchableOpacity
                    key={yogaClass.id}
                    style={[styles.classCard, isFull && styles.classCardDisabled]}
                    onPress={() => handleClassPress(yogaClass.id)}
                    disabled={isFull}
                  >
                    {/* Class Image */}
                    <View style={styles.imageContainer}>
                      <Image
                        source={{ 
                          uri: yogaClass.image_url || 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=800'
                        }}
                        style={styles.classImage}
                        resizeMode="cover"
                      />
                      {isFull && (
                        <View style={styles.fullOverlay}>
                          <Text style={styles.fullOverlayText}>Class Full</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.cardContent}>
                      {/* Teacher Info */}
                      <View style={styles.teacherInfo}>
                        <View style={styles.teacherAvatar}>
                          <User size={16} color="white" />
                        </View>
                        <Text style={styles.teacherName}>
                          {teacherName}
                        </Text>
                      </View>

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

                      <View style={styles.classDetails}>
                        <View style={styles.detailItem}>
                          <Calendar size={14} color="#666" />
                          <Text style={styles.detailText}>{formatDate(yogaClass.date)}</Text>
                        </View>
                        
                        <View style={styles.detailItem}>
                          <Clock size={14} color="#666" />
                          <Text style={styles.detailText}>
                            {formatTime(yogaClass.time)} • {yogaClass.duration}min
                          </Text>
                        </View>
                        
                        <View style={styles.detailItem}>
                          {isOnline ? (
                            <Globe size={14} color="#4CAF50" />
                          ) : (
                            <MapPin size={14} color="#666" />
                          )}
                          <Text style={[
                            styles.detailText,
                            isOnline && styles.onlineText
                          ]}>
                            {isOnline ? 'Online' : yogaClass.location}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.classFooter}>
                        <Text style={styles.priceText}>${yogaClass.price}</Text>
                        <Text style={[
                          styles.participantsText,
                          isFull && styles.fullText
                        ]}>
                          {participantCount}/{yogaClass.max_participants}
                          {isFull && ' (Full)'}
                        </Text>
                      </View>
                    </View>
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
                onPress={() => setFilters({ 
                  type: 'All', 
                  level: 'All', 
                  date: 'All',
                  mode: 'all',
                  priceRange: [0, 1000],
                  duration: 'all'
                })}
              >
                <Text style={styles.clearFiltersText}>Clear Filters</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          filteredRetreats.length > 0 ? (
            <>
              <Text style={styles.resultsCount}>
                {filteredRetreats.length} retreat{filteredRetreats.length !== 1 ? 's' : ''} found
              </Text>
              
              {filteredRetreats.map((retreat) => (
                <RetreatCard
                  key={retreat.id}
                  retreat={{
                    ...retreat,
                    retreat_capacity: retreat.retreat_capacity || retreat.max_participants,
                    profiles: retreat.profiles
                  }}
                  onPress={() => handleClassPress(retreat.id)}
                />
              ))}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No retreats found matching your filters.
              </Text>
              <TouchableOpacity
                style={styles.clearFiltersButton}
                onPress={() => setFilters({ 
                  type: 'All', 
                  level: 'All', 
                  date: 'All',
                  mode: 'all',
                  priceRange: [0, 1000],
                  duration: 'all'
                })}
              >
                <Text style={styles.clearFiltersText}>Clear Filters</Text>
              </TouchableOpacity>
            </View>
          )
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
    backgroundColor: '#8B7355',
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
    backgroundColor: '#8B7355',
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
    backgroundColor: '#8B7355',
  },
  durationButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  durationButtonTextActive: {
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
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  classCardDisabled: {
    opacity: 0.7,
  },
  imageContainer: {
    position: 'relative',
    height: 200,
  },
  classImage: {
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
  cardContent: {
    padding: 16,
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  teacherAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8B7355',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  teacherName: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
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
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  classType: {
    fontSize: 14,
    color: '#8B7355',
    fontWeight: '500',
  },
  levelBadge: {
    backgroundColor: '#8B7355',
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
  classDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
    fontSize: 20,
    fontWeight: '700',
    color: '#8B7355',
  },
  participantsText: {
    fontSize: 12,
    color: '#666',
  },
  fullText: {
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
    marginBottom: 20,
  },
  clearFiltersButton: {
    backgroundColor: '#8B7355',
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