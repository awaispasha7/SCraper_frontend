import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // Normalize email for comparison
    const normalizedEmail = email.toLowerCase().trim()
    
    // Check credentials in Supabase users table
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, password')
      .eq('email', normalizedEmail)
      .single()

    // Log error for debugging (in production, check Railway logs)
    if (userError) {
      console.error('Supabase query error:', userError)
      console.error('Email searched:', normalizedEmail)
    }

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid email or password', debug: process.env.NODE_ENV === 'development' ? { userError, normalizedEmail } : undefined },
        { status: 401 }
      )
    }

    // Verify password (in production, use bcrypt or similar)
    // For now, simple comparison (you should hash passwords in production)
    if (user.password !== password) {
      console.error('Password mismatch for user:', normalizedEmail)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Create session token (simple implementation)
    const sessionToken = Buffer.from(`${user.id}:${Date.now()}`).toString('base64')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

    // Store session in Supabase
    const { error: sessionError } = await supabaseAdmin
      .from('user_sessions')
      .insert({
        user_id: user.id,
        session_token: sessionToken,
        expires_at: expiresAt.toISOString(),
      })

    if (sessionError) {
      console.error('Session creation error:', sessionError)
      // Continue anyway, we'll use cookie-based session
    }

    // Set HTTP-only cookie
    const cookieStore = await cookies()
    // Ensure isProduction is always a boolean
    const isProduction = Boolean(
      process.env.NODE_ENV === 'production' || 
      process.env.VERCEL || 
      process.env.RAILWAY_ENVIRONMENT
    )
    
    cookieStore.set('session_token', sessionToken, {
      httpOnly: true,
      secure: isProduction, // Use HTTPS in production
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
      // Don't set domain - let browser use default
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    )
  }
}

