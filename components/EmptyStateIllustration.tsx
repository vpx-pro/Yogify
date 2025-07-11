import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

type EmptyStateIllustrationProps = {
  type: 'classes' | 'bookings' | 'favorites' | 'retreats' | 'reviews' | 'search';
  message: string;
  subMessage?: string;
  action?: React.ReactNode;
};

export default function EmptyStateIllustration({
  type,
  message,
  subMessage,
  action
}: EmptyStateIllustrationProps) {
  // Get the appropriate illustration based on type
  const getIllustrationUrl = () => {
    switch (type) {
      case 'classes':
        return 'https://images.pexels.com/photos/4056535/pexels-photo-4056535.jpeg?auto=compress&cs=tinysrgb&w=600';
      case 'bookings':
        return 'https://images.pexels.com/photos/3822906/pexels-photo-3822906.jpeg?auto=compress&cs=tinysrgb&w=600';
      case 'favorites':
        return 'https://images.pexels.com/photos/3759659/pexels-photo-3759659.jpeg?auto=compress&cs=tinysrgb&w=600';
      case 'retreats':
        return 'https://images.pexels.com/photos/4056723/pexels-photo-4056723.jpeg?auto=compress&cs=tinysrgb&w=600';
      case 'reviews':
        return 'https://images.pexels.com/photos/6787202/pexels-photo-6787202.jpeg?auto=compress&cs=tinysrgb&w=600';
      case 'search':
        return 'https://images.pexels.com/photos/6787211/pexels-photo-6787211.jpeg?auto=compress&cs=tinysrgb&w=600';
      default:
        return 'https://images.pexels.com/photos/3822906/pexels-photo-3822906.jpeg?auto=compress&cs=tinysrgb&w=600';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: getIllustrationUrl() }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.overlay} />
      </View>
      <Text style={styles.message}>{message}</Text>
      {subMessage && <Text style={styles.subMessage}>{subMessage}</Text>}
      {action && <View style={styles.actionContainer}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'white',
    borderRadius: 16,
    marginVertical: 16,
  },
  imageContainer: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
    marginBottom: 24,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  subMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  actionContainer: {
    marginTop: 8,
  },
});