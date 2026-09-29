// Reproduces the notification-bell query exactly as app-shell.tsx issues it, to
// surface an error that the component swallows (`if (!error && notifs)`).
// Also runs the same query without the profiles() embed for comparison.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const auth = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }),
})).json();
const uid = auth.user.id;
console.log("user:", uid);

const h = { apikey: ANON, Authorization: `Bearer ${auth.access_token}` };

async function probe(label, select) {
  const url = `${URL_}/rest/v1/notifications?select=${encodeURIComponent(select)}&recipient_user_id=eq.${uid}&order=created_at.desc&limit=20`;
  const res = await fetch(url, { headers: h });
  const body = await res.text();
  console.log(`\n--- ${label} ---`);
  console.log("status:", res.status);
  console.log("body:", body.slice(0, 700));
}

// Exactly what the bell requests (with the profiles embed).
await probe("BELL QUERY (with profiles embed)", "id,type,title,message,link,is_read,created_at,sender_user_id,profiles(full_name)");
// Without the embed.
await probe("PLAIN QUERY (no profiles embed)", "id,type,title,message,link,is_read,created_at,sender_user_id");

// Does the FK the embed relies on exist?
const fk = await fetch(`${URL_}/rest/v1/notifications?sender_user_id=not.is.null&select=id,sender_user_id,profiles!notifications_sender_user_id_fkey(full_name)&limit=5`, { headers: h });
console.log("\n--- FK hint notifications_sender_user_id_fkey ---");
console.log("status:", fk.status);
console.log("body:", (await fk.text()).slice(0, 400));
