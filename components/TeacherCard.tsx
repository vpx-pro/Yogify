import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Star, MapPin, Calendar } from 'lucide-react-native';
import TeacherAvatar from './TeacherAvatar';

interface TeacherProfile {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  email: string;
}

interface TeacherCardProps {
  teacher: TeacherProfile;
  classCount?: number;
  rating?: number;
  reviewCount?: number;
  specialties?: string[];
  onPress?: () => void;
  compact?: boolean;
}

export default function TeacherCard({
  teacher,
  classCount = 0,
  rating = 4.8,
  reviewCount = 127,
  specialties = ['Hatha', 'Vinyasa'],
  onPress,
  compact = false
}: TeacherCardProps) {
  if (compact) {
    return (
      <TouchableOpacity 
        style={styles.compactCard}
        onPress={onPress}
        disabled={!onPress}
      >
        <TeacherAvatar
          teacherId={teacher.id}
          teacherName={teacher.full_name}
          avatarUrl={teacher.avatar_url}
          size="SMALL"
        />
        <View style={styles.compactInfo}>
          <Text style={styles.compactName} numberOfLines={1}>
            {teacher.full_name}
          </Text>
          <View style={styles.compactRating}>
            <Star size={12} color="#FFD700" fill="#FFD700" />
            <Text style={styles.compactRatingText}>{rating}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity 
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <TeacherAvatar
          teacherId={teacher.id}
          teacherName={teacher.full_name}
          avatarUrl={teacher.avatar_url}
          size="LARGE"
        />
        
        <View style={styles.info}>
          <Text style={styles.name}>{teacher.full_name}</Text>
          
          <View style={styles.rating}>
            <Star size={16} color="#FFD700" fill="#FFD700" />
            <Text style={styles.ratingText}>
              {rating} ({reviewCount} reviews)
            </Text>
          </View>
          
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Calendar size={14} color="#666" />
              <Text style={styles.statText}>{classCount} classes</Text>
            </View>
          </View>
        </View>
      </View>

      {specialties.length > 0 && (
        <View style={styles.specialties}>
          <Text style={styles.specialtiesLabel}>Specialties:</Text>
          <View style={styles.specialtyTags}>
            {specialties.slice(0, 3).map((specialty, index) => (
              <View key={index} style={styles.specialtyTag}>
                <Text style={styles.specialtyText}>{specialty}</Text>
              </View>
            ))}
            {specialties.length > 3 && (
              <View style={styles.specialtyTag}>
                <Text style={styles.specialtyText}>+{specialties.length - 3}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    minWidth: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  info: {
    flex: 1,
    marginLeft: 16,
  },
  compactInfo: {
    flex: 1,
    marginLeft: 8,
  },
  name: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  compactName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  compactRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 14,
    color: '#666',
  },
  compactRatingText: {
    fontSize: 12,
    color: '#666',
  },
  stats: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#666',
  },
  specialties: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 16,
  },
  specialtiesLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  specialtyTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specialtyTag: {
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  specialtyText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
});