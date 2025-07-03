import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  TouchableOpacity, 
  Platform,
  SafeAreaView
} from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

interface DateRangePickerProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (range: DateRange) => void;
  initialRange?: DateRange;
  minDate?: Date;
  maxDate?: Date;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  isVisible,
  onClose,
  onSave,
  initialRange = { startDate: new Date(), endDate: new Date() },
  minDate = new Date(),
  maxDate,
}) => {
  const [dateRange, setDateRange] = useState<DateRange>(initialRange);
  const [currentStep, setCurrentStep] = useState<'start' | 'end'>('start');

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      if (!selectedDate) return;
      
      if (currentStep === 'start') {
        setDateRange(prev => ({ 
          ...prev, 
          startDate: selectedDate,
          // If end date is before new start date, update it
          endDate: prev.endDate && prev.endDate < selectedDate ? selectedDate : prev.endDate
        }));
        setCurrentStep('end');
      } else {
        setDateRange(prev => ({ ...prev, endDate: selectedDate }));
      }
    } else {
      // iOS behavior
      if (selectedDate) {
        if (currentStep === 'start') {
          setDateRange(prev => ({ 
            ...prev, 
            startDate: selectedDate,
            // If end date is before new start date, update it
            endDate: prev.endDate && prev.endDate < selectedDate ? selectedDate : prev.endDate
          }));
        } else {
          setDateRange(prev => ({ ...prev, endDate: selectedDate }));
        }
      }
    }
  };

  const handleSave = () => {
    if (dateRange.startDate && dateRange.endDate) {
      onSave(dateRange);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Set max date for end date picker based on start date
  const getMaxDate = () => {
    if (maxDate) return maxDate;
    
    // Default to 3 months from start date
    if (dateRange.startDate) {
      const maxEndDate = new Date(dateRange.startDate);
      maxEndDate.setMonth(maxEndDate.getMonth() + 3);
      return maxEndDate;
    }
    
    return undefined;
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Date Range</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.dateSelectionContainer}>
            <View style={styles.dateSelector}>
              <Text style={styles.dateLabel}>Start Date</Text>
              <TouchableOpacity 
                style={[
                  styles.dateButton,
                  currentStep === 'start' && styles.activeDateButton
                ]}
                onPress={() => setCurrentStep('start')}
              >
                <Calendar size={20} color={currentStep === 'start' ? '#8B7355' : '#666'} />
                <Text style={[
                  styles.dateText,
                  currentStep === 'start' && styles.activeDateText
                ]}>
                  {formatDate(dateRange.startDate)}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dateSelector}>
              <Text style={styles.dateLabel}>End Date</Text>
              <TouchableOpacity 
                style={[
                  styles.dateButton,
                  currentStep === 'end' && styles.activeDateButton
                ]}
                onPress={() => setCurrentStep('end')}
                disabled={!dateRange.startDate}
              >
                <Calendar size={20} color={currentStep === 'end' ? '#8B7355' : '#666'} />
                <Text style={[
                  styles.dateText,
                  currentStep === 'end' && styles.activeDateText,
                  !dateRange.startDate && styles.disabledDateText
                ]}>
                  {dateRange.startDate ? formatDate(dateRange.endDate) : 'Select start date first'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {Platform.OS === 'ios' && (
            <View style={styles.pickerContainer}>
              {currentStep === 'start' ? (
                <DateTimePicker
                  value={dateRange.startDate || new Date()}
                  mode="date"
                  display="spinner"
                  onChange={handleDateChange}
                  minimumDate={minDate}
                  maximumDate={getMaxDate()}
                />
              ) : (
                <DateTimePicker
                  value={dateRange.endDate || dateRange.startDate || new Date()}
                  mode="date"
                  display="spinner"
                  onChange={handleDateChange}
                  minimumDate={dateRange.startDate || minDate}
                  maximumDate={getMaxDate()}
                />
              )}
            </View>
          )}

          {Platform.OS === 'android' && (
            <View style={styles.androidPickerContainer}>
              <View style={styles.calendarNavigation}>
                <TouchableOpacity style={styles.navButton}>
                  <ChevronLeft size={24} color="#8B7355" />
                </TouchableOpacity>
                <Text style={styles.calendarMonth}>
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity style={styles.navButton}>
                  <ChevronRight size={24} color="#8B7355" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.calendarPlaceholder}>
                <Text style={styles.calendarPlaceholderText}>
                  {currentStep === 'start' 
                    ? 'Tap to select start date' 
                    : 'Tap to select end date'}
                </Text>
                <TouchableOpacity
                  style={styles.androidPickerButton}
                  onPress={() => {
                    // This will trigger the native date picker
                    DateTimePickerAndroid.open({
                      value: currentStep === 'start'
                        ? (dateRange.startDate || new Date())
                        : (dateRange.endDate || dateRange.startDate || new Date()),
                      mode: 'date',
                      display: 'default',
                      onChange: handleDateChange,
                      minimumDate: currentStep === 'start' ? minDate : dateRange.startDate || minDate,
                      maximumDate: getMaxDate(),
                    });
                  }}
                >
                  <Calendar size={24} color="#8B7355" />
                  <Text style={styles.androidPickerButtonText}>Open Date Picker</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={onClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.saveButton,
                (!dateRange.startDate || !dateRange.endDate) && styles.disabledButton
              ]}
              onPress={handleSave}
              disabled={!dateRange.startDate || !dateRange.endDate}
            >
              <Text style={styles.saveButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  dateSelectionContainer: {
    marginBottom: 20,
  },
  dateSelector: {
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  activeDateButton: {
    borderColor: '#8B7355',
    backgroundColor: '#F8F5F2',
  },
  dateText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
  },
  activeDateText: {
    color: '#8B7355',
    fontWeight: '500',
  },
  disabledDateText: {
    color: '#999',
  },
  pickerContainer: {
    marginBottom: 20,
  },
  androidPickerContainer: {
    marginBottom: 20,
  },
  calendarNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
  },
  calendarMonth: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  calendarPlaceholder: {
    height: 200,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarPlaceholderText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  androidPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B7355',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  androidPickerButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
    marginLeft: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginRight: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#8B7355',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginLeft: 8,
  },
  saveButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  disabledButton: {
    backgroundColor: '#CCC',
  },
});

export default DateRangePicker;