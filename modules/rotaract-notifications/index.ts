import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * Android-only bridge for notification state that native code needs while the app
 * is not running. Absent on iOS and on any build made before this module existed,
 * so every call site must tolerate `null` — hence requireOptionalNativeModule.
 */
declare class RotaractNotificationsModule extends NativeModule {
  /** Mirrors the Supabase session so the inline-reply receiver can post as this user. */
  setSession(url: string, anonKey: string, accessToken: string, refreshToken: string, userId: string): void;
  clearSession(): void;
  /** Drops a conversation's accumulated notification thread and cancels its banner. */
  clearConversation(conversationId: string): void;
  /** The conversation on screen right now; its messages are not notified. Null on leave. */
  setActiveConversation(conversationId: string | null): void;
  /** Mirrors the notification's MUTE/UNMUTE toggle so the app can undo it. */
  setConversationMuted(conversationId: string, muted: boolean): void;
  isConversationMuted(conversationId: string): boolean;
  /** Silences a looping urgent organizer alert. */
  stopUrgentAlert(): void;
}

export default requireOptionalNativeModule<RotaractNotificationsModule>('RotaractNotifications');
