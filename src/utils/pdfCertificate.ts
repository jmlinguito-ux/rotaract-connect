import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Alert, Platform } from 'react-native';

const SAF_DIR_KEY = '@rotaract:cert-save-dir';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { AppUser, RotaractEvent, EventParticipant, EventImpact } from '../types';
import { calculateParticipantHours } from './hoursCalculation';
import {
  CERT_SERIF_REGULAR_BASE64,
  CERT_SERIF_ITALIC_BASE64,
} from './fontsBase64';

// Lazy-loaded: logoBase64 (~47KB) and certAssetsBase64 (~463KB) are only needed
// when generating a PDF. Static imports forced both into the initial bundle (and
// every reload's module graph). They resolve once on first cert generation and
// are cached for the rest of the session.
let certAssetsPromise: Promise<{
  ROTARACT_HEADER_LOGO_BASE64: string;
  EMOJI_DATA_URI: Record<string, string>;
}> | null = null;
function getCertAssets() {
  if (!certAssetsPromise) {
    certAssetsPromise = Promise.all([
      import('./logoBase64'),
      import('./certAssetsBase64'),
    ]).then(([logo, cert]) => ({
      ROTARACT_HEADER_LOGO_BASE64: logo.ROTARACT_HEADER_LOGO_BASE64,
      EMOJI_DATA_URI: cert.EMOJI_DATA_URI,
    }));
  }
  return certAssetsPromise;
}

/**
 * Shared print CSS utilities (emoji sizing, etc.).
 * Standard serif (Georgia, Times New Roman) and sans-serif (system/Roboto) fonts
 * are used to ensure 100% consistent rendering across Android WebView and Chrome.
 */
const EMBEDDED_FONT_CSS = `
  .emoji {
    height: 1em;
    width: auto;
    vertical-align: -0.15em;
    display: inline-block;
  }
`;

/**
 * Renders an emoji as an inline Twemoji <img> when we have an embedded asset,
 * so it looks identical on every device; falls back to the raw glyph otherwise.
 */
function emojiImg(glyph: string, uriMap: Record<string, string>): string {
  const uri = uriMap[glyph];
  return uri ? `<img class="emoji" src="${uri}" alt="" />` : glyph;
}

export interface ExportCertificateParams {
  user: AppUser;
  attendedItems: Array<{ event: RotaractEvent; participant: EventParticipant; impact?: EventImpact }>;
  stats: { joined: number; organized: number; hours: number; service?: number; fellowships?: number; clubsCollab?: number };
  clubPresidentName?: string;
  clubPresidentRole?: string;
  clubPresidentSignatureUrl?: string;
  drrName?: string;
  drrRole?: string;
  drrSignatureUrl?: string;
}

export interface CertificateQRPayload {
  type: 'ROTARACT_D3800_CERT';
  cert_id: string;
  user_id: string;
  full_name: string;
  club_name: string;
  hours: number;
  projects_attended: number;
  projects_organized: number;
  issued_at: string;
  signature: string;
}

/**
 * Resolves volunteer distinction level from total hours.
 */
function getDistinctionBadge(hours: number): { title: string; color: string; icon: string } {
  if (hours >= 100) return { title: 'Diamond Rotary Fellow', color: '#1D4ED8', icon: '💎' };
  if (hours >= 50) return { title: 'Gold Humanitarian', color: '#D97706', icon: '🥇' };
  if (hours >= 25) return { title: 'Silver Champion', color: '#4B5563', icon: '🥈' };
  if (hours >= 10) return { title: 'Bronze Volunteer', color: '#B45309', icon: '🥉' };
  return { title: 'Active Volunteer', color: '#D91B5C', icon: '🌟' };
}

/**
 * Resolves the grammatical possessive pronoun based on user gender ('his', 'her', or gender-neutral 'their').
 */
function getPossessivePronoun(gender?: string | null): string {
  const g = gender?.toUpperCase()?.trim();
  if (g === 'MALE' || g === 'HE' || g === 'M') return 'his';
  if (g === 'FEMALE' || g === 'SHE' || g === 'F') return 'her';
  return 'their';
}

/**
 * Builds the official Page 1 Certificate HTML in exact A4 Landscape (842pt x 595pt).
 */
export async function generateCertificateLandscapeHTML({
  user,
  stats,
  clubPresidentName,
  clubPresidentRole,
  clubPresidentSignatureUrl,
  drrName,
  drrRole,
  drrSignatureUrl,
}: ExportCertificateParams): Promise<string> {
  const distinction = getDistinctionBadge(stats.hours);
  const { ROTARACT_HEADER_LOGO_BASE64, EMOJI_DATA_URI } = await getCertAssets();
  const formattedDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const certId = `D3800-${user.id.substring(0, 6).toUpperCase()}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const qrPayload: CertificateQRPayload = {
    type: 'ROTARACT_D3800_CERT',
    cert_id: certId,
    user_id: user.id,
    full_name: user.full_name,
    club_name: user.club_name || 'Rotaract Club',
    hours: stats.hours,
    projects_attended: stats.joined,
    projects_organized: stats.organized,
    issued_at: formattedDate,
    signature: `VERIFIED:${certId}:${user.id}:${stats.hours}HRS`,
  };

  const qrSvg = await QRCode.toString(JSON.stringify(qrPayload), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  const isRecipientClubPresident =
    user.club_role === 'CLUB_PRESIDENT' ||
    user.role === 'CLUB_PRESIDENT' ||
    user.position?.toLowerCase().includes('president');

  const showClubPresidentSignatory = !isRecipientClubPresident && Boolean(clubPresidentName);

  const presidentLabel = clubPresidentName || 'Club President';
  const presidentRoleLabel = clubPresidentRole || `President, ${user.club_name || 'Rotaract Club'}`;
  const drrLabel = drrName || 'District Rotaract Representative';
  const drrRoleLabel = drrRole || 'District Rotaract Representative, RID 3800';

  const presidentSigHtml = clubPresidentSignatureUrl
    ? `<div class="sign-img-wrapper"><img src="${clubPresidentSignatureUrl}" class="sign-img" alt="President Signature" /></div>`
    : '';
  const drrSigHtml = drrSignatureUrl
    ? `<div class="sign-img-wrapper"><img src="${drrSignatureUrl}" class="sign-img" alt="DRR Signature" /></div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=842, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>Rotaract District 3800 - Certificate of Volunteer Service</title>
        <style>
          ${EMBEDDED_FONT_CSS}
          @page {
            size: 842pt 595pt; /* A4 Landscape */
            margin: 0;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 842pt;
            height: 595pt;
            background-color: #FFFFFF;
            font-family: Georgia, 'Times New Roman', serif;
            -webkit-text-size-adjust: 100%;
            overflow: hidden;
          }

          .sheet-page {
            width: 842pt;
            height: 595pt;
            max-height: 595pt;
            box-sizing: border-box;
            padding: 12pt 16pt;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
            background-color: #FFFFFF;
            overflow: hidden;
          }

          .cert-frame {
            width: 100%;
            height: 100%;
            border: 4pt solid #D91B5C;
            border-radius: 8pt;
            padding: 4pt;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          }
          .cert-inner-frame {
            width: 100%;
            height: 100%;
            border: 1.5pt solid #D97706;
            border-radius: 5pt;
            padding: 8pt 20pt 6pt 20pt;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            text-align: center;
            background-color: #FFF7F9;
            background-image: radial-gradient(circle at center, #FFFFFF 55%, #FFF1F5 100%);
            box-sizing: border-box;
          }

          /* Header */
          .cert-header {
            text-align: center;
          }
          .logo-img {
            height: 80pt;
            max-width: 400pt;
            width: auto;
            object-fit: contain;
            margin-bottom: 4pt;
          }
          .district-title {
            font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif;
            font-size: 13pt;
            font-weight: 900;
            color: #475569;
            letter-spacing: 2.5pt;
            text-transform: uppercase;
            margin-bottom: 2pt;
            line-height: 1.15;
          }
          .cert-main-title {
            font-size: 28pt;
            font-weight: 900;
            color: #D91B5C;
            letter-spacing: 1.2pt;
            text-transform: uppercase;
            margin: 0 0 2pt 0;
            line-height: 1.1;
          }
          .cert-sub-title {
            font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif;
            font-size: 11pt;
            font-weight: 700;
            color: #0F172A;
            letter-spacing: 1pt;
            text-transform: uppercase;
            line-height: 1.2;
            margin-bottom: 2pt;
          }

          /* Recipient & Statement */
          .cert-center-body {
            text-align: center;
            margin: 8pt 0 2pt 0;
          }
          .present-to {
            font-size: 13pt;
            font-style: italic;
            color: #64748B;
            margin-bottom: 3pt;
          }
          .recipient-name {
            font-size: 30pt;
            font-weight: 700;
            color: #0F172A;
            letter-spacing: 0.5pt;
            border-bottom: 2.5pt solid #D91B5C;
            display: inline-block;
            padding: 0 35pt 2pt 35pt;
            margin-bottom: 2pt;
          }
          .recipient-meta {
            font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif;
            font-size: 12.5pt;
            font-weight: 800;
            color: #D91B5C;
            letter-spacing: 0.5pt;
            margin-bottom: 12pt;
          }
          .cert-statement {
            font-size: 14pt;
            line-height: 1.45;
            color: #334155;
            max-width: 720pt;
            margin: 0 auto;
            text-align: center;
          }

          /* Metric Row */
          .metric-row {
            display: flex;
            justify-content: center;
            gap: 15pt;
            margin: 5pt 0;
          }
          .metric-chip {
            background: #FFFFFF;
            border: 1pt solid #F1D4DF;
            border-radius: 6pt;
            padding: 4pt 15pt;
            min-width: 110pt;
            box-shadow: 0 1.5pt 3pt rgba(217, 27, 92, 0.05);
          }
          .metric-val {
            font-size: 13pt;
            font-weight: 900;
            color: #0F172A;
            font-family: -apple-system, Roboto, sans-serif;
          }
          .metric-lbl {
            font-size: 7.5pt;
            font-weight: 800;
            color: #64748B;
            text-transform: uppercase;
            letter-spacing: 0.4pt;
            font-family: -apple-system, Roboto, sans-serif;
            margin-top: 1pt;
          }

          /* Signatories */
          .signatories-container {
            margin: 4pt auto 0 auto;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .certified-by-label {
            font-size: 14pt;
            font-style: italic;
            color: #64748B;
            margin-bottom: 24pt;
            text-align: center;
          }
          .signatures-section {
            display: flex;
            align-items: flex-end;
            justify-content: center;
            gap: 50pt;
          }
          .sign-col {
            width: 220pt;
            text-align: center;
            position: relative;
          }
          .sign-img-wrapper {
            height: 38pt;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            margin-bottom: -3pt;
            pointer-events: none;
          }
          .sign-img {
            max-height: 38pt;
            max-width: 160pt;
            object-fit: contain;
          }
          .sign-line {
            border-top: none;
            padding-top: 0;
          }
          .sign-name {
            font-size: 14pt;
            font-weight: 900;
            color: #0F172A;
            letter-spacing: 0.2pt;
          }
          .sign-role {
            font-family: -apple-system, Roboto, sans-serif;
            font-size: 10pt;
            font-weight: 700;
            color: #64748B;
            margin-top: 1pt;
          }

          /* Footer Bottom Row */
          .cert-footer-bottom-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1pt solid #F1D4DF;
            padding-top: 5pt;
            width: 100%;
          }
          .bottom-left-qr-wrap {
            display: flex;
            align-items: center;
            gap: 8pt;
            text-align: left;
          }
          .qr-box {
            width: 36pt;
            height: 36pt;
            padding: 2pt;
            background: #FFFFFF;
            border: 1pt solid #E2E8F0;
            border-radius: 4pt;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .qr-box svg {
            width: 100%;
            height: 100%;
          }
          .qr-meta {
            display: flex;
            flex-direction: column;
            font-family: -apple-system, Roboto, sans-serif;
            gap: 0.5pt;
          }
          .qr-id {
            font-family: monospace;
            font-size: 8pt;
            font-weight: 800;
            color: #0F172A;
          }
          .qr-badge {
            font-size: 7pt;
            font-weight: 700;
            color: #D91B5C;
            letter-spacing: 0.2pt;
          }
          .qr-hint {
            font-size: 6.5pt;
            color: #64748B;
          }

          .footer-district-meta {
            font-family: -apple-system, Roboto, sans-serif;
            font-size: 7pt;
            font-weight: 800;
            color: #94A3B8;
            letter-spacing: 0.6pt;
            text-align: right;
            line-height: 1.3;
          }
        </style>
      </head>
      <body>

        <!-- PAGE 1: A4 LANDSCAPE CERTIFICATE -->
        <div class="sheet-page">
          <div class="cert-frame">
            <div class="cert-inner-frame">

              <!-- Header -->
              <div class="cert-header">
                <img src="${ROTARACT_HEADER_LOGO_BASE64}" class="logo-img" alt="Rotaract Official Logo" />
                <div class="district-title">Rotary International District 3800 • Philippines</div>
                <div class="cert-main-title">Certificate of Volunteer Service</div>
                <div class="cert-sub-title">Leadership & Community Impact Distinction • Rotary Year 2025–2026</div>
              </div>

              <!-- Center Recipient -->
              <div class="cert-center-body">
                <div class="present-to">This certificate is issued to</div>
                <div class="recipient-name">${user.full_name}</div>
                <div class="recipient-meta">${user.position} • ${user.club_name || 'Rotaract Club'}</div>
                <div class="cert-statement">
                  in verification of ${getPossessivePronoun(user.gender)} participation and completion of <strong>${stats.hours} verified ${stats.hours === 1 ? 'hour' : 'hours'}</strong> of volunteer service<br/>
                  rendered in good standing with <strong>Rotary International District 3800</strong>. This document is<br/>
                  issued as <strong>official verification</strong> of the volunteer service rendered through the organization<br/>
                  and serves as a record of the individual's participation and service.
                </div>
              </div>

              <!-- Summary Metric Chips -->
              <div class="metric-row">
                <div class="metric-chip">
                  <div class="metric-val" style="color: ${distinction.color};">${emojiImg(distinction.icon, EMOJI_DATA_URI)} ${distinction.title}</div>
                  <div class="metric-lbl">Distinction Tier</div>
                </div>
                <div class="metric-chip">
                  <div class="metric-val" style="color: #D91B5C;">${stats.hours} Hours</div>
                  <div class="metric-lbl">Total Verified Hours</div>
                </div>
                <div class="metric-chip">
                  <div class="metric-val">${stats.joined} Projects</div>
                  <div class="metric-lbl">Projects Attended</div>
                </div>
                <div class="metric-chip">
                  <div class="metric-val">${stats.organized} Projects</div>
                  <div class="metric-lbl">Projects Led</div>
                </div>
              </div>

              <!-- Signatories Container with Centered Certified By Header -->
              <div class="signatories-container">
                <div class="certified-by-label">Certified by:</div>
                <div class="signatures-section">
                  ${
                    showClubPresidentSignatory
                      ? `
                  <!-- Col 1: Club President -->
                  <div class="sign-col">
                    ${presidentSigHtml}
                    <div class="sign-line">
                      <div class="sign-name">${presidentLabel}</div>
                      <div class="sign-role">${presidentRoleLabel}</div>
                    </div>
                  </div>
                  `
                      : ''
                  }

                  <!-- District Rotaract Representative -->
                  <div class="sign-col">
                    ${drrSigHtml}
                    <div class="sign-line">
                      <div class="sign-name">${drrLabel}</div>
                      <div class="sign-role">${drrRoleLabel}</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Dedicated Bottom Row: QR Code at Lower-Left -->
              <div class="cert-footer-bottom-row">
                <div class="bottom-left-qr-wrap">
                  <div class="qr-box">
                    ${qrSvg}
                  </div>
                  <div class="qr-meta">
                    <div class="qr-id">ID: ${certId}</div>
                    <div class="qr-badge">Official Verification QR • Rotaract Connect</div>
                    <div class="qr-hint">Issued: ${formattedDate} • Verified Electronic Credential</div>
                  </div>
                </div>

                <div class="footer-district-meta">
                  ROTARY INTERNATIONAL DISTRICT 3800 • PHILIPPINES<br/>
                  COMMUNITY & YOUTH SERVICE ARCHIVE
                </div>
              </div>

            </div>
          </div>
        </div>

      </body>
    </html>
  `;
}

/**
 * Builds the official Page 2 Activity Transcript HTML in exact A4 Portrait (595pt x 842pt).
 */
export async function generateTranscriptPortraitHTML({
  user,
  attendedItems,
  stats,
}: ExportCertificateParams): Promise<string> {
  const distinction = getDistinctionBadge(stats.hours);
  const { ROTARACT_HEADER_LOGO_BASE64, EMOJI_DATA_URI } = await getCertAssets();
  const certId = `D3800-${user.id.substring(0, 6).toUpperCase()}-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const rowsHtml = attendedItems.length > 0
    ? attendedItems
        .map((item, index) => {
          const hours = calculateParticipantHours(item.participant, item.event);
          const isLead = item.event.organizer_user_id === user.id;
          const isCo = item.event.co_organizer_user_ids?.includes(user.id);
          const roleStr = isLead ? 'Lead Organizer' : isCo ? 'Co-Organizer' : 'Volunteer Attendee';
          const eventDate = new Date(item.event.start_datetime).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
          const typeLabel = (item.event.event_type || 'SERVICE_PROJECT').replace(/_/g, ' ');

          return `
            <tr style="background-color: ${index % 2 === 0 ? '#FFFFFF' : '#FDF2F5'};">
              <td style="padding: 7px 10px; border-bottom: 1px solid #F1D4DF; font-size: 10px; color: #475569; white-space: nowrap;">${eventDate}</td>
              <td style="padding: 7px 10px; border-bottom: 1px solid #F1D4DF; font-size: 10.5px; font-weight: 700; color: #1E293B;">
                ${item.event.title}
                <div style="font-size: 8.5px; font-weight: normal; color: #64748B;">${typeLabel} • ${item.event.city || 'District 3800'}</div>
              </td>
              <td style="padding: 7px 10px; border-bottom: 1px solid #F1D4DF; font-size: 10px; color: #334155;">${item.event.organizing_club_name || user.club_name || 'Rotaract Club'}</td>
              <td style="padding: 7px 10px; border-bottom: 1px solid #F1D4DF; font-size: 10px; font-weight: 700; color: #D91B5C;">${roleStr}</td>
              <td style="padding: 7px 10px; border-bottom: 1px solid #F1D4DF; font-size: 10.5px; font-weight: 900; text-align: right; color: #0F172A;">${hours} hrs</td>
            </tr>
          `;
        })
        .join('')
    : `
      <tr>
        <td colspan="5" style="text-align: center; padding: 24px; color: #64748B; font-size: 11.5px; font-style: italic;">
          No attended or organized service events recorded for this period.
        </td>
      </tr>
    `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=595, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>Rotaract District 3800 - Activity Transcript</title>
        <style>
          ${EMBEDDED_FONT_CSS}
          @page {
            size: 595pt 842pt;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 595pt;
            height: 842pt;
            background-color: #FFFFFF;
            font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif;
            -webkit-text-size-adjust: 100%;
            overflow: hidden;
          }
          /* Container in pt to match the pt-sized PDF page */
          .sheet-portrait {
            width: 595pt;
            height: 842pt;
            max-height: 842pt;
            box-sizing: border-box;
            padding: 20pt 24pt;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
            background-color: #FFFFFF;
            overflow: hidden;
          }
          .p-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2.5pt solid #D91B5C;
            padding-bottom: 10pt;
            margin-bottom: 14pt;
          }
          .p-header-left {
            display: flex;
            align-items: center;
            gap: 12pt;
          }
          .p-title {
            font-size: 16pt;
            font-weight: 900;
            color: #D91B5C;
            text-transform: uppercase;
            letter-spacing: 0.8pt;
            font-family: Georgia, 'Times New Roman', serif;
          }
          .p-subtitle {
            font-size: 9.5pt;
            color: #64748B;
            font-weight: 700;
            margin-top: 2pt;
          }
          .p-cert-badge-box {
            text-align: right;
          }
          .p-cert-id {
            font-family: monospace;
            font-size: 9.5pt;
            font-weight: 900;
            color: #0F172A;
          }
          .p-badge-verified {
            display: inline-block;
            margin-top: 3pt;
            padding: 3pt 8pt;
            background: #FFF1F4;
            border: 1pt solid #F1D4DF;
            border-radius: 3pt;
            font-size: 7.5pt;
            font-weight: 800;
            color: #D91B5C;
            text-transform: uppercase;
            letter-spacing: 0.4pt;
          }
          .p-member-hud {
            background: #FFF5F7;
            border: 1pt solid #F1D4DF;
            border-radius: 8pt;
            padding: 10pt 16pt;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 9pt;
            font-size: 10pt;
            color: #334155;
            margin-bottom: 15pt;
          }
          .p-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9pt;
            margin-bottom: 14pt;
          }
          .p-table th {
            background: #D91B5C;
            color: #FFFFFF;
            padding: 7.5pt 9pt;
            text-align: left;
            font-weight: 800;
            font-size: 8.5pt;
            text-transform: uppercase;
            letter-spacing: 0.4pt;
          }
          .p-table td {
            padding: 7pt 9pt;
            border-bottom: 1pt solid #F1D4DF;
            color: #334155;
          }
          .p-table-total-row {
            background: #FFF5F7;
            border-top: 2pt solid #D91B5C;
            font-weight: 900;
            color: #0F172A;
            font-size: 10pt;
          }
          .p-footer {
            border-top: 1pt solid #E2E8F0;
            padding-top: 10pt;
            font-size: 8pt;
            color: #64748B;
            line-height: 1.4;
          }
          .p-four-way-test {
            font-style: italic;
            font-family: 'CertSerif', Georgia, serif;
            margin-top: 4px;
            color: #475569;
          }
        </style>
      </head>
      <body>

        <!-- PAGE 2: A4 PORTRAIT ITEMIZED TRANSCRIPT -->
        <div class="sheet-portrait">
          <div>
            <div class="p-header">
              <div class="p-header-left">
                <img src="${ROTARACT_HEADER_LOGO_BASE64}" style="height: 48px;" alt="Rotaract Logo" />
                <div>
                  <div class="p-title">Official Volunteer Service & Attendance Transcript</div>
                  <div class="p-subtitle">Rotary International District 3800 • Verified Activity Ledger</div>
                </div>
              </div>
              <div class="p-cert-badge-box">
                <div class="p-cert-id">ID: ${certId}</div>
                <div class="p-badge-verified">Verified Credential</div>
              </div>
            </div>

            <div class="p-member-hud">
              <div><strong>Member:</strong> ${user.full_name}</div>
              <div><strong>Rotary Year:</strong> 2025–2026</div>
              <div><strong>Club:</strong> ${user.club_name || 'Rotaract Club'}</div>
              <div><strong>Position:</strong> ${user.position}</div>
              <div><strong>Distinction:</strong> ${emojiImg(distinction.icon, EMOJI_DATA_URI)} ${distinction.title}</div>
              <div><strong>Total Service:</strong> <span style="color: #D91B5C; font-weight: 900;">${stats.hours} Verified Hours</span></div>
            </div>

            <table class="p-table">
              <thead>
                <tr>
                  <th style="width: 15%;">Date</th>
                  <th style="width: 38%;">Service Project / Activity Title</th>
                  <th style="width: 23%;">Host Club / District</th>
                  <th style="width: 12%;">Role</th>
                  <th style="width: 12%; text-align: right;">Hours</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr class="p-table-total-row">
                  <td colspan="4" style="text-align: right; padding: 10px;">TOTAL VERIFIED VOLUNTEER SERVICE HOURS RECORDED:</td>
                  <td style="text-align: right; padding: 10px; color: #D91B5C; font-size: 12px; font-weight: 900;">${stats.hours} hrs</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="p-footer">
            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
              <div>
                <div><strong>Rotary International District 3800</strong> • Rotaract Connect Electronic Verification</div>
                <div class="p-four-way-test">"The Four-Way Test: Is it the TRUTH? Is it FAIR to all concerned? Will it build GOODWILL and BETTER FRIENDSHIPS? Will it be BENEFICIAL to all concerned?"</div>
              </div>
              <div style="text-align: right; font-size: 8.5px; color: #94A3B8;">
                Issued: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}<br/>
                Official District Record
              </div>
            </div>
          </div>
        </div>

      </body>
    </html>
  `;
}

/**
 * Returns the legacy combined HTML if requested.
 */
export async function generateCertificateHTML(params: ExportCertificateParams): Promise<string> {
  return generateCertificateLandscapeHTML(params);
}

/**
 * Generates and shares or prints the official Rotaract Volunteer Certificate PDF
 * with mixed orientations: Sheet 1 (Landscape Certificate) + Sheet 2 (Portrait Transcript).
 */
export async function exportVolunteerCertificatePDF(params: ExportCertificateParams): Promise<void> {
  try {
    const certHtml = await generateCertificateLandscapeHTML(params);
    const transcriptHtml = await generateTranscriptPortraitHTML(params);

    // Pass exact A4 Landscape (842pt x 595pt) and A4 Portrait (595pt x 842pt)
    // with 0 margins so Android PrintDocumentAdapter does not default to Letter (612x792)
    // or inject arbitrary device spooler margins.
    const certResult = await Print.printToFileAsync({
      html: certHtml,
      width: 842,
      height: 595,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      base64: true,
    });

    const transcriptResult = await Print.printToFileAsync({
      html: transcriptHtml,
      width: 595,
      height: 842,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      base64: true,
    });

    // 3. Merge both into a single 2-page PDF with mixed orientations using pdf-lib
    const mergedDoc = await PDFDocument.create();
    const doc1 = await PDFDocument.load(certResult.base64!);
    const doc2 = await PDFDocument.load(transcriptResult.base64!);

    const [page1] = await mergedDoc.copyPages(doc1, [0]);
    const [page2] = await mergedDoc.copyPages(doc2, [0]);

    mergedDoc.addPage(page1); // Landscape Page (842 x 595)
    mergedDoc.addPage(page2); // Portrait Page (595 x 842)

    const mergedBytes = await mergedDoc.save();
    const cleanName = (params.user.full_name || 'Member').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Rotaract_Certificate_Transcript_${cleanName}.pdf`;
    const outputFile = new File(Paths.cache, fileName);
    outputFile.write(mergedBytes);
    const finalUri = outputFile.uri;

    const shareIt = async () => {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(finalUri, {
          UTI: '.pdf',
          mimeType: 'application/pdf',
          dialogTitle: `Rotaract Volunteer Certificate & Transcript - ${params.user.full_name}`,
        });
      } else {
        await Print.printAsync({ uri: finalUri });
      }
    };

    // On Android, present a chooser: Share OR Save to Downloads.
    // "Save to Downloads" uses MediaStore (Android 10+) for a silent write to
    // the public Downloads folder — no picker, no permission prompt. Falls
    // back to SAF (folder picker, remembered after first grant) on older
    // devices or if MediaStore fails.
    if (Platform.OS === 'android') {
      const saveToDownloads = async () => {
        // Strip the file:// prefix — MediaCollection expects a plain path.
        const srcPath = finalUri.replace(/^file:\/\//, '');

        try {
          await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
            { name: fileName, parentFolder: '', mimeType: 'application/pdf' },
            'Download',
            srcPath,
          );
          Alert.alert('Certificate Saved', `Saved to Downloads as ${fileName}.`);
          return;
        } catch (mediaErr) {
          console.warn('[MediaStore save failed, falling back to SAF]', mediaErr);
        }

        // SAF fallback — first save asks for a folder; remembered after that.
        try {
          const mergedBase64 = await mergedDoc.saveAsBase64();
          let dirUri = await AsyncStorage.getItem(SAF_DIR_KEY);

          const writeInto = async (directoryUri: string) => {
            const safUri = await StorageAccessFramework.createFileAsync(
              directoryUri,
              fileName,
              'application/pdf',
            );
            await StorageAccessFramework.writeAsStringAsync(safUri, mergedBase64, {
              encoding: 'base64',
            });
          };

          if (dirUri) {
            try {
              await writeInto(dirUri);
              Alert.alert('Certificate Saved', `Saved as ${fileName}.`);
              return;
            } catch {
              await AsyncStorage.removeItem(SAF_DIR_KEY);
              dirUri = null;
            }
          }

          const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!permission.granted) return;
          await AsyncStorage.setItem(SAF_DIR_KEY, permission.directoryUri);
          await writeInto(permission.directoryUri);
          Alert.alert('Certificate Saved', `Saved as ${fileName} to the folder you chose.`);
        } catch (err: any) {
          console.warn('[Save to Downloads failed]', err);
          Alert.alert('Save Failed', err?.message || 'Could not save the certificate.');
        }
      };

      Alert.alert(
        'Certificate Ready',
        'Choose how to export your certificate.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Share', onPress: () => { shareIt().catch(() => {}); } },
          { text: 'Save to Downloads', onPress: () => { saveToDownloads().catch(() => {}); } },
        ],
        { cancelable: true },
      );
      return;
    }

    // iOS (and anything else): share sheet — includes "Save to Files".
    await shareIt();
  } catch (err: any) {
    console.error('[exportVolunteerCertificatePDF Error]:', err);
    if (err?.message !== 'User did not share' && !err?.message?.includes('cancelled')) {
      Alert.alert('Export Error', err?.message || 'Unable to generate PDF Certificate. Please try again.');
    }
  }
}
