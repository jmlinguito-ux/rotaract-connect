import React, { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

interface SignatureModalProps {
  visible: boolean;
  currentSignature?: string;
  onClose: () => void;
  onSave: (signatureUri: string) => Promise<void> | void;
}

const CANVAS_HEIGHT = 180;
const CANVAS_WIDTH = Dimensions.get('window').width - 64;

export const SignatureModal: React.FC<SignatureModalProps> = ({
  visible,
  currentSignature,
  onClose,
  onSave,
}) => {
  const { colors: themeColors } = useTheme();
  const [activeTab, setActiveTab] = useState<'DRAW' | 'UPLOAD'>('DRAW');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [selectedColor, setSelectedColor] = useState('#0F172A'); // Rotary Black
  const [strokeWidth, setStrokeWidth] = useState(3.5);
  const [uploadedImageUri, setUploadedImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // PanResponder for smooth signature drawing
  const currentStrokeRef = useRef<Point[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newPoint = { x: locationX, y: locationY };
        currentStrokeRef.current = [newPoint];
        setCurrentStroke([newPoint]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        // Keep within canvas bounds
        const clampedX = Math.max(0, Math.min(CANVAS_WIDTH, locationX));
        const clampedY = Math.max(0, Math.min(CANVAS_HEIGHT, locationY));
        const newPoints = [...currentStrokeRef.current, { x: clampedX, y: clampedY }];
        currentStrokeRef.current = newPoints;
        setCurrentStroke(newPoints);
      },
      onPanResponderRelease: () => {
        if (currentStrokeRef.current.length > 0) {
          const finishedStroke: Stroke = {
            points: [...currentStrokeRef.current],
            color: selectedColor,
            width: strokeWidth,
          };
          setStrokes((prev) => [...prev, finishedStroke]);
          currentStrokeRef.current = [];
          setCurrentStroke([]);
        }
      },
    })
  ).current;

  // Convert points array to smooth SVG path string
  const pointsToSvgPath = (points: Point[]): string => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;

    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
    }
    return path;
  };

  // Convert all strokes to a standalone SVG data URI
  const exportDrawnSignatureToDataUri = (): string => {
    const pathsSvg = strokes
      .map(
        (s) =>
          `<path d="${pointsToSvgPath(s.points)}" stroke="${s.color}" stroke-width="${s.width}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`
      )
      .join('');

    const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"><rect width="100%" height="100%" fill="none"/>${pathsSvg}</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgXml)}`;
  };

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to upload your signature.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const mimeType = asset.mimeType || 'image/png';
          setUploadedImageUri(`data:${mimeType};base64,${asset.base64}`);
        } else {
          setUploadedImageUri(asset.uri);
        }
      }
    } catch (err: any) {
      console.error('[Signature ImagePicker Error]:', err);
      Alert.alert('Upload Error', 'Unable to pick image. Please try again.');
    }
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
    setUploadedImageUri(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      let finalSignatureUri = '';

      if (activeTab === 'DRAW') {
        if (strokes.length === 0) {
          Alert.alert('Empty Signature', 'Please draw your signature on the pad before saving.');
          setSaving(false);
          return;
        }
        finalSignatureUri = exportDrawnSignatureToDataUri();
      } else {
        if (!uploadedImageUri) {
          Alert.alert('No Image', 'Please select a signature image to upload.');
          setSaving(false);
          return;
        }
        finalSignatureUri = uploadedImageUri;
      }

      await onSave(finalSignatureUri);
      onClose();
    } catch (err: any) {
      console.error('[Signature Save Error]:', err);
      Alert.alert('Save Failed', err?.message || 'Could not save digital signature.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: themeColors.surface }]}>
          {/* Modal Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrap, { backgroundColor: '#FDF2F5' }]}>
                <Ionicons name="pencil" size={20} color="#D91B5C" />
              </View>
              <View>
                <Text style={[styles.title, { color: themeColors.text }]}>Officer Digital Signature</Text>
                <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
                  Overlays on official Certificate of Volunteer Service
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={26} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Segmented Tab Switch */}
          <View style={[styles.tabBar, { backgroundColor: themeColors.bg }]}>
            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === 'DRAW' && [styles.tabItemActive, { backgroundColor: themeColors.surface }],
              ]}
              onPress={() => setActiveTab('DRAW')}
            >
              <Ionicons
                name="brush-outline"
                size={16}
                color={activeTab === 'DRAW' ? '#D91B5C' : themeColors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === 'DRAW' ? '#D91B5C' : themeColors.textMuted },
                  activeTab === 'DRAW' && styles.tabTextActive,
                ]}
              >
                Draw Signature
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabItem,
                activeTab === 'UPLOAD' && [styles.tabItemActive, { backgroundColor: themeColors.surface }],
              ]}
              onPress={() => setActiveTab('UPLOAD')}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={16}
                color={activeTab === 'UPLOAD' ? '#D91B5C' : themeColors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === 'UPLOAD' ? '#D91B5C' : themeColors.textMuted },
                  activeTab === 'UPLOAD' && styles.tabTextActive,
                ]}
              >
                Upload Image
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab 1: Interactive Drawing Canvas */}
          {activeTab === 'DRAW' && (
            <View style={styles.drawSection}>
              {/* Canvas Box */}
              <View
                style={[
                  styles.canvasContainer,
                  {
                    width: CANVAS_WIDTH,
                    height: CANVAS_HEIGHT,
                    borderColor: themeColors.border,
                  },
                ]}
                {...panResponder.panHandlers}
              >
                <Svg height={CANVAS_HEIGHT} width={CANVAS_WIDTH} style={styles.svgCanvas}>
                  {/* Saved Strokes */}
                  {strokes.map((stroke, index) => (
                    <Path
                      key={`saved-${index}`}
                      d={pointsToSvgPath(stroke.points)}
                      stroke={stroke.color}
                      strokeWidth={stroke.width}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {/* Active Drawing Stroke */}
                  {currentStroke.length > 0 && (
                    <Path
                      d={pointsToSvgPath(currentStroke)}
                      stroke={selectedColor}
                      strokeWidth={strokeWidth}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </Svg>

                {strokes.length === 0 && currentStroke.length === 0 && (
                  <View style={styles.placeholderOverlay} pointerEvents="none">
                    <Ionicons name="pencil-outline" size={24} color="#CBD5E1" />
                    <Text style={styles.placeholderText}>Sign with your finger or stylus inside the box</Text>
                    <View style={styles.guideLine} />
                  </View>
                )}
              </View>

              {/* Drawing Controls (Color, Width, Undo, Clear) */}
              <View style={styles.controlsRow}>
                {/* Pen Colors */}
                <View style={styles.colorPills}>
                  {['#0F172A', '#1E3A8A', '#065F46', '#D91B5C'].map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.colorDot,
                        { backgroundColor: c },
                        selectedColor === c && styles.colorDotActive,
                      ]}
                      onPress={() => setSelectedColor(c)}
                    />
                  ))}
                </View>

                {/* Stroke Actions */}
                <View style={styles.actionBtnsGroup}>
                  <TouchableOpacity
                    style={[styles.smallActionBtn, { backgroundColor: themeColors.bg }]}
                    onPress={handleUndo}
                    disabled={strokes.length === 0}
                  >
                    <Ionicons
                      name="arrow-undo-outline"
                      size={16}
                      color={strokes.length > 0 ? themeColors.text : '#CBD5E1'}
                    />
                    <Text
                      style={[
                        styles.smallActionBtnText,
                        { color: strokes.length > 0 ? themeColors.text : '#CBD5E1' },
                      ]}
                    >
                      Undo
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.smallActionBtn, { backgroundColor: '#FEE2E2' }]}
                    onPress={handleClear}
                  >
                    <Ionicons name="trash-outline" size={15} color="#DC2626" />
                    <Text style={[styles.smallActionBtnText, { color: '#DC2626' }]}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Tab 2: Upload Image */}
          {activeTab === 'UPLOAD' && (
            <View style={styles.uploadSection}>
              <TouchableOpacity
                style={[
                  styles.uploadBox,
                  {
                    width: CANVAS_WIDTH,
                    height: CANVAS_HEIGHT,
                    borderColor: uploadedImageUri ? '#D91B5C' : themeColors.border,
                    backgroundColor: themeColors.bg,
                  },
                ]}
                activeOpacity={0.8}
                onPress={handlePickImage}
              >
                {uploadedImageUri ? (
                  <View style={styles.uploadedPreviewWrap}>
                    <Image source={{ uri: uploadedImageUri }} style={styles.uploadedImg} resizeMode="contain" />
                    <Text style={styles.tapToChangeText}>Tap to choose a different photo</Text>
                  </View>
                ) : (
                  <View style={styles.uploadPrompt}>
                    <Ionicons name="image-outline" size={36} color="#D91B5C" />
                    <Text style={[styles.uploadPromptTitle, { color: themeColors.text }]}>
                      Upload Scanned Signature
                    </Text>
                    <Text style={[styles.uploadPromptSub, { color: themeColors.textMuted }]}>
                      Recommended: Transparent PNG or clear dark ink on white paper
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Footnote / Legal Tip */}
          <Text style={[styles.legalTip, { color: themeColors.textMuted }]}>
            ℹ️ This official signature will be embedded onto verified District 3800 service certificates issued to club members.
          </Text>

          {/* Bottom Actions */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: themeColors.border }]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={[styles.cancelBtnText, { color: themeColors.text }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: '#D91B5C' }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Official Signature</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16.5,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabItemActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '800',
  },
  drawSection: {
    alignItems: 'center',
  },
  canvasContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
    position: 'relative',
  },
  svgCanvas: {
    backgroundColor: 'transparent',
  },
  placeholderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  placeholderText: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 6,
    fontWeight: '600',
  },
  guideLine: {
    position: 'absolute',
    bottom: 34,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 12,
  },
  colorPills: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  colorDotActive: {
    borderWidth: 2.5,
    borderColor: '#D91B5C',
    transform: [{ scale: 1.15 }],
  },
  actionBtnsGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  smallActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  uploadSection: {
    alignItems: 'center',
  },
  uploadBox: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  uploadPrompt: {
    alignItems: 'center',
  },
  uploadPromptTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8,
  },
  uploadPromptSub: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  uploadedPreviewWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  uploadedImg: {
    width: '90%',
    height: 110,
  },
  tapToChangeText: {
    fontSize: 11,
    color: '#D91B5C',
    fontWeight: '700',
    marginTop: 6,
  },
  legalTip: {
    fontSize: 10.5,
    lineHeight: 15,
    marginTop: 14,
    marginBottom: 16,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: '#D91B5C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
});
