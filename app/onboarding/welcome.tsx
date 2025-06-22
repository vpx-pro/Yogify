import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#F5F5F0', '#E8E8E0']}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Yogify</Text>
          </View>

          <View style={styles.mainContent}>
            <Text style={styles.welcomeText}>Welcome to</Text>
            <Text style={styles.welcomeText}>Yogify</Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.emailButton}
              onPress={() => router.push('/onboarding/signin')}
            >
              <Text style={styles.emailButtonText}>Continue with Email</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signUpButton}
              onPress={() => router.push('/onboarding/signup')}
            >
              <Text style={styles.signUpButtonText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 40,
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#333',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  welcomeText: {
    fontSize: 42,
    fontWeight: '600',
    color: '#333',
    lineHeight: 50,
  },
  buttonContainer: {
    paddingBottom: 80,
    gap: 16,
  },
  emailButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
  },
  emailButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  signUpButton: {
    backgroundColor: '#C4896F',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
  },
  signUpButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
});