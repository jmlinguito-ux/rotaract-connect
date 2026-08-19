import { Share, Alert } from 'react-native';
import { RotaractEvent, EventParticipant, AppUser, Club, EventImpact } from '../types';
import { calculateParticipantHours } from './hoursCalculation';

function escapeCsv(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generates and shares an Event Attendance CSV report via the native OS share sheet.
 */
export async function exportEventAttendanceCSV(
  event: RotaractEvent,
  participants: EventParticipant[],
  users: AppUser[],
  clubs: Club[],
): Promise<void> {
  try {
    const headers = [
      'Event Title',
      'Member Name',
      'Email',
      'Club',
      'Position',
      'Role',
      'Attendance Status',
      'Checked In At',
      'Check In Latitude',
      'Check In Longitude',
      'Check In Distance (m)',
      'Check In Method',
      'Checked Out At',
      'Check Out Method',
      'Volunteer Hours Credited',
    ];

    const rows: string[] = [headers.join(',')];

    for (const p of participants) {
      const u = users.find(user => user.id === p.user_id);
      const c = clubs.find(club => club.id === u?.club_id);
      const hours = calculateParticipantHours(p, event);

      const row = [
        escapeCsv(event.title),
        escapeCsv(u?.full_name ?? 'Unknown'),
        escapeCsv(u?.email ?? ''),
        escapeCsv(c?.club_name ?? u?.club_name ?? ''),
        escapeCsv(u?.position ?? ''),
        escapeCsv(u?.role ?? 'MEMBER'),
        escapeCsv(p.attendance_status),
        escapeCsv(p.checked_in_at ?? 'N/A'),
        escapeCsv(p.check_in_latitude ?? 'N/A'),
        escapeCsv(p.check_in_longitude ?? 'N/A'),
        escapeCsv(p.check_in_distance_m !== undefined ? Math.round(p.check_in_distance_m) : 'N/A'),
        escapeCsv(p.check_in_method ?? 'N/A'),
        escapeCsv(p.checked_out_at ?? 'N/A'),
        escapeCsv(p.check_out_method ?? 'N/A'),
        escapeCsv(hours),
      ];

      rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');

    await Share.share({
      title: `Attendance - ${event.title}`,
      message: csvContent,
    });
  } catch (err: any) {
    if (err?.message !== 'User did not share') {
      Alert.alert('Export Error', 'Unable to export CSV report.');
    }
  }
}

/**
 * Generates and shares a District Impact & Performance CSV report via the native OS share sheet.
 */
export async function exportDistrictImpactCSV(
  events: RotaractEvent[],
  impacts: EventImpact[],
  clubs: Club[],
): Promise<void> {
  try {
    const headers = [
      'Event ID',
      'Event Title',
      'Event Type',
      'Status',
      'Organizing Club',
      'Start Date & Time',
      'End Date & Time',
      'Venue Address',
      'Volunteer Hours',
      'Beneficiaries Served',
      'Funds Raised (PHP)',
      'Trees Planted',
      'Items Distributed',
      'Project Impact Summary',
    ];

    const rows: string[] = [headers.join(',')];

    for (const ev of events) {
      const imp = impacts.find(i => i.event_id === ev.id);
      const club = clubs.find(c => c.id === ev.organizing_club_id);

      const row = [
        escapeCsv(ev.id),
        escapeCsv(ev.title),
        escapeCsv(ev.event_type),
        escapeCsv(ev.status),
        escapeCsv(club?.club_name ?? ev.organizing_club_name),
        escapeCsv(ev.start_datetime),
        escapeCsv(ev.end_datetime),
        escapeCsv(ev.address),
        escapeCsv(imp?.volunteer_hours ?? 0),
        escapeCsv(imp?.beneficiaries ?? 0),
        escapeCsv(imp?.funds_raised ?? 0),
        escapeCsv(imp?.trees_planted ?? 0),
        escapeCsv(imp?.items_distributed ?? 0),
        escapeCsv(imp?.impact_summary ?? ''),
      ];

      rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');

    await Share.share({
      title: 'District 3800 Impact Report',
      message: csvContent,
    });
  } catch (err: any) {
    if (err?.message !== 'User did not share') {
      Alert.alert('Export Error', 'Unable to export District CSV report.');
    }
  }
}

/**
 * Generates and shares a Member Volunteer Service Transcript via the native OS share sheet.
 */
export async function exportServiceTranscript(
  user: AppUser,
  attendedItems: Array<{ event: RotaractEvent; participant: EventParticipant; impact?: EventImpact }>,
  stats: { joined: number; organized: number; hours: number },
): Promise<void> {
  try {
    const headers = [
      'Record Type',
      'Event Date',
      'Event Title',
      'Event Type',
      'Organizing Club',
      'Member Role',
      'Attendance Status',
      'Volunteer Hours Credited',
    ];

    const rows: string[] = [
      `"ROTARY INTERNATIONAL DISTRICT 3800 - OFFICIAL SERVICE TRANSCRIPT"`,
      `"Member Name",${escapeCsv(user.full_name)}`,
      `"Email",${escapeCsv(user.email)}`,
      `"Club Affiliation",${escapeCsv(user.club_name)}`,
      `"Position / Role",${escapeCsv(user.position)}`,
      `"Total Verified Volunteer Hours",${escapeCsv(stats.hours)}`,
      `"Total Projects Attended",${escapeCsv(stats.joined)}`,
      `"Total Projects Organized",${escapeCsv(stats.organized)}`,
      `"Generated At",${escapeCsv(new Date().toLocaleString())}`,
      `""`,
      headers.join(','),
    ];

    for (const item of attendedItems) {
      const hours = calculateParticipantHours(item.participant, item.event);
      const isLead = item.event.organizer_user_id === user.id;
      const isCo = item.event.co_organizer_user_ids?.includes(user.id);
      const roleStr = isLead ? 'Lead Organizer' : isCo ? 'Co-Organizer' : 'Volunteer Attendee';

      const row = [
        escapeCsv('COMMUNITY_SERVICE'),
        escapeCsv(new Date(item.event.start_datetime).toLocaleDateString()),
        escapeCsv(item.event.title),
        escapeCsv(item.event.event_type),
        escapeCsv(item.event.organizing_club_name),
        escapeCsv(roleStr),
        escapeCsv(item.participant.attendance_status === 'ATTENDED' || item.participant.checked_in_at ? 'VERIFIED_ATTENDED' : 'JOINED'),
        escapeCsv(hours),
      ];
      rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');

    await Share.share({
      title: `Service Transcript - ${user.full_name}`,
      message: csvContent,
    });
  } catch (err: any) {
    if (err?.message !== 'User did not share') {
      Alert.alert('Export Error', 'Unable to export volunteer service transcript.');
    }
  }
}

/**
 * Exports a full personal data archive JSON package for the member via native OS share sheet.
 */
export async function exportUserDataArchive(
  user: AppUser,
  participants: EventParticipant[],
  events: RotaractEvent[],
  impacts: EventImpact[],
): Promise<void> {
  try {
    const myParticipations = participants.filter(p => p.user_id === user.id);
    const myEvents = events.filter(e => e.organizer_user_id === user.id || e.co_organizer_user_ids?.includes(user.id));
    const myAttendedEvents = myParticipations.map(p => {
      const ev = events.find(e => e.id === p.event_id);
      return {
        event_id: p.event_id,
        event_title: ev?.title ?? 'Unknown Event',
        event_type: ev?.event_type,
        start_datetime: ev?.start_datetime,
        end_datetime: ev?.end_datetime,
        status: p.status,
        attendance_status: p.attendance_status,
        checked_in_at: p.checked_in_at,
        checked_out_at: p.checked_out_at,
        check_in_method: p.check_in_method,
        volunteer_hours_recorded: ev ? calculateParticipantHours(p, ev) : 0,
      };
    });

    const archive = {
      export_version: '1.0',
      exported_at: new Date().toISOString(),
      user_profile: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        username: user.username,
        club_id: user.club_id,
        club_name: user.club_name,
        position: user.position,
        role: user.role,
        verification_status: user.verification_status,
        contact_number: user.contact_number,
        contact_privacy: user.contact_privacy,
      },
      participations: myAttendedEvents,
      organized_events: myEvents.map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        event_type: e.event_type,
        status: e.status,
        start_datetime: e.start_datetime,
        end_datetime: e.end_datetime,
        address: e.address,
        city: e.city,
      })),
    };

    const jsonString = JSON.stringify(archive, null, 2);
    await Share.share({
      title: `Rotaract Data Archive - ${user.full_name}`,
      message: jsonString,
    });
  } catch (err: any) {
    if (err?.message !== 'User did not share') {
      Alert.alert('Export Error', 'Unable to export personal data archive.');
    }
  }
}
