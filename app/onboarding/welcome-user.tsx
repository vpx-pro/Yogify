import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, User } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';

export default function WelcomeUserScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const handleContinue = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#333" />
          </TouchableOpacity>
          <View style={styles.profileIcon}>
            <User size={24} color="white" />
          </View>
        </View>

        <View style={styles.mainContent}>
          <Text style={styles.welcomeText}>Welcome,</Text>
          <Text style={styles.nameText}>{profile?.full_name || 'User'}</Text>
          
          <Text style={styles.journeyText}>Your Yogify journey starts here</Text>

          <View style={styles.roleContainer}>
            <Text style={styles.roleLabel}>You're logged in as</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>
                {profile?.role === 'teacher' ? 'Teacher' : 'Student'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  content: {
    flex: 1,
    paddingHorizontal: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
  },
  backButton: {
    // Empty space for alignment
  },
  profileIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#C4896F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    flex: 1,
    alignItems: 'flex-start',
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  nameText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#333',
    marginBottom: 40,
  },
  journeyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 60,
  },
  roleContainer: {
    marginBottom: 80,
  },
  roleLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: '#E8E8E0',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  roleText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  continueButton: {
    backgroundColor: '#C4896F',
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 60,
    alignSelf: 'center',
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    marginHorizontal: 40,
  },
  continueButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
  },
});