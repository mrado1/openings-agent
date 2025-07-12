import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client } from 'pg';
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
  // Phase 2: Enhanced metadata fields
  artist_metadata?: {
    medium?: string[];
    career_stage?: string;
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

async function updateDatabaseWithEnrichment(enrichedShows: EnrichedLocalShow[], isDryRun: boolean = false): Promise<void> {
  const client = new Client({
    host: 'localhost',
    port: 5433,
    database: 'scene_dev',
    user: 'scene',
    password: 'dev_password',
  });

  try {
    await client.connect();
    console.log('🔗 Connected to database for updates');
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const show of enrichedShows) {
      if (!show.ai_enrichment.success) {
        console.log(`   ⏭️  Skipping ${show.title} - enrichment failed`);
        skippedCount++;
        continue;
      }
      
      if (isDryRun) {
        console.log(`   🔍 [DRY RUN] Would update show ${show.id}: ${show.title}`);
        console.log(`     - has_been_enriched: ${show.has_been_enriched}`);
        console.log(`     - ai_enrichment metadata: ${JSON.stringify(show.ai_enrichment)}`);
        if (show.artist_metadata) {
          console.log(`     - artist_metadata: ${JSON.stringify(show.artist_metadata)}`);
        }
        continue;
      }
      
      // Update the shows table with enriched data
      await client.query(`
        UPDATE shows 
        SET 
          press_release = $1,
          image_url = $2,
          additional_images = $3,
          show_summary = $4,
          has_been_enriched = $5,
          ai_enrichment = $6,
          enriched_at = $7,
          show_url = $8
        WHERE id = $9
      `, [
        show.press_release,
        show.image_url,
        show.additional_images,
        show.show_summary,
        show.has_been_enriched,
        JSON.stringify(show.ai_enrichment),
        new Date(show.ai_enrichment.enrichment_timestamp),
        show.ai_enrichment.discovered_url,
        show.id
      ]);
      
      updatedCount++;
      console.log(`   ✅ Updated show ${show.id}: ${show.title}`);
      
      // Phase 2: Update artist metadata if available
      if (show.artist_metadata && show.artist_names.length > 0) {
        for (const artistName of show.artist_names) {
          // Check if artist exists
          const artistResult = await client.query('SELECT id FROM artists WHERE name = $1', [artistName]);
          
          if (artistResult.rows.length > 0) {
            const artistId = artistResult.rows[0].id;
            
            // Update artist with Phase 2 metadata
            if (show.artist_metadata.medium) {
              await client.query(`
                UPDATE artists 
                SET medium = $1 
                WHERE id = $2
              `, [show.artist_metadata.medium, artistId]);
              console.log(`     🎨 Updated artist ${artistName} medium: ${show.artist_metadata.medium.join(', ')}`);
            }
            
            if (show.artist_metadata.career_stage) {
              await client.query(`
                UPDATE artists 
                SET career_stage = $1 
                WHERE id = $2
              `, [show.artist_metadata.career_stage, artistId]);
              console.log(`     👤 Updated artist ${artistName} career stage: ${show.artist_metadata.career_stage}`);
            }
          }
        }
      }
    }
    
    console.log(`\n📊 Database update summary:`);
    console.log(`   ✅ Updated shows: ${updatedCount}`);
    console.log(`   ⏭️  Skipped shows: ${skippedCount}`);
    
  } catch (error: any) {
    console.error(`💥 Database update error: ${error.message}`);
    throw error;
  } finally {
    await client.end();
  }
}

async function enrichLocalShows(localTestFile: string, updateDatabase: boolean = false, dryRun: boolean = false): Promise<void> {
  try {
    console.log(`🔬 Starting AI enrichment of local shows: ${localTestFile}`);
    if (updateDatabase) {
      console.log(`📊 Database updates: ${dryRun ? 'DRY RUN' : 'ENABLED'}`);
    }
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
          year: year,
          gallery_website: localShow.gallery_website || undefined
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
          
          // Phase 2: Enhanced metadata extraction
          if (aiData.artist_metadata) {
            enrichedShow.artist_metadata = aiData.artist_metadata;
            console.log(`   🎨 Extracted artist metadata: ${JSON.stringify(aiData.artist_metadata)}`);
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
    }
    
    const processingTime = Math.round((Date.now() - startTime) / 1000);
    
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
    const resultFilename = `enrichment_results_${Date.now()}.json`;
    const resultPath = path.join('outputs', resultFilename);
    fs.writeFileSync(resultPath, JSON.stringify(enrichmentResults, null, 2));
    
    console.log('\n🎯 AI ENRICHMENT COMPLETE');
    console.log('=========================');
    console.log(`📊 Success Rate: ${enrichmentResults.success_rate}% (${successCount}/${localTestSet.local_unenriched_shows.length})`);
    console.log(`⏱️  Processing Time: ${processingTime} seconds`);
    console.log(`📁 Results saved to: ${resultFilename}`);
    
    if (errors.length > 0) {
      console.log(`\n❌ Errors encountered:`);
      errors.forEach(error => {
        console.log(`   - ${error}`);
      });
    }
    
    // Update database if requested
    if (updateDatabase) {
      console.log('\n📊 UPDATING DATABASE');
      console.log('====================');
      await updateDatabaseWithEnrichment(enrichedShows, dryRun);
    }
    
    console.log(`\n🔗 Next step: ${updateDatabase ? 'Database updated!' : 'Run with --update-database to update database'}`);
    
  } catch (error: any) {
    console.error(`💥 Enrichment failed: ${error.message}`);
    throw error;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Please provide local test set file name');
    console.log('Usage: npm run enrich-local-shows <local_test_file.json> [--update-database] [--dry-run]');
    console.log('Example: npm run enrich-local-shows local_unenriched_test_set_1234567890.json --update-database');
    process.exit(1);
  }

  const localTestFile = args[0];
  const updateDatabase = args.includes('--update-database');
  const dryRun = args.includes('--dry-run');
  
  try {
    await enrichLocalShows(localTestFile, updateDatabase, dryRun);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 