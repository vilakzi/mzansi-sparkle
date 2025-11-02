import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { fileName, totalChunks } = await req.json();

    if (!fileName || !totalChunks) {
      throw new Error('Missing required parameters');
    }

    console.log(`Merging ${totalChunks} chunks for ${fileName}`);

    // Download all chunks
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkFileName = `${fileName}.part${i}`;
      
      const { data, error } = await supabaseClient.storage
        .from('posts-media')
        .download(chunkFileName);

      if (error) {
        console.error(`Error downloading chunk ${i}:`, error);
        throw error;
      }

      const arrayBuffer = await data.arrayBuffer();
      chunks.push(new Uint8Array(arrayBuffer));
    }

    // Merge chunks
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const mergedFile = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of chunks) {
      mergedFile.set(chunk, offset);
      offset += chunk.length;
    }

    // Determine file extension
    const ext = fileName.split('.').pop();
    const finalFileName = fileName;

    // Upload merged file
    const { error: uploadError } = await supabaseClient.storage
      .from('posts-media')
      .upload(finalFileName, mergedFile, {
        contentType: ext === 'mp4' ? 'video/mp4' : 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading merged file:', uploadError);
      throw uploadError;
    }

    // Delete chunk files
    const chunkFileNames = [];
    for (let i = 0; i < totalChunks; i++) {
      chunkFileNames.push(`${fileName}.part${i}`);
    }

    const { error: deleteError } = await supabaseClient.storage
      .from('posts-media')
      .remove(chunkFileNames);

    if (deleteError) {
      console.warn('Error deleting chunk files:', deleteError);
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseClient.storage
      .from('posts-media')
      .getPublicUrl(finalFileName);

    console.log('Merge complete:', publicUrl);

    return new Response(
      JSON.stringify({ publicUrl }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Merge error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
