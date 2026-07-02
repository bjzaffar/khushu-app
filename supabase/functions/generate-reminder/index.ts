import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Rate limiting (in-memory, per-instance) ──────────────────────────────────
const rateLimits = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 30; // 30 calls per hour per user

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimits.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) return true;
  recent.push(now);
  rateLimits.set(userId, recent);
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, closestCategory, prayerName, llmGuidance, establishedTexts } =
      await req.json();

    if (!text || typeof text !== "string" || text.length > 200) {
      return new Response(
        JSON.stringify({
          error: "text is required and must be under 200 characters",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!prayerName || !llmGuidance) {
      return new Response(
        JSON.stringify({
          error: "prayerName and llmGuidance are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Rate limit check
    if (isRateLimited(user.id)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Build the established texts section of the prompt
    const textsList = Array.isArray(establishedTexts) && establishedTexts.length > 0
      ? establishedTexts.map((t: string, i: number) => `${i + 1}. "${t}"`).join("\n")
      : "";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 60,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: `You write pre-salah reminder notifications for a Muslim prayer focus app.

The user is about to pray ${prayerName}. Their specific distraction:
"${text}"

${closestCategory ? `Closest category: ${closestCategory}` : "This distraction doesn't fit any standard category."}
Theme: ${llmGuidance.theme}
Tone: ${llmGuidance.tone}
Avoid: ${llmGuidance.avoid}
${textsList ? `\nHere are existing reminders for similar distractions. Use them as inspiration — build off one of them but adapt it to this user's specific distraction:\n${textsList}` : ""}

Write ONE sentence (max 25 words) that:
1. Names the specific distraction briefly
2. Connects it to a relevant Divine Attribute or the theme
3. Gently redirects attention to the prayer
4. Matches the tone and avoids what's listed

Return ONLY the reminder text, no quotes or formatting.`,
          },
        ],
      }),
    });

    const data = await response.json();
    const reminder = (data.content?.[0]?.text ?? "").trim();

    if (!reminder) {
      return new Response(JSON.stringify({ reminder: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reminder }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
