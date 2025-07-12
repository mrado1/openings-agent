import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

interface EnrichedShow {
  id: number;
  title: string;
  artist_names: string[];
  press_release: string | null;
  image_url: string | null;
  additional_images: string[] | null;
  show_summary: string | null;
  has_been_enriched: boolean;
  ai_enrichment: {
    success: boolean;
    confidence: number;
    discovered_url?: string;
    processing_time_seconds: number;
    quality_criteria_met: number;
    enrichment_timestamp: string;
    errors: string[];
  };
  artist_metadata?: {
    medium?: string[];
    career_stage?: string;
  };
}

interface EnrichmentResults {
  enriched_shows: EnrichedShow[];
}

async function updateDatabaseFromResults(resultsFile: string, isDryRun: boolean = false): Promise<void> {
  const client = new Client({
    host: 'localhost',
    port: 5433,
    database: 'scene_dev',
    user: 'scene',
    password: 'dev_password',
  });

  try {
    // Load enrichment results
    const resultsPath = resultsFile.startsWith('outputs/') ? resultsFile : path.join('outputs', resultsFile);
    if (!fs.existsSync(resultsPath)) {
      throw new Error(`Results file not found: ${resultsPath}`);
    }
    
    const results: EnrichmentResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    console.log(`📋 Loaded ${results.enriched_shows.length} enriched shows from ${resultsFile}`);
    
    await client.connect();
    console.log('🔗 Connected to database for updates');
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const show of results.enriched_shows) {
      if (!show.ai_enrichment.success) {
        console.log(`   ⏭️  Skipping ${show.title} - enrichment failed`);
        skippedCount++;
        continue;
      }
      
      if (isDryRun) {
        console.log(`   🔍 [DRY RUN] Would update show ${show.id}: ${show.title}`);
        console.log(`     - has_been_enriched: ${show.has_been_enriched}`);
        console.log(`     - quality_criteria_met: ${show.ai_enrichment.quality_criteria_met}`);
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

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('❌ Please provide enrichment results file name');
    console.log('Usage: ts-node src/updateDatabaseFromResults.ts <enrichment_results_file.json> [--dry-run]');
    console.log('Example: ts-node src/updateDatabaseFromResults.ts enrichment_results_1752279675935.json');
    process.exit(1);
  }

  const resultsFile = args[0];
  const isDryRun = args.includes('--dry-run');
  
  console.log(`🔬 Updating database from enrichment results: ${resultsFile}`);
  if (isDryRun) {
    console.log('📊 DRY RUN MODE - No actual database changes will be made');
  }
  console.log('');
  
  try {
    await updateDatabaseFromResults(resultsFile, isDryRun);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 