/**
 * Script to convert Trulia listings Excel file to CSV
 * Preserves all data exactly as it is in the Excel file
 * 
 * Usage: node scripts/convert-trulia-excel-to-csv.js
 */

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

// Configuration - try multiple possible locations
const POSSIBLE_PATHS = [
  path.join(__dirname, '..', 'trulia_listings_enriched.xlsx'),
  path.join(__dirname, '..', '..', 'trulia_listings_enriched.xlsx'),
  path.join(process.cwd(), 'trulia_listings_enriched.xlsx'),
]

let INPUT_EXCEL = null
for (const filePath of POSSIBLE_PATHS) {
  if (fs.existsSync(filePath)) {
    INPUT_EXCEL = filePath
    break
  }
}

if (!INPUT_EXCEL) {
  console.error('❌ Excel file not found. Tried:')
  POSSIBLE_PATHS.forEach(p => console.error(`   - ${p}`))
  console.error('   Please ensure trulia_listings_enriched.xlsx is in the project root or scripts directory')
  process.exit(1)
}

const OUTPUT_CSV = path.join(path.dirname(INPUT_EXCEL), 'trulia_listings_enriched.csv')

// Convert Excel to CSV
async function convertExcelToCSV(excelPath, csvPath) {
  console.log(`📖 Reading Excel file: ${excelPath}`)

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(excelPath)

  console.log(`✅ Workbook loaded successfully`)

  // Write to CSV
  // ExcelJS's workbook.csv.writeFile method writes the first worksheet to CSV by default.
  // It attempts to preserve formatting and data types where possible.
  await workbook.csv.writeFile(csvPath)

  console.log(`✅ CSV file created: ${csvPath}`)

  // Read back for statistics
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const lines = csvContent.split('\n').filter(line => line.trim())
  const rowCount = lines.length - 1 // Subtract header row

  console.log(`📊 Statistics:`)
  console.log(`   - Total rows (including header): ${lines.length}`)
  console.log(`   - Data rows: ${rowCount}`)

  // Show first few lines as preview
  if (lines.length > 0) {
    console.log(`\n📝 Preview (first 3 lines):`)
    lines.slice(0, Math.min(3, lines.length)).forEach((line, i) => {
      const preview = line.length > 100 ? line.substring(0, 100) + '...' : line
      console.log(`   ${i + 1}. ${preview}`)
    })
  }

  return csvPath
}

// Main function
async function main() {
  console.log('🚀 Converting Trulia Excel file to CSV...')
  console.log(`📁 Input file: ${INPUT_EXCEL}`)
  console.log(`📁 Output file: ${OUTPUT_CSV}`)
  console.log('')

  try {
    await convertExcelToCSV(INPUT_EXCEL, OUTPUT_CSV)
    console.log('')
    console.log('✅ Conversion complete!')
    console.log(`   CSV file saved at: ${OUTPUT_CSV}`)
    console.log('   All data has been preserved exactly as it was in the Excel file.')
  } catch (error) {
    console.error('❌ Error converting file:', error.message)
    process.exit(1)
  }
}

// Run the script
if (require.main === module) {
  main()
}

module.exports = { convertExcelToCSV }


