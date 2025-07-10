import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DiscoveryPipeline } from '../discovery/discoveryPipeline';
import { ShowSearchContext } from '../discovery/searchQueryBuilder';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface LocalUnenrichedShow {
  id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  gallery_website: string;
  start_date: string;
  end_date: string;
  press_release: string | null;
  image_url: string | null;
  additional_images: string[] | null;
  show_summary: string | null;
  has_been_enriched: boolean;
  source_url: string;
  scraped_at: string;
  gallery_address: string | null;
}

interface LocalTestSet {
  production_reference: string;
  local_unenriched_shows: LocalUnenrichedShow[];
  match_criteria: string;
  matched_count: number;
  unmatched_shows: string[];
  extracted_at: string;
}

interface EnrichedLocalShow extends LocalUnenrichedShow {
  ai_enrichment: {
    success: boolean;
    confidence: number;
    discovered_url?: string;
    enriched_fields: {
      press_release?: string;
      image_url?: string;
      additional_images?: string[];
      show_summary?: string;
    };
    errors: string[];
  };
}

interface EnrichmentResults {
  local_test_reference: string;
  production_test_reference: string;
  enriched_shows: EnrichedLocalShow[];
  success_rate: number;
  total_shows: number;
  successful_enrichments: number;
  failed_enrichments: number;
  processing_time_seconds: number;
  extracted_at: string;
}

async function enrichLocalShows(localTestFile: string): Promise<void> {
  try {
    console.log(`🔬 Starting AI enrichment of local shows: ${localTestFile}`);
    console.log('');
    
    // Load local unenriched test set
    const localTestPath = path.join('outputs', localTestFile);
    if (!fs.existsSync(localTestPath)) {
      throw new Error(`Local test set file not found: ${localTestPath}`);
    }
    
    const localTestSet: LocalTestSet = JSON.parse(fs.readFileSync(localTestPath, 'utf8'));
    console.log(`📋 Loaded ${localTestSet.local_unenriched_shows.length} local unenriched shows`);
    console.log(`🔗 Production reference: ${localTestSet.production_reference}`);
    console.log(`🎯 Match criteria: ${localTestSet.match_criteria}`);
    console.log('');
    
    const pipeline = new DiscoveryPipeline();
    const enrichedShows: EnrichedLocalShow[] = [];
    const errors: string[] = [];
    let successCount = 0;
    
    const startTime = Date.now();
    
    // Process each local unenriched show
    for (let i = 0; i < localTestSet.local_unenriched_shows.length; i++) {
      const localShow = localTestSet.local_unenriched_shows[i];
      console.log(`\n🔬 [${i + 1}/${localTestSet.local_unenriched_shows.length}] Enriching: "${localShow.title}"`);
      console.log(`   Artist: ${localShow.artist_names.join(', ')}`);
      console.log(`   Gallery: ${localShow.gallery_name}`);
      console.log(`   Current status: enriched=${localShow.has_been_enriched}`);
      
      try {
        // Extract year from start_date
        const year = new Date(localShow.start_date).getFullYear().toString();
        
        // Create search context from existing local data
        const context: ShowSearchContext = {
          title: localShow.title,
          artist: localShow.artist_names[0], // Use primary artist for search
          gallery: localShow.gallery_name,
          year: year
        };
        
        // Run AI discovery and extraction to enrich the show
        console.log(`   🚀 Running AI discovery pipeline...`);
        const aiResult = await pipeline.discoverAndExtract(context);
        
        // Create enriched show object with AI results
        const enrichedShow: EnrichedLocalShow = {
          ...localShow, // Start with existing local data
          ai_enrichment: {
            success: aiResult.success,
            confidence: aiResult.confidence || 0,
            discovered_url: aiResult.discoveredUrl,
            enriched_fields: {},
            errors: aiResult.errors || []
          }
        };
        
        // Merge AI enrichment results with local data
        if (aiResult.success && aiResult.extractedData) {
          // Only update fields that were previously empty/null or improve existing data
          if (!localShow.press_release && aiResult.extractedData.press_release) {
            enrichedShow.ai_enrichment.enriched_fields.press_release = aiResult.extractedData.press_release;
          }
          
          if (!localShow.image_url && aiResult.extractedData.image_url) {
            enrichedShow.ai_enrichment.enriched_fields.image_url = aiResult.extractedData.image_url;
          }
          
          if ((!localShow.additional_images || localShow.additional_images.length === 0) && 
              aiResult.extractedData.additional_images && aiResult.extractedData.additional_images.length > 0) {
            enrichedShow.ai_enrichment.enriched_fields.additional_images = aiResult.extractedData.additional_images;
          }
          
          if (!localShow.show_summary && aiResult.extractedData.show_summary) {
            enrichedShow.ai_enrichment.enriched_fields.show_summary = aiResult.extractedData.show_summary;
          }
          
          successCount++;
          console.log(`   ✅ Enrichment successful! Confidence: ${aiResult.confidence}%`);
          console.log(`   🌐 Found URL: ${aiResult.discoveredUrl}`);
          
          const enrichedFields = Object.keys(enrichedShow.ai_enrichment.enriched_fields);
          if (enrichedFields.length > 0) {
            console.log(`   ➕ Enriched fields: ${enrichedFields.join(', ')}`);
          } else {
            console.log(`   ℹ️ No new fields enriched (existing data sufficient)`);
          }
        } else {
          console.log(`   ❌ Enrichment failed: ${aiResult.errors?.join(', ') || 'Unknown error'}`);
          errors.push(`Show ${i + 1} (${localShow.title}): ${aiResult.errors?.join(', ') || 'Unknown error'}`);
        }
        
        enrichedShows.push(enrichedShow);
        
      } catch (error: any) {
        console.log(`   💥 Error: ${error.message}`);
        errors.push(`Show ${i + 1} (${localShow.title}): ${error.message}`);
        
        // Add failed enrichment entry
        const failedShow: EnrichedLocalShow = {
          ...localShow,
          ai_enrichment: {
            success: false,
            confidence: 0,
            enriched_fields: {},
            errors: [error.message]
          }
        };
        
        enrichedShows.push(failedShow);
      }
      
      // Wait between requests to avoid rate limits
      if (i < localTestSet.local_unenriched_shows.length - 1) {
        console.log(`   ⏳ Waiting 2 seconds before next enrichment...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const endTime = Date.now();
    const processingTime = Math.round((endTime - startTime) / 1000);
    
    // Create enrichment results
    const enrichmentResults: EnrichmentResults = {
      local_test_reference: localTestFile,
      production_test_reference: localTestSet.production_reference,
      enriched_shows: enrichedShows,
      success_rate: Math.round((successCount / localTestSet.local_unenriched_shows.length) * 100),
      total_shows: localTestSet.local_unenriched_shows.length,
      successful_enrichments: successCount,
      failed_enrichments: localTestSet.local_unenriched_shows.length - successCount,
      processing_time_seconds: processingTime,
      extracted_at: new Date().toISOString()
    };
    
    // Save enrichment results
    const resultFilename = `local_enrichment_${Date.now()}.json`;
    const resultPath = path.join('outputs', resultFilename);
    fs.writeFileSync(resultPath, JSON.stringify(enrichmentResults, null, 2));
    
    console.log('\n🎯 LOCAL ENRICHMENT COMPLETE');
    console.log('============================');
    console.log(`✅ Success Rate: ${enrichmentResults.success_rate}% (${successCount}/${localTestSet.local_unenriched_shows.length})`);
    console.log(`⏱️  Total Time: ${processingTime} seconds`);
    console.log(`📁 Results saved to: ${resultFilename}`);
    
    if (errors.length > 0) {
      console.log(`\n❌ Errors encountered:`);
      errors.forEach(error => {
        console.log(`   - ${error}`);
      });
    }
    
    console.log(`\n🔗 Next step: Compare enriched local data to production with:`);
    console.log(`npm run compare-local-to-production ${resultFilename}`);
    
  } catch (error: any) {
    console.error(`💥 Local enrichment failed: ${error.message}`);
    throw error;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Please provide local test set file name');
    console.log('Usage: npm run enrich-local-shows <local_unenriched_set_file.json>');
    console.log('Example: npm run enrich-local-shows local_unenriched_set_1752181066112.json');
    process.exit(1);
  }

  const localTestFile = args[0];
  
  // API keys will be validated by the services that use them
  
  try {
    await enrichLocalShows(localTestFile);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 