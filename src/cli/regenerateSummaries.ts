import * as dotenv from 'dotenv';
import { Client } from 'pg';
import { SummaryGenerationService } from '../services/summaryGenerationService';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface ShowForSummaryUpdate {
  id: number;
  title: string;
  artist_names: string[];
  press_release: string;
  current_summary: string;
}

async function regenerateSummaries(limit: number = 50, dryRun: boolean = false): Promise<void> {
  console.log(`🔄 ${dryRun ? '[DRY RUN] ' : ''}Regenerating summaries for shows with truncated or poor summaries...`);
  
  const client = new Client({
    host: 'localhost',
    port: 5433,
    database: 'scene_dev',
    user: 'scene',
    password: 'dev_password',
  });

  const summaryService = new SummaryGenerationService();

  try {
    await client.connect();
    console.log('🔗 Connected to local Scene database');

    // Query shows with truncated summaries or poor content
    const result = await client.query(`
      SELECT s.id, s.title, s.press_release, s.show_summary as current_summary,
             ARRAY_AGG(a.name ORDER BY a.name) as artist_names
      FROM shows s 
      JOIN artists a ON a.id = ANY(s.artist_ids)
      WHERE s.press_release IS NOT NULL 
        AND s.press_release != ''
        AND (
          s.show_summary LIKE '%...' 
          OR s.show_summary LIKE '%not enough information%'
          OR s.show_summary LIKE '%Press release did not provide%'
          OR s.show_summary LIKE '%insufficient%'
        )
      GROUP BY s.id, s.title, s.press_release, s.show_summary
      ORDER BY s.id
      LIMIT $1;
    `, [limit]);

    const shows: ShowForSummaryUpdate[] = result.rows;
    console.log(`📋 Found ${shows.length} shows needing summary regeneration`);

    if (shows.length === 0) {
      console.log('✅ No shows found with truncated or poor summaries!');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < shows.length; i++) {
      const show = shows[i];
      const primaryArtist = show.artist_names[0];
      
      console.log(`\n🔄 [${i + 1}/${shows.length}] Processing: "${show.title}" by ${primaryArtist}`);
      console.log(`   Current summary: ${show.current_summary.substring(0, 100)}${show.current_summary.length > 100 ? '...' : ''}`);
      console.log(`   Press release length: ${show.press_release.length} chars`);

      try {
        // Generate new summary
        const newSummary = await summaryService.generateSummary(
          show.press_release, 
          show.title, 
          primaryArtist
        );

        if (dryRun) {
          console.log(`   🔍 [DRY RUN] Would update to: ${newSummary}`);
        } else {
          // Update database
          await client.query(`
            UPDATE shows 
            SET show_summary = $1 
            WHERE id = $2
          `, [newSummary, show.id]);
          
          console.log(`   ✅ Updated summary: ${newSummary}`);
        }

        successCount++;

        // Rate limiting between requests
        if (i < shows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }

      } catch (error: any) {
        failCount++;
        console.error(`   ❌ Failed to regenerate summary: ${error.message}`);
      }
    }

    console.log(`\n📊 Summary regeneration complete:`);
    console.log(`   ✅ Successful updates: ${successCount}`);
    console.log(`   ❌ Failed updates: ${failCount}`);
    console.log(`   📈 Success rate: ${Math.round((successCount / shows.length) * 100)}%`);

  } catch (error: any) {
    console.error(`💥 Database operation failed: ${error.message}`);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(arg => arg.match(/^\d+$/));
  const limit = limitArg ? parseInt(limitArg) : 50;
  const dryRun = args.includes('--dry-run');
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run regenerate-summaries [limit] [--dry-run]');
    console.log('');
    console.log('Examples:');
    console.log('  npm run regenerate-summaries 20 --dry-run   # Test mode: check 20 shows');
    console.log('  npm run regenerate-summaries 50             # Update 50 shows');
    console.log('  npm run regenerate-summaries                # Update 50 shows (default)');
    console.log('');
    console.log('This script finds shows with:');
    console.log('  - Truncated summaries ending with "..."');
    console.log('  - Poor summaries mentioning "not enough information"');
    console.log('  - Summaries with "insufficient" content warnings');
    process.exit(0);
  }

  try {
    await regenerateSummaries(limit, dryRun);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 