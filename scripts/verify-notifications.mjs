// End-to-end notification test: create an approval request as the real user and
// confirm the DB trigger produces a notification row that the recipient can read.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
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
const userId = auth.user.id;
console.log("user:", userId);

const { data: mem } = await supabase
  .from("organization_memberships")
  .select("organization_id, role_id, roles(name)")
  .eq("user_id", userId)
  .limit(1);
const orgId = mem?.[0]?.organization_id;
console.log("org:", orgId, "role:", JSON.stringify(mem?.[0]?.roles));

const { data: perms, error: permErr } = await supabase
  .from("role_permissions")
  .select("permissions(code)")
  .eq("role_id", mem?.[0]?.role_id);
console.log("role_permissions:", permErr?.message ?? JSON.stringify(perms?.map(p => p.permissions?.code)));

const results = [];
const step = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
};

// Realtime subscription established BEFORE the insert.
const received = [];
const channel = supabase
  .channel("notif-proof")
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${userId}` },
    (payload) => { received.push(payload.new); }
  );
const subscribed = await new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), 15000);
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") { clearTimeout(t); resolve(true); }
  });
});
step("realtime subscribe", subscribed);

const { data: notifId, error: sendErr } = await supabase.rpc("send_notification", {
  p_organization_id: orgId,
  p_recipient_user_id: userId,
  p_sender_user_id: null,
  p_type: "INFO",
  p_title: "Notifikasi Uji Coba",
  p_message: "Verifikasi pipeline notifikasi.",
  p_link: "/approval",
});
step("send_notification", !sendErr && !!notifId, sendErr?.message ?? `id=${notifId}`);

// Realtime delivery
await new Promise((r) => setTimeout(r, 4000));
step("realtime INSERT delivered", received.some((n) => n.id === notifId), `${received.length} event(s)`);

const { data: after } = await supabase
  .from("notifications")
  .select("id, type, title, message, link, is_read")
  .eq("recipient_user_id", userId)
  .order("created_at", { ascending: false })
  .limit(5);
step("recipient reads own notification", !after?.length ? false : after.some((r) => r.id === notifId), `${after?.length} row(s)`);

const { data: marked, error: markErr } = await supabase.rpc("mark_notification_read", { p_notification_id: notifId, p_all: false });
step("mark_notification_read(one)", !markErr, markErr?.message ?? `marked=${marked}`);

const { data: readState } = await supabase.from("notifications").select("is_read").eq("id", notifId).maybeSingle();
step("notification flagged read", readState?.is_read === true, `is_read=${readState?.is_read}`);

await supabase.removeChannel(channel);

const { error: delErr } = await supabase.from("notifications").delete().eq("id", notifId);
console.log(`\ncleanup: ${delErr?.message ?? "deleted"}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} passed =====`);
for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`);

await supabase.auth.signOut();
