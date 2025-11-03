// Node script to measure timings for both RPCs (requires SUPABASE_URL and SUPABASE_KEY env vars)
const { createClient } = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("SUPABASE_URL and SUPABASE_KEY are required");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function measure(name, fn) {
  const start = Date.now();
  const res = await fn();
  const ms = Date.now() - start;
  console.log(`${name} => ${ms}ms`, res.error ? res.error.message : `rows=${(res.data || []).length}`);
}

async function run() {
  const userId = process.env.TEST_USER_ID;
  if (!userId) {
    console.error("Provide TEST_USER_ID env var");
    process.exit(1);
  }

  await measure("get_simple_feed", () =>
    supabase.rpc("get_simple_feed", { p_user_id: userId, p_feed_type: "for-you", p_limit: 20, p_offset: 0 })
  );

  await measure("get_personalized_feed", () =>
    supabase.rpc("get_personalized_feed", { p_user_id: userId, p_limit: 20, p_offset: 0 })
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});