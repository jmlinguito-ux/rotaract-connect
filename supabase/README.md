# Rotaract Connect — Supabase Database Setup & Publishing Guide

This directory contains the production-ready PostgreSQL SQL schema, row-level security (RLS) policies, and initial seed data to host **Rotaract Connect** on Supabase.

---

## 🚀 Quick Setup Instructions

### Step 1: Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. Note down your **Project URL** and **anon public API Key** from **Project Settings > API**.

### Step 2: Run Database Schema & Seeds
1. Open your Supabase Dashboard and click on **SQL Editor** on the left sidebar.
2. Click **New Query**, copy the contents of [`supabase/schema.sql`](file:///Users/jonahmicahinguito/dev/rotaract-connect/supabase/schema.sql) and click **Run**.
3. Create another query, copy the contents of [`supabase/seed.sql`](file:///Users/jonahmicahinguito/dev/rotaract-connect/supabase/seed.sql), and click **Run**.

---

## 📦 Client Integration (Expo / React Native)

### Step 1: Install Supabase JS Client & Secure Storage
Run the following command in your project terminal:

```bash
npm install @supabase/supabase-js @react-native-async-storage/async-storage
```

### Step 2: Create `.env` file
Create `.env` in the root of your project:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 3: Initialize Supabase Client (`src/services/supabase.ts`)
Create `src/services/supabase.ts`:

```typescript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

---

## 💬 1-on-1 Chat & Realtime Messaging Setup

The database schema includes full support for 1-on-1 direct messaging and event inquiries:

- **`conversations`**: Tracks conversations between event participants and event organizers.
- **`direct_messages`**: Stores message contents, timestamps, sender/receiver foreign keys.
- **RLS Policies**: Ensures only message senders and recipients can read or send messages in their active conversations.
- **Realtime Subscriptions**: Enabled for `direct_messages`. In React Native, subscribe to new incoming messages with:

```typescript
useEffect(() => {
  const subscription = supabase
    .channel(`chat:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        setMessages((prev) => [...prev, payload.new]);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(subscription);
  };
}, [conversationId]);
```

---

## 🔒 Security & Realtime Highlights
- **Row Level Security (RLS)**: Enforces that users can only view their own conversations and direct messages, while club presidents and admins retain moderation privileges.
- **Supabase Realtime**: Enables instant live updates for `notifications` and `direct_messages`.

---

## 🖼️ Photo Storage Setup

The schema creates three Storage buckets (see section 5 of `schema.sql`) — no extra dashboard setup is needed:

| Bucket | Public? | Path convention | Used for |
|---|---|---|---|
| `avatars` | yes | `<user_id>/<filename>` | Profile photos |
| `event-covers` | yes | `<event_id>/<filename>` | Event cover photos |
| `verification-proofs` | **no** | `<user_id>/<filename>` | Rotaract ID / membership proofs (owner + reviewers only) |

Upload from the app with `src/services/storage.ts`:

```typescript
import { uploadImage, getPublicImageUrl, getSignedImageUrl } from '../services/storage';

// Public image (avatar / cover): store the public URL on the row.
const path = await uploadImage('avatars', `${user.id}/avatar.jpg`, localFileUri);
const url = getPublicImageUrl('avatars', path);
await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);

// Private image (verification proof): store the PATH; mint a signed URL when a
// reviewer displays it — signed URLs expire and must not be persisted.
const proofPath = await uploadImage('verification-proofs', `${user.id}/proof.jpg`, localFileUri);
await supabase.from('verification_applications').update({ proof_url: proofPath }).eq('id', applicationId);
const viewUrl = await getSignedImageUrl('verification-proofs', proofPath);
```

> Never store a device `file://` URI in the database — it only exists in that device's
> app sandbox. Store the Storage path (private buckets) or public URL (public buckets).

---

## 👤 Seeding Users (Important)

`profiles.id` references `auth.users(id)`, so **profiles cannot be seeded from SQL**.
To create demo/test accounts:

1. Supabase Dashboard → **Authentication → Add User** (email + password), one per demo account.
2. Insert matching rows into `profiles` using each new auth user's UUID.
3. Link club presidents: `UPDATE clubs SET president_id = '<auth uid>' WHERE club_code = 'RC-3800-021';`

Zones and clubs seed without any auth users (see `seed.sql`).
