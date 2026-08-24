import React from 'react';
import { Image, ImageStyle, StyleProp, View, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

interface SignatureImageProps {
  signatureUrl?: string | null;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
  invertInDarkMode?: boolean;
}

function invertSvgForDarkMode(svgXml: string): string {
  // Replace stroke colors with #FFFFFF, preserving stroke="none"
  return svgXml
    .replace(/stroke="([^"]+)"/gi, (match, color) => {
      if (color.toLowerCase() === 'none' || color.toLowerCase() === 'transparent') return match;
      return 'stroke="#FFFFFF"';
    })
    .replace(/fill="([^"]+)"/gi, (match, color) => {
      if (color.toLowerCase() === 'none' || color.toLowerCase() === 'transparent') return match;
      return 'fill="#FFFFFF"';
    });
}

/**
 * Universal Signature Renderer for React Native.
 * Correctly renders drawn SVG data URIs, SVG XML strings, and standard bitmap images (PNG/JPG).
 * Automatically adapts dark signatures to crisp white in Dark Mode for high visibility.
 */
export const SignatureImage: React.FC<SignatureImageProps> = ({
  signatureUrl,
  style,
  resizeMode = 'contain',
  invertInDarkMode = true,
}) => {
  const { isNightMode } = useTheme();

  if (!signatureUrl) return null;

  const shouldInvert = invertInDarkMode && isNightMode;

  // 1. Check for SVG Data URI or SVG XML
  if (signatureUrl.startsWith('data:image/svg+xml;utf8,')) {
    const rawXml = decodeURIComponent(signatureUrl.replace('data:image/svg+xml;utf8,', ''));
    const finalXml = shouldInvert ? invertSvgForDarkMode(rawXml) : rawXml;
    return (
      <View style={[styles.container, style as any]}>
        <SvgXml xml={finalXml} width="100%" height="100%" />
      </View>
    );
  }

  if (signatureUrl.startsWith('data:image/svg+xml;base64,')) {
    const base64Str = signatureUrl.replace('data:image/svg+xml;base64,', '');
    try {
      const decodedXml = decodeURIComponent(escape(atob(base64Str)));
      const finalXml = shouldInvert ? invertSvgForDarkMode(decodedXml) : decodedXml;
      return (
        <View style={[styles.container, style as any]}>
          <SvgXml xml={finalXml} width="100%" height="100%" />
        </View>
      );
    } catch {
      // Fallback
    }
  }

  if (signatureUrl.trim().startsWith('<svg')) {
    const finalXml = shouldInvert ? invertSvgForDarkMode(signatureUrl) : signatureUrl;
    return (
      <View style={[styles.container, style as any]}>
        <SvgXml xml={finalXml} width="100%" height="100%" />
      </View>
    );
  }

  // 2. Standard bitmap image (PNG, JPG, base64 PNG, HTTPS URL)
  return (
    <Image
      source={{ uri: signatureUrl }}
      style={[style, shouldInvert && { tintColor: '#FFFFFF' }]}
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

