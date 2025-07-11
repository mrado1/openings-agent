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
    added_data: {
      press_release?: {
        original_length: number;
        ai_length: number;
        content?: string;
      };
      images?: {
        original_count: number;
        ai_count: number;
        additional_images?: string[];
      };
      show_summary?: {
        original_exists: boolean;
        ai_generated: boolean;
        content?: string;
      };
    };
    errors: string[];
  };
}

interface EnrichmentResults {
  local_test_reference: string;
  enriched_shows: EnrichedShow[];
  success_rate: number;
  total_shows: number;
  successful_enrichments: number;
  failed_enrichments: number;
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
    const localTestPath = path.join('outputs', localTestFile);
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
    let successCount = 0;
    let pressReleaseAdditions = 0;
    let imageAdditions = 0;
    let summaryAdditions = 0;
    
    const startTime = Date.now();
    
    // Process each show
    for (let i = 0; i < localTestSet.local_shows.length; i++) {
      const localShow = localTestSet.local_shows[i];
      console.log(`\n🔬 [${i + 1}/${localTestSet.local_shows.length}] Enriching: "${localShow.title}"`);
      console.log(`   Artist: ${localShow.artist_names.join(', ')}`);
      console.log(`   Gallery: ${localShow.gallery_name}`);
      
      // Analyze current data state
      const originalPressReleaseLength = localShow.press_release?.length || 0;
      const originalImageCount = localShow.image_url ? 1 : 0; // Artforum only has 1 preview image
      const originalHasSummary = !!localShow.show_summary;
      
      console.log(`   Current: PR=${originalPressReleaseLength} chars, Images=${originalImageCount}, Summary=${originalHasSummary}`);
      
      const showStartTime = Date.now();
      
      try {
        // Create search context
        const year = new Date(localShow.start_date).getFullYear().toString();
        const context: ShowSearchContext = {
          title: localShow.title || 'Untitled',
          artist: localShow.artist_names[0] || 'Unknown Artist',
          gallery: localShow.gallery_name,
          year: year,
          gallery_website: localShow.gallery_website || undefined
        };
        
        console.log(`   🚀 Running AI discovery pipeline...`);
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
            added_data: {},
            errors: aiResult.errors || []
          }
        };
        
        // Analyze improvements if successful
        if (aiResult.success && aiResult.extractedData) {
          const aiData = aiResult.extractedData;
          
          // CRITICAL FIX: Update main show fields with AI-extracted data
          // Replace Artforum image_url with gallery image_url if found
          if (aiData.image_url && !aiData.image_url.includes('artforum.com')) {
            enrichedShow.image_url = aiData.image_url;
            console.log(`   🖼️ Replaced main image: ${localShow.image_url} → ${aiData.image_url}`);
          }
          
          // Update additional_images if AI found better images
          if (aiData.additional_images && aiData.additional_images.length > 0) {
            enrichedShow.additional_images = aiData.additional_images;
            console.log(`   📸 Updated additional images: ${aiData.additional_images.length} images`);
          }
          
          // Update press_release if AI found better content
          if (aiData.press_release && aiData.press_release.length > originalPressReleaseLength) {
            enrichedShow.press_release = aiData.press_release;
            console.log(`   📄 Updated press release: ${originalPressReleaseLength} → ${aiData.press_release.length} chars`);
          }
          
          // Update show_summary if AI generated one
          if (aiData.show_summary && !originalHasSummary) {
            enrichedShow.show_summary = aiData.show_summary;
            console.log(`   📝 Added show summary`);
          }
          
          // Press release analysis for tracking
          const aiPressReleaseLength = aiData.press_release?.length || 0;
          if (aiPressReleaseLength > originalPressReleaseLength) {
            enrichedShow.ai_enrichment.added_data.press_release = {
              original_length: originalPressReleaseLength,
              ai_length: aiPressReleaseLength,
              content: aiData.press_release
            };
            pressReleaseAdditions++;
          }
          
          // Image analysis - count additional_images from AI
          const aiImageCount = (aiData.additional_images?.length || 0);
          if (aiImageCount > 0) {
            enrichedShow.ai_enrichment.added_data.images = {
              original_count: originalImageCount,
              ai_count: aiImageCount,
              additional_images: aiData.additional_images
            };
            imageAdditions++;
          }
          
          // Summary analysis for tracking
          if (aiData.show_summary && !originalHasSummary) {
            enrichedShow.ai_enrichment.added_data.show_summary = {
              original_exists: originalHasSummary,
              ai_generated: true,
              content: aiData.show_summary
            };
            summaryAdditions++;
          }
          
          successCount++;
          
          // Log improvements
          const improvements = [];
          if (enrichedShow.ai_enrichment.added_data.press_release) {
            improvements.push(`PR +${aiPressReleaseLength - originalPressReleaseLength} chars`);
          }
          if (enrichedShow.ai_enrichment.added_data.images) {
            improvements.push(`Images +${aiImageCount}`);
          }
          if (enrichedShow.ai_enrichment.added_data.show_summary) {
            improvements.push('Summary added');
          }
          
          console.log(`   ✅ Success! Confidence: ${aiResult.confidence}%`);
          console.log(`   🌐 Found URL: ${aiResult.discoveredUrl}`);
          console.log(`   ➕ Improvements: ${improvements.length > 0 ? improvements.join(', ') : 'None'}`);
          console.log(`   ⏱️  Processing time: ${processingTime}s`);
          
        } else {
          console.log(`   ❌ Failed: ${aiResult.errors?.join(', ') || 'Unknown error'}`);
          errors.push(`Show ${i + 1} (${localShow.title}): ${aiResult.errors?.join(', ') || 'Unknown error'}`);
        }
        
        enrichedShows.push(enrichedShow);
        
      } catch (error: any) {
        const processingTime = Math.round((Date.now() - showStartTime) / 1000);
        console.log(`   💥 Error: ${error.message}`);
        errors.push(`Show ${i + 1} (${localShow.title}): ${error.message}`);
        
        // Add failed enrichment entry
        const failedShow: EnrichedShow = {
          ...localShow,
          ai_enrichment: {
            success: false,
            confidence: 0,
            processing_time_seconds: processingTime,
            added_data: {},
            errors: [error.message]
          }
        };
        
        enrichedShows.push(failedShow);
      }
      
      // Wait between requests
      if (i < localTestSet.local_shows.length - 1) {
        console.log(`   ⏳ Waiting 2 seconds before next enrichment...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    const totalProcessingTime = Math.round((Date.now() - startTime) / 1000);
    
    // Create enrichment results
    const enrichmentResults: EnrichmentResults = {
      local_test_reference: localTestFile,
      enriched_shows: enrichedShows,
      success_rate: Math.round((successCount / localTestSet.local_shows.length) * 100),
      total_shows: localTestSet.local_shows.length,
      successful_enrichments: successCount,
      failed_enrichments: localTestSet.local_shows.length - successCount,
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
    console.log(`✅ Success Rate: ${enrichmentResults.success_rate}% (${successCount}/${localTestSet.local_shows.length})`);
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
    
    console.log(`\n🏆 Overall Improvement Rate: ${improvementRate}%`);
    
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