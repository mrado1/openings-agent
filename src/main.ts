import * as dotenv from 'dotenv';
import { fetchAndCleanHtml } from './utils/fetchHtml';
import { extractShowFields } from './extractors/extractFieldsGemini';
import { ShowData } from './types/schemas';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from multiple possible locations
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

export async function extractShowFromUrl(showUrl: string): Promise<any> {
  try {
    console.log(`🔍 Processing: ${showUrl}`);
    
    // Step 1: Fetch show page
    const showHtml = await fetchAndCleanHtml(showUrl);
    console.log(`📄 Fetched HTML (${showHtml.length} characters)`);
    
    // Step 2: Extract show data
    const extracted = await extractShowFields(showHtml, showUrl);
    console.log(`🎯 Extracted fields: ${Object.keys(extracted).join(', ')}`);
    
    const result = {
      success: true,
      data: extracted,
      show_url: showUrl,
      processed_at: new Date().toISOString()
    };
    
    // Save result
    const filename = `extraction_${Date.now()}.json`;
    const outputPath = path.join('outputs', filename);
    
    // Ensure outputs directory exists
    if (!fs.existsSync('outputs')) {
      fs.mkdirSync('outputs');
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    
    console.log(`✅ Completed extraction`);
    console.log(`📁 Saved to: ${outputPath}`);
    
    return result;
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Extraction failed: ${message}`);
    
    const errorResult = {
      success: false,
      error: message,
      show_url: showUrl,
      processed_at: new Date().toISOString()
    };
    
    // Save error result too
    const filename = `extraction_error_${Date.now()}.json`;
    const outputPath = path.join('outputs', filename);
    
    if (!fs.existsSync('outputs')) {
      fs.mkdirSync('outputs');
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(errorResult, null, 2));
    
    throw error;
  }
}

// CLI interface
if (require.main === module) {
  const showUrl = process.argv[2];
  if (!showUrl) {
    console.error('Usage: ts-node src/main.ts <show-url>');
    console.error('Example: ts-node src/main.ts https://pacegallery.com/exhibitions/current');
    process.exit(1);
  }
  
  extractShowFromUrl(showUrl).catch(console.error);
} 