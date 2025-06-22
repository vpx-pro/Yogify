import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { MapPin, Search, Navigation, Globe } from 'lucide-react-native';
import * as Location from 'expo-location';

// Web-compatible map component
const WebMapView = ({ location, onLocationSelect }: { 
  location: LocationCoordinate | null; 
  onLocationSelect: (coordinate: LocationCoordinate) => void;
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    // Simulate map loading for web
    const timer = setTimeout(() => setMapLoaded(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!mapLoaded) {
    return (
      <View style={styles.mapPlaceholder}>
        <ActivityIndicator size="large" color="#C4896F" />
        <Text style={styles.mapPlaceholderText}>Loading Map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.webMapContainer}>
      <View style={styles.webMapPlaceholder}>
        <MapPin size={32} color="#C4896F" />
        <Text style={styles.webMapText}>Interactive Map</Text>
        <Text style={styles.webMapSubtext}>
          {location 
            ? `Selected: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
            : 'Tap to select location'
          }
        </Text>
        <TouchableOpacity
          style={styles.webMapButton}
          onPress={() => {
            // Simulate location selection for web demo
            const demoLocation = {
              latitude: 37.7749 + (Math.random() - 0.5) * 0.01,
              longitude: -122.4194 + (Math.random() - 0.5) * 0.01,
            };
            onLocationSelect(demoLocation);
          }}
        >
          <Text style={styles.webMapButtonText}>Select Demo Location</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Native map component (placeholder for when running on mobile)
const NativeMapView = ({ location, onLocationSelect }: { 
  location: LocationCoordinate | null; 
  onLocationSelect: (coordinate: LocationCoordinate) => void;
}) => {
  // This would use react-native-maps on native platforms
  return (
    <View style={styles.mapContainer}>
      <Text style={styles.nativeMapText}>
        Native Map View would be rendered here on mobile devices
      </Text>
      <TouchableOpacity
        style={styles.nativeMapButton}
        onPress={() => {
          const demoLocation = {
            latitude: 37.7749,
            longitude: -122.4194,
          };
          onLocationSelect(demoLocation);
        }}
      >
        <Text style={styles.nativeMapButtonText}>Select Location</Text>
      </TouchableOpacity>
    </View>
  );
};

interface LocationCoordinate {
  latitude: number;
  longitude: number;
}

interface LocationSelectorProps {
  isOnline: boolean;
  selectedLocation: LocationCoordinate | null;
  locationAddress: string;
  onLocationChange: (location: LocationCoordinate | null, address: string) => void;
}

const PREDEFINED_LOCATIONS = [
  { name: 'Studio A - Main Hall', address: '123 Wellness St, Downtown' },
  { name: 'Studio B - Quiet Room', address: '123 Wellness St, Downtown' },
  { name: 'Outdoor Pavilion', address: '456 Park Ave, Central Park' },
  { name: 'Community Center', address: '789 Community Blvd, Midtown' },
  { name: 'Beach Yoga Spot', address: '321 Ocean Drive, Beachfront' },
];

export default function LocationSelector({
  isOnline,
  selectedLocation,
  locationAddress,
  onLocationChange,
}: LocationSelectorProps) {
  const [searchQuery, setSearchQuery] = useState(locationAddress);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<typeof PREDEFINED_LOCATIONS>([]);
  const [showResults, setShowResults] = useState(false);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  useEffect(() => {
    checkLocationPermission();
  }, []);

  useEffect(() => {
    setSearchQuery(locationAddress);
  }, [locationAddress]);

  const checkLocationPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationPermission(status);
    } catch (error) {
      console.error('Error checking location permission:', error);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting location permission:', error);
      Alert.alert('Error', 'Failed to request location permission');
      return false;
    }
  };

  const getCurrentLocation = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Web Platform', 'Location services are limited on web. Please use the search or select from predefined locations.');
      return;
    }

    setIsGettingLocation(true);
    try {
      let hasPermission = locationPermission === 'granted';
      
      if (!hasPermission) {
        hasPermission = await requestLocationPermission();
      }

      if (!hasPermission) {
        Alert.alert('Permission Required', 'Location permission is required to get your current location.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coordinate = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      // Reverse geocode to get address
      const addresses = await Location.reverseGeocodeAsync(coordinate);
      const address = addresses[0] 
        ? `${addresses[0].street || ''} ${addresses[0].city || ''} ${addresses[0].region || ''}`.trim()
        : `${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)}`;

      onLocationChange(coordinate, address);
      setSearchQuery(address);
    } catch (error) {
      console.error('Error getting current location:', error);
      Alert.alert('Error', 'Failed to get current location. Please try again or enter manually.');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setIsSearching(true);

    // Simulate search delay
    setTimeout(() => {
      if (query.trim()) {
        const filtered = PREDEFINED_LOCATIONS.filter(location =>
          location.name.toLowerCase().includes(query.toLowerCase()) ||
          location.address.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(filtered);
        setShowResults(true);
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
      setIsSearching(false);
    }, 300);
  };

  const selectPredefinedLocation = (location: typeof PREDEFINED_LOCATIONS[0]) => {
    // Generate demo coordinates for predefined locations
    const demoCoordinate = {
      latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
      longitude: -122.4194 + (Math.random() - 0.5) * 0.1,
    };

    onLocationChange(demoCoordinate, location.address);
    setSearchQuery(location.address);
    setShowResults(false);
  };

  const handleMapLocationSelect = (coordinate: LocationCoordinate) => {
    const address = `${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)}`;
    onLocationChange(coordinate, address);
    setSearchQuery(address);
  };

  if (isOnline) {
    return (
      <View style={styles.onlineContainer}>
        <View style={styles.onlineIndicator}>
          <Globe size={20} color="#4CAF50" />
          <Text style={styles.onlineText}>Online Class - No physical location needed</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Class Location</Text>
      
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Search size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Search for location or enter address..."
            placeholderTextColor="#999"
          />
          {isSearching && <ActivityIndicator size="small" color="#C4896F" />}
        </View>
        
        <TouchableOpacity
          style={styles.currentLocationButton}
          onPress={getCurrentLocation}
          disabled={isGettingLocation}
        >
          {isGettingLocation ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Navigation size={20} color="white" />
          )}
        </TouchableOpacity>
      </View>

      {/* Search Results */}
      {showResults && searchResults.length > 0 && (
        <View style={styles.searchResults}>
          {searchResults.map((location, index) => (
            <TouchableOpacity
              key={index}
              style={styles.searchResultItem}
              onPress={() => selectPredefinedLocation(location)}
            >
              <MapPin size={16} color="#C4896F" />
              <View style={styles.searchResultText}>
                <Text style={styles.searchResultName}>{location.name}</Text>
                <Text style={styles.searchResultAddress}>{location.address}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Map View */}
      <View style={styles.mapSection}>
        <Text style={styles.mapTitle}>Select on Map</Text>
        {Platform.OS === 'web' ? (
          <WebMapView
            location={selectedLocation}
            onLocationSelect={handleMapLocationSelect}
          />
        ) : (
          <NativeMapView
            location={selectedLocation}
            onLocationSelect={handleMapLocationSelect}
          />
        )}
      </View>

      {/* Selected Location Info */}
      {selectedLocation && (
        <View style={styles.selectedLocationInfo}>
          <View style={styles.selectedLocationHeader}>
            <MapPin size={16} color="#4CAF50" />
            <Text style={styles.selectedLocationTitle}>Selected Location</Text>
          </View>
          <Text style={styles.selectedLocationAddress}>{locationAddress}</Text>
          <Text style={styles.selectedLocationCoords}>
            {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
          </Text>
        </View>
      )}

      {/* Quick Location Options */}
      <View style={styles.quickOptions}>
        <Text style={styles.quickOptionsTitle}>Quick Select</Text>
        <View style={styles.quickOptionsGrid}>
          {PREDEFINED_LOCATIONS.slice(0, 4).map((location, index) => (
            <TouchableOpacity
              key={index}
              style={styles.quickOptionButton}
              onPress={() => selectPredefinedLocation(location)}
            >
              <Text style={styles.quickOptionText}>{location.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  onlineContainer: {
    padding: 20,
    alignItems: 'center',
  },
  onlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  onlineText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  currentLocationButton: {
    backgroundColor: '#C4896F',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResults: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    maxHeight: 200,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  searchResultAddress: {
    fontSize: 14,
    color: '#666',
  },
  mapSection: {
    marginBottom: 16,
  },
  mapTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 12,
  },
  mapContainer: {
    height: 200,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholder: {
    height: 200,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: '#666',
  },
  webMapContainer: {
    height: 200,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  webMapPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F8F8F8',
  },
  webMapText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  webMapSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  webMapButton: {
    backgroundColor: '#C4896F',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 8,
  },
  webMapButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  nativeMapText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  nativeMapButton: {
    backgroundColor: '#C4896F',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  nativeMapButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  selectedLocationInfo: {
    backgroundColor: '#E8F5E8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  selectedLocationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  selectedLocationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  selectedLocationAddress: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  selectedLocationCoords: {
    fontSize: 12,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  quickOptions: {
    marginTop: 8,
  },
  quickOptionsTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 12,
  },
  quickOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickOptionButton: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minWidth: (width - 60) / 2,
  },
  quickOptionText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});