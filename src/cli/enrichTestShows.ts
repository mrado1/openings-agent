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
  gallery_website: string | null;
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
  selection_criteria: string;
  local_shows: LocalUnenrichedShow[];
  selected_count: number;
  total_unenriched: number;
  missing_data_analysis: any;
  extracted_at: string;
}

interface EnrichedShow extends LocalUnenrichedShow {
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
  enriched_shows: EnrichedShow[];
  // Technical success metrics (pipeline completion)
  technical_success_rate: number;
  total_shows: number;
  successful_extractions: number;
  failed_extractions: number;
  // Quality enrichment metrics (meaningful improvements)
  quality_enrichment_rate: number;
  quality_enrichments: number;
  insufficient_quality: number;
  total_processing_time_seconds: number;
  improvements_summary: {
    press_release_additions: number;
    image_additions: number;
    summary_additions: number;
  };
  extracted_at: string;
}

async function enrichTestShows(localTestFile: string): Promise<void> {
  try {
    console.log(`🔬 Starting AI enrichment test: ${localTestFile}`);
    console.log('');
    
    // Load local test set
    const localTestPath = localTestFile.startsWith('outputs/') ? localTestFile : path.join('outputs', localTestFile);
    if (!fs.existsSync(localTestPath)) {
      throw new Error(`Local test set file not found: ${localTestPath}`);
    }
    
    const localTestSet: LocalTestSet = JSON.parse(fs.readFileSync(localTestPath, 'utf8'));
    console.log(`📋 Loaded ${localTestSet.local_shows.length} local shows for enrichment`);
    console.log(`🎯 Selection criteria: ${localTestSet.selection_criteria}`);
    console.log(`📊 Missing data analysis:`);
    console.log(`   No press release: ${localTestSet.missing_data_analysis.no_press_release}`);
    console.log(`   No images: ${localTestSet.missing_data_analysis.no_images}`);
    console.log(`   No summary: ${localTestSet.missing_data_analysis.no_summary}`);
    console.log('');
    
    const pipeline = new DiscoveryPipeline();
    const enrichedShows: EnrichedShow[] = [];
    const errors: string[] = [];
    let successCount = 0; // Technical success (no pipeline errors)
    let qualityEnrichmentCount = 0; // Quality success (has_been_enriched = true)
    let pressReleaseAdditions = 0;
    let imageAdditions = 0;
    let summaryAdditions = 0;
    
    const startTime = Date.now();
    
    // Process shows in parallel batches for speed while respecting API rate limits
    const BATCH_SIZE = 5; // Process 5 shows concurrently
    const BATCH_DELAY = 3000; // 3 second delay between batches
    
    const batches = [];
    for (let i = 0; i < localTestSet.local_shows.length; i += BATCH_SIZE) {
      batches.push(localTestSet.local_shows.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`🚀 Processing ${localTestSet.local_shows.length} shows in ${batches.length} parallel batches of ${BATCH_SIZE}`);
    console.log(`⏱️  Estimated time: ~${Math.round((batches.length * 70) / 60)} minutes (${batches.length} batches × ~70s avg per batch)`);
    console.log('');
    
    let processedCount = 0;
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`\n📦 BATCH ${batchIndex + 1}/${batches.length} - Processing ${batch.length} shows in parallel...`);
      
      // Process all shows in this batch concurrently
      const batchPromises = batch.map(async (localShow, indexInBatch) => {
        const globalIndex = processedCount + indexInBatch;
        const showId = `[${globalIndex + 1}/${localTestSet.local_shows.length}]`;
        
        console.log(`🔬 ${showId} Starting: "${localShow.title}" by ${localShow.artist_names.join(', ')}`);
        
        // Analyze current data state
        const originalPressReleaseLength = localShow.press_release?.length || 0;
        const originalImageCount = localShow.image_url ? 1 : 0;
        const originalHasSummary = !!localShow.show_summary;
        
        const showStartTime = Date.now();
        
        try {
          // Create search context with Phase 2 parameters
          const year = new Date(localShow.start_date).getFullYear().toString();
          const context: ShowSearchContext = {
            title: localShow.title || 'Untitled',
            artist: localShow.artist_names[0] || 'Unknown Artist',
            gallery: localShow.gallery_name,
            year: year,
            gallery_website: localShow.gallery_website || undefined,

          };
          
          const aiResult = await pipeline.discoverAndExtract(context);
          const processingTime = Math.round((Date.now() - showStartTime) / 1000);
          
          // Create enriched show object
          const enrichedShow: EnrichedShow = {
            ...localShow,
            ai_enrichment: {
              success: aiResult.success,
              confidence: aiResult.confidence || 0,
              discovered_url: aiResult.discoveredUrl,
              processing_time_seconds: processingTime,
              quality_criteria_met: 0,
              enrichment_timestamp: new Date().toISOString(),
              errors: aiResult.errors || []
            }
          };
          
          // Analyze improvements if successful
          if (aiResult.success && aiResult.extractedData) {
            const aiData = aiResult.extractedData;
            let qualityCriteriaMet = 0;
            
            // Update main show fields with AI-extracted data
            if (aiData.image_url && !aiData.image_url.includes('artforum.com')) {
              enrichedShow.image_url = aiData.image_url;
              qualityCriteriaMet++;
              console.log(`🖼️ ${showId} Replaced main image`);
            }
            
            if (aiData.additional_images && aiData.additional_images.length > 0) {
              enrichedShow.additional_images = aiData.additional_images;
              qualityCriteriaMet++;
              console.log(`📸 ${showId} Added ${aiData.additional_images.length} additional images`);
            }
            
            if (aiData.press_release && aiData.press_release.length > originalPressReleaseLength) {
              enrichedShow.press_release = aiData.press_release;
              qualityCriteriaMet++;
              console.log(`📄 ${showId} Updated press release (${originalPressReleaseLength} → ${aiData.press_release.length} chars)`);
            }
            
            if (aiData.show_summary && !originalHasSummary) {
              enrichedShow.show_summary = aiData.show_summary;
              console.log(`📝 ${showId} Added show summary`);
            }
            
            // Phase 2: Log enhanced metadata extraction
            if (aiData.artist_medium) {
              console.log(`🎨 ${showId} Detected artist medium: ${aiData.artist_medium}`);
            }
            
            if (aiData.show_url && !aiData.show_url.includes('artforum.com')) {
              console.log(`🔗 ${showId} Gallery exhibition URL: ${aiData.show_url}`);
            }
            
            if (aiResult.discoveredUrl && !aiResult.discoveredUrl.includes('artforum.com')) {
              qualityCriteriaMet++;
            }
            
            enrichedShow.ai_enrichment.quality_criteria_met = qualityCriteriaMet;
            
            // Mark as enriched if 3+ criteria met
            if (qualityCriteriaMet >= 3) {
              enrichedShow.has_been_enriched = true;
              console.log(`✅ ${showId} Quality success! ${qualityCriteriaMet}/4 criteria - marked enriched (${processingTime}s)`);
              return { enrichedShow, success: true, qualitySuccess: true, improvements: { pressRelease: aiData.press_release && aiData.press_release.length > originalPressReleaseLength, images: aiData.additional_images && aiData.additional_images.length > 0, summary: aiData.show_summary && !originalHasSummary } };
            } else {
              console.log(`⚠️ ${showId} Quality insufficient: ${qualityCriteriaMet}/4 criteria (${processingTime}s)`);
              return { enrichedShow, success: true, qualitySuccess: false, improvements: { pressRelease: aiData.press_release && aiData.press_release.length > originalPressReleaseLength, images: aiData.additional_images && aiData.additional_images.length > 0, summary: aiData.show_summary && !originalHasSummary } };
            }
            
          } else {
            console.log(`❌ ${showId} Failed: ${aiResult.errors?.join(', ') || 'Unknown error'} (${processingTime}s)`);
            return { enrichedShow, success: false, qualitySuccess: false, error: aiResult.errors?.join(', ') || 'Unknown error', improvements: { pressRelease: false, images: false, summary: false } };
          }
          
        } catch (error: any) {
          const processingTime = Math.round((Date.now() - showStartTime) / 1000);
          console.log(`💥 ${showId} Error: ${error.message} (${processingTime}s)`);
          
          const failedShow: EnrichedShow = {
            ...localShow,
            ai_enrichment: {
              success: false,
              confidence: 0,
              processing_time_seconds: processingTime,
              quality_criteria_met: 0,
              enrichment_timestamp: new Date().toISOString(),
              errors: [error.message]
            }
          };
          
          return { enrichedShow: failedShow, success: false, qualitySuccess: false, error: error.message, improvements: { pressRelease: false, images: false, summary: false } };
        }
      });
      
      // Wait for all shows in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process batch results
      batchResults.forEach(result => {
        enrichedShows.push(result.enrichedShow);
        
        if (result.success) {
          successCount++;
          if (result.qualitySuccess) {
            qualityEnrichmentCount++;
          }
          
          // Count improvements
          if (result.improvements.pressRelease) pressReleaseAdditions++;
          if (result.improvements.images) imageAdditions++;
          if (result.improvements.summary) summaryAdditions++;
        } else {
          errors.push(`Show ${processedCount + 1}: ${result.error}`);
        }
      });
      
      processedCount += batch.length;
      
      // Progress update
      const batchTime = Math.max(...batchResults.map(r => r.enrichedShow.ai_enrichment.processing_time_seconds));
      const qualityInBatch = batchResults.filter(r => r.qualitySuccess).length;
      console.log(`📊 Batch ${batchIndex + 1} complete: ${batchResults.filter(r => r.success).length}/${batch.length} technical success, ${qualityInBatch}/${batch.length} quality success (${batchTime}s max)`);
      
      // Delay between batches (except for the last one)
      if (batchIndex < batches.length - 1) {
        console.log(`⏳ Waiting ${BATCH_DELAY/1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
    
    const totalProcessingTime = Math.round((Date.now() - startTime) / 1000);
    
    // Create enrichment results
    const enrichmentResults: EnrichmentResults = {
      local_test_reference: localTestFile,
      enriched_shows: enrichedShows,
      // Technical success metrics
      technical_success_rate: Math.round((successCount / localTestSet.local_shows.length) * 100),
      total_shows: localTestSet.local_shows.length,
      successful_extractions: successCount,
      failed_extractions: localTestSet.local_shows.length - successCount,
      // Quality enrichment metrics  
      quality_enrichment_rate: Math.round((qualityEnrichmentCount / localTestSet.local_shows.length) * 100),
      quality_enrichments: qualityEnrichmentCount,
      insufficient_quality: localTestSet.local_shows.length - qualityEnrichmentCount,
      total_processing_time_seconds: totalProcessingTime,
      improvements_summary: {
        press_release_additions: pressReleaseAdditions,
        image_additions: imageAdditions,
        summary_additions: summaryAdditions
      },
      extracted_at: new Date().toISOString()
    };
    
    // Save enrichment results
    const resultFilename = `enrichment_results_${Date.now()}.json`;
    const resultPath = path.join('outputs', resultFilename);
    fs.writeFileSync(resultPath, JSON.stringify(enrichmentResults, null, 2));
    
    console.log('\n🎯 AI ENRICHMENT TEST COMPLETE');
    console.log('==============================');
    console.log(`📊 TECHNICAL SUCCESS: ${enrichmentResults.technical_success_rate}% (${successCount}/${localTestSet.local_shows.length}) - Pipeline completed without errors`);
    console.log(`🏆 QUALITY ENRICHMENT: ${enrichmentResults.quality_enrichment_rate}% (${qualityEnrichmentCount}/${localTestSet.local_shows.length}) - Shows meaningfully improved (3+ criteria)`);
    console.log(`⏱️  Total Time: ${totalProcessingTime} seconds (avg: ${Math.round(totalProcessingTime/localTestSet.local_shows.length)}s per show)`);
    console.log(`📁 Results saved to: ${resultFilename}`);
    console.log('');
    console.log('📈 AI Improvements:');
    console.log(`   Press Release additions: ${pressReleaseAdditions}/${localTestSet.local_shows.length} shows`);
    console.log(`   Image additions: ${imageAdditions}/${localTestSet.local_shows.length} shows`);
    console.log(`   Summary additions: ${summaryAdditions}/${localTestSet.local_shows.length} shows`);
    
    const totalImprovements = pressReleaseAdditions + imageAdditions + summaryAdditions;
    const maxPossibleImprovements = localTestSet.local_shows.length * 3;
    const improvementRate = Math.round((totalImprovements / maxPossibleImprovements) * 100);
    
    console.log(`\n📈 Content Improvement Rate: ${improvementRate}% (${totalImprovements}/${maxPossibleImprovements} possible improvements)`);
    
    if (errors.length > 0) {
      console.log(`\n❌ Errors encountered:`);
      errors.forEach(error => {
        console.log(`   - ${error}`);
      });
    }
    
    console.log(`\n🔗 Next step: Analyze detailed results in ${resultFilename}`);
    
  } catch (error: any) {
    console.error(`💥 Enrichment test failed: ${error.message}`);
    throw error;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Please provide local test set file name');
    console.log('Usage: npm run enrich-test-shows <local_unenriched_test_set_file.json>');
    console.log('Example: npm run enrich-test-shows local_unenriched_test_set_1752182405592.json');
    process.exit(1);
  }

  const localTestFile = args[0];
  
  try {
    await enrichTestShows(localTestFile);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 