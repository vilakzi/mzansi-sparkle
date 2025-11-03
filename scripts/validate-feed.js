#!/usr/bin/env node

/**
 * Feed Validation Script
 * 
 * This script validates that both simple and personalized feed functions work correctly
 * and measures their performance.
 * 
 * Usage: node scripts/validate-feed.js
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('Required: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testSimpleFeed(userId) {
  console.log('\n📊 Testing get_simple_feed...');
  
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase.rpc('get_simple_feed', {
      p_user_id: userId,
      p_feed_type: 'for-you',
      p_limit: 20,
      p_offset: 0
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      console.error('❌ get_simple_feed failed:', error.message);
      return { success: false, duration, error };
    }
    
    console.log(`✅ get_simple_feed succeeded in ${duration}ms`);
    console.log(`   Returned ${data?.length || 0} posts`);
    
    // Validate data structure
    if (data && data.length > 0) {
      const firstPost = data[0];
      const requiredFields = ['id', 'user_id', 'media_url', 'caption', 'likes_count', 
                              'username', 'display_name', 'is_liked', 'is_saved'];
      const missingFields = requiredFields.filter(field => !(field in firstPost));
      
      if (missingFields.length > 0) {
        console.warn(`⚠️  Missing fields in response: ${missingFields.join(', ')}`);
      } else {
        console.log('   ✓ All expected fields present');
      }
    }
    
    return { success: true, duration, postCount: data?.length || 0 };
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('❌ Unexpected error:', err.message);
    return { success: false, duration, error: err };
  }
}

async function testPersonalizedFeed(userId) {
  console.log('\n📊 Testing get_personalized_feed...');
  
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase.rpc('get_personalized_feed', {
      p_user_id: userId,
      p_limit: 20,
      p_offset: 0
    });
    
    const duration = Date.now() - startTime;
    
    if (error) {
      // This is expected if the function doesn't exist
      if (error.message.includes('function') && error.message.includes('does not exist')) {
        console.log('⚠️  get_personalized_feed does not exist (expected - not yet implemented)');
        console.log('   This function should be created when personalized feed is optimized');
        return { success: true, duration, notImplemented: true };
      }
      
      console.error('❌ get_personalized_feed failed:', error.message);
      return { success: false, duration, error };
    }
    
    console.log(`✅ get_personalized_feed succeeded in ${duration}ms`);
    console.log(`   Returned ${data?.length || 0} posts`);
    
    if (duration > 10000) {
      console.warn(`⚠️  SLOW: Feed took ${duration}ms (>10s). Optimization needed!`);
    }
    
    return { success: true, duration, postCount: data?.length || 0 };
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('❌ Unexpected error:', err.message);
    return { success: false, duration, error: err };
  }
}

async function getSampleUserId() {
  console.log('🔍 Finding a sample user...');
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .limit(1)
    .single();
  
  if (error || !data) {
    console.warn('⚠️  No users found in database. Using test UUID.');
    return '00000000-0000-0000-0000-000000000000';
  }
  
  console.log(`✓ Using user ID: ${data.id}`);
  return data.id;
}

async function checkFeatureFlag() {
  console.log('\n🚩 Checking feature flag configuration...');
  
  const flagValue = process.env.VITE_PERSONALIZED_FEED;
  
  if (!flagValue || flagValue.toLowerCase() === 'false' || flagValue === '0') {
    console.log('✓ VITE_PERSONALIZED_FEED is disabled (simple feed mode)');
    return false;
  } else {
    console.log('⚠️  VITE_PERSONALIZED_FEED is enabled (personalized feed mode)');
    return true;
  }
}

async function main() {
  console.log('🚀 Feed Validation Script');
  console.log('========================\n');
  
  // Check feature flag
  const personalizedEnabled = await checkFeatureFlag();
  
  // Get a sample user ID
  const userId = await getSampleUserId();
  
  // Test simple feed (always available)
  const simpleFeedResult = await testSimpleFeed(userId);
  
  // Test personalized feed (may not exist yet)
  const personalizedFeedResult = await testPersonalizedFeed(userId);
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 SUMMARY');
  console.log('='.repeat(50));
  
  console.log('\nSimple Feed:');
  if (simpleFeedResult.success) {
    console.log(`  ✅ Working (${simpleFeedResult.duration}ms, ${simpleFeedResult.postCount} posts)`);
    if (simpleFeedResult.duration < 2000) {
      console.log('  🚀 Excellent performance!');
    } else if (simpleFeedResult.duration < 5000) {
      console.log('  ✓ Good performance');
    } else {
      console.log('  ⚠️  Performance could be improved');
    }
  } else {
    console.log('  ❌ Failed');
  }
  
  console.log('\nPersonalized Feed:');
  if (personalizedFeedResult.notImplemented) {
    console.log('  ⚠️  Not implemented (expected)');
    console.log('  ℹ️  Will be created when optimization is complete');
  } else if (personalizedFeedResult.success) {
    console.log(`  ✅ Working (${personalizedFeedResult.duration}ms, ${personalizedFeedResult.postCount} posts)`);
    if (personalizedFeedResult.duration > 30000) {
      console.log('  ❌ CRITICAL: Too slow (>30s)');
    } else if (personalizedFeedResult.duration > 10000) {
      console.log('  ⚠️  Warning: Slow (>10s)');
    } else if (personalizedFeedResult.duration > 5000) {
      console.log('  ⚠️  Performance could be better');
    } else {
      console.log('  🚀 Good performance!');
    }
  } else {
    console.log('  ❌ Failed or not available');
  }
  
  console.log('\nFeature Flag:');
  if (personalizedEnabled) {
    console.log('  ⚠️  Enabled - App will use personalized feed');
    if (personalizedFeedResult.notImplemented) {
      console.log('  ❌ WARNING: Flag is enabled but function does not exist!');
      console.log('  → Set VITE_PERSONALIZED_FEED=false until optimization is complete');
    }
  } else {
    console.log('  ✅ Disabled - App will use simple feed (recommended)');
  }
  
  console.log('\n' + '='.repeat(50));
  
  // Exit code
  if (simpleFeedResult.success) {
    console.log('\n✅ Validation passed - Simple feed is working correctly');
    process.exit(0);
  } else {
    console.log('\n❌ Validation failed - Simple feed has issues');
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
