import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert, TextInput, Modal } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Plus, Calendar, Clock, Users, MapPin, CreditCard as Edit, Trash2 } from 'lucide-react-native';
import type { Database } from '@/lib/supabase';

type YogaClass = Database['public']['Tables']['yoga_classes']['Row'];

export default function ClassesScreen() {
  const { profile } = useAuth();
  const [classes, setClasses] = useState<YogaClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClass, setNewClass] = useState({
    title: '',
    description: '',
    date: '',
    time: '',
    duration: 60,
    max_participants: 10,
    price: 25,
    level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    type: 'Hatha',
    location: 'Studio A',
  });

  const isTeacher = profile?.role === 'teacher';

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      let query = supabase.from('yoga_classes').select('*');
      
      if (isTeacher) {
        query = query.eq('teacher_id', profile?.id);
      }
      
      const { data, error } = await query.order('date', { ascending: true });

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const createClass = async () => {
    if (!profile?.id || !newClass.title || !newClass.date || !newClass.time) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase
        .from('yoga_classes')
        .insert([{
          ...newClass,
          teacher_id: profile.id,
          current_participants: 0,
        }]);

      if (error) throw error;

      setShowCreateModal(false);
      setNewClass({
        title: '',
        description: '',
        date: '',
        time: '',
        duration: 60,
        max_participants: 10,
        price: 25,
        level: 'beginner',
        type: 'Hatha',
        location: 'Studio A',
      });
      fetchClasses();
      Alert.alert('Success', 'Class created successfully!');
    } catch (error) {
      console.error('Error creating class:', error);
      Alert.alert('Error', 'Failed to create class');
    }
  };

  const bookClass = async (classId: string) => {
    if (!profile?.id) return;

    try {
      const { error } = await supabase
        .from('bookings')
        .insert([{
          student_id: profile.id,
          class_id: classId,
          status: 'confirmed',
        }]);

      if (error) throw error;

      // Update class participant count
      const targetClass = classes.find(c => c.id === classId);
      if (targetClass) {
        await supabase
          .from('yoga_classes')
          .update({ current_participants: targetClass.current_participants + 1 })
          .eq('id', classId);
      }

      fetchClasses();
      Alert.alert('Success', 'Class booked successfully!');
    } catch (error) {
      console.error('Error booking class:', error);
      Alert.alert('Error', 'Failed to book class');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isTeacher ? 'My Classes' : 'Available Classes'}
        </Text>
        {isTeacher && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowCreateModal(true)}
          >
            <Plus size={24} color="white" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.loadingText}>Loading classes...</Text>
        ) : classes.length > 0 ? (
          classes.map((yogaClass) => (
            <View key={yogaClass.id} style={styles.classCard}>
              <View style={styles.classHeader}>
                <Text style={styles.classTitle}>{yogaClass.title}</Text>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelText}>{yogaClass.level}</Text>
                </View>
              </View>
              
              <Text style={styles.classDescription} numberOfLines={2}>
                {yogaClass.description}
              </Text>
              
              <View style={styles.classDetails}>
                <View style={styles.detailItem}>
                  <Calendar size={16} color="#666" />
                  <Text style={styles.detailText}>{yogaClass.date}</Text>
                </View>
                
                <View style={styles.detailItem}>
                  <Clock size={16} color="#666" />
                  <Text style={styles.detailText}>{yogaClass.time} ({yogaClass.duration}min)</Text>
                </View>
                
                <View style={styles.detailItem}>
                  <Users size={16} color="#666" />
                  <Text style={styles.detailText}>
                    {yogaClass.current_participants}/{yogaClass.max_participants}
                  </Text>
                </View>
                
                <View style={styles.detailItem}>
                  <MapPin size={16} color="#666" />
                  <Text style={styles.detailText}>{yogaClass.location}</Text>
                </View>
              </View>
              
              <View style={styles.classFooter}>
                <Text style={styles.priceText}>${yogaClass.price}</Text>
                {isTeacher ? (
                  <View style={styles.teacherActions}>
                    <TouchableOpacity style={styles.editButton}>
                      <Edit size={16} color="#C4896F" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteButton}>
                      <Trash2 size={16} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      yogaClass.current_participants >= yogaClass.max_participants && styles.disabledButton
                    ]}
                    onPress={() => bookClass(yogaClass.id)}
                    disabled={yogaClass.current_participants >= yogaClass.max_participants}
                  >
                    <Text style={styles.actionButtonText}>
                      {yogaClass.current_participants >= yogaClass.max_participants ? 'Full' : 'Book Now'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {isTeacher 
                ? 'No classes created yet. Create your first class!' 
                : 'No classes available at the moment.'
              }
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Create Class Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create Class</Text>
            <TouchableOpacity onPress={createClass}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Class Title *</Text>
              <TextInput
                style={styles.input}
                value={newClass.title}
                onChangeText={(text) => setNewClass({ ...newClass, title: text })}
                placeholder="e.g., Morning Hatha Yoga"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newClass.description}
                onChangeText={(text) => setNewClass({ ...newClass, description: text })}
                placeholder="Describe your class..."
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>Date *</Text>
                <TextInput
                  style={styles.input}
                  value={newClass.date}
                  onChangeText={(text) => setNewClass({ ...newClass, date: text })}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.inputLabel}>Time *</Text>
                <TextInput
                  style={styles.input}
                  value={newClass.time}
                  onChangeText={(text) => setNewClass({ ...newClass, time: text })}
                  placeholder="HH:MM"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>Duration (minutes)</Text>
                <TextInput
                  style={styles.input}
                  value={newClass.duration.toString()}
                  onChangeText={(text) => setNewClass({ ...newClass, duration: parseInt(text) || 60 })}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={styles.inputLabel}>Max Participants</Text>
                <TextInput
                  style={styles.input}
                  value={newClass.max_participants.toString()}
                  onChangeText={(text) => setNewClass({ ...newClass, max_participants: parseInt(text) || 10 })}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Price ($)</Text>
              <TextInput
                style={styles.input}
                value={newClass.price.toString()}
                onChangeText={(text) => setNewClass({ ...newClass, price: parseInt(text) || 25 })}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Location</Text>
              <TextInput
                style={styles.input}
                value={newClass.location}
                onChangeText={(text) => setNewClass({ ...newClass, location: text })}
                placeholder="e.g., Studio A"
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#C4896F',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
  classCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  classHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  classTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  levelBadge: {
    backgroundColor: '#C4896F',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  levelText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  classDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  classDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#666',
  },
  classFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#C4896F',
  },
  actionButton: {
    backgroundColor: '#C4896F',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  actionButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  disabledButton: {
    backgroundColor: '#CCC',
  },
  teacherActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: 'white',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cancelText: {
    fontSize: 16,
    color: '#666',
  },
  saveText: {
    fontSize: 16,
    color: '#C4896F',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
});