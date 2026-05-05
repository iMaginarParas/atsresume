import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COACH_PERSONA = `You are Alex Carter, a senior hiring manager with 15+ years of experience conducting interviews at top companies like Google, McKinsey, and JP Morgan. You have a warm but professional demeanor.

PERSONALITY TRAITS:
- You speak naturally and conversationally, like a real person — use contractions, occasional filler phrases ("you know", "honestly", "look"), and vary your sentence length.
- You're genuinely curious about candidates. You ask follow-up questions based on what they actually said, not generic next questions.
- You sometimes share brief anecdotes or context ("I once had a candidate who..." or "In my experience at Google...") to make the conversation feel real.
- You're encouraging but honest. You don't sugarcoat — if an answer is weak, you gently say so and explain why.
- You occasionally use humor or light remarks to keep things relaxed.
- You react to answers before moving on — "That's a great point" or "Hmm, interesting approach" or "I see where you're going with that, but let me push back a bit..."
- You NEVER sound like an AI. No bullet points in speech. No "Here are 3 things..." patterns. Talk like a human in a real conversation.

INTERVIEW STYLE:
- Mix behavioral, situational, and technical questions appropriate for the role.
- Adapt difficulty based on the candidate's responses — if they're doing well, challenge them more.
- Sometimes ask unexpected follow-ups like "Walk me through your thought process there" or "What would you do differently if you had more time?"
- Occasionally create mild pressure like a real interview: "I'm not quite convinced — can you give me a more specific example?"
- Keep your responses concise and conversational — under 80 words for questions, under 100 words for feedback.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const { user, errorResponse } = await authenticateRequest(req, corsHeaders);
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const { action } = body;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Service configuration error");

    // ── Non-streaming actions that return structured JSON ──
    if (action === "generate-questions" || action === "analyze-strengths") {
      return await handleStructured(body, LOVABLE_API_KEY);
    }

    // ── Streaming actions (mock interview) ──
    return await handleStreaming(body, LOVABLE_API_KEY);
  } catch (e) {
    console.error("interview-prep error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleStructured(body: any, apiKey: string) {
  const { action, position, industry, resumeData, questionType, experienceLevel } = body;

  let systemPrompt = "";
  let userPrompt = "";
  let tools: any[] = [];
  let toolChoice: any = undefined;

  if (action === "generate-questions") {
    const resumeContext = resumeData
      ? `\n\nCandidate's Resume:\n- Skills: ${(resumeData.skills || []).join(", ")}\n- Experience: ${(resumeData.experience || []).map((e: any) => `${e.title} at ${e.company}: ${e.description}`).join("; ")}\n- Education: ${(resumeData.education || []).map((e: any) => `${e.degree} from ${e.school}`).join("; ")}\n- Summary: ${resumeData.summary || "N/A"}`
      : "";

    systemPrompt = `You are an expert interview coach. Generate interview questions for a "${position}" role in "${industry}".${resumeContext}`;

    const typeInstructions: Record<string, string> = {
      "resume-based": `Generate 8 interview questions directly from the candidate's resume by analyzing their work experience, projects, skills, and achievements. Focus on "why", "how", and "impact" questions. Each question should reference specific details from the resume.`,
      "behavioral": `Generate 8 behavioral (HR) interview questions using the STAR method framework. Cover: teamwork, leadership, conflict resolution, failure handling, and decision-making. Include guidance on how to structure the answer using STAR (Situation, Task, Action, Result).`,
      "technical": `Generate 8 technical interview questions based on the candidate's skills and the target role. Group by difficulty: 3 beginner, 3 intermediate, 2 advanced. Focus on practical problem-solving.`,
      "role-based": `Generate 8 common interview questions for the "${position}" role at ${experienceLevel || "mid"} level. Mix behavioral and situational questions appropriate for the experience level.`,
    };

    userPrompt = typeInstructions[questionType] || typeInstructions["role-based"];
    userPrompt += `\n\nFor each question, provide:\n1. The question itself\n2. Why the interviewer asks this (intent)\n3. A structured answer framework (STAR, CAR, or problem-solution-impact)\n4. A brief tip for answering well\n5. Difficulty level (beginner, intermediate, advanced)`;

    tools = [{
      type: "function",
      function: {
        name: "return_questions",
        description: "Return generated interview questions with guidance",
        parameters: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  intent: { type: "string", description: "Why the interviewer asks this" },
                  framework: { type: "string", description: "Answer framework guidance (STAR/CAR/PSI)" },
                  tip: { type: "string", description: "Brief answering tip" },
                  difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
                  category: { type: "string", description: "Question category" },
                },
                required: ["question", "intent", "framework", "tip", "difficulty", "category"],
                additionalProperties: false,
              },
            },
          },
          required: ["questions"],
          additionalProperties: false,
        },
      },
    }];
    toolChoice = { type: "function", function: { name: "return_questions" } };

  } else if (action === "analyze-strengths") {
    const resumeContext = resumeData
      ? `Candidate's Resume:\n- Skills: ${(resumeData.skills || []).join(", ")}\n- Experience: ${(resumeData.experience || []).map((e: any) => `${e.title} at ${e.company}: ${e.description}. Bullets: ${(e.bullets || []).join("; ")}`).join("\n")}\n- Education: ${(resumeData.education || []).map((e: any) => `${e.degree} from ${e.school}`).join("; ")}\n- Summary: ${resumeData.summary || "N/A"}`
      : "No resume provided.";

    systemPrompt = `You are an expert career coach analyzing a candidate's resume for interview preparation.`;
    userPrompt = `Analyze this resume for a "${position}" role in "${industry}" and identify:\n1. Top 5 strengths an interviewer would notice\n2. Top 5 potential weaknesses or gaps an interviewer might probe\n3. For each weakness, provide a preparation tip on how to address it\n4. An overall interview readiness score (1-100)\n\n${resumeContext}`;

    tools = [{
      type: "function",
      function: {
        name: "return_analysis",
        description: "Return strengths and weaknesses analysis",
        parameters: {
          type: "object",
          properties: {
            strengths: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  point: { type: "string" },
                  explanation: { type: "string" },
                },
                required: ["point", "explanation"],
                additionalProperties: false,
              },
            },
            weaknesses: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  point: { type: "string" },
                  explanation: { type: "string" },
                  tip: { type: "string", description: "How to address this in an interview" },
                },
                required: ["point", "explanation", "tip"],
                additionalProperties: false,
              },
            },
            readinessScore: { type: "number", description: "Interview readiness score 1-100" },
            summary: { type: "string", description: "Brief overall assessment" },
          },
          required: ["strengths", "weaknesses", "readinessScore", "summary"],
          additionalProperties: false,
        },
      },
    }];
    toolChoice = { type: "function", function: { name: "return_analysis" } };
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      tool_choice: toolChoice,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const t = await response.text();
    console.error("AI gateway error:", response.status, t);
    throw new Error("AI gateway error");
  }

  const result = await response.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call in response");

  const parsed = JSON.parse(toolCall.function.arguments);
  return new Response(JSON.stringify(parsed), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleStreaming(body: any, apiKey: string) {
  const { action, position, industry, conversation, resumeData } = body;

  let systemPrompt = "";
  let userPrompt = "";

  const resumeContext = resumeData
    ? `\n\nThe candidate's resume includes:\n- Skills: ${(resumeData.skills || []).join(", ")}\n- Recent role: ${resumeData.experience?.[0]?.title || "N/A"} at ${resumeData.experience?.[0]?.company || "N/A"}\n- Summary: ${resumeData.summary || "N/A"}`
    : "";

  if (action === "start") {
    systemPrompt = COACH_PERSONA;
    userPrompt = `You're about to interview someone for a "${position}" role in the "${industry}" industry.${resumeContext}\n\nStart with a natural, warm greeting — introduce yourself as Alex, mention you've been looking forward to this, maybe make a brief comment about the role or industry. Then ease into the first question naturally. Don't jump straight into "Tell me about yourself" — be more creative and specific to the role. Keep it under 80 words.`;
  } else if (action === "respond") {
    systemPrompt = `${COACH_PERSONA}\n\nYou are currently interviewing someone for a "${position}" role in the "${industry}" industry.${resumeContext}`;
    userPrompt = "Based on what the candidate just said, react naturally — acknowledge their answer with a brief, genuine reaction (agreement, surprise, curiosity, or gentle pushback). Then transition smoothly into your next question. Make the transition feel organic, not scripted. Keep total response under 100 words.";
  } else if (action === "summary") {
    systemPrompt = `${COACH_PERSONA}\n\nThe interview for a "${position}" role in "${industry}" has just ended.${resumeContext}`;
    userPrompt = `Wrap up the interview naturally — like you're giving candid feedback over coffee. 
Include:
- Your honest overall impression (rate 1-10 but frame it conversationally, like "I'd put you at about a 7 out of 10")
- What genuinely impressed you (be specific, reference their actual answers)
- Where they fell short and what to work on (be direct but kind)
- One piece of advice you'd give them as a mentor, not just an interviewer
Keep it under 200 words. Sound like a real person giving real feedback.`;
  } else {
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...(conversation || []),
  ];
  if (action === "start" || action === "summary") {
    messages.push({ role: "user", content: userPrompt });
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const t = await response.text();
    console.error("AI gateway error:", response.status, t);
    throw new Error("AI gateway error");
  }

  return new Response(response.body, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}
