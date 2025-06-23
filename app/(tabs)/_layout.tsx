import { Tabs } from 'expo-router';
import { Chrome as Home, Calendar, User, BookOpen, Search } from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { Platform } from 'react-native';

export default function TabLayout() {
  const { profile } = useAuth();
  const isTeacher = profile?.role === 'teacher';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#C4896F',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 1,
          borderTopColor: '#E0E0E0',
          paddingBottom: Platform.OS === 'ios' ? 34 : 20, // Extra space for home indicator
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 88 : 75, // Increased height
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginBottom: Platform.OS === 'ios' ? 0 : 5,
        },
        tabBarIconStyle: {
          marginTop: 5,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ size, color }) => (
            <Home size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: isTeacher ? 'My Classes' : 'Classes',
          tabBarIcon: ({ size, color }) => (
            <Calendar size={size} color={color} />
          ),
        }}
      />
      {!isTeacher && (
        <>
          <Tabs.Screen
            name="explore"
            options={{
              title: 'Explore',
              tabBarIcon: ({ size, color }) => (
                <Search size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="bookings"
            options={{
              title: 'My Bookings',
              tabBarIcon: ({ size, color }) => (
                <BookOpen size={size} color={color} />
              ),
            }}
          />
        </>
      )}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ size, color }) => (
            <User size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}