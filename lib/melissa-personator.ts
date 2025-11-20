/**
 * Melissa Personator Consumer API Service
 * Fetches owner email and phone number using owner name and mailing address
 * 
 * API Documentation: https://docs.melissa.com/cloud-api/personator-consumer/
 * Note: Append action requires subscription license (not available on credit licenses)
 */

interface MelissaContactVerifyResponse {
  success: boolean
  email?: string | null
  phone?: string | null
  error?: string
  rawData?: any
}

/**
 * Parse mailing address into components for Melissa API
 * Handles formats like:
 * - "123 Main St, Chicago, IL 60601-1234"
 * - "123 Main St Chicago IL 60601"
 * - "123 Main Street, Chicago, Illinois 60601"
 */
function parseMailingAddress(address: string): {
  street: string
  city: string
  state: string
  zip: string
} {
  const result = {
    street: '',
    city: '',
    state: '',
    zip: ''
  }

  if (!address) return result

  // Try to parse with comma separator first: "Street, City, State ZIP"
  const commaMatch = address.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i)
  if (commaMatch) {
    result.street = commaMatch[1].trim()
    result.city = commaMatch[2].trim()
    result.state = commaMatch[3].trim().toUpperCase()
    result.zip = commaMatch[4].trim().split('-')[0] // Remove ZIP+4 extension
    return result
  }

  // Try without comma: "Street City State ZIP"
  const spaceMatch = address.match(/^(.+?)\s+([A-Za-z\s]+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i)
  if (spaceMatch) {
    result.street = spaceMatch[1].trim()
    result.city = spaceMatch[2].trim()
    result.state = spaceMatch[3].trim().toUpperCase()
    result.zip = spaceMatch[4].trim().split('-')[0] // Remove ZIP+4 extension
    return result
  }

  // Fallback: try to extract ZIP and state
  const zipMatch = address.match(/\b(\d{5}(?:-\d{4})?)\b/)
  if (zipMatch) {
    result.zip = zipMatch[1].split('-')[0] // Remove extension
  }

  const stateMatch = address.match(/\b([A-Z]{2})\b(?=\s+\d{5})/i)
  if (stateMatch) {
    result.state = stateMatch[1].toUpperCase()
  }

  // Everything before state/ZIP is likely street + city
  const beforeStateZip = address.replace(/\s+[A-Z]{2}\s+\d{5}.*$/i, '').trim()
  if (beforeStateZip) {
    // Try to split street and city (city is usually last word before state)
    const parts = beforeStateZip.split(/\s+/)
    if (parts.length > 1) {
      // Last part is usually city
      result.city = parts[parts.length - 1]
      result.street = parts.slice(0, -1).join(' ')
    } else {
      result.street = beforeStateZip
    }
  }

  console.log('📍 Final parsed address:', result)
  return result
}

/**
 * Format phone number to standard format
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  
  // Format as (XXX) XXX-XXXX if 10 digits
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  
  // Format as +X (XXX) XXX-XXXX if 11 digits (with country code)
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  
  // Return as-is if not standard format
  return phone
}

/**
 * Call Melissa Personator API to get email and phone
 * 
 * @param ownerName - Owner's full name from ATTOM API
 * @param mailingAddress - Owner's mailing address from ATTOM API
 * @returns Object with email and phone, or error
 */
export async function fetchMelissaPersonatorData(
  ownerName: string | null,
  mailingAddress: string | null
): Promise<MelissaContactVerifyResponse> {
  // In Next.js API routes, use process.env directly (server-side)
  const apiKey = process.env.MELISSA_PERSONATOR_API_KEY || process.env.MELISSA_KEY

  // API key check (silent)

  if (!apiKey || apiKey === 'your_melissa_api_key_here') {
    console.error('❌ Melissa Personator API key not configured')
    console.error('Please set MELISSA_PERSONATOR_API_KEY or MELISSA_KEY in .env file')
    return {
      success: false,
      email: null,
      phone: null,
      error: 'Melissa Personator API key not configured. Please add MELISSA_PERSONATOR_API_KEY or MELISSA_KEY to .env file'
    }
  }

  // Validate inputs - mailing address is required
  if (!mailingAddress) {
    return {
      success: false,
      email: null,
      phone: null,
      error: 'Mailing address is required for Melissa Personator lookup'
    }
  }
  
  // If no owner name, we can still try with just address (reverse lookup)

  try {
    // Parse mailing address to extract components
    const addressParts = parseMailingAddress(mailingAddress)
    
    // Melissa Personator ContactVerify API endpoint
    const apiUrl = 'https://personator.melissadata.net/v3/WEB/ContactVerify/doContactVerify'
    
    // Build request parameters according to ContactVerify API specification
    // Required: id (LicenseKey)
    // Optional: act (Actions), full (FullName), a1 (AddressLine1), loc (Locality), 
    //           admarea (AdministrativeArea), postal (PostalCode), ctry (Country)
    const params = new URLSearchParams({
      'id': apiKey, // LicenseKey (required)
    })
    
    // Add Actions parameter
    // IMPORTANT: 'Append' action requires subscription license (not available on credit licenses)
    // Credit licenses can only use 'Check' (validation only, no email/phone enrichment)
    // If you get GE29 error, your license doesn't support Append
    // To get email/phone data, you need to upgrade to subscription license
    params.append('act', 'Check,Append')
    
    // Add full name if available
    if (ownerName) {
      params.append('full', ownerName.trim())
    }
    
    // Add address components
    if (addressParts.street) {
      params.append('a1', addressParts.street)
    }
    if (addressParts.city) {
      params.append('loc', addressParts.city) // Locality (city)
    }
    if (addressParts.state) {
      params.append('admarea', addressParts.state) // AdministrativeArea (state)
    }
    if (addressParts.zip) {
      params.append('postal', addressParts.zip) // PostalCode
    }
    
    // Set country to USA by default
    params.append('ctry', 'USA')
    
    // Request details logged only on error

    const response = await fetch(`${apiUrl}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ Melissa Personator API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 500)
      })
      
      return {
        success: false,
        email: null,
        phone: null,
        error: `Melissa Personator API error: ${response.status} ${response.statusText}`,
        rawData: errorText
      }
    }

    const data = await response.json()
    
    // Check for errors first
    const transmissionResults = data.TransmissionResults || ''
    
    let email: string | null = null
    let phone: string | null = null

    // EXTRACT EMAIL and PHONE from Records array structure
    // Response structure: { Records: [{ EmailAddress: "...", PhoneNumber: "...", ... }] }
    if (data.Records && Array.isArray(data.Records) && data.Records.length > 0) {
      const record = data.Records[0]
      
      // EXTRACT EMAIL - Check multiple possible field names
      // Note: Some fields might be empty strings " " which need to be filtered out
      const emailFields = ['EmailAddress', 'Email', 'MailboxName', 'DomainName']
      for (const field of emailFields) {
        if (record[field] && typeof record[field] === 'string') {
          const emailValue = record[field].trim()
          // Skip empty strings, single spaces, and invalid emails
          if (emailValue && 
              emailValue !== ' ' && 
              emailValue.length > 0 &&
              emailValue.includes('@') && 
              emailValue.length > 5 &&
              emailValue.indexOf('@') > 0 &&
              emailValue.indexOf('@') < emailValue.length - 1) {
            email = emailValue
            break
          }
        }
      }
      
      // EXTRACT PHONE - Check multiple possible field names and combinations
      const phoneFields = ['PhoneNumber', 'Phone']
      
      // First try direct phone fields
      for (const field of phoneFields) {
        if (record[field] && typeof record[field] === 'string') {
          const phoneValue = record[field].trim()
          // Skip empty strings and spaces
          if (phoneValue && phoneValue !== ' ' && phoneValue.length > 0) {
            const digits = phoneValue.replace(/\D/g, '')
            if (digits.length >= 10) {
              phone = formatPhoneNumber(phoneValue)
              break
            }
          }
        }
      }
      
      // If no direct phone, try constructing from PhonePrefix + PhoneSuffix + AreaCode
      if (!phone) {
        const areaCode = (record.AreaCode || '').trim().replace(/\D/g, '')
        const phonePrefix = (record.PhonePrefix || '').trim().replace(/\D/g, '')
        const phoneSuffix = (record.PhoneSuffix || '').trim().replace(/\D/g, '')
        
        // Try AreaCode + PhonePrefix + PhoneSuffix
        if (areaCode.length === 3 && phonePrefix.length === 3 && phoneSuffix.length === 4) {
          phone = `(${areaCode}) ${phonePrefix}-${phoneSuffix}`
        }
        // Try just PhonePrefix + PhoneSuffix (if area code not available)
        else if (phonePrefix.length === 3 && phoneSuffix.length === 4) {
          phone = `(${phonePrefix}) ${phoneSuffix.substring(0, 3)}-${phoneSuffix.substring(3)}`
        }
        // Try AreaCode + PhoneNumber (if PhoneNumber is 7 digits)
        else if (areaCode.length === 3 && record.PhoneNumber) {
          const phoneNum = (record.PhoneNumber || '').trim().replace(/\D/g, '')
          if (phoneNum.length === 7) {
            phone = `(${areaCode}) ${phoneNum.substring(0, 3)}-${phoneNum.substring(3)}`
          }
        }
      }
      
      // Check for error codes
      if (transmissionResults.includes('GE29') || transmissionResults.includes('GE')) {
        // GE29 = General error - Append action not available on credit licenses
        // The 'Append' action (which adds phone/email) requires a subscription license
        // Credit licenses can only use 'Check' action (validation only)
      if (!email && !phone) {
          console.warn('⚠️ GE29 Error: Append action requires subscription license')
          console.warn('   Your current license appears to be credit-based')
          console.warn('   To get email/phone data, you need a subscription license')
          console.warn('   Contact Melissa sales to upgrade: https://www.melissa.com/contact')
        }
      }
    } else {
      // No records returned
      if (transmissionResults && transmissionResults.includes('GE29')) {
        // Silent - expected behavior for some subscriptions
      }
    }

    return {
      success: true,
      email: email || null,
      phone: phone || null,
      rawData: data
    }

  } catch (error: any) {
    console.error('❌ Error calling Melissa Personator API:', error)
    return {
      success: false,
      email: null,
      phone: null,
      error: `Failed to fetch data from Melissa Personator: ${error.message}`,
      rawData: error
    }
  }
}
