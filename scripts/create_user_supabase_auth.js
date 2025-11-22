/**
 * Script to create a user in Supabase Auth
 * Run this with: node scripts/create_user_supabase_auth.js
 * 
 * This uses Supabase Admin API to create users with proper password hashing
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Error: Missing Supabase credentials')
  console.error('   Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Please set these in .env file')
  process.exit(1)
}

// Create admin client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function createUser() {
  const email = 'admin@scraper.com'
  const password = 'admin123'

  console.log('🔐 Creating user in Supabase Auth...\n')
  console.log('Email:', email)
  console.log('Password:', password, '\n')

  try {
    // Create user using Supabase Admin API
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email
    })

    if (error) {
      if (error.message.includes('already registered')) {
        console.log('⚠️  User already exists. Updating password...\n')
        
        // Get user by email
        const { data: users, error: listError } = await supabase.auth.admin.listUsers()
        if (listError) {
          console.error('❌ Error listing users:', listError.message)
          return
        }

        const user = users.users.find(u => u.email === email)
        if (!user) {
          console.error('❌ User not found')
          return
        }

        // Update password
        const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
          user.id,
          { password: password }
        )

        if (updateError) {
          console.error('❌ Error updating password:', updateError.message)
          return
        }

        console.log('✅ Password updated successfully!')
        console.log('   User ID:', user.id)
        console.log('   Email:', user.email)
      } else {
        console.error('❌ Error creating user:', error.message)
      }
      return
    }

    if (data && data.user) {
      console.log('✅ User created successfully!')
      console.log('   User ID:', data.user.id)
      console.log('   Email:', data.user.email)
      console.log('   Email Confirmed:', data.user.email_confirmed_at ? 'Yes' : 'No')
    }
  } catch (err) {
    console.error('❌ Unexpected error:', err.message)
  }
}

createUser()


