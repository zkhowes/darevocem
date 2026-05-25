// One-off: clear test users' app data so first-run starts truly blank.
//
// Why: earlier testing seeded saved_phrases (e.g. the aphasia intro with a
// name) and set profiles.onboarding_complete=true. The profile was later
// blanked but the saved_phrases row lingered, so the home intro card kept
// showing a stale name. This resets profiles + deletes saved_phrases /
// common_items / usage data so onboarding re-runs clean.
//
// Usage (service role key via env — never hardcode it):
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/wipe-test-user.mjs            # dry run: list users + counts
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/wipe-test-user.mjs --wipe      # actually wipe ALL users' app data
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/wipe-test-user.mjs --wipe --email you@example.com   # wipe one user
//
// This is a local dev/test utility. It does NOT delete the auth user — only
// their app rows — so the next sign-in is the same account, freshly onboarding.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://bbyxsseiejxdwchthjmp.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY in the environment. Aborting.');
  process.exit(1);
}

const wipe = process.argv.includes('--wipe');
const emailIdx = process.argv.indexOf('--email');
const onlyEmail = emailIdx >= 0 ? process.argv[emailIdx + 1] : null;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Tables that hold per-user app data. saved_phrases is the one with the stale
// name; the rest are cleared so first-run is genuinely fresh.
const USER_DATA_TABLES = ['saved_phrases', 'common_items', 'usage_events', 'session_traces', 'preferences'];

async function main() {
  const { data: list, error } = await admin.auth.admin.listUsers();
  if (error) { console.error('listUsers failed:', error.message); process.exit(1); }

  let users = list.users;
  if (onlyEmail) users = users.filter((u) => u.email?.toLowerCase() === onlyEmail.toLowerCase());

  if (users.length === 0) { console.log('No matching users.'); return; }

  for (const u of users) {
    console.log(`\nUser ${u.id}  ${u.email ?? '(no email)'}`);

    // Show current saved_phrases (so we can see the stale row before wiping).
    const { data: phrases } = await admin.from('saved_phrases').select('text').eq('user_id', u.id);
    console.log(`  saved_phrases: ${phrases?.length ?? 0}`);
    (phrases ?? []).slice(0, 10).forEach((p) => console.log(`    - ${p.text}`));

    if (!wipe) continue;

    for (const table of USER_DATA_TABLES) {
      const { error: delErr } = await admin.from(table).delete().eq('user_id', u.id);
      if (delErr) console.log(`  ! ${table}: ${delErr.message}`);
      else console.log(`  cleared ${table}`);
    }

    // Reset profile to blank + onboarding_complete=false so onboarding re-runs.
    const { error: profErr } = await admin.from('profiles').update({
      first_name: null, last_name: null, display_name: null,
      date_of_birth: null, phone: null, home_address: null,
      emergency_contact: null, emergency_phone: null,
      onboarding_complete: false,
    }).eq('id', u.id);
    if (profErr) console.log(`  ! profiles: ${profErr.message}`);
    else console.log('  reset profile (onboarding_complete=false)');
  }

  console.log(wipe ? '\nDone. Sign in again to re-run onboarding.' : '\nDry run only. Re-run with --wipe to clear.');
}

main();
