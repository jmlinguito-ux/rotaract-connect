import React from 'react';
import { Image, ImageStyle, StyleProp, View, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';

interface SignatureImageProps {
  signatureUrl?: string | null;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
}

/**
 * Universal Signature Renderer for React Native.
 * Correctly renders drawn SVG data URIs, SVG XML strings, and standard bitmap images (PNG/JPG).
 */
export const SignatureImage: React.FC<SignatureImageProps> = ({
  signatureUrl,
  style,
  resizeMode = 'contain',
}) => {
  if (!signatureUrl) return null;

  // 1. Check for SVG Data URI or SVG XML
  if (signatureUrl.startsWith('data:image/svg+xml;utf8,')) {
    const rawXml = decodeURIComponent(signatureUrl.replace('data:image/svg+xml;utf8,', ''));
    return (
      <View style={[styles.container, style as any]}>
        <SvgXml xml={rawXml} width="100%" height="100%" />
      </View>
    );
  }

  if (signatureUrl.startsWith('data:image/svg+xml;base64,')) {
    const base64Str = signatureUrl.replace('data:image/svg+xml;base64,', '');
    try {
      const decodedXml = decodeURIComponent(escape(atob(base64Str)));
      return (
        <View style={[styles.container, style as any]}>
          <SvgXml xml={decodedXml} width="100%" height="100%" />
        </View>
      );
    } catch {
      // Fallback
    }
  }

  if (signatureUrl.trim().startsWith('<svg')) {
    return (
      <View style={[styles.container, style as any]}>
        <SvgXml xml={signatureUrl} width="100%" height="100%" />
      </View>
    );
  }

  // 2. Standard bitmap image (PNG, JPG, base64 PNG, HTTPS URL)
  return (
    <Image
      source={{ uri: signatureUrl }}
      style={style}
      resizeMode={resizeMode}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
