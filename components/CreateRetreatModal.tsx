import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { X, Calendar, MapPin, Globe, Camera, Plus, Minus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

interface CreateRetreatModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (retreatData: any) => Promise<void>;
  loading: boolean;
}

const RETREAT_TYPES = [
  'Mindfulness Retreat',
  'Yoga & Meditation',
  'Wellness Escape',
  'Spiritual Journey',
  'Detox Retreat',
  'Adventure Yoga',
  'Healing Retreat',
  'Silent Retreat',
];

export default function CreateRetreatModal({ visible, onClose, onSubmit, loading }: CreateRetreatModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Mindfulness Retreat',
    startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
    endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
    time: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    isVirtual: false,
    location: '',
    retreatImage: null as string | null,
    highlights: [''] as string[],
    capacity: 20,
    price: 400,
    earlyBirdPrice: 350,
    earlyBirdDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEarlyBirdDatePicker, setShowEarlyBirdDatePicker] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Retreat title is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (formData.endDate <= formData.startDate) {
      newErrors.endDate = 'End date must be after start date';
    }

    if (!formData.isVirtual && !formData.location.trim()) {
      newErrors.location = 'Location is required for physical retreats';
    }

    if (formData.highlights.filter(h => h.trim()).length === 0) {
      newErrors.highlights = 'At least one highlight is required';
    }

    if (formData.capacity < 5 || formData.capacity > 50) {
      newErrors.capacity = 'Capacity must be between 5 and 50';
    }

    if (formData.price <= 0) {
      newErrors.price = 'Price must be greater than 0';
    }

    if (formData.earlyBirdPrice >= formData.price) {
      newErrors.earlyBirdPrice = 'Early bird price must be less than regular price';
    }

    if (formData.earlyBirdDeadline >= formData.startDate) {
      newErrors.earlyBirdDeadline = 'Early bird deadline must be before retreat start date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    // Calculate retreat duration in days
    const durationInDays = Math.ceil((formData.endDate.getTime() - formData.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // For retreats, we'll use a standard daily session duration (e.g., 2 hours = 120 minutes)
    // The actual retreat duration is tracked by start/end dates
    const dailySessionDuration = 120; // 2 hours per day

    const retreatData = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      type: formData.type,
      date: formData.startDate.toISOString().split('T')[0],
      retreat_end_date: formData.endDate.toISOString().split('T')[0],
      time: formData.time.toTimeString().split(' ')[0].substring(0, 5),
      duration: dailySessionDuration, // Use standard daily session duration
      level: formData.level,
      is_retreat: true,
      is_virtual: formData.isVirtual,
      location: formData.isVirtual ? 'Virtual Retreat' : formData.location.trim(),
      retreat_image_url: formData.retreatImage,
      retreat_highlights: formData.highlights.filter(h => h.trim()),
      retreat_capacity: formData.capacity,
      max_participants: formData.capacity,
      price: formData.price,
      early_bird_price: formData.earlyBirdPrice,
      early_bird_deadline: formData.earlyBirdDeadline.toISOString().split('T')[0],
    };

    await onSubmit(retreatData);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera roll permissions to upload an image.');
      return;
    }

    setImageLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1200, 630],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
          Alert.alert('File too large', 'Please select an image smaller than 2MB.');
          return;
        }

        setFormData(prev => ({ ...prev, retreatImage: asset.uri }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    } finally {
      setImageLoading(false);
    }
  };

  const addHighlight = () => {
    if (formData.highlights.length < 5) {
      setFormData(prev => ({
        ...prev,
        highlights: [...prev.highlights, '']
      }));
    }
  };

  const removeHighlight = (index: number) => {
    setFormData(prev => ({
      ...prev,
      highlights: prev.highlights.filter((_, i) => i !== index)
    }));
  };

  const updateHighlight = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      highlights: prev.highlights.map((h, i) => i === index ? value : h)
    }));
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'Mindfulness Retreat',
      startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      time: new Date(Date.now() + 60 * 60 * 1000),
      isVirtual: false,
      location: '',
      retreatImage: null,
      highlights: [''],
      capacity: 20,
      price: 400,
      earlyBirdPrice: 350,
      earlyBirdDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      level: 'beginner',
    });
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const getDuration = () => {
    const days = Math.ceil((formData.endDate.getTime() - formData.startDate.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView 
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} disabled={loading}>
              <X size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Create Retreat</Text>
            <TouchableOpacity 
              onPress={handleSubmit} 
              disabled={loading}
              style={[styles.createButton, loading && styles.createButtonDisabled]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.createButtonText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.content} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Retreat Preview Card */}
            <View style={styles.previewCard}>
              <View style={styles.previewImageContainer}>
                {formData.retreatImage ? (
                  <Image source={{ uri: formData.retreatImage }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewImagePlaceholder}>
                    <Camera size={32} color="#999" />
                    <Text style={styles.previewImageText}>Retreat Banner</Text>
                  </View>
                )}
                <View style={styles.previewOverlay}>
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationText}>{getDuration()}-Day Retreat</Text>
                  </View>
                </View>
              </View>
              <View style={styles.previewContent}>
                <Text style={styles.previewTitle}>
                  {formData.title || 'Retreat Title'}
                </Text>
                <Text style={styles.previewLocation}>
                  {formData.isVirtual ? '🌐 Virtual' : `📍 ${formData.location || 'Location'}`}
                </Text>
              </View>
            </View>

            {/* Basic Information */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Basic Information</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Retreat Title *</Text>
                <TextInput
                  style={[styles.input, errors.title && styles.inputError]}
                  value={formData.title}
                  onChangeText={(text) => {
                    setFormData(prev => ({ ...prev, title: text }));
                    if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
                  }}
                  placeholder="e.g. Mindfulness Escape in Santorini"
                  editable={!loading}
                />
                {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description *</Text>
                <TextInput
                  style={[styles.textArea, errors.description && styles.inputError]}
                  value={formData.description}
                  onChangeText={(text) => {
                    setFormData(prev => ({ ...prev, description: text }));
                    if (errors.description) setErrors(prev => ({ ...prev, description: '' }));
                  }}
                  placeholder="Describe your retreat experience, what participants can expect..."
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  editable={!loading}
                />
                {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Retreat Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeOptions}>
                  {RETREAT_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeOption,
                        formData.type === type && styles.typeOptionActive
                      ]}
                      onPress={() => setFormData(prev => ({ ...prev, type }))}
                    >
                      <Text style={[
                        styles.typeOptionText,
                        formData.type === type && styles.typeOptionTextActive
                      ]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Dates & Time */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Schedule</Text>
              
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.label}>Start Date</Text>
                  <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowStartDatePicker(true)}
                    disabled={loading}
                  >
                    <Calendar size={16} color="#666" />
                    <Text style={styles.dateText}>
                      {formData.startDate.toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.label}>End Date</Text>
                  <TouchableOpacity
                    style={[styles.dateButton, errors.endDate && styles.inputError]}
                    onPress={() => setShowEndDatePicker(true)}
                    disabled={loading}
                  >
                    <Calendar size={16} color="#666" />
                    <Text style={styles.dateText}>
                      {formData.endDate.toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {errors.endDate && <Text style={styles.errorText}>{errors.endDate}</Text>}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Start Time</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowTimePicker(true)}
                  disabled={loading}
                >
                  <Calendar size={16} color="#666" />
                  <Text style={styles.dateText}>
                    {formData.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Location */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location</Text>
              
              <View style={styles.modeToggle}>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    !formData.isVirtual && styles.modeButtonActive
                  ]}
                  onPress={() => setFormData(prev => ({ ...prev, isVirtual: false }))}
                  disabled={loading}
                >
                  <MapPin size={16} color={!formData.isVirtual ? 'white' : '#666'} />
                  <Text style={[
                    styles.modeButtonText,
                    !formData.isVirtual && styles.modeButtonTextActive
                  ]}>
                    Physical
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    formData.isVirtual && styles.modeButtonActive
                  ]}
                  onPress={() => setFormData(prev => ({ ...prev, isVirtual: true }))}
                  disabled={loading}
                >
                  <Globe size={16} color={formData.isVirtual ? 'white' : '#666'} />
                  <Text style={[
                    styles.modeButtonText,
                    formData.isVirtual && styles.modeButtonTextActive
                  ]}>
                    Virtual
                  </Text>
                </TouchableOpacity>
              </View>

              {!formData.isVirtual && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Venue Location *</Text>
                  <TextInput
                    style={[styles.input, errors.location && styles.inputError]}
                    value={formData.location}
                    onChangeText={(text) => {
                      setFormData(prev => ({ ...prev, location: text }));
                      if (errors.location) setErrors(prev => ({ ...prev, location: '' }));
                    }}
                    placeholder="e.g. Santorini, Greece"
                    editable={!loading}
                  />
                  {errors.location && <Text style={styles.errorText}>{errors.location}</Text>}
                </View>
              )}
            </View>

            {/* Retreat Image */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Retreat Banner</Text>
              <TouchableOpacity
                style={styles.imageUpload}
                onPress={pickImage}
                disabled={loading || imageLoading}
              >
                {formData.retreatImage ? (
                  <Image source={{ uri: formData.retreatImage }} style={styles.imagePreview} />
                ) : (
                  <View style={styles.imageUploadPlaceholder}>
                    {imageLoading ? (
                      <ActivityIndicator size="small" color="#C4896F" />
                    ) : (
                      <>
                        <Camera size={24} color="#666" />
                        <Text style={styles.imageUploadText}>Add Banner Image</Text>
                        <Text style={styles.imageUploadSubtext}>1200x630px, Max 2MB</Text>
                      </>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Highlights */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Retreat Highlights</Text>
              {formData.highlights.map((highlight, index) => (
                <View key={index} style={styles.highlightRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={highlight}
                    onChangeText={(text) => updateHighlight(index, text)}
                    placeholder={`Highlight ${index + 1}`}
                    editable={!loading}
                  />
                  {formData.highlights.length > 1 && (
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeHighlight(index)}
                    >
                      <Minus size={16} color="#FF6B6B" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {formData.highlights.length < 5 && (
                <TouchableOpacity style={styles.addButton} onPress={addHighlight}>
                  <Plus size={16} color="#C4896F" />
                  <Text style={styles.addButtonText}>Add Highlight</Text>
                </TouchableOpacity>
              )}
              {errors.highlights && <Text style={styles.errorText}>{errors.highlights}</Text>}
            </View>

            {/* Pricing & Capacity */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pricing & Capacity</Text>
              
              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.label}>Capacity</Text>
                  <TextInput
                    style={[styles.input, errors.capacity && styles.inputError]}
                    value={formData.capacity.toString()}
                    onChangeText={(text) => {
                      const capacity = parseInt(text) || 5;
                      setFormData(prev => ({ ...prev, capacity }));
                      if (errors.capacity) setErrors(prev => ({ ...prev, capacity: '' }));
                    }}
                    keyboardType="numeric"
                    placeholder="20"
                    editable={!loading}
                  />
                  {errors.capacity && <Text style={styles.errorText}>{errors.capacity}</Text>}
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.label}>Regular Price (€)</Text>
                  <TextInput
                    style={[styles.input, errors.price && styles.inputError]}
                    value={formData.price.toString()}
                    onChangeText={(text) => {
                      const price = parseInt(text) || 0;
                      setFormData(prev => ({ ...prev, price }));
                      if (errors.price) setErrors(prev => ({ ...prev, price: '' }));
                    }}
                    keyboardType="numeric"
                    placeholder="400"
                    editable={!loading}
                  />
                  {errors.price && <Text style={styles.errorText}>{errors.price}</Text>}
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.label}>Early Bird Price (€)</Text>
                  <TextInput
                    style={[styles.input, errors.earlyBirdPrice && styles.inputError]}
                    value={formData.earlyBirdPrice.toString()}
                    onChangeText={(text) => {
                      const price = parseInt(text) || 0;
                      setFormData(prev => ({ ...prev, earlyBirdPrice: price }));
                      if (errors.earlyBirdPrice) setErrors(prev => ({ ...prev, earlyBirdPrice: '' }));
                    }}
                    keyboardType="numeric"
                    placeholder="350"
                    editable={!loading}
                  />
                  {errors.earlyBirdPrice && <Text style={styles.errorText}>{errors.earlyBirdPrice}</Text>}
                </View>

                <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
                  <Text style={styles.label}>Early Bird Deadline</Text>
                  <TouchableOpacity
                    style={[styles.dateButton, errors.earlyBirdDeadline && styles.inputError]}
                    onPress={() => setShowEarlyBirdDatePicker(true)}
                    disabled={loading}
                  >
                    <Calendar size={16} color="#666" />
                    <Text style={styles.dateText}>
                      {formData.earlyBirdDeadline.toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  {errors.earlyBirdDeadline && <Text style={styles.errorText}>{errors.earlyBirdDeadline}</Text>}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Date/Time Pickers */}
          {showStartDatePicker && (
            <DateTimePicker
              value={formData.startDate}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(event, selectedDate) => {
                setShowStartDatePicker(false);
                if (selectedDate) {
                  setFormData(prev => ({ ...prev, startDate: selectedDate }));
                }
              }}
            />
          )}

          {showEndDatePicker && (
            <DateTimePicker
              value={formData.endDate}
              mode="date"
              display="default"
              minimumDate={formData.startDate}
              onChange={(event, selectedDate) => {
                setShowEndDatePicker(false);
                if (selectedDate) {
                  setFormData(prev => ({ ...prev, endDate: selectedDate }));
                }
              }}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={formData.time}
              mode="time"
              display="default"
              onChange={(event, selectedTime) => {
                setShowTimePicker(false);
                if (selectedTime) {
                  setFormData(prev => ({ ...prev, time: selectedTime }));
                }
              }}
            />
          )}

          {showEarlyBirdDatePicker && (
            <DateTimePicker
              value={formData.earlyBirdDeadline}
              mode="date"
              display="default"
              maximumDate={formData.startDate}
              onChange={(event, selectedDate) => {
                setShowEarlyBirdDatePicker(false);
                if (selectedDate) {
                  setFormData(prev => ({ ...prev, earlyBirdDeadline: selectedDate }));
                }
              }}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4EDE4',
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  createButton: {
    backgroundColor: '#8B7355',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  previewCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  previewImageContainer: {
    position: 'relative',
    height: 160,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewImagePlaceholder: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  previewImageText: {
    fontSize: 14,
    color: '#999',
  },
  previewOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  durationBadge: {
    backgroundColor: 'rgba(139, 115, 85, 0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  durationText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
  },
  previewContent: {
    padding: 16,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  previewLocation: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: '#333',
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  textArea: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: '#333',
    height: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12,
    color: '#FF6B6B',
    marginTop: 4,
  },
  typeOptions: {
    flexDirection: 'row',
  },
  typeOption: {
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  typeOptionActive: {
    backgroundColor: '#8B7355',
  },
  typeOptionText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  typeOptionTextActive: {
    color: 'white',
  },
  row: {
    flexDirection: 'row',
  },
  dateButton: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  modeButtonActive: {
    backgroundColor: '#8B7355',
  },
  modeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: 'white',
  },
  imageUpload: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    height: 120,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageUploadPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imageUploadText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  imageUploadSubtext: {
    fontSize: 12,
    color: '#999',
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  removeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFE5E5',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 14,
    color: '#8B7355',
    fontWeight: '500',
  },
});