import { NextRequest, NextResponse } from 'next/server'
import { fetchMelissaPersonatorData } from '@/lib/melissa-personator'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import fs from 'fs'
import path from 'path'

// Atom API key for For Sale By Owner listings
const ATOM_API_KEY = process.env.ATTOM_API_KEY || '00088313f4a127201256b9bf19a2963b'
// Separate Atom API key for Trulia/Redfin listings
// Can be set via TRULIA_REDFIN_ATTOM_API_KEY environment variable, otherwise uses default
const TRULIA_REDFIN_ATOM_API_KEY = process.env.TRULIA_REDFIN_ATTOM_API_KEY || '00088313f4a127201256b9bf19a2963b'
const ATOM_API_BASE_URL = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0'

// Load owner data lookup (email/phone from CSV)
let ownerDataLookup: Record<string, { ownerName: string; emails: string[]; phones: string[]; propertyAddress: string }> | null = null

function loadOwnerDataLookup() {
  if (ownerDataLookup !== null) return ownerDataLookup
  
  try {
    const lookupPath = path.join(process.cwd(), 'owner_data_lookup.json')
    if (fs.existsSync(lookupPath)) {
      const fileContent = fs.readFileSync(lookupPath, 'utf-8')
      ownerDataLookup = JSON.parse(fileContent)
      return ownerDataLookup
    }
  } catch (error) {
    console.warn('⚠️ Could not load owner data lookup file:', error)
  }
  
  ownerDataLookup = {}
  return ownerDataLookup
}

// Normalize address for matching
function normalizeAddress(address: string): string {
  if (!address) return ''
  return address
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(ave|avenue|st|street|rd|road|dr|drive|blvd|boulevard|ln|lane|pl|place|ct|court|cir|circle)\b/gi, (match) => {
      const abbrev: Record<string, string> = {
        'avenue': 'ave', 'street': 'st', 'road': 'rd', 'drive': 'dr',
        'boulevard': 'blvd', 'lane': 'ln', 'place': 'pl', 'court': 'ct', 'circle': 'cir'
      }
      return abbrev[match.toLowerCase()] || match.toLowerCase()
    })
}

// Lookup email and phone from CSV data
function lookupOwnerData(address: string): { emails: string[]; phones: string[] } | null {
  const lookup = loadOwnerDataLookup()
  if (!lookup) return null
  
  const normalizedAddr = normalizeAddress(address)
  
  // Try exact match first
  if (lookup[normalizedAddr]) {
    return {
      emails: lookup[normalizedAddr].emails || [],
      phones: lookup[normalizedAddr].phones || []
    }
  }
  
  // Try partial match (in case addresses differ slightly)
  for (const [key, value] of Object.entries(lookup)) {
    if (normalizedAddr.includes(key) || key.includes(normalizedAddr)) {
      return {
        emails: value.emails || [],
        phones: value.phones || []
      }
    }
  }
  
  return null
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const address = searchParams.get('address')
    const listingLink = searchParams.get('listing_link') // Also accept listing_link for matching
    const source = searchParams.get('source') // Check if request is from Trulia/Redfin

    if (!address) {
      return NextResponse.json(
        { error: 'Address parameter is required' },
        { status: 400 }
      )
    }
    
    // Use different Atom API key for Trulia/Redfin requests
    const atomApiKey = (source === 'trulia' || source === 'redfin') 
      ? TRULIA_REDFIN_ATOM_API_KEY 
      : ATOM_API_KEY
    
    console.log(`\n🔍 [OWNER-INFO API] Request received:`)
    console.log(`   Address: "${address}"`)
    console.log(`   Listing Link: "${listingLink || 'not provided'}"`)
    console.log(`   Source: "${source || 'default'}"`)
    console.log(`   Using Atom API Key: ${atomApiKey.substring(0, 10)}...`)

    // ALWAYS check Supabase tables FIRST for owner data
    // Check addresses table if source is "addresses", otherwise check listings table
    const dbClient = supabaseAdmin || supabase
    if (dbClient) {
      try {
        // If source is "addresses", check addresses table first
        if (source === 'addresses') {
          console.log('📥 Checking Supabase addresses table for owner data...')
          
          // Parse address to match format in addresses table
          // Address format might be "514 Peach Spring Dr, Houston, TX 77037"
          const addressParts = address.split(',').map(p => p.trim())
          const streetAddress = addressParts[0] || address
          
          // Try to find address by matching street address
          const { data: addressData, error: addressError } = await dbClient
            .from('addresses')
            .select('owner_name, mailing_address, emails, phones, address, city, state, zip')
            .ilike('address', `%${streetAddress}%`)
            .maybeSingle()
          
          if (!addressError && addressData && (addressData.owner_name || addressData.mailing_address || addressData.emails || addressData.phones)) {
            console.log('✅ Found address in Supabase addresses table with owner data')
            
            // Parse emails and phones from text format
            const parseEmails = (emailsData: any): string[] => {
              if (!emailsData) return []
              if (typeof emailsData === 'string') {
                // Split by comma and clean up
                return emailsData.split(',').map((e: string) => e.trim()).filter((e: string) => e && e.includes('@'))
              }
              if (Array.isArray(emailsData)) return emailsData
              return []
            }
            
            const parsePhones = (phonesData: any): string[] => {
              if (!phonesData) return []
              if (typeof phonesData === 'string') {
                // Split by comma and clean up
                return phonesData.split(',').map((p: string) => p.trim()).filter((p: string) => p && /[\d-]/.test(p))
              }
              if (Array.isArray(phonesData)) return phonesData
              return []
            }
            
            const emails = parseEmails(addressData.emails)
            const phones = parsePhones(addressData.phones)
            
            return NextResponse.json({
              ownerName: addressData.owner_name || null,
              mailingAddress: addressData.mailing_address || null,
              email: emails.length > 0 ? emails[0] : null,
              phone: phones.length > 0 ? phones[0] : null,
              allEmails: emails,
              allPhones: phones,
              propertyAddress: address
            })
          }
        }
        
        // Check listings table for For Sale By Owner listings
        console.log('📥 Checking Supabase listings table for owner data...')
        
        // Try to find listing by address or listing_link
        let query = dbClient
          .from('listings')
          .select('owner_name, mailing_address, owner_emails, owner_phones, address, listing_link')
        
        if (listingLink) {
          query = query.eq('listing_link', listingLink)
        } else {
          query = query.ilike('address', `%${address}%`)
        }
        
        const { data: listing, error: listingError } = await query.maybeSingle()
        
        if (!listingError && listing) {
          console.log('✅ Found For Sale By Owner listing in Supabase with owner data')
          
          // Parse emails and phones from JSONB or text format
          const parseEmails = (emailsData: any): string[] => {
            if (!emailsData) return []
            if (typeof emailsData === 'string') {
              try {
                return JSON.parse(emailsData)
              } catch {
                return emailsData.split(/[,\n]/).map((e: string) => e.trim()).filter((e: string) => e && e.includes('@'))
              }
            }
            if (Array.isArray(emailsData)) return emailsData
            return []
          }
          
          const parsePhones = (phonesData: any): string[] => {
            if (!phonesData) return []
            if (typeof phonesData === 'string') {
              try {
                return JSON.parse(phonesData)
              } catch {
                return phonesData.split(/[,\n]/).map((p: string) => p.trim()).filter((p: string) => p && /[\d-]/.test(p))
              }
            }
            if (Array.isArray(phonesData)) return phonesData
            return []
          }
          
          const allEmails = parseEmails(listing.owner_emails)
          const allPhones = parsePhones(listing.owner_phones)
          
          // Get owner name and mailing address from Supabase
          let ownerName = listing.owner_name && listing.owner_name !== 'null' ? listing.owner_name : null
          let mailingAddress = listing.mailing_address && listing.mailing_address !== 'null' ? listing.mailing_address : null
          
          // If mailing address is missing, try to fetch from CSV file
          if (!mailingAddress || mailingAddress === '' || mailingAddress === 'null') {
            console.log('⚠️ Mailing address missing in Supabase, fetching from CSV file...')
            
            try {
              // Try to load from sale owner.csv file
              const csvPaths = [
                path.join(process.cwd(), 'sale owner.csv'),
                path.join(process.cwd(), '..', 'sale owner.csv'),
                path.join(process.cwd(), '..', '..', 'sale owner.csv'),
              ]
              
              for (const csvPath of csvPaths) {
                if (fs.existsSync(csvPath)) {
                  console.log(`📂 Reading CSV file: ${csvPath}`)
                  const csvContent = fs.readFileSync(csvPath, 'utf-8')
                  const csvLines = csvContent.split('\n').filter(line => line.trim())
                  
                  if (csvLines.length < 2) continue
                  
                  // Parse header
                  const headers = csvLines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
                  const addressIndex = headers.indexOf('address')
                  const mailingAddressIndex = headers.indexOf('mailing_address')
                  
                  if (addressIndex === -1 || mailingAddressIndex === -1) {
                    console.warn('⚠️ CSV file missing required columns (address or mailing_address)')
                    continue
                  }
                  
                  // Find matching listing by address
                  for (let i = 1; i < csvLines.length; i++) {
                    const line = csvLines[i]
                    // Simple CSV parsing (handle quoted values)
                    const values: string[] = []
                    let currentValue = ''
                    let inQuotes = false
                    
                    for (let j = 0; j < line.length; j++) {
                      const char = line[j]
                      if (char === '"') {
                        inQuotes = !inQuotes
                      } else if (char === ',' && !inQuotes) {
                        values.push(currentValue.trim().replace(/^"|"$/g, ''))
                        currentValue = ''
                      } else {
                        currentValue += char
                      }
                    }
                    values.push(currentValue.trim().replace(/^"|"$/g, ''))
                    
                    const csvAddress = values[addressIndex] || ''
                    const csvMailingAddress = values[mailingAddressIndex] || ''
                    
                    // Check if addresses match (case-insensitive, partial match)
                    const normalizedSearchAddr = normalizeAddress(address)
                    const normalizedCsvAddr = normalizeAddress(csvAddress)
                    
                    if (normalizedCsvAddr && normalizedSearchAddr && 
                        (normalizedCsvAddr.includes(normalizedSearchAddr) || 
                         normalizedSearchAddr.includes(normalizedCsvAddr))) {
                      // Found matching listing
                      if (csvMailingAddress && csvMailingAddress !== '' && csvMailingAddress !== 'null') {
                        mailingAddress = csvMailingAddress
                        console.log(`✅ Fetched mailing address from CSV: ${mailingAddress}`)
                        
                        // Also update owner name if missing
                        const ownerNameIndex = headers.indexOf('owner_name')
                        if ((!ownerName || ownerName === 'null' || ownerName === '') && 
                            ownerNameIndex !== -1 && values[ownerNameIndex]) {
                          const csvOwnerName = values[ownerNameIndex].trim()
                          if (csvOwnerName && csvOwnerName !== '' && csvOwnerName !== 'null') {
                            ownerName = csvOwnerName
                            console.log(`✅ Fetched owner name from CSV: ${ownerName}`)
                          }
                        }
                        break
                      }
                    }
                  }
                  break
                }
              }
              
              if (!mailingAddress || mailingAddress === 'null' || mailingAddress === '') {
                console.warn('⚠️ Mailing address not found in CSV file')
              }
            } catch (csvError: any) {
              console.warn('⚠️ Error reading from CSV file:', csvError.message)
              // Continue with data from Supabase
            }
          }
          
          // Return owner data from Supabase (with Atom API enrichment if needed)
          return NextResponse.json({
            ownerName: ownerName,
            mailingAddress: mailingAddress,
            email: allEmails.length > 0 ? allEmails[0] : null,
            phone: allPhones.length > 0 ? allPhones[0] : null,
            allEmails: allEmails,
            allPhones: allPhones,
            propertyAddress: listing.address || address,
            source: 'supabase_listings'
          })
        } else {
          console.log('⚠️ Listing not found in Supabase listings table')
        }
      } catch (supabaseError) {
        console.warn('⚠️ Error checking Supabase listings table:', supabaseError)
        // Continue to check other sources
      }
    }

    // Check Supabase for Trulia listings data first (if source is trulia)
    if (source === 'trulia') {
      const dbClient = supabaseAdmin || supabase
      if (dbClient) {
        try {
          console.log('📥 Checking Supabase trulia_listings table for owner data...')
          
          // Try to find listing by address or listing_link
          let query = dbClient
            .from('trulia_listings')
            .select('owner_name, mailing_address, emails, phones, address')
          
          if (listingLink) {
            query = query.eq('listing_link', listingLink)
          } else {
            query = query.eq('address', address)
          }
          
          const { data: truliaListing, error: truliaError } = await query.maybeSingle()
          
          if (!truliaError && truliaListing) {
            console.log('✅ Found Trulia listing in Supabase with owner data')
            
            // Parse emails and phones from text format
            const parseEmails = (emailsStr: string | null): string[] => {
              if (!emailsStr || emailsStr === 'null' || emailsStr === '' || 
                  emailsStr === 'no email found' || emailsStr === 'No email addresses found' || emailsStr === 'no data') {
                return []
              }
              return emailsStr
                .split(/[,\n]/)
                .map(email => email.trim())
                .filter(email => email && email.includes('@'))
            }
            
            const parsePhones = (phonesStr: string | null): string[] => {
              if (!phonesStr || phonesStr === 'null' || phonesStr === '' || 
                  phonesStr === 'no phone available' || phonesStr === 'no data') {
                return []
              }
              const cleaned = phonesStr.replace(/Landline:\s*/gi, '').replace(/Mobile:\s*/gi, '').trim()
              return cleaned
                .split(/[,\n]/)
                .map(phone => phone.trim())
                .filter(phone => phone && /[\d-]/.test(phone))
            }
            
            const allEmails = parseEmails(truliaListing.emails)
            const allPhones = parsePhones(truliaListing.phones)
            
            // Return owner data from Supabase
            return NextResponse.json({
              ownerName: truliaListing.owner_name && truliaListing.owner_name !== 'null' ? truliaListing.owner_name : null,
              mailingAddress: truliaListing.mailing_address && truliaListing.mailing_address !== 'null' ? truliaListing.mailing_address : null,
              email: allEmails.length > 0 ? allEmails[0] : null,
              phone: allPhones.length > 0 ? allPhones[0] : null,
              allEmails: allEmails,
              allPhones: allPhones,
              propertyAddress: truliaListing.address || address,
              source: 'supabase_trulia'
            })
          } else {
            console.log('⚠️ Trulia listing not found in Supabase, will try Atom API')
          }
        } catch (supabaseError) {
          console.warn('⚠️ Error checking Supabase for Trulia data:', supabaseError)
          // Continue to Atom API fallback
        }
      }
    }

    // Check Supabase for Zillow FSBO listings (if source is zillow-fsbo)
    if (source === 'zillow-fsbo') {
      const dbClient = supabaseAdmin || supabase
      if (dbClient) {
        try {
          console.log('📥 Checking Supabase zillow_fsbo_listings table for owner data...')
          
          let query = dbClient
            .from('zillow_fsbo_listings')
            .select('phone_number, address, detail_url')
          
          if (listingLink) {
            query = query.eq('detail_url', listingLink)
          } else {
            // Try multiple address matching strategies
            // First try exact match
            query = query.ilike('address', `%${address}%`)
          }
          
          let { data: fsboListing, error: fsboError } = await query.maybeSingle()
          
          // If no match and we have an address, try more flexible matching
          if ((fsboError || !fsboListing) && address && !listingLink) {
            console.log('   ⚠️ Initial query failed, trying flexible address matching...')
            // Extract street number and name for better matching
            const addressParts = address.split(',').map(p => p.trim())
            const streetAddress = addressParts[0] || address
            const streetNumberMatch = streetAddress.match(/^(\d+)/)
            const streetNumber = streetNumberMatch ? streetNumberMatch[1] : null
            
            if (streetNumber) {
              // Try matching by street number + partial street name
              const { data: flexibleMatch, error: flexibleError } = await dbClient
                .from('zillow_fsbo_listings')
                .select('phone_number, address, detail_url')
                .ilike('address', `%${streetNumber}%`)
                .limit(10)
              
              if (!flexibleError && flexibleMatch && flexibleMatch.length > 0) {
                // Find the best match
                const normalizedSearch = normalizeAddress(address)
                const bestMatch = flexibleMatch.find((listing: any) => {
                  const normalizedListing = normalizeAddress(listing.address || '')
                  return normalizedListing.includes(normalizedSearch) || normalizedSearch.includes(normalizedListing)
                })
                if (bestMatch) {
                  fsboListing = bestMatch
                  fsboError = null
                  console.log('   ✅ Found match using flexible address matching')
                }
              }
            }
          }
          
          if (!fsboError && fsboListing) {
            console.log('✅ Found Zillow FSBO listing in Supabase with owner data')
            console.log('   📞 phone_number value:', fsboListing.phone_number)
            
            // Parse phone_number only (this is the only column that exists)
            const parsePhones = (phoneNumber: any): string[] => {
              const phones: string[] = []
              
              if (phoneNumber !== null && phoneNumber !== undefined) {
                const phoneStr = String(phoneNumber).trim()
                if (phoneStr && phoneStr !== '' && phoneStr !== 'null' && phoneStr !== 'no data' && phoneStr !== 'NULL' && phoneStr.toLowerCase() !== 'none') {
                  // Check if it looks like a phone number (has digits)
                  if (/[\d]/.test(phoneStr)) {
                    phones.push(phoneStr)
                  }
                }
              }
              
              // Remove duplicates and filter out invalid entries
              return phones.filter((p: string) => {
                const trimmed = p.trim()
                return trimmed && trimmed.length > 0 && trimmed !== 'null' && trimmed !== 'NULL' && /[\d-]/.test(trimmed)
              })
            }
            
            const allPhones = parsePhones(fsboListing.phone_number)
            
            console.log('   📞 Parsed phones:', allPhones)
            
            if (allPhones.length === 0) {
              console.warn('   ⚠️ WARNING: No phone numbers found in listing!')
              console.warn('      phone_number column:', fsboListing.phone_number)
            }
            
            return NextResponse.json({
              ownerName: null,  // Not available in zillow_fsbo_listings table
              mailingAddress: null,  // Not available in zillow_fsbo_listings table
              email: null,  // Not available in zillow_fsbo_listings table
              phone: allPhones.length > 0 ? allPhones[0] : null,
              allEmails: [],
              allPhones: allPhones,
              propertyAddress: fsboListing.address || address,
              source: 'supabase_zillow_fsbo'
            })
          } else {
            if (fsboError) {
              console.error('   ❌ Error querying zillow_fsbo_listings:', fsboError)
            } else {
              console.log('⚠️ Zillow FSBO listing not found in Supabase, will try Atom API')
            }
          }
        } catch (supabaseError) {
          console.warn('⚠️ Error checking Supabase for Zillow FSBO data:', supabaseError)
          // Continue to Atom API fallback
        }
      }
    }

    // Check Supabase for Zillow FRBO listings (if source is zillow-frbo)
    if (source === 'zillow-frbo') {
      const dbClient = supabaseAdmin || supabase
      if (dbClient) {
        try {
          console.log('📥 Checking Supabase zillow_frbo_listings table for owner data...')
          
          let query = dbClient
            .from('zillow_frbo_listings')
            .select('phone_number, address, url')
          
          if (listingLink) {
            query = query.eq('url', listingLink)
          } else {
            query = query.ilike('address', `%${address}%`)
          }
          
          let { data: frboListing, error: frboError } = await query.maybeSingle()
          
          // If no match and we have an address, try more flexible matching
          if ((frboError || !frboListing) && address && !listingLink) {
            console.log('   ⚠️ Initial query failed, trying flexible address matching...')
            const addressParts = address.split(',').map(p => p.trim())
            const streetAddress = addressParts[0] || address
            const streetNumberMatch = streetAddress.match(/^(\d+)/)
            const streetNumber = streetNumberMatch ? streetNumberMatch[1] : null
            
            if (streetNumber) {
              const { data: flexibleMatch, error: flexibleError } = await dbClient
                .from('zillow_frbo_listings')
                .select('phone_number, address, url')
                .ilike('address', `%${streetNumber}%`)
                .limit(10)
              
              if (!flexibleError && flexibleMatch && flexibleMatch.length > 0) {
                const normalizedSearch = normalizeAddress(address)
                const bestMatch = flexibleMatch.find((listing: any) => {
                  const normalizedListing = normalizeAddress(listing.address || '')
                  return normalizedListing.includes(normalizedSearch) || normalizedSearch.includes(normalizedListing)
                })
                if (bestMatch) {
                  frboListing = bestMatch
                  frboError = null
                  console.log('   ✅ Found match using flexible address matching')
                }
              }
            }
          }
          
          if (!frboError && frboListing) {
            console.log('✅ Found Zillow FRBO listing in Supabase with owner data')
            console.log('   📞 phone_number value:', frboListing.phone_number)
            
            // Parse phone_number only (this is the only column that exists)
            const parsePhones = (phoneNumber: any): string[] => {
              const phones: string[] = []
              
              if (phoneNumber !== null && phoneNumber !== undefined) {
                const phoneStr = String(phoneNumber).trim()
                if (phoneStr && phoneStr !== '' && phoneStr !== 'null' && phoneStr !== 'no data' && phoneStr !== 'NULL' && phoneStr.toLowerCase() !== 'none') {
                  // Check if it looks like a phone number (has digits)
                  if (/[\d]/.test(phoneStr)) {
                    phones.push(phoneStr)
                  }
                }
              }
              
              // Remove duplicates and filter out invalid entries
              return phones.filter((p: string) => {
                const trimmed = p.trim()
                return trimmed && trimmed.length > 0 && trimmed !== 'null' && trimmed !== 'NULL' && /[\d-]/.test(trimmed)
              })
            }
            
            const allPhones = parsePhones(frboListing.phone_number)
            
            console.log('   📞 Parsed phones:', allPhones)
            
            if (allPhones.length === 0) {
              console.warn('   ⚠️ WARNING: No phone numbers found in listing!')
              console.warn('      phone_number column:', frboListing.phone_number)
            }
            
            return NextResponse.json({
              ownerName: null,  // Not available in zillow_frbo_listings table
              mailingAddress: null,  // Not available in zillow_frbo_listings table
              email: null,  // Not available in zillow_frbo_listings table
              phone: allPhones.length > 0 ? allPhones[0] : null,
              allEmails: [],
              allPhones: allPhones,
              propertyAddress: frboListing.address || address,
              source: 'supabase_zillow_frbo'
            })
          } else {
            if (frboError) {
              console.error('   ❌ Error querying zillow_frbo_listings:', frboError)
            } else {
              console.log('⚠️ Zillow FRBO listing not found in Supabase, will try Atom API')
            }
          }
        } catch (supabaseError) {
          console.warn('⚠️ Error checking Supabase for Zillow FRBO data:', supabaseError)
          // Continue to Atom API fallback
        }
      }
    }

    // Check Supabase for Hotpads listings (if source is hotpads)
    if (source === 'hotpads') {
      const dbClient = supabaseAdmin || supabase
      if (dbClient) {
        try {
          console.log('📥 Checking Supabase hotpads_listings table for owner data...')
          
          let query = dbClient
            .from('hotpads_listings')
            .select('phone_number, email, address, url')
          
          if (listingLink) {
            query = query.eq('url', listingLink)
          } else {
            query = query.ilike('address', `%${address}%`)
          }
          
          let { data: hotpadsListing, error: hotpadsError } = await query.maybeSingle()
          
          // If no match and we have an address, try more flexible matching
          if ((hotpadsError || !hotpadsListing) && address && !listingLink) {
            console.log('   ⚠️ Initial query failed, trying flexible address matching...')
            const addressParts = address.split(',').map(p => p.trim())
            const streetAddress = addressParts[0] || address
            const streetNumberMatch = streetAddress.match(/^(\d+)/)
            const streetNumber = streetNumberMatch ? streetNumberMatch[1] : null
            
            if (streetNumber) {
              const { data: flexibleMatch, error: flexibleError } = await dbClient
                .from('hotpads_listings')
                .select('phone_number, email, address, url')
                .ilike('address', `%${streetNumber}%`)
                .limit(10)
              
              if (!flexibleError && flexibleMatch && flexibleMatch.length > 0) {
                const normalizedSearch = normalizeAddress(address)
                const bestMatch = flexibleMatch.find((listing: any) => {
                  const normalizedListing = normalizeAddress(listing.address || '')
                  return normalizedListing.includes(normalizedSearch) || normalizedSearch.includes(normalizedListing)
                })
                if (bestMatch) {
                  hotpadsListing = bestMatch
                  hotpadsError = null
                  console.log('   ✅ Found match using flexible address matching')
                }
              }
            }
          }
          
          if (!hotpadsError && hotpadsListing) {
            console.log('✅ Found Hotpads listing in Supabase with owner data')
            console.log('   📞 phone_number value:', hotpadsListing.phone_number)
            console.log('   📧 email value:', hotpadsListing.email)
            
            // Parse phone_number only (this is the only phone column that exists)
            const parsePhones = (phoneNumber: any): string[] => {
              const phones: string[] = []
              
              if (phoneNumber !== null && phoneNumber !== undefined) {
                const phoneStr = String(phoneNumber).trim()
                if (phoneStr && phoneStr !== '' && phoneStr !== 'null' && phoneStr !== 'no data' && phoneStr !== 'NULL' && phoneStr.toLowerCase() !== 'none') {
                  // Check if it looks like a phone number (has digits)
                  if (/[\d]/.test(phoneStr)) {
                    phones.push(phoneStr)
                  }
                }
              }
              
              // Remove duplicates and filter out invalid entries
              return phones.filter((p: string) => {
                const trimmed = p.trim()
                return trimmed && trimmed.length > 0 && trimmed !== 'null' && trimmed !== 'NULL' && /[\d-]/.test(trimmed)
              })
            }
            
            // Parse email (singular, not emails)
            const parseEmails = (emailData: any): string[] => {
              const emails: string[] = []
              
              if (emailData !== null && emailData !== undefined) {
                const emailStr = String(emailData).trim()
                if (emailStr && emailStr !== '' && emailStr !== 'null' && emailStr !== 'no data' && emailStr !== 'NULL' && emailStr.toLowerCase() !== 'none') {
                  // Check if it looks like an email (has @)
                  if (emailStr.includes('@')) {
                    emails.push(emailStr)
                  }
                }
              }
              
              return emails.filter((e: string) => e && e.includes('@'))
            }
            
            const allPhones = parsePhones(hotpadsListing.phone_number)
            const allEmails = parseEmails(hotpadsListing.email)
            
            console.log('   📞 Parsed phones:', allPhones)
            console.log('   📧 Parsed emails:', allEmails)
            
            if (allPhones.length === 0) {
              console.warn('   ⚠️ WARNING: No phone numbers found in listing!')
              console.warn('      phone_number column:', hotpadsListing.phone_number)
            }
            
            return NextResponse.json({
              ownerName: null,  // Not available in hotpads_listings table
              mailingAddress: null,  // Not available in hotpads_listings table
              email: allEmails.length > 0 ? allEmails[0] : null,
              phone: allPhones.length > 0 ? allPhones[0] : null,
              allEmails: allEmails,
              allPhones: allPhones,
              propertyAddress: hotpadsListing.address || address,
              source: 'supabase_hotpads'
            })
          } else {
            if (hotpadsError) {
              console.error('   ❌ Error querying hotpads_listings:', hotpadsError)
            } else {
              console.log('⚠️ Hotpads listing not found in Supabase, will try Atom API')
            }
          }
        } catch (supabaseError) {
          console.warn('⚠️ Error checking Supabase for Hotpads data:', supabaseError)
          // Continue to Atom API fallback
        }
      }
    }

    // Atom Data API call to get property owner information
    // Using property expanded profile endpoint to find property by address
    // Format: address1=street address&address2=city,state zip
    const apiUrl = `${ATOM_API_BASE_URL}/property/expandedprofile`
    
    // Parse address - format can be:
    // Space-separated: "Street Address City State ZIP"
    // Comma-separated: "Street Address, City, State, ZIP" (common in Redfin/Trulia)
    // Examples:
    // "1229 North Austin Boulevard Chicago Il 60651"
    // "3066 Timber Hill Ln, Aurora, IL, 60504" (Redfin format)
    // "4800 S Lake Park 2107 Chicago Il 60615" (with apartment)
    // We need to split into: address1 (street) and address2 (city, state zip)
    // Atom API expects: address1="Street" and address2="City, State ZIP"
    
    let address1 = address.trim()
    let address2 = ''
    
    // Normalize address - remove extra spaces
    address1 = address1.replace(/\s+/g, ' ')
    
    // Check if address is comma-separated (common in Redfin/Trulia CSV format)
    // Format: "Street Address, City, State, ZIP"
    if (address.includes(',')) {
      const commaParts = address.split(',').map(part => part.trim()).filter(part => part)
      
      if (commaParts.length >= 3) {
        // Extract street address (first part)
        address1 = commaParts[0]
        
        // Extract city (second part)
        const city = commaParts[1]
        
        // Extract state and ZIP (third part and beyond)
        // Handle cases like "IL, 60504" or "IL 60504" or just "IL"
        let state = ''
        let zip = ''
        
        if (commaParts.length >= 4) {
          // Format: "Street, City, State, ZIP"
          state = commaParts[2].toUpperCase()
          zip = commaParts[3]
        } else if (commaParts.length === 3) {
          // Format: "Street, City, State ZIP" or "Street, City, State"
          const stateZipPart = commaParts[2]
          const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5})?$/)
          if (stateZipMatch) {
            state = stateZipMatch[1].toUpperCase()
            zip = stateZipMatch[2] || ''
          } else {
            // Try to extract state and zip separately
            const parts = stateZipPart.split(/\s+/)
            if (parts.length >= 2) {
              state = parts[0].toUpperCase()
              zip = parts[1]
            } else {
              state = stateZipPart.toUpperCase()
            }
          }
        }
        
        // Format address2 as "City, State ZIP"
        if (zip) {
          address2 = `${city}, ${state} ${zip}`.trim()
        } else {
          address2 = `${city}, ${state}`.trim()
        }
      }
    }
    
    // Normalize ordinal numbers (1St, 2Nd, 3Rd, 4Th, etc.) to standard format
    // Atom Data API expects: "63rd" or "63 RD" format, not "63Rd"
    // Handle various formats: "63Rd", "63rd", "63RD", "63 RD"
    address1 = address1.replace(/(\d+)(St|Nd|Rd|Th)\b/gi, (match, num, suffix) => {
      // Convert to lowercase ordinal: "63Rd" -> "63rd", "63RD" -> "63rd"
      return num + suffix.toLowerCase()
    })
    
    // Also normalize "63 RD" (with space) to "63rd" (no space)
    address1 = address1.replace(/(\d+)\s+(St|Nd|Rd|Th)\b/gi, (match, num, suffix) => {
      return num + suffix.toLowerCase()
    })
    
    // Normalize street abbreviations for better ATTOM matching
    // Common abbreviations that ATTOM might expect
    const streetAbbr = {
      'Avenue': 'Ave',
      'Street': 'St',
      'Road': 'Rd',
      'Boulevard': 'Blvd',
      'Drive': 'Dr',
      'Lane': 'Ln',
      'Court': 'Ct',
      'Place': 'Pl',
      'Circle': 'Cir',
      'Parkway': 'Pkwy'
    }
    
    // Try to normalize street type if it's a full word
    for (const [full, abbr] of Object.entries(streetAbbr)) {
      const regex = new RegExp(`\\b${full}\\b`, 'gi')
      address1 = address1.replace(regex, abbr)
    }
    
    const addressParts = address1.split(/\s+/)
    
    // Find ZIP code (5 digits) - it's usually the last part
    let zipIndex = -1
    for (let i = addressParts.length - 1; i >= 0; i--) {
      if (/^\d{5}$/.test(addressParts[i])) {
        zipIndex = i
        break
      }
    }
    
    if (zipIndex >= 2) {
      // We found ZIP, now find state (should be before ZIP)
      // Format: "... City State ZIP"
      // Example: "... Chicago Il 60651"
      // zipIndex points to ZIP, zipIndex-1 points to State, zipIndex-2 points to City
      const zip = addressParts[zipIndex]
      const state = addressParts[zipIndex - 1]
      const cityIndex = zipIndex - 2
      
      if (cityIndex >= 0) {
        // Extract street address (everything before city)
        // This includes apartment/unit numbers if present
        address1 = addressParts.slice(0, cityIndex).join(' ')
        
        // Extract city, state, zip and format as "City, State ZIP"
        const city = addressParts[cityIndex]
        // Normalize state to uppercase (Il -> IL, IL -> IL)
        const normalizedState = state.toUpperCase()
        address2 = `${city}, ${normalizedState} ${zip}`
      }
    }
    
    // If comma-separated parsing didn't work or address2 is empty, try space-separated parsing
    if (!address2 || address1 === address) {
      // Try case-insensitive search for Chicago
      const chicagoRegex = /\bchicago\b/i
      const chicagoMatch = address.match(chicagoRegex)
      
      if (chicagoMatch && chicagoMatch.index && chicagoMatch.index > 0) {
        const chicagoIndex = chicagoMatch.index
        address1 = address.substring(0, chicagoIndex).trim()
        const remaining = address.substring(chicagoIndex).trim()
        
        // Try to format remaining as "City, State ZIP"
        const remainingParts = remaining.split(/\s+/)
        if (remainingParts.length >= 3) {
          // Format: "Chicago Il 60651" -> "Chicago, IL 60651"
          const city = remainingParts[0]
          const state = remainingParts[1].toUpperCase()
          const zip = remainingParts[2] || ''
          address2 = `${city}, ${state} ${zip}`.trim()
        } else if (remainingParts.length >= 2) {
          // Format: "Chicago Il" -> "Chicago, IL" (no ZIP)
          const city = remainingParts[0]
          const state = remainingParts[1].toUpperCase()
          address2 = `${city}, ${state}`
        } else {
          address2 = remaining
        }
      } else {
        // Final fallback - try to extract any city name
        // Look for common patterns: "City State ZIP" or "City State"
        const cityStateZipPattern = /\b([A-Z][a-z]+)\s+([A-Z]{2})\s+(\d{5})\b/
        const match = address.match(cityStateZipPattern)
        
        if (match) {
          const city = match[1]
          const state = match[2]
          const zip = match[3]
          const cityStart = address.indexOf(city)
          
          if (cityStart > 0) {
            address1 = address.substring(0, cityStart).trim()
            address2 = `${city}, ${state} ${zip}`
          } else {
            // If city is at start, try to extract from address parts
            const addressParts = address.split(/\s+/)
            if (addressParts.length >= 3) {
              const possibleCity = addressParts[0]
              const possibleState = addressParts[1]
              const possibleZip = addressParts[2]
              if (/^[A-Z]{2}$/.test(possibleState) && /^\d{5}$/.test(possibleZip)) {
                address1 = address
                address2 = `${possibleCity}, ${possibleState} ${possibleZip}`
              } else {
                address1 = address
                address2 = `${possibleCity}, ${possibleState}`
              }
            } else {
              address1 = address
              address2 = ''
            }
          }
        } else {
          // Try to extract state and zip from end
          const addressParts = address.split(/\s+/)
          if (addressParts.length >= 2) {
            const possibleState = addressParts[addressParts.length - 2]
            const possibleZip = addressParts[addressParts.length - 1]
            if (/^[A-Z]{2}$/.test(possibleState) && /^\d{5}$/.test(possibleZip)) {
              address1 = addressParts.slice(0, -2).join(' ')
              if (addressParts.length >= 3) {
                const city = addressParts[addressParts.length - 3]
                address2 = `${city}, ${possibleState} ${possibleZip}`
              } else {
                address2 = `${possibleState} ${possibleZip}`
              }
            } else {
              address1 = address
              address2 = ''
            }
          } else {
            address1 = address
            address2 = ''
          }
        }
      }
    }
    
    // Final validation and cleanup
    if (!address1 || address1.length < 5) {
      // If address1 is too short, use full address
      address1 = address
    }
    
    // Only use default if we absolutely cannot determine city/state
    // Try one more time to extract from comma-separated format
    if (!address2 || address2.trim() === '') {
      const lastAttempt = address.match(/([^,]+),\s*([^,]+),\s*([A-Z]{2})(?:,\s*(\d{5}))?/i)
      if (lastAttempt) {
        address1 = lastAttempt[1].trim()
        const city = lastAttempt[2].trim()
        const state = lastAttempt[3].toUpperCase()
        const zip = lastAttempt[4] || ''
        address2 = zip ? `${city}, ${state} ${zip}` : `${city}, ${state}`
      } else {
        // Only as absolute last resort for addresses we truly can't parse
        address2 = 'Chicago, IL'
      }
    }

    const addressParams = new URLSearchParams({
      address1: address1,
      address2: address2,
    })

    // Validate that we have both parameters
    if (!address1 || !address2) {
      return NextResponse.json(
        { 
          error: 'Failed to parse address. Both address1 and address2 are required.',
          details: { original: address, parsed: { address1, address2 } }
        },
        { status: 400 }
      )
    }

    // Build full URL with parameters
    const fullUrl = `${apiUrl}?${addressParams.toString()}`

    // Atom Data API might accept different header formats
    // Try with 'apikey' header first (standard format)
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'apikey': atomApiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })
    
    // Request/response details logged only on error

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Atom API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorText,
        requestAddress: address,
        parsedAddress: { address1, address2 }
      })
      
      // Try to parse error as JSON or XML
      let errorDetails: any = errorText
      let errorMessage = 'Failed to fetch owner information from Atom Data API'
      let errorJson: any = null
      
      // Try JSON first
      try {
        errorJson = JSON.parse(errorText)
        errorDetails = errorJson
        
        // Extract specific error message if available
        if (errorJson.status && errorJson.status.msg) {
          errorMessage = errorJson.status.msg
        } else if (errorJson.msg) {
          errorMessage = errorJson.msg
        } else if (errorJson.error) {
          errorMessage = errorJson.error
        }
        
        console.error('Atom API Error (Parsed JSON):', errorJson)
      } catch (jsonError) {
        // Not JSON, try XML parsing
        if (errorText.includes('<Response>') || errorText.includes('<response>') || errorText.includes('<?xml')) {
          console.log('Parsing XML error response')
          
          // Basic XML parsing for error messages
          const msgMatch = errorText.match(/<msg>(.*?)<\/msg>/i)
          const codeMatch = errorText.match(/<code>(.*?)<\/code>/i)
          
          if (msgMatch) {
            errorMessage = msgMatch[1].trim()
          }
          
          if (codeMatch) {
            const code = codeMatch[1].trim()
            errorJson = {
              status: {
                code: parseInt(code) || code,
                msg: errorMessage
              }
            }
            errorDetails = errorJson
          }
          
          console.error('Atom API Error (Parsed XML):', {
            code: codeMatch ? codeMatch[1] : 'N/A',
            message: errorMessage
          })
        } else {
          // Not JSON or XML, use as is
          console.error('Atom API Error (Raw text):', errorText.substring(0, 200))
        }
      }
      
      // Provide user-friendly error message
      let userMessage = errorMessage
      let httpStatus = response.status
      
      if (response.status === 400) {
        // Check if it's "SuccessWithoutResult" (property not found)
        if (errorJson && errorJson.status && errorJson.status.msg === 'SuccessWithoutResult') {
          userMessage = `Property not found in Atom Data API database.\n\nSearched for:\n• Address: ${address1}\n• City/State/ZIP: ${address2}\n\nThis property may not be available in the database. Please verify the address is correct.`
          // Return as 404 for better frontend handling
          httpStatus = 404
          console.log('Returning 404 for SuccessWithoutResult:', {
            originalAddress: address,
            parsedAddress: { address1, address2 },
            userMessage
          })
        } else {
          userMessage = `Invalid address format. Please check the property address.\n\nParsed as:\n• Address: ${address1}\n• City/State/ZIP: ${address2}`
        }
      } else if (response.status === 401) {
        userMessage = `API authentication failed (401 Unauthorized).\n\nPossible causes:\n• API key is invalid or expired\n• API key format is incorrect\n• API key permissions are insufficient\n\nPlease verify your Atom Data API key is correct and has proper permissions.`
        
        // Log API key format for debugging (without exposing full key)
        console.error('401 Unauthorized - API Key Info:', {
          keyLength: ATOM_API_KEY.length,
          keyPrefix: ATOM_API_KEY.substring(0, 10) + '...',
          headerUsed: 'apikey',
          requestUrl: fullUrl.substring(0, 100)
        })
      } else if (response.status === 404) {
        userMessage = 'Property not found in database. This property may not be available in Atom Data API.'
      } else if (response.status === 429) {
        userMessage = 'API rate limit exceeded. Please try again later.'
      }
      
      // If API fails, return a structured error
      const errorResponse = {
        error: userMessage,
        details: errorDetails,
        status: httpStatus,
        requestAddress: address,
        parsedAddress: { address1, address2 },
        requestUrl: fullUrl.substring(0, 100) + '...' // Truncate for security
      }
      
      console.log('Returning error response:', {
        httpStatus,
        errorMessage: userMessage.substring(0, 100),
        hasErrorField: true
      })
      
      return NextResponse.json(errorResponse, { status: httpStatus })
    }

    // Check content type - Atom API might return XML or JSON
    const contentType = response.headers.get('content-type') || ''
    
    // Read response as text first (so we can handle both JSON and XML)
    const responseText = await response.text()
    let data: any
    
    // Try to parse as JSON first (most common case)
    try {
      data = JSON.parse(responseText)
    } catch (jsonError) {
      // Not JSON, check if it's XML
      if (contentType.includes('xml') || responseText.trim().startsWith('<?xml') || responseText.trim().startsWith('<response>')) {
        
        // Atom API sometimes returns XML even when Accept: application/json is sent
        // This might be a configuration issue or the API might not support JSON for this endpoint
        return NextResponse.json(
          {
            error: 'Atom API returned XML format instead of JSON',
            details: 'The API response is in XML format, but this endpoint expects JSON. This might indicate:\n1. API endpoint configuration issue\n2. API key permissions\n3. API version compatibility',
            contentType: contentType,
            rawResponse: responseText.substring(0, 2000),
            suggestion: 'Please verify the API endpoint supports JSON format or check API documentation.'
          },
          { status: 500 }
        )
      } else {
        // Unknown format
        console.error('Failed to parse response - unknown format:', responseText.substring(0, 500))
        return NextResponse.json(
          {
            error: 'Unable to parse API response',
            details: 'The API returned an unexpected format. Expected JSON but received unknown format.',
            contentType: contentType,
            rawResponse: responseText.substring(0, 2000)
          },
          { status: 500 }
        )
      }
    }
    
    // Check if API returned "SuccessWithoutResult" (property not found)
    if (data.status && data.status.msg === 'SuccessWithoutResult' && data.status.total === 0) {
      // Even if ATTOM doesn't find the property, we can still try Melissa Personator
      // with just the property address - sometimes Melissa has data ATTOM doesn't
      let melissaEmail = null
      let melissaPhone = null
      
      try {
        // Try Melissa with just the address (no owner name)
        // Some Melissa APIs can do reverse address lookup
        const melissaData = await fetchMelissaPersonatorData(
          null, // No owner name available
          address // Use property address as mailing address
        )
        
        if (melissaData.success && (melissaData.email || melissaData.phone)) {
          melissaEmail = melissaData.email
          melissaPhone = melissaData.phone
        }
      } catch (melissaError: any) {
        // Silent - expected if no data available
      }
      
      // Return response with whatever data we have (even if just from Melissa)
      return NextResponse.json(
        {
          ownerName: null,
          mailingAddress: null,
          email: melissaEmail,
          phone: melissaPhone,
          propertyAddress: address,
          error: 'Property not found in Atom Data API database',
          details: 'This property may not be available in the database, or the address format may need adjustment.',
          status: 404,
          requestAddress: address,
          parsedAddress: { address1, address2 },
          apiResponse: data.status,
          note: melissaEmail || melissaPhone ? 'Some contact information found via Melissa Personator API' : null
        },
        { status: 404 }
      )
    }
    
    // Check if response has any data
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      console.warn('⚠️ Atom API returned empty response')
    }

    // Extract owner information from the response
    // Atom Data API response structure may vary, so we'll handle different formats
    let ownerInfo = {
      ownerName: null as string | null,
      mailingAddress: null as string | null,
      email: null as string | null,
      phone: null as string | null,
      propertyAddress: address,
      rawData: data,
    }

    // Helper function to extract owner name from various structures
    const extractOwnerName = (property: any): string | null => {
      // Try multiple paths for owner name
      // Atom Data API structure: property.assessment.owner.owner1.fullName
      const paths = [
        // Atom Data API standard structure
        property?.assessment?.owner?.owner1?.fullName,
        property?.assessment?.owner?.owner1?.name,
        property?.assessment?.owner?.owner1?.firstNameAndMi && property?.assessment?.owner?.owner1?.lastName
          ? `${property.assessment.owner.owner1.firstNameAndMi} ${property.assessment.owner.owner1.lastName}`.trim()
          : null,
        // Alternative structures
        property?.owner?.name,
        property?.owner?.owner1?.name,
        property?.owner?.owner1?.fullName,
        property?.owner1?.name,
        property?.owner1?.fullName,
        property?.owner?.fullName,
        property?.owner?.firstName && property?.owner?.lastName 
          ? `${property.owner.firstName} ${property.owner.lastName}`.trim()
          : null,
        property?.owner1?.firstName && property?.owner1?.lastName 
          ? `${property.owner1.firstName} ${property.owner1.lastName}`.trim()
          : null,
      ]
      
      for (const name of paths) {
        if (name && typeof name === 'string' && name.trim() && 
            name !== 'null' && name !== 'None' && 
            !name.includes('NOT AVAILABLE') && 
            !name.includes('AVAILABLE FROM DATA SOURCE')) {
          return name.trim()
        }
      }
      return null
    }

    // Helper function to extract mailing address
    const extractMailingAddress = (property: any): string | null => {
      // Atom Data API structure: property.assessment.owner.mailingAddressOneLine
      // Or property.assessment.owner.mailingAddress object
      
      // First try mailingAddressOneLine (single line format)
      const oneLinePaths = [
        property?.assessment?.owner?.mailingAddressOneLine,
        property?.owner?.mailingAddressOneLine,
        property?.mailingAddressOneLine,
      ]
      
      for (const oneLine of oneLinePaths) {
        if (oneLine && typeof oneLine === 'string' && oneLine.trim() && oneLine !== '') {
          return oneLine.trim()
        }
      }
      
      // Then try mailingAddress object
      const mailAddrPaths = [
        property?.assessment?.owner?.mailingAddress,
        property?.owner?.mailingAddress,
        property?.owner?.owner1?.mailingAddress,
        property?.owner1?.mailingAddress,
        property?.mailingAddress,
      ]
      
      for (const mailAddr of mailAddrPaths) {
        if (mailAddr && typeof mailAddr === 'object') {
          const parts = [
            mailAddr.address1,
            mailAddr.addressOne,
            mailAddr.line1,
            mailAddr.street,
            mailAddr.city,
            mailAddr.locality,
            mailAddr.state,
            mailAddr.stateFips,
            mailAddr.zip,
            mailAddr.zipCode,
            mailAddr.postal1,
            mailAddr.postalCode,
          ].filter(Boolean)
          
          if (parts.length > 0) {
            return parts.join(', ')
          }
        }
      }
      return null
    }

    // FIRST: ALWAYS try to get email/phone from Supabase FIRST (before ATTOM API processing)
    // Use admin client for server-side queries (bypasses RLS if needed)
    // Reuse dbClient that was already declared above (line 105)
    if (dbClient) {
      try {
        console.log(`\n🔍 [OWNER-INFO] Fetching email/phone from Supabase for: "${address}"`)
        console.log(`   Using: ${supabaseAdmin ? 'Admin client' : 'Regular client'}`)
        
        // TEST: First, let's see if we can query ANY listing with emails/phones
        const { data: testQuery, error: testError } = await dbClient
          .from('listings')
          .select('id, address, owner_emails, owner_phones')
          .not('owner_emails', 'is', null)
          .limit(1)
        
        if (testError) {
          console.error(`   ❌ TEST QUERY FAILED: ${testError.message}`)
          console.error(`   Error code: ${testError.code}`)
          console.error(`   Error details:`, JSON.stringify(testError))
        } else if (testQuery && testQuery.length > 0) {
          console.log(`   ✅ TEST QUERY SUCCESS: Found ${testQuery.length} listing(s) with emails`)
          const testListing = testQuery[0]
          const emailCount = Array.isArray(testListing.owner_emails) ? testListing.owner_emails.length : 0
          const phoneCount = Array.isArray(testListing.owner_phones) ? testListing.owner_phones.length : 0
          console.log(`   Sample: "${testListing.address}" has ${emailCount} emails, ${phoneCount} phones`)
        } else {
          console.log(`   ⚠️ TEST QUERY: No listings with emails found in database`)
        }
        
        // Extract street number and first word of street name
        // Examples: 
        //   "8232 W Agatite Avenue Norridge Il 60706" -> number: "8232", street: "agatite"
        //   "901 Harrison Street Park Ridge IL 60068" -> number: "901", street: "harrison"
        const addressLower = address.toLowerCase().trim()
        const numberMatch = addressLower.match(/^(\d+)/)
        const streetNumber = numberMatch ? numberMatch[1] : ''
        
        // Extract first word of street name (after number and optional direction)
        // Handle "West" -> "W", "North" -> "N", etc.
        const streetNameMatch = addressLower.match(/^\d+\s+(?:west|w|north|n|south|s|east|e)\s+([a-z]+)/) || 
                                addressLower.match(/^\d+\s+([a-z]+)/)
        const streetName = streetNameMatch ? streetNameMatch[1] : ''
        
        // Also normalize street type abbreviations for better matching
        // "Avenue" -> "Ave", "Street" -> "St", etc.
        const normalizedStreetName = streetName
          ? streetName
              .replace(/avenue|ave/g, 'ave')
              .replace(/street|st/g, 'st')
              .replace(/road|rd/g, 'rd')
              .replace(/drive|dr/g, 'dr')
              .replace(/boulevard|blvd/g, 'blvd')
              .replace(/lane|ln/g, 'ln')
              .replace(/place|pl/g, 'pl')
              .replace(/court|ct/g, 'ct')
              .replace(/circle|cir/g, 'cir')
          : ''
        
        console.log(`   Extracted: number="${streetNumber}", street="${streetName}", normalized="${normalizedStreetName}"`)
        
        if (!streetNumber) {
          console.log(`   ⚠️ Could not extract street number from address`)
        }
        
        // FIRST: Try to match by listing_link if provided (most reliable)
        let listingData: any = null
        let supabaseError: any = null
        
        // Determine which table to query based on source
        const tableName = (source === 'redfin') ? 'redfin_listings' : 'listings'
        const emailColumn = (source === 'redfin') ? 'emails' : 'owner_emails'
        const phoneColumn = (source === 'redfin') ? 'phones' : 'owner_phones'
        
        if (listingLink) {
          console.log(`   [Strategy 0] Trying to match by listing_link: "${listingLink}" in table: ${tableName}`)
          const { data: linkMatch, error: linkError } = await dbClient
            .from(tableName)
            .select(`address, ${emailColumn}, ${phoneColumn}, listing_link, owner_name, mailing_address`)
            .eq('listing_link', listingLink)
            .maybeSingle()
          
          if (!linkError && linkMatch) {
            listingData = linkMatch
            console.log(`   ✅✅✅ MATCHED BY LISTING_LINK!`)
            console.log(`   Database address: "${linkMatch.address}"`)
          } else {
            console.log(`   ⚠️ No match by listing_link in ${tableName}`)
          }
        }
        
        // SECOND: If no listing_link match, query ALL listings and match by address
        if (!listingData) {
          console.log(`   [Strategy 1] Querying ALL listings from ${tableName}...`)
          // Query all listings (don't filter by emails/phones - we want to match by address)
          let { data: allListings, error: queryError } = await dbClient
            .from(tableName)
            .select(`address, ${emailColumn}, ${phoneColumn}, listing_link, owner_name, mailing_address`)
          
          // If that fails, try with limit
          if (queryError) {
            console.log(`   ⚠️ First query failed, trying with limit...`)
            const result = await dbClient
              .from(tableName)
              .select(`address, ${emailColumn}, ${phoneColumn}, listing_link, owner_name, mailing_address`)
              .limit(1000)
            
            allListings = result.data
            queryError = result.error
          }
          
          supabaseError = queryError
          
          if (queryError) {
            console.error(`   ❌ Error querying Supabase: ${queryError.message}`)
            console.error(`   Error details:`, JSON.stringify(queryError))
          } else if (allListings && allListings.length > 0) {
            console.log(`   ✅ Found ${allListings.length} listings with emails/phones in database`)
            
            // Find the best match by street number (required) + street name
            let bestMatch: any = null
            let bestScore = 0
            
            for (const listing of allListings) {
            const listingAddr = (listing.address || '').toLowerCase()
            
            // Calculate match score
            let score = 0
            
            // Street number MUST match (required)
            if (streetNumber && listingAddr.includes(streetNumber)) {
              score += 50 // High weight for street number
            } else {
              continue // Skip if street number doesn't match
            }
            
            // Street name match (bonus) - also check normalized version
            const listingAddrNormalized = listingAddr
              .replace(/west|w\b/g, 'w')
              .replace(/north|n\b/g, 'n')
              .replace(/south|s\b/g, 's')
              .replace(/east|e\b/g, 'e')
              .replace(/avenue|ave/g, 'ave')
              .replace(/street|st\b/g, 'st')
              .replace(/road|rd\b/g, 'rd')
              .replace(/drive|dr\b/g, 'dr')
              .replace(/boulevard|blvd/g, 'blvd')
              .replace(/lane|ln\b/g, 'ln')
              .replace(/place|pl\b/g, 'pl')
              .replace(/court|ct\b/g, 'ct')
              .replace(/circle|cir\b/g, 'cir')
            
            if (streetName && (listingAddr.includes(streetName) || listingAddrNormalized.includes(normalizedStreetName))) {
              score += 30
            }
            
            // Check if more words match (bonus)
            const searchWords = addressLower.split(/\s+/).filter(w => 
              w.length > 2 && 
              !['w', 'n', 's', 'e', 'il', 'illinois', 'st', 'street', 'ave', 'avenue', 'rd', 'road', 'dr', 'drive'].includes(w)
            )
            const listingWords = listingAddr.split(/\s+/).filter((w: string) => w.length > 2)
            const matchingWords = searchWords.filter((w: string) => listingWords.includes(w))
            score += matchingWords.length * 5
            
            if (score > bestScore) {
              bestScore = score
              bestMatch = listing
            }
          }
          
          if (bestMatch && bestScore >= 50) { // At least street number must match
            listingData = bestMatch
            console.log(`   ✅✅✅ MATCH FOUND! Score: ${bestScore}`)
            console.log(`   Search address: "${address}"`)
            console.log(`   Database address: "${bestMatch.address}"`)
          } else {
            console.log(`   ⚠️ No match found (best score: ${bestScore}, need >= 50)`)
            if (allListings.length > 0) {
              console.log(`   Sample addresses in DB (first 5):`)
              allListings.slice(0, 5).forEach((l: any, i: number) => {
                console.log(`     ${i + 1}. "${l.address}"`)
              })
            }
          }
          } else {
            console.log(`   ⚠️ No listings with emails/phones found in database`)
          }
        }
        
        // Use bestMatch if found (already set above if match found)
        
        if (!supabaseError && listingData) {
          console.log(`✅ Found listing in Supabase with address: "${listingData.address}"`)
          
          // For Redfin, also set owner_name and mailing_address from database
          if (source === 'redfin' && listingData.owner_name) {
            ownerInfo.ownerName = listingData.owner_name
          }
          if (source === 'redfin' && listingData.mailing_address) {
            ownerInfo.mailingAddress = listingData.mailing_address
          }
          
          // Parse emails and phones - handle both JSONB arrays and text strings
          let emails: string[] = []
          let phones: string[] = []
          
          const emailData = listingData[emailColumn]
          const phoneData = listingData[phoneColumn]
          
          console.log(`   📧 Email data type: ${typeof emailData}, value: ${emailData ? (typeof emailData === 'string' ? emailData.substring(0, 100) : JSON.stringify(emailData).substring(0, 100)) : 'null/undefined'}`)
          console.log(`   📞 Phone data type: ${typeof phoneData}, value: ${phoneData ? (typeof phoneData === 'string' ? phoneData.substring(0, 100) : JSON.stringify(phoneData).substring(0, 100)) : 'null/undefined'}`)
          
          if (emailData !== null && emailData !== undefined && emailData !== '') {
            if (typeof emailData === 'string') {
              // For Redfin, emails might be comma/newline separated text
              if (source === 'redfin') {
                emails = emailData.split(/[,\n]/).map((e: string) => e.trim()).filter((e: string) => e && e.includes('@'))
              } else {
                try {
                  emails = JSON.parse(emailData)
                } catch (e) {
                  console.warn('Failed to parse owner_emails from Supabase:', e)
                }
              }
            } else if (Array.isArray(emailData)) {
              emails = emailData
            }
          }
          
          if (phoneData !== null && phoneData !== undefined && phoneData !== '') {
            if (typeof phoneData === 'string') {
              // For Redfin, phones might be comma/newline separated text
              if (source === 'redfin') {
                const cleaned = phoneData.replace(/Landline:\s*/gi, '').trim()
                const rawPhones = cleaned.split(/[,\n]/)
                  .map((p: string) => p.trim())
                  .filter((p: string) => p && /[\d-]/.test(p))
                
                // Format phone numbers: keep original format if it looks good, otherwise format as (XXX) XXX-XXXX
                phones = rawPhones.map((p: string) => {
                  const digitsOnly = p.replace(/\D/g, '')
                  if (digitsOnly.length === 10) {
                    // Format as (XXX) XXX-XXXX
                    return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`
                  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
                    // Format as +1 (XXX) XXX-XXXX
                    return `+1 (${digitsOnly.slice(1, 4)}) ${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`
                  } else if (digitsOnly.length >= 10) {
                    // Keep original if it's already formatted nicely, otherwise use digits
                    return p.length > 10 && /[\d\s\-\(\)]/.test(p) ? p : digitsOnly
                  }
                  return p
                }).filter((p: string) => {
                  const digitsOnly = p.replace(/\D/g, '')
                  return digitsOnly.length >= 10
                })
              } else {
                try {
                  phones = JSON.parse(phoneData)
                } catch (e) {
                  console.warn('Failed to parse owner_phones from Supabase:', e)
                }
              }
            } else if (Array.isArray(phoneData)) {
              phones = phoneData
            }
          }
          
          if (emails.length > 0 || phones.length > 0) {
            ownerInfo.email = emails.length > 0 ? emails[0] : null
            ownerInfo.phone = phones.length > 0 ? phones[0] : null
            ;(ownerInfo as any).allEmails = emails
            ;(ownerInfo as any).allPhones = phones
            console.log(`✅✅✅ Supabase Data Found: { emails: ${emails.length}, phones: ${phones.length} }`)
            console.log(`   Emails: ${JSON.stringify(emails)}`)
            console.log(`   Phones: ${JSON.stringify(phones)}`)
          } else {
            console.log(`⚠️ Supabase listing found but no email/phone data`)
            console.log(`   ${emailColumn} value: ${JSON.stringify(listingData[emailColumn])}`)
            console.log(`   ${phoneColumn} value: ${JSON.stringify(listingData[phoneColumn])}`)
            console.log(`   Raw listingData keys: ${Object.keys(listingData).join(', ')}`)
          }
        } else {
          console.log(`⚠️ No listing found in Supabase for address: "${address}"`)
          if (supabaseError) {
            console.log(`   Error: ${supabaseError.message}`)
            console.log(`   Error code: ${supabaseError.code}`)
            console.log(`   Error details: ${JSON.stringify(supabaseError)}`)
          }
        }
      } catch (supabaseErr: any) {
        console.error('❌ Error fetching from Supabase:', supabaseErr.message)
      }
    } else {
      console.warn('⚠️ Supabase client not initialized')
    }

    // Try to extract from different response structures
    let property = null
    
    if (data.property && Array.isArray(data.property) && data.property.length > 0) {
      property = data.property[0]
    } else if (data.property && typeof data.property === 'object') {
      property = data.property
    } else if (data.properties && Array.isArray(data.properties) && data.properties.length > 0) {
      property = data.properties[0]
    } else if (data.data && data.data.property) {
      property = Array.isArray(data.data.property) ? data.data.property[0] : data.data.property
    }

    if (property) {
      ownerInfo.ownerName = extractOwnerName(property)
      ownerInfo.mailingAddress = extractMailingAddress(property)
      
      // SECOND: If Supabase doesn't have data, try CSV lookup (Supabase was already checked above)
      if (!(ownerInfo as any).allEmails || (ownerInfo as any).allEmails.length === 0) {
        // First try the owner_data_lookup.json
        const csvData = lookupOwnerData(address)
        if (csvData && (csvData.emails.length > 0 || csvData.phones.length > 0)) {
          // Use first email and phone from CSV if available
          if (!ownerInfo.email) ownerInfo.email = csvData.emails.length > 0 ? csvData.emails[0] : null
          if (!ownerInfo.phone) ownerInfo.phone = csvData.phones.length > 0 ? csvData.phones[0] : null
          
          // Store all emails and phones for frontend display
          ;(ownerInfo as any).allEmails = csvData.emails
          ;(ownerInfo as any).allPhones = csvData.phones
          
          console.log(`✅ CSV Data: { emails: ${csvData.emails.length}, phones: ${csvData.phones.length} }`)
        } else if (source === 'redfin') {
          // Fallback: Read directly from redfin_listings_enriched.csv
          try {
            const csvPaths = [
              path.join(process.cwd(), 'redfin_listings_enriched.csv'),
              path.join(process.cwd(), '..', 'redfin_listings_enriched.csv'),
              path.join(process.cwd(), '..', '..', 'redfin_listings_enriched.csv'),
            ]
            
            for (const csvPath of csvPaths) {
              if (fs.existsSync(csvPath)) {
                const csvContent = fs.readFileSync(csvPath, 'utf-8')
                const csvLines = csvContent.split('\n').filter(line => line.trim())
                if (csvLines.length < 2) continue
                
                // Parse header
                const headers = csvLines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
                const addressIndex = headers.indexOf('address')
                const emailIndex = headers.indexOf('emails')
                const phoneIndex = headers.indexOf('phones')
                
                if (addressIndex === -1) continue
                
                // Find matching listing by address
                for (let i = 1; i < csvLines.length; i++) {
                  const line = csvLines[i]
                  // Simple CSV parsing (handle quoted values)
                  const values: string[] = []
                  let currentValue = ''
                  let inQuotes = false
                  
                  for (let j = 0; j < line.length; j++) {
                    const char = line[j]
                    if (char === '"') {
                      inQuotes = !inQuotes
                    } else if (char === ',' && !inQuotes) {
                      values.push(currentValue.trim().replace(/^"|"$/g, ''))
                      currentValue = ''
                    } else {
                      currentValue += char
                    }
                  }
                  values.push(currentValue.trim().replace(/^"|"$/g, ''))
                  
                  const listingAddress = values[addressIndex] || ''
                  if (listingAddress && address.toLowerCase().includes(listingAddress.toLowerCase().split(',')[0]) || 
                      listingAddress.toLowerCase().includes(address.toLowerCase().split(',')[0])) {
                    // Found matching listing
                    const emailsStr = emailIndex >= 0 ? values[emailIndex] || '' : ''
                    const phonesStr = phoneIndex >= 0 ? values[phoneIndex] || '' : ''
                    
                    if (emailsStr || phonesStr) {
                      const emails = emailsStr.split(/[,\n]/).map(e => e.trim()).filter(e => e && e.includes('@'))
                      const phones = phonesStr.split(/[,\n]/)
                        .map(p => p.replace(/Landline:\s*/gi, '').trim())
                        .filter(p => p && /[\d-]/.test(p))
                        .map(p => {
                          const digitsOnly = p.replace(/\D/g, '')
                          if (digitsOnly.length === 10) {
                            return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`
                          }
                          return p
                        })
                        .filter(p => {
                          const digitsOnly = p.replace(/\D/g, '')
                          return digitsOnly.length >= 10
                        })
                      
                      if (emails.length > 0 || phones.length > 0) {
                        if (!ownerInfo.email && emails.length > 0) ownerInfo.email = emails[0]
                        if (!ownerInfo.phone && phones.length > 0) ownerInfo.phone = phones[0]
                        ;(ownerInfo as any).allEmails = emails
                        ;(ownerInfo as any).allPhones = phones
                        console.log(`✅ Found in CSV file: { emails: ${emails.length}, phones: ${phones.length} }`)
                        break
                      }
                    }
                  }
                }
                break
              }
            }
          } catch (csvError: any) {
            console.warn('⚠️ Could not read from CSV file:', csvError.message)
          }
        }
      }
    } else {
      // Even if property not found, we might have email/phone from Supabase above
      console.log('⚠️ No property found from ATTOM API, but may have email/phone from Supabase')
    }
    
    // If we still don't have email/phone, try Melissa as final fallback
    if (((ownerInfo as any).allEmails?.length === 0 || !(ownerInfo as any).allEmails) && 
        ((ownerInfo as any).allPhones?.length === 0 || !(ownerInfo as any).allPhones) &&
        ownerInfo.ownerName && ownerInfo.mailingAddress) {
      console.log('🔍 Calling Melissa Personator API as fallback...')
      try {
        const melissaData = await fetchMelissaPersonatorData(
          ownerInfo.ownerName,
          ownerInfo.mailingAddress
        )
        
        if (melissaData.success) {
          // Only use Melissa data if we don't have any from Supabase/CSV
          if (!ownerInfo.email && melissaData.email) {
            ownerInfo.email = melissaData.email
            ;(ownerInfo as any).allEmails = [melissaData.email]
          }
          if (!ownerInfo.phone && melissaData.phone) {
            ownerInfo.phone = melissaData.phone
            ;(ownerInfo as any).allPhones = [melissaData.phone]
          }
          
          // Log result (found or not found)
          console.log('✅ Melissa Personator:', {
            email: melissaData.email ? 'Found' : 'Not found',
            phone: melissaData.phone ? 'Found' : 'Not found'
          })
        } else {
          console.error('❌ Melissa Personator API failed:', melissaData.error)
        }
      } catch (melissaError: any) {
        console.error('❌ Error calling Melissa Personator API:', melissaError.message)
      }
    }
    
    // If no data extracted, log the property structure for debugging
    if (property && !ownerInfo.ownerName && !ownerInfo.mailingAddress) {
      console.log('Property object keys:', Object.keys(property))
      console.log('Assessment owner keys:', property?.assessment?.owner ? Object.keys(property.assessment.owner) : 'N/A')
      console.log('Owner1 keys:', property?.assessment?.owner?.owner1 ? Object.keys(property.assessment.owner.owner1) : 'N/A')
      console.log('Property structure (first 1500 chars):', JSON.stringify(property, null, 2).substring(0, 1500))
    }

    // Include rawData in response for debugging (can be removed later)
    const verification = property ? {
      ownerNameValid: ownerInfo.ownerName !== null && ownerInfo.ownerName.length > 0,
      mailingAddressValid: ownerInfo.mailingAddress !== null && ownerInfo.mailingAddress.length > 0,
      rawOwnerData: {
        fullName: property?.assessment?.owner?.owner1?.fullName,
        firstNameAndMi: property?.assessment?.owner?.owner1?.firstNameAndMi,
        lastName: property?.assessment?.owner?.owner1?.lastName,
        mailingAddressOneLine: property?.assessment?.owner?.mailingAddressOneLine,
      },
      propertyAddress: property?.address?.oneLine || property?.address?.line1,
      dataSource: 'Atom Data API + Melissa Personator API',
      extractionPath: {
        ownerName: ownerInfo.ownerName ? 'property.assessment.owner.owner1.fullName' : 'not found',
        mailingAddress: ownerInfo.mailingAddress ? 'property.assessment.owner.mailingAddressOneLine' : 'not found',
        email: ownerInfo.email ? 'Melissa Personator API' : 'not found',
        phone: ownerInfo.phone ? 'Melissa Personator API' : 'not found',
      }
    } : null

    // Ensure allEmails and allPhones are always arrays
    const allEmails = (ownerInfo as any).allEmails || []
    const allPhones = (ownerInfo as any).allPhones || []
    
    // Save owner_name and mailing_address to database if we have them
    if (dbClient && (ownerInfo.ownerName || ownerInfo.mailingAddress)) {
      try {
        // Prepare update data
        const updateData: any = {}
        
        if (ownerInfo.ownerName && ownerInfo.ownerName.trim() !== '') {
          updateData.owner_name = ownerInfo.ownerName.trim()
          console.log(`\n💾 [OWNER-INFO] Saving owner_name to database: "${updateData.owner_name}"`)
        }
        
        if (ownerInfo.mailingAddress && ownerInfo.mailingAddress.trim() !== '') {
          updateData.mailing_address = ownerInfo.mailingAddress.trim()
          console.log(`💾 [OWNER-INFO] Saving mailing_address to database: "${updateData.mailing_address}"`)
        }
        
        if (Object.keys(updateData).length === 0) {
          return // Nothing to update
        }
        
        let updated = false
        
        // Try to update by listing_link first (most reliable)
        if (listingLink) {
          const { data: updateResult, error: updateError } = await dbClient
            .from('listings')
            .update(updateData)
            .eq('listing_link', listingLink)
            .select('id, owner_name, mailing_address')
          
          if (updateError) {
            console.warn(`⚠️ Failed to update by listing_link: ${updateError.message}`)
          } else if (updateResult && updateResult.length > 0) {
            console.log(`✅ Saved to database for listing_link: ${listingLink}`)
            console.log(`   Updated listing ID: ${updateResult[0].id}`)
            if (updateData.owner_name) {
              console.log(`   owner_name: ${updateResult[0].owner_name}`)
            }
            if (updateData.mailing_address) {
              console.log(`   mailing_address: ${updateResult[0].mailing_address}`)
            }
            updated = true
          } else {
            console.warn(`⚠️ No listing found with listing_link: ${listingLink}`)
          }
        }
        
        // If not updated yet, try by address
        if (!updated && address) {
          // Normalize address for matching
          const normalizedAddr = address.toLowerCase().trim().replace(/\s+/g, ' ')
          
          // Try to find and update by address
          const { data: updateResult, error: updateError } = await dbClient
            .from('listings')
            .update(updateData)
            .ilike('address', `%${normalizedAddr}%`)
            .select('id, address, owner_name, mailing_address')
            .limit(1)
          
          if (updateError) {
            console.warn(`⚠️ Failed to update by address: ${updateError.message}`)
          } else if (updateResult && updateResult.length > 0) {
            console.log(`✅ Saved to database for address: ${address}`)
            console.log(`   Updated listing ID: ${updateResult[0].id}`)
            if (updateData.owner_name) {
              console.log(`   owner_name: ${updateResult[0].owner_name}`)
            }
            if (updateData.mailing_address) {
              console.log(`   mailing_address: ${updateResult[0].mailing_address}`)
            }
            updated = true
          } else {
            console.warn(`⚠️ No listing found with address: ${address}`)
          }
        }
        
        if (!updated) {
          console.warn(`⚠️ Could not save to database - listing not found`)
        }
      } catch (saveError: any) {
        console.error(`❌ Error saving to database: ${saveError.message}`)
        console.error(`   Stack: ${saveError.stack}`)
        // Don't fail the request if save fails
      }
    }
    
    return NextResponse.json({
      ...ownerInfo,
      allEmails: Array.isArray(allEmails) ? allEmails : [],
      allPhones: Array.isArray(allPhones) ? allPhones : [],
      debug: {
        hasProperty: !!property,
        propertyKeys: property ? Object.keys(property) : [],
        responseKeys: Object.keys(data),
        extracted: {
          ownerName: ownerInfo.ownerName,
          mailingAddress: ownerInfo.mailingAddress,
          email: ownerInfo.email,
          phone: ownerInfo.phone,
          allEmailsCount: allEmails.length,
          allPhonesCount: allPhones.length
        },
        verification: verification
      }
    })
  } catch (error: any) {
    console.error('Error fetching owner info:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch owner information',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

