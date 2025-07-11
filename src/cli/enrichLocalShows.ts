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
    processing_time_seconds: number;
    quality_criteria_met: number; // 0-4 based on quality criteria
    enrichment_timestamp: string;
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
    const localTestPath = localTestFile.startsWith('outputs/') ? localTestFile : path.join('outputs', localTestFile);
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
        // Track processing time
        const showStartTime = Date.now();
        
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
        const processingTime = Math.round((Date.now() - showStartTime) / 1000);
        
        // Create enriched show object with AI results
        const enrichedShow: EnrichedLocalShow = {
          ...localShow, // Start with existing local data
          ai_enrichment: {
            success: aiResult.success,
            confidence: aiResult.confidence || 0,
            discovered_url: aiResult.discoveredUrl,
            processing_time_seconds: processingTime,
            quality_criteria_met: 0, // Will be calculated based on criteria
            enrichment_timestamp: new Date().toISOString(),
            errors: aiResult.errors || []
          }
        };

        // CRITICAL FIX: Update main show fields directly with AI-extracted data
        if (aiResult.success && aiResult.extractedData) {
          const aiData = aiResult.extractedData;
          let qualityCriteriaMet = 0;
          
          // 1. Replace Artforum image_url with gallery image_url if found
          if (aiData.image_url && !aiData.image_url.includes('artforum.com')) {
            enrichedShow.image_url = aiData.image_url;
            qualityCriteriaMet++; // Main image replaced criterion
            console.log(`   🖼️ Replaced main image: ${localShow.image_url || 'none'} → ${aiData.image_url}`);
          }
          
          // 2. Update additional_images if AI found images
          if (aiData.additional_images && aiData.additional_images.length > 0) {
            enrichedShow.additional_images = aiData.additional_images;
            qualityCriteriaMet++; // Additional images found criterion
            console.log(`   📸 Updated additional images: ${aiData.additional_images.length} images`);
          }
          
          // 3. Update press_release if AI found better content
          if (aiData.press_release && aiData.press_release.length > 50) {
            enrichedShow.press_release = aiData.press_release;
            qualityCriteriaMet++; // Press release found criterion
            console.log(`   📄 Updated press release: ${(localShow.press_release?.length || 0)} → ${aiData.press_release.length} chars`);
          }
          
          // 4. Update show_summary if AI generated one
          if (aiData.show_summary && !localShow.show_summary) {
            enrichedShow.show_summary = aiData.show_summary;
            console.log(`   📝 Added show summary`);
          }
          
          // 5. Accurate URL found criterion (gallery URL, not Artforum)
          if (aiResult.discoveredUrl && !aiResult.discoveredUrl.includes('artforum.com')) {
            qualityCriteriaMet++; // Accurate URL found criterion
          }
          
          // Update quality criteria count
          enrichedShow.ai_enrichment.quality_criteria_met = qualityCriteriaMet;
          
          // Determine if show should be marked as enriched (3+ criteria = 75% quality)
          if (qualityCriteriaMet >= 3) {
            enrichedShow.has_been_enriched = true;
            console.log(`   ✅ Quality success! ${qualityCriteriaMet}/4 criteria met - marked as enriched`);
          } else {
            console.log(`   ⚠️ Quality insufficient: ${qualityCriteriaMet}/4 criteria met - needs review`);
          }
          
          successCount++;
          console.log(`   ✅ Enrichment successful! Confidence: ${aiResult.confidence}%`);
          console.log(`   🌐 Found URL: ${aiResult.discoveredUrl}`);
          console.log(`   📊 Quality score: ${qualityCriteriaMet}/4 criteria met`);
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
            discovered_url: undefined,
            processing_time_seconds: 0,
            quality_criteria_met: 0,
            enrichment_timestamp: new Date().toISOString(),
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