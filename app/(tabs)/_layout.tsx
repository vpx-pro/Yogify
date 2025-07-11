import { Tabs } from 'expo-router';
import { Chrome as Home, Calendar, User, BookOpen, Search, CalendarDays, ClipboardCheck, ChartBar as BarChart } from 'lucide-react-native';
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
        tabBarInactiveTintColor: '#888',
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
      
      {/* Conditionally render tabs based on user role */}
      {isTeacher ? (
        // Teacher-specific tabs
        <>
          <Tabs.Screen
            name="classes"
            options={{
              title: 'My Classes',
              tabBarIcon: ({ size, color }) => (
                <Calendar size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="my-schedule"
            options={{
              title: 'Schedule',
              tabBarIcon: ({ size, color }) => (
                <CalendarDays size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="class-stats"
            options={{
              title: 'Stats',
              tabBarIcon: ({ size, color }) => (
                <BarChart size={size} color={color} />
              ),
            }}
          />
        </>
      ) : (
        // Student-specific tabs
        <>
          <Tabs.Screen
            name="classes"
            options={{
              title: 'Classes',
              tabBarIcon: ({ size, color }) => (
                <Calendar size={size} color={color} />
              ),
            }}
          />
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
            name="my-bookings"
            options={{
              title: 'Bookings',
              tabBarIcon: ({ size, color }) => (
                <ClipboardCheck size={size} color={color} />
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
      
      {/* Hide the old bookings tab since we now have role-specific tabs */}
      <Tabs.Screen
        name="bookings"
        options={{
          href: null, // This hides the tab
        }}
      />
      
      {/* Hide tabs that shouldn't be accessible based on role */}
      {isTeacher && (
        <>
          <Tabs.Screen
            name="explore"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="my-bookings"
            options={{
              href: null,
            }}
          />
        </>
      )}
      
      {!isTeacher && (
        <>
          <Tabs.Screen
            name="my-schedule"
            options={{
              href: null,
            }}
          />
          <Tabs.Screen
            name="class-stats"
            options={{
              href: null,
            }}
          />
        </>
      )}
    </Tabs>
  );
}