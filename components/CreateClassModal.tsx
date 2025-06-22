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
import { X, Calendar, Clock, MapPin, DollarSign, Camera, Check } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import LocationSelector from './LocationSelector';

interface CreateClassModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (classData: any) => Promise<void>;
  loading: boolean;
}

interface LocationCoordinate {
  latitude: number;
  longitude: number;
}

const YOGA_TYPES = [
  'Hatha',
  'Vinyasa',
  'Ashtanga',
  'Bikram',
  'Hot Yoga',
  'Yin Yoga',
  'Restorative',
  'Power Yoga',
  'Kundalini',
  'Iyengar',
];

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
  { label: '75 min', value: 75 },
  { label: '90 min', value: 90 },
  { label: '120 min', value: 120 },
  { label: '180 min', value: 180 },
];

const LEVEL_OPTIONS = [
  { label: 'Beginner', value: 'beginner' },
  { label: 'Intermediate', value: 'intermediate' },
  { label: 'Advanced', value: 'advanced' },
];

export default function CreateClassModal({ visible, onClose, onSubmit, loading }: CreateClassModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'Hatha',
    date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    time: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    duration: 60,
    level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    isOnline: false,
    location: 'Studio A',
    locationCoordinate: null as LocationCoordinate | null,
    meetingLink: '',
    price: 25,
    maxParticipants: 10,
    image: null as string | null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showLevelDropdown, setShowLevelDropdown] = useState(false);
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // 1: Basic Info, 2: Location, 3: Details

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.length > 50) {
      newErrors.title = 'Title must be 50 characters or less';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length > 500) {
      newErrors.description = 'Description must be 500 characters or less';
    }

    if (formData.price < 0 || formData.price > 999) {
      newErrors.price = 'Price must be between $0 and $999';
    }

    if (formData.maxParticipants < 1 || formData.maxParticipants > 50) {
      newErrors.maxParticipants = 'Max participants must be between 1 and 50';
    }

    if (!formData.isOnline && !formData.location.trim()) {
      newErrors.location = 'Location is required for physical classes';
    }

    if (formData.isOnline && !formData.meetingLink.trim()) {
      newErrors.meetingLink = 'Meeting link is required for online classes';
    }

    // Check if date/time is at least 1 hour from now
    const classDateTime = new Date(formData.date);
    classDateTime.setHours(formData.time.getHours(), formData.time.getMinutes());
    const minDateTime = new Date(Date.now() + 60 * 60 * 1000);

    if (classDateTime < minDateTime) {
      newErrors.datetime = 'Class must be scheduled at least 1 hour from now';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const classDateTime = new Date(formData.date);
    classDateTime.setHours(formData.time.getHours(), formData.time.getMinutes());

    const submitData = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      type: formData.type,
      date: formData.date.toISOString().split('T')[0],
      time: formData.time.toTimeString().split(' ')[0].substring(0, 5),
      duration: formData.duration,
      level: formData.level,
      location: formData.isOnline ? 'Online' : formData.location.trim(),
      price: formData.price,
      max_participants: formData.maxParticipants,
      meeting_link: formData.isOnline ? formData.meetingLink.trim() : null,
      image_url: formData.image,
    };

    await onSubmit(submitData);
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
        aspect: [1, 1],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Check file size (2MB limit)
        if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
          Alert.alert('File too large', 'Please select an image smaller than 2MB.');
          return;
        }

        setFormData(prev => ({ ...prev, image: asset.uri }));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    } finally {
      setImageLoading(false);
    }
  };

  const handleLocationChange = (coordinate: LocationCoordinate | null, address: string) => {
    setFormData(prev => ({
      ...prev,
      locationCoordinate: coordinate,
      location: address,
    }));
    if (errors.location) {
      setErrors(prev => ({ ...prev, location: '' }));
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'Hatha',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      time: new Date(Date.now() + 60 * 60 * 1000),
      duration: 60,
      level: 'beginner',
      isOnline: false,
      location: 'Studio A',
      locationCoordinate: null,
      meetingLink: '',
      price: 25,
      maxParticipants: 10,
      image: null,
    });
    setErrors({});
    setCurrentStep(1);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3].map((step) => (
        <View key={step} style={styles.stepContainer}>
          <View style={[
            styles.stepCircle,
            currentStep >= step && styles.stepCircleActive
          ]}>
            <Text style={[
              styles.stepNumber,
              currentStep >= step && styles.stepNumberActive
            ]}>
              {step}
            </Text>
          </View>
          <Text style={styles.stepLabel}>
            {step === 1 ? 'Basic Info' : step === 2 ? 'Location' : 'Details'}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderBasicInfo = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Title */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Class Title <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.input, errors.title && styles.inputError]}
          value={formData.title}
          onChangeText={(text) => {
            setFormData(prev => ({ ...prev, title: text }));
            if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
          }}
          placeholder="e.g. Morning Flow Yoga"
          maxLength={50}
          editable={!loading}
        />
        <Text style={styles.charCount}>{formData.title.length}/50</Text>
        {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
      </View>

      {/* Description */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Description <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={[styles.textArea, errors.description && styles.inputError]}
          value={formData.description}
          onChangeText={(text) => {
            setFormData(prev => ({ ...prev, description: text }));
            if (errors.description) setErrors(prev => ({ ...prev, description: '' }));
          }}
          placeholder="Describe your class, what students can expect, and any special requirements..."
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
          editable={!loading}
        />
        <Text style={styles.charCount}>{formData.description.length}/500</Text>
        {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
      </View>

      {/* Yoga Type */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Yoga Type</Text>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setShowTypeDropdown(!showTypeDropdown)}
          disabled={loading}
        >
          <Text style={styles.dropdownText}>{formData.type}</Text>
        </TouchableOpacity>
        {showTypeDropdown && (
          <View style={styles.dropdownOptions}>
            {YOGA_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={styles.dropdownOption}
                onPress={() => {
                  setFormData(prev => ({ ...prev, type }));
                  setShowTypeDropdown(false);
                }}
              >
                <Text style={styles.dropdownOptionText}>{type}</Text>
                {formData.type === type && <Check size={16} color="#C4896F" />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Level */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Level</Text>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setShowLevelDropdown(!showLevelDropdown)}
          disabled={loading}
        >
          <Text style={styles.dropdownText}>
            {LEVEL_OPTIONS.find(l => l.value === formData.level)?.label}
          </Text>
        </TouchableOpacity>
        {showLevelDropdown && (
          <View style={styles.dropdownOptions}>
            {LEVEL_OPTIONS.map((level) => (
              <TouchableOpacity
                key={level.value}
                style={styles.dropdownOption}
                onPress={() => {
                  setFormData(prev => ({ ...prev, level: level.value as any }));
                  setShowLevelDropdown(false);
                }}
              >
                <Text style={styles.dropdownOptionText}>{level.label}</Text>
                {formData.level === level.value && <Check size={16} color="#C4896F" />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderLocationStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Mode Toggle */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Class Mode</Text>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              !formData.isOnline && styles.modeButtonActive
            ]}
            onPress={() => setFormData(prev => ({ ...prev, isOnline: false }))}
            disabled={loading}
          >
            <MapPin size={16} color={!formData.isOnline ? 'white' : '#666'} />
            <Text style={[
              styles.modeButtonText,
              !formData.isOnline && styles.modeButtonTextActive
            ]}>
              Physical
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeButton,
              formData.isOnline && styles.modeButtonActive
            ]}
            onPress={() => setFormData(prev => ({ ...prev, isOnline: true }))}
            disabled={loading}
          >
            <Text style={[
              styles.modeButtonText,
              formData.isOnline && styles.modeButtonTextActive
            ]}>
              Online
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Location Selector or Meeting Link */}
      {formData.isOnline ? (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Meeting Link <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, errors.meetingLink && styles.inputError]}
            value={formData.meetingLink}
            onChangeText={(text) => {
              setFormData(prev => ({ ...prev, meetingLink: text }));
              if (errors.meetingLink) setErrors(prev => ({ ...prev, meetingLink: '' }));
            }}
            placeholder="https://zoom.us/j/..."
            editable={!loading}
          />
          {errors.meetingLink && <Text style={styles.errorText}>{errors.meetingLink}</Text>}
        </View>
      ) : (
        <LocationSelector
          isOnline={formData.isOnline}
          selectedLocation={formData.locationCoordinate}
          locationAddress={formData.location}
          onLocationChange={handleLocationChange}
        />
      )}
    </ScrollView>
  );

  const renderDetailsStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      {/* Date & Time */}
      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowDatePicker(true)}
            disabled={loading}
          >
            <Calendar size={16} color="#666" />
            <Text style={styles.dateTimeText}>
              {formData.date.toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
          <Text style={styles.label}>Time</Text>
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowTimePicker(true)}
            disabled={loading}
          >
            <Clock size={16} color="#666" />
            <Text style={styles.dateTimeText}>
              {formData.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {errors.datetime && <Text style={styles.errorText}>{errors.datetime}</Text>}

      {/* Duration */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Duration</Text>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setShowDurationDropdown(!showDurationDropdown)}
          disabled={loading}
        >
          <Text style={styles.dropdownText}>
            {DURATION_OPTIONS.find(d => d.value === formData.duration)?.label}
          </Text>
        </TouchableOpacity>
        {showDurationDropdown && (
          <View style={styles.dropdownOptions}>
            {DURATION_OPTIONS.map((duration) => (
              <TouchableOpacity
                key={duration.value}
                style={styles.dropdownOption}
                onPress={() => {
                  setFormData(prev => ({ ...prev, duration: duration.value }));
                  setShowDurationDropdown(false);
                }}
              >
                <Text style={styles.dropdownOptionText}>{duration.label}</Text>
                {formData.duration === duration.value && <Check size={16} color="#C4896F" />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Price & Max Participants */}
      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.label}>Price ($)</Text>
          <View style={styles.priceInput}>
            <DollarSign size={16} color="#666" />
            <TextInput
              style={styles.priceInputField}
              value={formData.price.toString()}
              onChangeText={(text) => {
                const price = parseInt(text) || 0;
                setFormData(prev => ({ ...prev, price }));
                if (errors.price) setErrors(prev => ({ ...prev, price: '' }));
              }}
              keyboardType="numeric"
              placeholder="25"
              editable={!loading}
            />
          </View>
          {errors.price && <Text style={styles.errorText}>{errors.price}</Text>}
        </View>

        <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
          <Text style={styles.label}>Max Participants</Text>
          <TextInput
            style={[styles.input, errors.maxParticipants && styles.inputError]}
            value={formData.maxParticipants.toString()}
            onChangeText={(text) => {
              const maxParticipants = parseInt(text) || 1;
              setFormData(prev => ({ ...prev, maxParticipants }));
              if (errors.maxParticipants) setErrors(prev => ({ ...prev, maxParticipants: '' }));
            }}
            keyboardType="numeric"
            placeholder="10"
            editable={!loading}
          />
          {errors.maxParticipants && <Text style={styles.errorText}>{errors.maxParticipants}</Text>}
        </View>
      </View>

      {/* Image Upload */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Class Image (Optional)</Text>
        <TouchableOpacity
          style={styles.imageUpload}
          onPress={pickImage}
          disabled={loading || imageLoading}
        >
          {formData.image ? (
            <Image source={{ uri: formData.image }} style={styles.imagePreview} />
          ) : (
            <View style={styles.imageUploadPlaceholder}>
              {imageLoading ? (
                <ActivityIndicator size="small" color="#C4896F" />
              ) : (
                <>
                  <Camera size={24} color="#666" />
                  <Text style={styles.imageUploadText}>Add Image</Text>
                  <Text style={styles.imageUploadSubtext}>Max 2MB, Square format</Text>
                </>
              )}
            </View>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

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
            <Text style={styles.headerTitle}>Create Class</Text>
            {currentStep === 3 ? (
              <TouchableOpacity 
                onPress={handleSubmit} 
                disabled={loading}
                style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.saveButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.saveButton} />
            )}
          </View>

          {/* Step Indicator */}
          {renderStepIndicator()}

          {/* Step Content */}
          <View style={styles.content}>
            {currentStep === 1 && renderBasicInfo()}
            {currentStep === 2 && renderLocationStep()}
            {currentStep === 3 && renderDetailsStep()}
          </View>

          {/* Navigation Buttons */}
          <View style={styles.navigationButtons}>
            {currentStep > 1 && (
              <TouchableOpacity
                style={styles.navButton}
                onPress={prevStep}
                disabled={loading}
              >
                <Text style={styles.navButtonText}>Previous</Text>
              </TouchableOpacity>
            )}
            
            {currentStep < 3 && (
              <TouchableOpacity
                style={[styles.navButton, styles.navButtonPrimary]}
                onPress={nextStep}
                disabled={loading}
              >
                <Text style={[styles.navButtonText, styles.navButtonTextPrimary]}>Next</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Date/Time Pickers */}
          {showDatePicker && (
            <DateTimePicker
              value={formData.date}
              mode="date"
              display="default"
              minimumDate={new Date()}
              maximumDate={new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)}
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) {
                  setFormData(prev => ({ ...prev, date: selectedDate }));
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
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
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
  saveButton: {
    backgroundColor: '#C4896F',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  stepContainer: {
    alignItems: 'center',
    marginHorizontal: 20,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stepCircleActive: {
    backgroundColor: '#C4896F',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  stepNumberActive: {
    color: 'white',
  },
  stepLabel: {
    fontSize: 12,
    color: '#666',
  },
  content: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
    padding: 20,
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#C4896F',
  },
  navButtonPrimary: {
    backgroundColor: '#C4896F',
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#C4896F',
  },
  navButtonTextPrimary: {
    color: 'white',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#FF6B6B',
  },
  input: {
    backgroundColor: 'white',
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
    backgroundColor: 'white',
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
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#FF6B6B',
    marginTop: 4,
  },
  dropdown: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dropdownText: {
    fontSize: 16,
    color: '#333',
  },
  dropdownOptions: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    maxHeight: 200,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#333',
  },
  row: {
    flexDirection: 'row',
  },
  dateTimeButton: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateTimeText: {
    fontSize: 16,
    color: '#333',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
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
    backgroundColor: '#C4896F',
  },
  modeButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: 'white',
  },
  priceInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceInputField: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  imageUpload: {
    backgroundColor: 'white',
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
});