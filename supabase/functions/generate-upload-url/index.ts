import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user authentication
    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { fileName, fileSize, fileType, totalChunks } = await req.json();

    if (!fileName || !fileSize || !fileType || !totalChunks) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create upload session
    const { data: session, error: sessionError } = await supabaseClient
      .from('upload_sessions')
      .insert({
        user_id: user.id,
        file_name: fileName,
        file_size: fileSize,
        file_type: fileType,
        total_chunks: totalChunks,
        status: 'pending'
      })
      .select()
      .single();

    if (sessionError || !session) {
      console.error('Session creation error:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create upload session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate pre-signed URLs for each chunk
    const uploadUrls: string[] = [];
    const storagePath = `${user.id}/${session.id}`;

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = `${storagePath}/chunk-${i}`;
      
      // Generate signed upload URL (valid for 1 hour)
      const { data: signedUrl, error: urlError } = await supabaseClient
        .storage
        .from('posts-media')
        .createSignedUploadUrl(chunkPath);

      if (urlError || !signedUrl) {
        console.error(`Error generating URL for chunk ${i}:`, urlError);
        // Clean up session on error
        await supabaseClient
          .from('upload_sessions')
          .delete()
          .eq('id', session.id);
        
        return new Response(
          JSON.stringify({ error: `Failed to generate upload URL for chunk ${i}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      uploadUrls.push(signedUrl.signedUrl);
    }

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        uploadUrls,
        storagePath
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Generate upload URL error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
