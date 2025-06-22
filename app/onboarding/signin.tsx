import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    const { error } = await signIn(email, password);
    
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      router.replace('/(tabs)');
    }
    setLoading(false);
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
          <Text style={styles.title}>Sign In</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#999"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor="#999"
          />

          <TouchableOpacity
            style={[styles.signInButton, loading && styles.disabledButton]}
            onPress={handleSignIn}
            disabled={loading}
          >
            <Text style={styles.signInButtonText}>
              {loading ? 'Signing In...' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.signUpLink}
            onPress={() => router.push('/onboarding/signup')}
          >
            <Text style={styles.signUpLinkText}>
              Don&apos;t have an account? Sign Up
            </Text>
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
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
  },
  backButton: {
    marginRight: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#333',
  },
  form: {
    flex: 1,
    gap: 20,
  },
  input: {
    backgroundColor: '#E8E8E0',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    color: '#333',
  },
  signInButton: {
    backgroundColor: '#C4896F',
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  signInButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  signUpLink: {
    alignItems: 'center',
    marginTop: 20,
  },
  signUpLinkText: {
    fontSize: 14,
    color: '#666',
  },
});