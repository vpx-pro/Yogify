import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Calendar, MapPin, Globe, Users, Clock } from 'lucide-react-native';
import TeacherAvatar from './TeacherAvatar';

interface RetreatCardProps {
  retreat: {
    id: string;
    title: string;
    description?: string;
    date: string;
    retreat_end_date?: string;
    time: string;
    location: string;
    is_virtual: boolean;
    retreat_image_url?: string;
    retreat_highlights?: string[];
    retreat_capacity: number;
    current_participants: number;
    price: number;
    early_bird_price?: number;
    early_bird_deadline?: string;
    level: string;
    type: string;
    teacher_id: string;
    profiles?: {
      full_name: string;
      avatar_url?: string;
    };
  };
  onPress?: () => void;
  compact?: boolean;
}

export default function RetreatCard({ retreat, onPress, compact = false }: RetreatCardProps) {
  const getDuration = () => {
    if (!retreat.retreat_end_date) return 1;
    const start = new Date(retreat.date);
    const end = new Date(retreat.retreat_end_date);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const formatDateRange = () => {
    const start = new Date(retreat.date);
    const end = retreat.retreat_end_date ? new Date(retreat.retreat_end_date) : start;
    
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();
    const year = start.getFullYear();

    if (startMonth === endMonth) {
      return `${startMonth} ${startDay} - ${endDay}, ${year}`;
    } else {
      return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
    }
  };

  const isEarlyBirdActive = () => {
    if (!retreat.early_bird_deadline) return false;
    return new Date(retreat.early_bird_deadline) >= new Date();
  };

  const getCurrentPrice = () => {
    return isEarlyBirdActive() && retreat.early_bird_price 
      ? retreat.early_bird_price 
      : retreat.price;
  };

  const teacherName = retreat.profiles?.full_name || 'Unknown Teacher';

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress}>
        <View style={styles.compactImageContainer}>
          <Image
            source={{ 
              uri: retreat.retreat_image_url || 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=400'
            }}
            style={styles.compactImage}
            resizeMode="cover"
          />
          <View style={styles.compactOverlay}>
            <View style={styles.compactDurationBadge}>
              <Text style={styles.compactDurationText}>{getDuration()}D</Text>
            </View>
          </View>
        </View>
        <View style={styles.compactContent}>
          <Text style={styles.compactTitle} numberOfLines={1}>
            {retreat.title}
          </Text>
          <Text style={styles.compactLocation} numberOfLines={1}>
            {retreat.is_virtual ? '🌐 Virtual' : `📍 ${retreat.location}`}
          </Text>
          <Text style={styles.compactPrice}>€{getCurrentPrice()}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.imageContainer}>
        <Image
          source={{ 
            uri: retreat.retreat_image_url || 'https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg?auto=compress&cs=tinysrgb&w=800'
          }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.overlay}>
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{getDuration()}-Day Retreat</Text>
          </View>
          {isEarlyBirdActive() && (
            <View style={styles.earlyBirdBadge}>
              <Text style={styles.earlyBirdText}>Early Bird</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.content}>
        {/* Teacher Info */}
        <View style={styles.teacherInfo}>
          <TeacherAvatar
            teacherId={retreat.teacher_id}
            teacherName={teacherName}
            avatarUrl={retreat.profiles?.avatar_url}
            size="SMALL"
          />
          <Text style={styles.teacherName}>{teacherName}</Text>
        </View>

        <Text style={styles.title}>{retreat.title}</Text>
        <Text style={styles.type}>{retreat.type}</Text>

        <View style={styles.details}>
          <View style={styles.detailItem}>
            <Calendar size={16} color="#8B7355" />
            <Text style={styles.detailText}>{formatDateRange()}</Text>
          </View>

          <View style={styles.detailItem}>
            <Clock size={16} color="#8B7355" />
            <Text style={styles.detailText}>
              {retreat.time.substring(0, 5)}
            </Text>
          </View>

          <View style={styles.detailItem}>
            {retreat.is_virtual ? (
              <Globe size={16} color="#4CAF50" />
            ) : (
              <MapPin size={16} color="#8B7355" />
            )}
            <Text style={[
              styles.detailText,
              retreat.is_virtual && styles.virtualText
            ]}>
              {retreat.is_virtual ? 'Virtual Retreat' : retreat.location}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Users size={16} color="#8B7355" />
            <Text style={styles.detailText}>
              {retreat.current_participants}/{retreat.retreat_capacity} participants
            </Text>
          </View>
        </View>

        {/* Highlights */}
        {retreat.retreat_highlights && retreat.retreat_highlights.length > 0 && (
          <View style={styles.highlights}>
            {retreat.retreat_highlights.slice(0, 2).map((highlight, index) => (
              <Text key={index} style={styles.highlight}>
                • {highlight}
              </Text>
            ))}
            {retreat.retreat_highlights.length > 2 && (
              <Text style={styles.moreHighlights}>
                +{retreat.retreat_highlights.length - 2} more
              </Text>
            )}
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.priceContainer}>
            {isEarlyBirdActive() && retreat.early_bird_price && (
              <Text style={styles.originalPrice}>€{retreat.price}</Text>
            )}
            <Text style={styles.price}>€{getCurrentPrice()}</Text>
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelText}>{retreat.level}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
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
  compactCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginRight: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
    width: 200,
  },
  imageContainer: {
    position: 'relative',
    height: 200,
  },
  compactImageContainer: {
    position: 'relative',
    height: 120,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  compactImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compactOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  durationBadge: {
    backgroundColor: 'rgba(139, 115, 85, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  compactDurationBadge: {
    backgroundColor: 'rgba(139, 115, 85, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  durationText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
  },
  compactDurationText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '600',
  },
  earlyBirdBadge: {
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  earlyBirdText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  compactContent: {
    padding: 12,
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  teacherName: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    marginLeft: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  type: {
    fontSize: 14,
    color: '#8B7355',
    fontWeight: '500',
    marginBottom: 12,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
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
  virtualText: {
    color: '#4CAF50',
    fontWeight: '500',
  },
  compactLocation: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  highlights: {
    marginBottom: 12,
  },
  highlight: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  moreHighlights: {
    fontSize: 12,
    color: '#8B7355',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  originalPrice: {
    fontSize: 14,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: '#8B7355',
  },
  compactPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B7355',
  },
  levelBadge: {
    backgroundColor: '#F4EDE4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  levelText: {
    fontSize: 12,
    color: '#8B7355',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
});