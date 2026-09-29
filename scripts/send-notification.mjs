// Sends one notification to the test user and leaves it in place, so an external
// observer (the browser) can confirm the bell badge updates without a reload.
// Prints the notification id; clean up with:  DELETE FROM notifications WHERE id = '...'
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
  email: process.env.TEST_EMAIL,
  password: process.env.TEST_PASSWORD,
});
if (authErr) { console.error("LOGIN FAILED:", authErr.message); process.exit(1); }

const { data: mem } = await supabase
  .from("organization_memberships")
  .select("organization_id")
  .eq("user_id", auth.user.id)
  .eq("is_active", true)
  .maybeSingle();

const { data: id, error } = await supabase.rpc("send_notification", {
  p_organization_id: mem.organization_id,
  p_recipient_user_id: auth.user.id,
  p_sender_user_id: null,
  p_type: "WARNING",
  p_title: "Uji Realtime Bell",
  p_message: "Notifikasi ini dikirim dari luar browser untuk memverifikasi badge realtime.",
  p_link: "/approval",
});
if (error) { console.error("SEND FAILED:", error.message); process.exit(1); }
console.log(`sent id=${id}`);
await supabase.auth.signOut();
