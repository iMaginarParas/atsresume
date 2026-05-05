import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getZoomAccessToken() {
  const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");

  const credentials = btoa(`${clientId}:${clientSecret}`);
  
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get Zoom token: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function createZoomMeeting(accessToken: string, topic: string, startTime: string, duration: number) {
  const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topic,
      type: 2, // Scheduled meeting
      start_time: startTime,
      duration,
      timezone: "UTC",
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        mute_upon_entry: true,
        waiting_room: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Zoom meeting: ${await response.text()}`);
  }

  return await response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const recruiterId = claims.claims.sub;

    // Parse request body
    const { applicationId, scheduledAt, durationMinutes, notes } = await req.json();

    if (!applicationId || !scheduledAt) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get application details
    const { data: application, error: appError } = await supabase
      .from('job_post_applications')
      .select('*, job_posts!inner(title, recruiter_id)')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return new Response(JSON.stringify({ error: 'Application not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify recruiter owns the job post
    if (application.job_posts.recruiter_id !== recruiterId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get applicant profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', application.applicant_id)
      .single();

    const applicantName = profile?.display_name || 'Candidate';
    const meetingTopic = `Interview: ${application.job_posts.title} - ${applicantName}`;

    // Create Zoom meeting
    const accessToken = await getZoomAccessToken();
    const zoomMeeting = await createZoomMeeting(
      accessToken,
      meetingTopic,
      scheduledAt,
      durationMinutes || 30
    );

    // Save interview to database
    const { data: interview, error: insertError } = await supabase
      .from('scheduled_interviews')
      .insert({
        job_post_id: application.job_post_id,
        application_id: applicationId,
        recruiter_id: recruiterId,
        applicant_id: application.applicant_id,
        scheduled_at: scheduledAt,
        duration_minutes: durationMinutes || 30,
        zoom_meeting_id: zoomMeeting.id.toString(),
        zoom_join_url: zoomMeeting.join_url,
        zoom_start_url: zoomMeeting.start_url,
        zoom_password: zoomMeeting.password,
        notes,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to save interview:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to save interview' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, interview }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error scheduling interview:', error);
    console.error('Interview scheduling failed:', error);
    return new Response(JSON.stringify({ error: 'Failed to schedule interview. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
