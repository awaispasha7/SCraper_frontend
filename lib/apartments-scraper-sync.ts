/**
 * Apartments Scraper Sync Service
 * Handles running the apartments scraper and syncing with Supabase
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)

/**
 * Run the apartments Scrapy scraper
 */
export async function runApartmentsScraper(): Promise<void> {
  // Get the workspace root (one level up from SCraper_frontend-main)
  const workspaceRoot = path.resolve(process.cwd(), '..')
  const scraperPath = path.join(workspaceRoot, 'apartments', 'apartments')
  
  if (!fs.existsSync(scraperPath)) {
    throw new Error(`Scraper directory not found: ${scraperPath}`)
  }
  
  const startTime = Date.now()
  
  try {
    // Set up environment with Python in PATH and UTF-8 encoding
    const env = { ...process.env }
    // Set UTF-8 encoding for Python output (fixes emoji encoding issues on Windows)
    env.PYTHONIOENCODING = 'utf-8'
    
    // Try to find Python/Anaconda in common locations
    const possiblePythonPaths = [
      process.env.ANACONDA_PATH,
      process.env.CONDA_PREFIX,
      'C:\\Python313',
      'C:\\python\\Python312',
      'C:\\Python312',
      'C:\\Python311',
      'C:\\Python310',
      'C:\\Python39',
      'C:\\Users\\hp\\anaconda3',
      'C:\\Users\\hp\\miniconda3',
      'C:\\ProgramData\\Anaconda3',
      'C:\\ProgramData\\Miniconda3',
      'C:\\Program Files\\Python313',
      'C:\\Program Files\\Python312',
      'C:\\Program Files\\Python311',
      'C:\\Program Files\\Python310',
      'C:\\Program Files\\Python39',
      'C:\\Program Files (x86)\\Python313',
      'C:\\Program Files (x86)\\Python312',
      'C:\\Program Files (x86)\\Python311',
      'C:\\Program Files (x86)\\Python310',
      'C:\\Program Files (x86)\\Python39',
    ].filter(Boolean) as string[]
    
    let pythonCommand = 'python'
    let pythonFound = false
    
    // If Python paths found, try to use full path to python.exe
    if (possiblePythonPaths.length > 0) {
      const pythonPaths = possiblePythonPaths
        .map(p => [`${p}`, `${p}\\Scripts`, `${p}\\Library\\bin`])
        .flat()
        .join(';')
      env.PATH = `${pythonPaths};${env.PATH || ''}`
      
      // Try each path to find python.exe
      for (const pythonPath of possiblePythonPaths) {
        const pythonExe = path.join(pythonPath, 'python.exe')
        const pythonScriptsExe = path.join(pythonPath, 'Scripts', 'python.exe')
        const pythonwExe = path.join(pythonPath, 'pythonw.exe')
        
        // Check if python.exe exists, use full path if available
        if (fs.existsSync(pythonExe)) {
          pythonCommand = pythonExe
          pythonFound = true
          console.log(`   ✅ Found Python at: ${pythonExe}`)
          break
        } else if (fs.existsSync(pythonScriptsExe)) {
          pythonCommand = pythonScriptsExe
          pythonFound = true
          console.log(`   ✅ Found Python at: ${pythonScriptsExe}`)
          break
        } else if (fs.existsSync(pythonwExe)) {
          // pythonw.exe can also run scripts
          pythonCommand = pythonwExe
          pythonFound = true
          console.log(`   ✅ Found Python at: ${pythonwExe}`)
          break
        }
      }
      
      // If still not found, try to find Python using 'where' command
      if (!pythonFound) {
        try {
          const { stdout } = await execAsync('where python', { env, timeout: 5000 })
          if (stdout && stdout.trim()) {
            const pythonPath = stdout.split('\n')[0].trim()
            if (fs.existsSync(pythonPath)) {
              pythonCommand = pythonPath
              pythonFound = true
              console.log(`   ✅ Found Python using 'where' command: ${pythonPath}`)
            }
          }
        } catch (e) {
          // 'where' command failed, continue to next attempt
          console.log(`   ⚠️ 'where python' command failed, trying other methods...`)
        }
      }
      
      // If still not found, try Windows Python launcher (py)
      if (!pythonFound) {
        try {
          const { stdout } = await execAsync('where py', { env, timeout: 5000 })
          if (stdout && stdout.trim()) {
            const pyPath = stdout.split('\n')[0].trim()
            if (fs.existsSync(pyPath)) {
              pythonCommand = pyPath
              pythonFound = true
              console.log(`   ✅ Found Python launcher at: ${pyPath}`)
            }
          }
        } catch (e) {
          // 'where py' command failed
        }
      }
      
      // Final fallback - try 'python' command
      if (!pythonFound) {
        console.log(`   ⚠️ Python not found in standard locations. Trying 'python' command...`)
        console.log(`   💡 If this fails, please install Python or add it to your PATH`)
        pythonCommand = 'python'
      }
    } else {
      // No Python paths found, try 'python' or 'py'
      console.log(`   ⚠️ No Python paths configured, trying 'python' command...`)
      pythonCommand = 'python'
    }
    
    console.log('🔄 Running apartments scraper...')
    console.log(`   Scraper path: ${scraperPath}`)
    console.log(`   Python command: ${pythonCommand}`)
    
    // Run Scrapy crawl command - quote only if it's a full path
    const pythonCmd = pythonCommand.includes('\\') || pythonCommand.includes('/') 
      ? `"${pythonCommand}"` 
      : pythonCommand
    const command = `${pythonCmd} -m scrapy crawl apartments_frbo -a city="chicago-il"`
    
    console.log(`   Executing: ${command}`)
    console.log(`   This may take several minutes. Please wait...`)
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: scraperPath,
      env: env,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
      timeout: 30 * 60 * 1000 // 30 minutes timeout (scraping can take a while)
    })
    
    // Log first few lines of output to show progress
    if (stdout) {
      const lines = stdout.split('\n').slice(0, 20)
      console.log(`   Scraper output (first 20 lines):`)
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`   ${line.trim()}`)
        }
      })
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000)
    console.log(`✅ Scraper completed in ${duration} seconds`)
    
    // Log errors from scraper output
    if (stdout) {
      const lines = stdout.split('\n')
      const errorLines = lines.filter(line => 
        line.includes('ERROR') ||
        line.includes('Error') ||
        line.includes('❌') ||
        line.includes('Failed') ||
        line.includes('Exception')
      )
      
      if (errorLines.length > 0) {
        console.error('❌ Scraper errors:')
        errorLines.forEach(msg => {
          if (msg.trim()) {
            console.error(`   ${msg.trim()}`)
          }
        })
      }
    }
    
    if (stderr) {
      console.warn('⚠️ Scraper stderr:', stderr.substring(0, 1000))
    }
    
    // Check if CSV was generated
    const csvPath = path.join(scraperPath, 'output', 'apartments_frbo_chicago-il.csv')
    if (!fs.existsSync(csvPath)) {
      throw new Error('Scraper did not generate CSV output file')
    }
    
    console.log(`✅ CSV file generated: ${csvPath}`)
    
  } catch (error: any) {
    console.error('❌ Scraper execution failed:', error.message)
    throw error
  }
}

/**
 * Upload CSV to Supabase using the upload script
 */
export async function uploadApartmentsToSupabase(): Promise<void> {
  // Get the workspace root (one level up from SCraper_frontend-main)
  const workspaceRoot = path.resolve(process.cwd(), '..')
  const scraperPath = path.join(workspaceRoot, 'apartments', 'apartments')
  const csvPath = path.join(scraperPath, 'output', 'apartments_frbo_chicago-il.csv')
  const uploadScriptPath = path.join(scraperPath, 'upload_to_supabase.py')
  
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`)
  }
  
  if (!fs.existsSync(uploadScriptPath)) {
    throw new Error(`Upload script not found: ${uploadScriptPath}`)
  }
  
  try {
    // Set up environment with Python in PATH and UTF-8 encoding
    const env = { ...process.env }
    // Set UTF-8 encoding for Python output (fixes emoji encoding issues on Windows)
    env.PYTHONIOENCODING = 'utf-8'
    
    // Try to find Python/Anaconda in common locations
    const possiblePythonPaths = [
      process.env.ANACONDA_PATH,
      process.env.CONDA_PREFIX,
      'C:\\Python313',
      'C:\\python\\Python312',
      'C:\\Python312',
      'C:\\Python311',
      'C:\\Python310',
      'C:\\Python39',
      'C:\\Users\\hp\\anaconda3',
      'C:\\Users\\hp\\miniconda3',
      'C:\\ProgramData\\Anaconda3',
      'C:\\ProgramData\\Miniconda3',
      'C:\\Program Files\\Python313',
      'C:\\Program Files\\Python312',
      'C:\\Program Files\\Python311',
      'C:\\Program Files\\Python310',
      'C:\\Program Files\\Python39',
      'C:\\Program Files (x86)\\Python313',
      'C:\\Program Files (x86)\\Python312',
      'C:\\Program Files (x86)\\Python311',
      'C:\\Program Files (x86)\\Python310',
      'C:\\Program Files (x86)\\Python39',
    ].filter(Boolean) as string[]
    
    let pythonCommand = 'python'
    let pythonFound = false
    
    // If Python paths found, try to use full path to python.exe
    if (possiblePythonPaths.length > 0) {
      const pythonPaths = possiblePythonPaths
        .map(p => [`${p}`, `${p}\\Scripts`, `${p}\\Library\\bin`])
        .flat()
        .join(';')
      env.PATH = `${pythonPaths};${env.PATH || ''}`
      
      // Try each path to find python.exe
      for (const pythonPath of possiblePythonPaths) {
        const pythonExe = path.join(pythonPath, 'python.exe')
        const pythonScriptsExe = path.join(pythonPath, 'Scripts', 'python.exe')
        const pythonwExe = path.join(pythonPath, 'pythonw.exe')
        
        // Check if python.exe exists, use full path if available
        if (fs.existsSync(pythonExe)) {
          pythonCommand = pythonExe
          pythonFound = true
          console.log(`   ✅ Found Python at: ${pythonExe}`)
          break
        } else if (fs.existsSync(pythonScriptsExe)) {
          pythonCommand = pythonScriptsExe
          pythonFound = true
          console.log(`   ✅ Found Python at: ${pythonScriptsExe}`)
          break
        } else if (fs.existsSync(pythonwExe)) {
          // pythonw.exe can also run scripts
          pythonCommand = pythonwExe
          pythonFound = true
          console.log(`   ✅ Found Python at: ${pythonwExe}`)
          break
        }
      }
      
      // If still not found, try Windows Python launcher (py)
      if (!pythonFound) {
        console.log(`   ⚠️ Python.exe not found in Anaconda paths, trying 'py' launcher`)
        pythonCommand = 'py'
      }
    } else {
      // No Anaconda paths found, try 'py' launcher or 'python'
      console.log(`   ⚠️ No Anaconda paths found, trying 'py' launcher`)
      pythonCommand = 'py'
    }
    
    console.log('📤 Uploading CSV to Supabase...')
    console.log(`   CSV path: ${csvPath}`)
    
    // Quote only if it's a full path
    const pythonCmd = pythonCommand.includes('\\') || pythonCommand.includes('/') 
      ? `"${pythonCommand}"` 
      : pythonCommand
    const command = `${pythonCmd} upload_to_supabase.py --csv "${csvPath}"`
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: scraperPath,
      env: env,
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    })
    
    if (stdout) {
      console.log('✅ Upload output:', stdout.substring(0, 1000))
    }
    
    if (stderr) {
      console.warn('⚠️ Upload warnings:', stderr.substring(0, 1000))
    }
    
    console.log('✅ Upload to Supabase completed')
    
  } catch (error: any) {
    console.error('❌ Upload to Supabase failed:', error.message)
    throw error
  }
}

/**
 * Main sync function - runs scraper and uploads to Supabase
 */
export async function refreshApartmentsListings(): Promise<{
  scraped: number
  uploaded: number
  timestamp: string
}> {
  console.log('🔄 Starting apartments scraper sync...')
  
  try {
    // Step 1: Run the scraper
    await runApartmentsScraper()
    
    // Step 2: Upload to Supabase
    await uploadApartmentsToSupabase()
    
    // Step 3: Get count from Supabase
    const { supabase } = await import('@/lib/supabase')
    let uploaded = 0
    
    if (supabase) {
      const { count, error: countError } = await supabase
        .from('apartments_frbo_chicago')
        .select('*', { count: 'exact', head: true })
      
      if (!countError && count !== null) {
        uploaded = count
      }
    }
    
    const result = {
      scraped: uploaded,
      uploaded: uploaded,
      timestamp: new Date().toISOString()
    }
    
    console.log(`✅ Apartments sync complete: ${uploaded} listings in Supabase`)
    
    return result
    
  } catch (error: any) {
    console.error('❌ Apartments sync failed:', error.message)
    throw error
  }
}

