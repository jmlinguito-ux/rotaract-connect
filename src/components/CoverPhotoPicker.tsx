import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { BottomSheet } from './BottomSheet';

interface CoverPhotoPickerProps {
  value?: string;
  onChange: (uri?: string) => void;
}

const PRESET_PHOTOS = [
  { id: '1', title: 'Community Service', url: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=1000&q=80' },
  { id: '2', title: 'Coastal Cleanup', url: 'https://images.unsplash.com/photo-1618477388954-7852f32655ec?auto=format&fit=crop&w=1000&q=80' },
  { id: '3', title: 'Fellowship Gala', url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1000&q=80' },
  { id: '4', title: 'Tree Planting', url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1000&q=80' },
];

export function CoverPhotoPicker({ value, onChange }: CoverPhotoPickerProps) {
  const [presetModalVisible, setPresetModalVisible] = useState(false);

  const handleLaunchDevicePicker = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Photo Permission',
          'Photo library access is needed to select a cover photo. You can also pick from sample cover photos.',
          [
            { text: 'Sample Photos', onPress: () => setPresetModalVisible(true) },
            { text: 'OK', style: 'cancel' },
          ],
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        onChange(result.assets[0].uri);
      }
    } catch (error) {
      setPresetModalVisible(true);
    }
  };

  const handleOpenOptions = () => {
    Alert.alert(
      'Event Cover Photo',
      'Choose photo source:',
      [
        { text: 'Device Photo Gallery', onPress: handleLaunchDevicePicker },
        { text: 'Sample Cover Photo Library', onPress: () => setPresetModalVisible(true) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <View style={styles.container}>
      {value ? (
        <View style={styles.previewCard}>
          <Image source={{ uri: value }} style={styles.previewImage} resizeMode="cover" />
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.changeBtn} onPress={handleOpenOptions}>
              <Ionicons name="image-outline" size={14} color="#fff" />
              <Text style={styles.changeText}>Reposition / Change</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.removeBtn} onPress={() => onChange(undefined)}>
              <Ionicons name="trash-outline" size={14} color={colors.danger} />
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.uploadPlaceholder} onPress={handleOpenOptions}>
          <View style={styles.uploadIconCircle}>
            <Ionicons name="camera-outline" size={24} color={colors.primary} />
          </View>
          <Text style={styles.uploadTitle}>Upload Event Cover Photo</Text>
          <Text style={styles.uploadSub}>Tap to select, crop, zoom, and reposition photo</Text>
        </TouchableOpacity>
      )}

      <BottomSheet
        visible={presetModalVisible}
        onClose={() => setPresetModalVisible(false)}
        cardStyle={styles.modalCard}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Choose Preset Cover Photo</Text>
          <TouchableOpacity onPress={() => setPresetModalVisible(false)}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.presetGrid}>
          {PRESET_PHOTOS.map(p => (
            <TouchableOpacity
              key={p.id}
              style={styles.presetItem}
              onPress={() => {
                onChange(p.url);
                setPresetModalVisible(false);
              }}
            >
              <Image source={{ uri: p.url }} style={styles.presetImage} resizeMode="cover" />
              <Text style={styles.presetTitle}>{p.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 0, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 4 },
  previewCard: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  previewImage: { width: '100%', height: 160 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  changeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.danger },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  uploadPlaceholder: {
    height: 120,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    borderStyle: 'dashed',
    borderRadius: 14,
    backgroundColor: colors.primary + '0A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  uploadIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  uploadTitle: { fontSize: 13, fontWeight: '700', color: colors.primary },
  uploadSub: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  presetLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  presetLinkText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  presetGrid: { gap: 12 },
  presetItem: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  presetImage: { width: '100%', height: 120 },
  presetTitle: { padding: 8, fontSize: 12, fontWeight: '700', color: colors.text, backgroundColor: colors.surface },
});
