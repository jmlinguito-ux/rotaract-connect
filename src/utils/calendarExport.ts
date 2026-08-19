import { Share, Alert } from 'react-native';
import { RotaractEvent } from '../types';

function formatIsoToIcs(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcsText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generates an RFC-5545 compliant iCalendar (.ics) string with a 1-hour pre-event alarm
 * and shares it via the native OS share sheet for import into Apple/Google Calendar.
 */
export async function exportEventToCalendar(event: RotaractEvent): Promise<void> {
  try {
    const dtStart = formatIsoToIcs(event.start_datetime);
    const dtEnd = formatIsoToIcs(event.end_datetime);
    const dtStamp = formatIsoToIcs(new Date().toISOString());

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Rotaract Connect//District 3800//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${event.id}@rotaractconnect.org`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(event.description ? `${event.description}\n\nOrganized by: ${event.organizing_club_name}` : `Organized by: ${event.organizing_club_name}`)}`,
      `LOCATION:${escapeIcsText(`${event.address}, ${event.city}`)}`,
      `GEO:${event.latitude};${event.longitude}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: ${escapeIcsText(event.title)} starts in 1 hour`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    const icsContent = icsLines.join('\r\n');

    await Share.share({
      title: `${event.title}.ics`,
      message: icsContent,
    });
  } catch (err: any) {
    if (err?.message !== 'User did not share') {
      Alert.alert('Calendar Error', 'Unable to generate iCalendar file.');
    }
  }
}
