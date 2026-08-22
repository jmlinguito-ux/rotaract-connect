import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Alert } from 'react-native';
import QRCode from 'qrcode';
import { PDFDocument } from 'pdf-lib';
import { AppUser, RotaractEvent, EventParticipant, EventImpact } from '../types';
import { calculateParticipantHours } from './hoursCalculation';
import { ROTARACT_HEADER_LOGO_BASE64 } from './logoBase64';

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
        <title>Rotaract District 3800 - Certificate of Volunteer Service</title>
        <style>
          @page {
            size: 842pt 595pt;
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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
          }

          /* Exact A4 Landscape Page Container */
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
            page-break-inside: avoid;
            break-inside: avoid;
            page-break-after: avoid;
            break-after: auto;
          }

          /* Ornate Double Border Frame */
          .cert-frame {
            width: 100%;
            height: 100%;
            border: 4px solid #D91B5C;
            border-radius: 10px;
            padding: 4px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          }
          .cert-inner-frame {
            width: 100%;
            height: 100%;
            border: 1.5px solid #D97706;
            border-radius: 6px;
            padding: 10px 24px 8px 24px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            text-align: center;
            background: radial-gradient(circle at center, #FFFFFF 55%, #FFF7F9 100%);
            box-sizing: border-box;
          }

          /* Header */
          .cert-header {
            text-align: center;
          }
          .logo-img {
            height: 84px;
            max-width: 520px;
            width: auto;
            object-fit: contain;
            margin-bottom: 14px;
          }
          .district-title {
            font-size: 13.5px;
            font-weight: 900;
            color: #475569;
            letter-spacing: 4px;
            text-transform: uppercase;
            margin-bottom: 2px;
          }
          .cert-main-title {
            font-size: 30px;
            font-weight: 900;
            color: #D91B5C;
            letter-spacing: 2px;
            text-transform: uppercase;
            font-family: Georgia, 'Times New Roman', serif;
            margin: 1px 0;
          }
          .cert-sub-title {
            font-size: 12px;
            font-weight: 700;
            color: #0F172A;
            letter-spacing: 1.5px;
            text-transform: uppercase;
          }

          /* Recipient & Statement */
          .cert-center-body {
            text-align: center;
            margin: 2px 0;
          }
          .present-to {
            font-size: 16.5px;
            font-style: italic;
            color: #64748B;
            font-family: Georgia, serif;
            margin-bottom: 16px;
          }
          .recipient-name {
            font-size: 40px;
            font-weight: 900;
            color: #0F172A;
            font-family: Georgia, 'Times New Roman', serif;
            letter-spacing: 0.5px;
            border-bottom: 3px solid #D91B5C;
            display: inline-block;
            padding: 0 40px 4px 40px;
            margin-bottom: 4px;
          }
          .recipient-meta {
            font-size: 16px;
            font-weight: 800;
            color: #D91B5C;
            letter-spacing: 0.5px;
            margin-bottom: 18px;
          }
          .cert-statement {
            font-size: 16px;
            line-height: 1.65;
            color: #334155;
            max-width: 940px;
            margin: 0 auto;
            text-align: center;
          }

          /* Metric Row */
          .metric-row {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin: 2px 0 4px 0;
          }
          .metric-chip {
            background: #FFFFFF;
            border: 1.5px solid #F1D4DF;
            border-radius: 8px;
            padding: 5px 18px;
            text-align: center;
            min-width: 148px;
            box-shadow: 0 2px 4px rgba(217, 27, 92, 0.05);
          }
          .metric-val {
            font-size: 16px;
            font-weight: 900;
            color: #0F172A;
          }
          .metric-lbl {
            font-size: 9.5px;
            font-weight: 800;
            color: #64748B;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 1px;
          }

          /* Signatory Container with Centered Certified By Header */
          .signatories-container {
            margin: 10px auto 0 auto;
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          .certified-by-label {
            font-size: 16.5px;
            font-style: italic;
            color: #64748B;
            font-family: Georgia, serif;
            margin-bottom: 54px;
            text-align: center;
          }
          .signatures-section {
            display: flex;
            align-items: flex-end;
            justify-content: center;
            gap: 76px;
            transform: translateY(10px);
          }
          .sign-col {
            width: 250px;
            text-align: center;
            position: relative;
          }
          .sign-img-wrapper {
            height: 46px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            margin-bottom: -4px;
            pointer-events: none;
          }
          .sign-img {
            max-height: 46px;
            max-width: 200px;
            object-fit: contain;
          }
          .sign-line {
            border-top: 2px solid #0F172A;
            padding-top: 5px;
          }
          .sign-name {
            font-size: 15px;
            font-weight: 900;
            color: #0F172A;
            letter-spacing: 0.3px;
          }
          .sign-role {
            font-size: 11px;
            font-weight: 700;
            color: #64748B;
            margin-top: 1px;
          }

          /* Dedicated Bottom Bar */
          .cert-footer-bottom-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1.5px solid #F1D4DF;
            padding-top: 8px;
            width: 100%;
          }

          /* Bottom-Left QR Authenticity Badge */
          .bottom-left-qr-wrap {
            display: flex;
            align-items: center;
            gap: 12px;
            text-align: left;
          }
          .qr-box {
            width: 68px;
            height: 68px;
            border: 1.5px solid #CBD5E1;
            border-radius: 6px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #FFFFFF;
            padding: 2px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.06);
          }
          .qr-box svg {
            width: 100% !important;
            height: 100% !important;
            display: block;
            shape-rendering: crispEdges;
          }
          .qr-meta {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .qr-id {
            font-family: monospace;
            font-size: 10px;
            font-weight: 900;
            color: #0F172A;
            letter-spacing: 0.5px;
          }
          .qr-badge {
            font-size: 8.5px;
            font-weight: 800;
            color: #D91B5C;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .qr-hint {
            font-size: 8px;
            color: #64748B;
          }
          .footer-district-meta {
            font-size: 9.5px;
            font-weight: 700;
            color: #94A3B8;
            text-align: right;
            letter-spacing: 0.5px;
            line-height: 1.4;
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
                <div class="present-to">This certificate of distinction is proudly presented to</div>
                <div class="recipient-name">${user.full_name}</div>
                <div class="recipient-meta">${user.position} • ${user.club_name || 'Rotaract Club'}</div>
                <div class="cert-statement">
                  In grateful recognition of steadfast dedication, active humanitarian leadership, and rendering<br/>
                  <strong>${stats.hours} verified hours</strong> of volunteer service in good standing with <strong>Rotary International District 3800</strong>,<br/>
                  exemplifying the Rotary ideal of <em>Service Above Self</em>.
                </div>
              </div>

              <!-- Summary Metric Chips -->
              <div class="metric-row">
                <div class="metric-chip">
                  <div class="metric-val" style="color: ${distinction.color};">${distinction.icon} ${distinction.title}</div>
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
                  <!-- Col 1: Club President -->
                  <div class="sign-col">
                    ${presidentSigHtml}
                    <div class="sign-line">
                      <div class="sign-name">${presidentLabel}</div>
                      <div class="sign-role">${presidentRoleLabel}</div>
                    </div>
                  </div>

                  <!-- Col 2: District Rotaract Representative -->
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
        <title>Rotaract District 3800 - Activity Transcript</title>
        <style>
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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
          }
          .sheet-portrait {
            width: 595pt;
            height: 842pt;
            max-height: 842pt;
            box-sizing: border-box;
            padding: 24pt 28pt;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
            background-color: #FFFFFF;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .p-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 3px solid #D91B5C;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .p-header-left {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .p-title {
            font-size: 18px;
            font-weight: 900;
            color: #D91B5C;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-family: Georgia, serif;
          }
          .p-subtitle {
            font-size: 11px;
            color: #64748B;
            font-weight: 700;
            margin-top: 2px;
          }
          .p-cert-badge-box {
            text-align: right;
          }
          .p-cert-id {
            font-family: monospace;
            font-size: 11px;
            font-weight: 900;
            color: #0F172A;
          }
          .p-badge-verified {
            display: inline-block;
            margin-top: 4px;
            padding: 3px 8px;
            background: #FFF1F4;
            border: 1px solid #F1D4DF;
            border-radius: 4px;
            font-size: 9px;
            font-weight: 800;
            color: #D91B5C;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .p-member-hud {
            background: #FFF5F7;
            border: 1.5px solid #F1D4DF;
            border-radius: 10px;
            padding: 12px 18px;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            font-size: 11.5px;
            color: #334155;
            margin-bottom: 18px;
          }
          .p-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10.5px;
            margin-bottom: 16px;
          }
          .p-table th {
            background: #D91B5C;
            color: #FFFFFF;
            padding: 8px 10px;
            text-align: left;
            font-weight: 800;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .p-table td {
            padding: 7px 10px;
            border-bottom: 1px solid #F1D4DF;
            color: #334155;
          }
          .p-table-total-row {
            background: #FFF5F7;
            border-top: 2.5px solid #D91B5C;
            font-weight: 900;
            color: #0F172A;
          }
          .p-footer {
            border-top: 1.5px solid #E2E8F0;
            padding-top: 12px;
            font-size: 9.5px;
            color: #64748B;
            line-height: 1.5;
          }
          .p-four-way-test {
            font-style: italic;
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
              <div><strong>Distinction:</strong> ${distinction.icon} ${distinction.title}</div>
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

    // 1. Generate Landscape Certificate Page (842pt x 595pt)
    const certResult = await Print.printToFileAsync({
      html: certHtml,
      width: 842,
      height: 595,
      base64: true,
    });

    // 2. Generate Portrait Transcript Page (595pt x 842pt)
    const transcriptResult = await Print.printToFileAsync({
      html: transcriptHtml,
      width: 595,
      height: 842,
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
    const outputFile = new File(Paths.cache, `Rotaract_Certificate_Transcript_${cleanName}.pdf`);
    outputFile.write(mergedBytes);
    const finalUri = outputFile.uri;

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
  } catch (err: any) {
    console.error('[exportVolunteerCertificatePDF Error]:', err);
    if (err?.message !== 'User did not share' && !err?.message?.includes('cancelled')) {
      Alert.alert('Export Error', err?.message || 'Unable to generate PDF Certificate. Please try again.');
    }
  }
}
