// Supabase Edge Function: send-push-notification
// Triggered by DB webhook on notifications INSERT
//
// Setup:
//   1. supabase secrets set VAPID_PUBLIC_KEY=<your_key>
//   2. supabase secrets set VAPID_PRIVATE_KEY=<your_key>
//   3. supabase secrets set VAPID_SUBJECT=mailto:admin@example.com
//   4. Create a DB webhook in Supabase dashboard:
//      Table: notifications, Event: INSERT
//      URL: https://<project>.supabase.co/functions/v1/send-push-notification

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// web-push compatible signing for Deno
async function signVapid(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<string> {
  // Import the private key
  const keyData = Uint8Array.from(
    atob(privateKey.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const header = btoa(JSON.stringify({ typ: "JWT", alg: "ES256" }))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const payload = btoa(
    JSON.stringify({
      aud: new URL(audience).origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    })
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const data = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cryptoKey, data);

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${header}.${payload}.${sigB64}`;
}

const NOTIFICATION_MESSAGES: Record<string, { title: string; body: (actor: string) => string }> = {
  like: { title: "New like", body: (a) => `${a} liked your post` },
  comment: { title: "New comment", body: (a) => `${a} commented on your post` },
  comment_reply: { title: "New reply", body: (a) => `${a} replied to your comment` },
  follow: { title: "New follower", body: (a) => `${a} started following you` },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response("VAPID keys not configured", { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const body = await req.json();
  // DB webhook payload: { record: <new row>, ... }
  const notification = body.record ?? body;

  const { user_id, type, actor_id } = notification;
  if (!user_id || !type || !actor_id) {
    return new Response("Missing fields", { status: 400 });
  }

  // Fetch actor username
  const { data: actor } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", actor_id)
    .single();

  const template = NOTIFICATION_MESSAGES[type];
  if (!template || !actor) {
    return new Response("Unknown notification type", { status: 200 });
  }

  // Fetch all push subscriptions for this user
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user_id);

  if (!subs || subs.length === 0) {
    return new Response("No subscriptions", { status: 200 });
  }

  const payload = JSON.stringify({
    title: template.title,
    body: template.body(actor.username),
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: {
      type,
      postId: notification.post_id,
      url: notification.post_id ? `/post/${notification.post_id}` : `/profile/${actor.username}`,
    },
  });

  const results = await Promise.allSettled(
    subs.map(async (sub) => {
      const jwt = await signVapid(sub.endpoint, VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
          TTL: "86400",
        },
        body: payload,
      });

      // 410 Gone = subscription expired, clean it up
      if (res.status === 410) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", sub.endpoint);
      }

      return res.status;
    })
  );

  return new Response(JSON.stringify({ sent: results.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
