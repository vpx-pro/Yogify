import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { RefreshCw, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle } from 'lucide-react-native';

interface ParticipantCountManagerProps {
  classId?: string;
  onCountUpdate?: (newCount: number) => void;
  showSyncButton?: boolean;
}

interface CountValidationResult {
  class_id: string;
  old_count: number;
  new_count: number;
  fixed: boolean;
}

export default function ParticipantCountManager({
  classId,
  onCountUpdate,
  showSyncButton = false
}: ParticipantCountManagerProps) {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Sync participant count for a specific class
  const syncClassCount = async (targetClassId: string) => {
    try {
      setSyncing(true);
      setSyncStatus('idle');

      const { error } = await supabase.rpc('sync_participant_count', {
        p_class_id: targetClassId
      });

      if (error) throw error;

      // Get the updated count
      const { data: classData, error: fetchError } = await supabase
        .from('yoga_classes')
        .select('current_participants')
        .eq('id', targetClassId)
        .single();

      if (fetchError) throw fetchError;

      setSyncStatus('success');
      setLastSyncTime(new Date());
      
      if (onCountUpdate && classData) {
        onCountUpdate(classData.current_participants);
      }

      return classData?.current_participants || 0;
    } catch (error) {
      console.error('Error syncing participant count:', error);
      setSyncStatus('error');
      throw error;
    } finally {
      setSyncing(false);
    }
  };

  // Validate and fix all class participant counts
  const validateAllCounts = async () => {
    try {
      setSyncing(true);
      setSyncStatus('idle');

      const { data, error } = await supabase.rpc('validate_all_participant_counts');

      if (error) throw error;

      const results = data as CountValidationResult[];
      const fixedCount = results?.length || 0;

      setSyncStatus('success');
      setLastSyncTime(new Date());

      Alert.alert(
        'Validation Complete',
        `Validated ${fixedCount} classes. All participant counts are now synchronized.`,
        [{ text: 'OK' }]
      );

      return results;
    } catch (error) {
      console.error('Error validating participant counts:', error);
      setSyncStatus('error');
      Alert.alert(
        'Validation Failed',
        'Failed to validate participant counts. Please try again.',
        [{ text: 'OK' }]
      );
      throw error;
    } finally {
      setSyncing(false);
    }
  };

  // Handle sync button press
  const handleSync = async () => {
    try {
      if (classId) {
        await syncClassCount(classId);
        Alert.alert(
          'Sync Complete',
          'Participant count has been synchronized with actual bookings.',
          [{ text: 'OK' }]
        );
      } else {
        await validateAllCounts();
      }
    } catch (error) {
      // Error already handled in the sync functions
    }
  };

  // Auto-sync on mount if classId is provided
  useEffect(() => {
    if (classId) {
      syncClassCount(classId).catch(() => {
        // Error already handled in syncClassCount
      });
    }
  }, [classId]);

  if (!showSyncButton) {
    return null;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.syncButton,
          syncing && styles.syncButtonDisabled,
          syncStatus === 'success' && styles.syncButtonSuccess,
          syncStatus === 'error' && styles.syncButtonError
        ]}
        onPress={handleSync}
        disabled={syncing}
      >
        <View style={styles.syncButtonContent}>
          {syncing ? (
            <RefreshCw size={16} color="white" style={styles.spinning} />
          ) : syncStatus === 'success' ? (
            <CheckCircle size={16} color="white" />
          ) : syncStatus === 'error' ? (
            <AlertTriangle size={16} color="white" />
          ) : (
            <RefreshCw size={16} color="white" />
          )}
          
          <Text style={styles.syncButtonText}>
            {syncing 
              ? 'Syncing...' 
              : classId 
                ? 'Sync Count' 
                : 'Validate All'
            }
          </Text>
        </View>
      </TouchableOpacity>

      {lastSyncTime && (
        <Text style={styles.lastSyncText}>
          Last synced: {lastSyncTime.toLocaleTimeString()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 8,
  },
  syncButton: {
    backgroundColor: '#C4896F',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncButtonDisabled: {
    backgroundColor: '#999',
  },
  syncButtonSuccess: {
    backgroundColor: '#4CAF50',
  },
  syncButtonError: {
    backgroundColor: '#FF6B6B',
  },
  syncButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  spinning: {
    // Note: For actual spinning animation, you'd need react-native-reanimated
    // This is just a placeholder for the spinning effect
  },
  lastSyncText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
});