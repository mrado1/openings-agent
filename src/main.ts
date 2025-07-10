import * as dotenv from 'dotenv';
import { fetchAndCleanHtml } from './utils/fetchHtml';
import { extractShowFields } from './extractors/extractFieldsGemini';
import { validateExtractionResult, formatValidationReport } from './utils/validation';
import { ExtractionResult } from './types/schemas';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function extractShow(showUrl: string, enhanced: boolean = false): Promise<ExtractionResult> {
  console.log(`🔍 Starting ${enhanced ? 'enhanced' : 'standard'} extraction for: ${showUrl}`);
  
  try {
    // Step 1: Fetch and clean HTML content
    console.log('📥 Fetching HTML content...');
    const html = await fetchAndCleanHtml(showUrl);
    console.log(`✅ Fetched ${html.length} characters`);

    // Step 2: Extract fields using Gemini (enhanced prompts)
    console.log('🔮 Extracting fields with Gemini...');
    const extractionStart = Date.now();
    const extractedData = await extractShowFields(html, showUrl);
    const extractionTime = Date.now() - extractionStart;
    console.log(`✅ Gemini extraction completed in ${extractionTime}ms`);

    // Step 3: Validate results
    console.log('📊 Validating extraction results...');
    const validation = validateExtractionResult(extractedData);
    console.log(formatValidationReport(validation));

    // Step 4: Create result object
    const result: ExtractionResult = {
      success: true,
      data: {
        title: extractedData.title || '',
        artists: extractedData.artists || [],
        start_date: extractedData.start_date || '',
        end_date: extractedData.end_date || '',
        press_release: extractedData.press_release || '',
        image_url: extractedData.image_url || '',
        additional_images: extractedData.additional_images || [],
        show_summary: extractedData.show_summary || '',
        gallery_url: extractedData.gallery_url || showUrl,
        extracted_at: extractedData.extracted_at || new Date().toISOString(),
        has_been_enriched: true,
        source_url: extractedData.source_url || showUrl
      },
      confidence: validation.quality_score,
      errors: validation.errors
    };

    // Step 5: Save results
    const outputsDir = path.join(__dirname, '..', 'outputs');
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `extraction_${enhanced ? 'enhanced_' : ''}${timestamp}.json`;
    const outputPath = path.join(outputsDir, filename);

    const outputData = {
      success: true,
      data: result.data,
      validation,
      confidence: validation.quality_score,
      show_url: showUrl,
      processed_at: new Date().toISOString(),
      extraction_mode: enhanced ? 'enhanced' : 'standard'
    };

    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    
    console.log(`\n💾 Results saved to: outputs/${filename}`);
    console.log(`🎯 Extraction confidence: ${validation.quality_score}%`);
    
    // Show extracted fields summary
    console.log('\n📋 EXTRACTED FIELDS SUMMARY:');
    console.log('=' .repeat(40));
    if (result.data) {
      console.log(`Title: ${result.data.title || 'NOT FOUND'}`);
      console.log(`Artists: ${result.data.artists.length > 0 ? result.data.artists.join(', ') : 'NOT FOUND'}`);
      console.log(`Start Date: ${result.data.start_date || 'NOT FOUND'}`);
      console.log(`End Date: ${result.data.end_date || 'NOT FOUND'}`);
      console.log(`Press Release: ${result.data.press_release ? `${result.data.press_release.substring(0, 100)}...` : 'NOT FOUND'}`);
      console.log(`Images: ${result.data.additional_images.length + (result.data.image_url ? 1 : 0)} found`);
    } else {
      console.log('No data extracted');
    }

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Extraction failed:', errorMessage);

    // Save error result
    const outputsDir = path.join(__dirname, '..', 'outputs');
    if (!fs.existsSync(outputsDir)) {
      fs.mkdirSync(outputsDir, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = `extraction_error_${timestamp}.json`;
    const errorData = {
      success: false,
      error: errorMessage,
      show_url: showUrl,
      processed_at: new Date().toISOString(),
      extraction_mode: enhanced ? 'enhanced' : 'standard'
    };

    fs.writeFileSync(path.join(outputsDir, filename), JSON.stringify(errorData, null, 2));

    return {
      success: false,
      errors: [errorMessage],
      confidence: 0
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  

  
  if (args.length === 0) {
    console.log('Usage: npm run extract <show-url>');
    console.log('   or: npm run extract-enhanced <show-url>');
    console.log('');
    console.log('Example: npm run extract https://www.pacegallery.com/exhibitions/alicja-kwade-telos-tales/');
    process.exit(1);
  }

  // Find URL (not --enhanced flag)
  const showUrl = args.find(arg => arg.startsWith('http'));
  const enhanced = args.includes('--enhanced') || process.argv.some(arg => arg.includes('extract-enhanced'));

  if (!showUrl || !showUrl.startsWith('http')) {
    console.error('❌ Please provide a valid URL starting with http:// or https://');

    process.exit(1);
  }

  // Check API keys

  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in .env.local');
    process.exit(1);
  }

  console.log(`🚀 AI Show Extractor v1.0 ${enhanced ? '(Enhanced Mode)' : ''}`);
  console.log('=' .repeat(50));

  const result = await extractShow(showUrl, enhanced);
  
  if (result.success) {
    console.log('\n✅ Extraction completed successfully!');
    console.log('Run "npm run compare-extraction" to compare with baseline data.');
  } else {
    console.log('\n❌ Extraction failed. Check the error output above.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
} 