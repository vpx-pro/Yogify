import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, User, GraduationCap } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';

export default function RoleSelectionScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher' | null>(null);
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!selectedRole || !user) return;

    setLoading(true);
    
    try {
      const { error } = await updateProfile({ role: selectedRole });
      if (error) throw error;

      router.push('/onboarding/welcome-user');
    } catch (error) {
      console.error('Error updating role:', error);
    } finally {
      setLoading(false);
    }
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
        </View>

        <View style={styles.mainContent}>
          <Text style={styles.title}>Choose Your Role</Text>

          <View style={styles.roleContainer}>
            <TouchableOpacity
              style={[
                styles.roleCard,
                selectedRole === 'student' && styles.selectedCard
              ]}
              onPress={() => setSelectedRole('student')}
            >
              <View style={[styles.roleIcon, { backgroundColor: '#B39CD0' }]}>
                <User size={32} color="white" />
              </View>
              <Text style={styles.roleTitle}>I am a Student</Text>
              <Text style={styles.roleDescription}>Find and book yoga classes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleCard,
                selectedRole === 'teacher' && styles.selectedCard
              ]}
              onPress={() => setSelectedRole('teacher')}
            >
              <View style={[styles.roleIcon, { backgroundColor: '#C4896F' }]}>
                <GraduationCap size={32} color="white" />
              </View>
              <Text style={styles.roleTitle}>I am a Teacher</Text>
              <Text style={styles.roleDescription}>Create and manage your classes</Text>
            </TouchableOpacity>
          </View>

          {selectedRole && (
            <TouchableOpacity
              style={[styles.continueButton, loading && styles.disabledButton]}
              onPress={handleContinue}
              disabled={loading}
            >
              <Text style={styles.continueButtonText}>
                {loading ? 'Setting up...' : 'Continue'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8E8F0',
  },
  content: {
    flex: 1,
    paddingHorizontal: 40,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#333',
    marginBottom: 60,
  },
  roleContainer: {
    width: '100%',
    gap: 20,
    marginBottom: 60,
  },
  roleCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: '#C4896F',
  },
  roleIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  roleTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  roleDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  continueButton: {
    backgroundColor: '#C4896F',
    borderRadius: 25,
    paddingVertical: 16,
    paddingHorizontal: 60,
    alignItems: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});