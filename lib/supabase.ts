/**
 * Supabase Client Configuration
 * Creates both regular and admin clients for database operations
 */

import { createClient } from '@supabase/supabase-js'

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
// Support both old and new Supabase key variable names
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 
                        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Regular Supabase client (for public operations)
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Admin Supabase client (for server-side operations with elevated permissions)
export const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null

// Log initialization status (only on server-side)
if (typeof window === 'undefined') {
  console.log('🔧 Supabase Client Initialization:')
  console.log('   Regular client:', supabase ? '✅ Initialized' : '❌ Not initialized (missing SUPABASE_URL or SUPABASE_ANON_KEY)')
  console.log('   Admin client:', supabaseAdmin ? '✅ Initialized' : '❌ Not initialized (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)')
  
  if (!supabase) {
    console.warn('⚠️  Supabase regular client not initialized. Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env')
  }
  
  if (!supabaseAdmin) {
    console.warn('⚠️  Supabase admin client not initialized. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  }
}
