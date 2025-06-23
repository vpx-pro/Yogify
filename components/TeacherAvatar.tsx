import React, { useState } from 'react';
import { View, Image, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { User } from 'lucide-react-native';
import { AvatarService, AVATAR_SIZES } from '@/lib/avatarService';

interface TeacherAvatarProps {
  teacherId: string;
  teacherName: string;
  avatarUrl?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  showName?: boolean;
  style?: any;
}

export default function TeacherAvatar({
  teacherId,
  teacherName,
  avatarUrl,
  size = 'MEDIUM',
  showName = false,
  style
}: TeacherAvatarProps) {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const avatarSize = AVATAR_SIZES[size];
  const finalAvatarUrl = AvatarService.getCachedAvatarUrl(
    teacherId,
    teacherName,
    avatarUrl,
    avatarSize
  );

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  const renderFallbackAvatar = () => (
    <View style={[
      styles.fallbackAvatar,
      { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
      style
    ]}>
      <User size={avatarSize * 0.4} color="white" />
    </View>
  );

  const renderAvatar = () => {
    if (imageError) {
      return renderFallbackAvatar();
    }

    return (
      <View style={[
        styles.avatarContainer,
        { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
        style
      ]}>
        <Image
          source={{ uri: finalAvatarUrl }}
          style={[
            styles.avatar,
            { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }
          ]}
          onLoad={handleImageLoad}
          onError={handleImageError}
          accessibilityLabel={`${teacherName}'s profile photo`}
        />
        
        {imageLoading && (
          <View style={[
            styles.loadingOverlay,
            { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }
          ]}>
            <ActivityIndicator 
              size="small" 
              color="#C4896F" 
            />
          </View>
        )}
      </View>
    );
  };

  if (showName) {
    return (
      <View style={styles.avatarWithName}>
        {renderAvatar()}
        <Text style={[
          styles.teacherNameText,
          { fontSize: Math.max(12, avatarSize * 0.15) }
        ]} numberOfLines={2}>
          {teacherName}
        </Text>
      </View>
    );
  }

  return renderAvatar();
}

const styles = StyleSheet.create({
  avatarContainer: {
    position: 'relative',
    backgroundColor: '#F0F0F0',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  avatar: {
    resizeMode: 'cover',
  },
  fallbackAvatar: {
    backgroundColor: '#C4896F',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWithName: {
    alignItems: 'center',
    maxWidth: 100,
  },
  teacherNameText: {
    marginTop: 8,
    textAlign: 'center',
    color: '#333',
    fontWeight: '500',
    lineHeight: 16,
  },
});