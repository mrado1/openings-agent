import * as dotenv from 'dotenv';
import { DiscoveryPipeline } from '../discovery/discoveryPipeline';
import { ShowSearchContext } from '../discovery/searchQueryBuilder';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

async function discoverAndExtractShow(
  title: string,
  artist: string, 
  gallery: string,
  year: string
) {
  try {
    console.log(`🔍 Discovering show: "${title}" by ${artist} at ${gallery} (${year})`);
    console.log(`⏰ Started at: ${new Date().toLocaleTimeString()}`);
    
    const pipeline = new DiscoveryPipeline();
    const context: ShowSearchContext = { title, artist, gallery, year };
    
    const startTime = Date.now();
    const result = await pipeline.discoverAndExtract(context);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Save comprehensive discovery result
    const filename = `discovery_${Date.now()}.json`;
    const outputPath = path.join('outputs', filename);
    
    const outputData = {
      ...result,
      searchContext: context,
      duration_seconds: parseFloat(duration),
      processed_at: new Date().toISOString()
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    
    // Display results
    console.log('\n' + '='.repeat(60));
    
    if (result.success) {
      console.log(`🎉 Discovery successful! Confidence: ${result.confidence}%`);
      console.log(`🌐 Discovered URL: ${result.discoveredUrl}`);
      console.log(`⏱️  Duration: ${duration}s`);
      console.log(`📊 Search queries tried: ${result.searchQueries.length}`);
      console.log(`🔗 URLs found: ${result.urlsFound}, filtered: ${result.urlsFiltered}`);
      
      if (result.extractedData) {
        console.log(`\n📝 Extracted Data:`);
        console.log(`   Title: ${result.extractedData.title || 'N/A'}`);
        console.log(`   Artists: ${result.extractedData.artists?.join(', ') || 'N/A'}`);
        console.log(`   Dates: ${result.extractedData.start_date || 'N/A'} - ${result.extractedData.end_date || 'N/A'}`);
        console.log(`   Images: ${result.extractedData.images?.length || 0}`);
        console.log(`   Press Release: ${result.extractedData.press_release ? `${result.extractedData.press_release.length} chars` : 'N/A'}`);
      }
      
    } else {
      console.log(`❌ Discovery failed after ${duration}s`);
      console.log(`📊 Search queries tried: ${result.searchQueries.length}`);
      console.log(`🔗 URLs found: ${result.urlsFound}, filtered: ${result.urlsFiltered}`);
      console.log(`\n💥 Errors:`);
      result.errors.forEach(error => console.log(`   ${error}`));
    }
    
    console.log(`\n📁 Full results saved to: ${outputPath}`);
    console.log('='.repeat(60));
    
    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`💥 Discovery pipeline failed: ${errorMessage}`);
    throw error;
  }
}

function printUsage() {
  console.log(`
🎯 Phase 3: Show Discovery CLI

Usage:
  npm run discover-shows "Show Title" "Artist Name" "Gallery Name" "Year"

Examples:
  npm run discover-shows "Telos Tales" "Alicja Kwade" "Pace" "2025"
  npm run discover-shows "New Paintings" "Jeff Koons" "Gagosian" "2025"
  npm run discover-shows "Retrospective" "Kara Walker" "David Zwirner" "2024"

Notes:
  - Use quotes around multi-word arguments
  - Gallery name can be partial (e.g., "Pace" for "Pace Gallery")
  - Year helps filter current vs past exhibitions
  - Results saved to outputs/discovery_*.json
`);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length !== 4) {
    console.error('❌ Invalid arguments\n');
    printUsage();
    process.exit(1);
  }
  
  const [title, artist, gallery, year] = args;
  
  // Validate arguments
  if (!title.trim() || !artist.trim() || !gallery.trim() || !year.trim()) {
    console.error('❌ All arguments must be non-empty\n');
    printUsage();
    process.exit(1);
  }
  
  if (!/^\d{4}$/.test(year)) {
    console.error('❌ Year must be a 4-digit number\n');
    printUsage();
    process.exit(1);
  }
  
  discoverAndExtractShow(title, artist, gallery, year).catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n💥 Fatal error: ${errorMessage}`);
    process.exit(1);
  });
}

export { discoverAndExtractShow }; 