/**
 * Test script to verify login credentials in Supabase
 * Run this with: node scripts/test-login.js
 */

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Error: Missing Supabase configuration')
  console.error('   SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceRoleKey ? '✅ Set' : '❌ Missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function testLogin() {
  console.log('🔍 Testing login credentials...\n')

  const testEmail = 'admin@scraper.com'
  const testPassword = 'admin123'

  // Step 1: Check if user exists
  console.log('Step 1: Checking if user exists...')
  const { data: users, error: queryError } = await supabase
    .from('users')
    .select('id, email, password, created_at')
    .eq('email', testEmail.toLowerCase().trim())

  if (queryError) {
    console.error('❌ Database query error:', queryError.message)
    console.error('   Details:', queryError)
    return
  }

  if (!users || users.length === 0) {
    console.error('❌ User not found in database!')
    console.error('   Email searched:', testEmail.toLowerCase().trim())
    console.error('\n   Solution: Run the SQL script to create the user:')
    console.error('   scripts/insert_user_credentials.sql')
    return
  }

  console.log('✅ User found:', users[0].email)
  console.log('   User ID:', users[0].id)
  console.log('   Created at:', users[0].created_at)
  console.log('   Stored password:', users[0].password)

  // Step 2: Verify password
  console.log('\nStep 2: Verifying password...')
  if (users[0].password === testPassword) {
    console.log('✅ Password matches!')
  } else {
    console.error('❌ Password mismatch!')
    console.error('   Expected:', testPassword)
    console.error('   Stored:', users[0].password)
    console.error('\n   Solution: Update the password in Supabase:')
    console.error('   UPDATE users SET password = \'admin123\' WHERE email = \'admin@scraper.com\';')
    return
  }

  // Step 3: Test session creation
  console.log('\nStep 3: Testing session creation...')
  const sessionToken = Buffer.from(`${users[0].id}:${Date.now()}`).toString('base64')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data: session, error: sessionError } = await supabase
    .from('user_sessions')
    .insert({
      user_id: users[0].id,
      session_token: sessionToken,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()

  if (sessionError) {
    console.error('❌ Session creation error:', sessionError.message)
    console.error('   Details:', sessionError)
    return
  }

  console.log('✅ Session created successfully!')
  console.log('   Session token:', sessionToken.substring(0, 20) + '...')
  console.log('   Expires at:', expiresAt.toISOString())

  // Step 4: Verify session can be retrieved
  console.log('\nStep 4: Verifying session retrieval...')
  const { data: retrievedSession, error: retrieveError } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at, users(id, email)')
    .eq('session_token', sessionToken)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (retrieveError || !retrievedSession) {
    console.error('❌ Session retrieval error:', retrieveError?.message)
    return
  }

  console.log('✅ Session retrieved successfully!')
  console.log('   User ID:', retrievedSession.user_id)
  console.log('   User email:', retrievedSession.users?.email || 'N/A')

  console.log('\n✅ All tests passed! Login should work.')
}

testLogin().catch(console.error)

