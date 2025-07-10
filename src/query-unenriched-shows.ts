import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

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
  missing_data_analysis: {
    no_press_release: number;
    no_images: number;
    no_summary: number;
    no_gallery_website: number;
  };
  extracted_at: string;
}

async function queryUnenrichedShows(limit: number = 10): Promise<void> {
  console.log(`🔍 Finding ${limit} unenriched shows with missing data for AI enrichment testing...`);

  const client = new Client({
    host: 'localhost',
    port: 5433,
    database: 'scene_dev',
    user: 'scene',
    password: 'dev_password',
  });

  try {
    await client.connect();
    console.log('🔗 Connected to local Scene database');

    // First, get stats on unenriched shows
    const statsResult = await client.query(`
      SELECT 
        COUNT(*) as total_unenriched,
        COUNT(*) FILTER (WHERE press_release IS NULL OR press_release = '') as no_press_release,
        COUNT(*) FILTER (WHERE image_url IS NULL OR image_url = '') as no_images,
        COUNT(*) FILTER (WHERE show_summary IS NULL OR show_summary = '') as no_summary,
        COUNT(*) FILTER (WHERE g.website IS NULL OR g.website = '') as no_gallery_website
      FROM shows s 
      JOIN galleries g ON s.gallery_id = g.id
      WHERE s.has_been_enriched = false;
    `);

    const stats = statsResult.rows[0];
    console.log(`📊 Unenriched shows analysis:`);
    console.log(`   Total unenriched: ${stats.total_unenriched}`);
    console.log(`   Missing press release: ${stats.no_press_release}`);
    console.log(`   Missing images: ${stats.no_images}`);
    console.log(`   Missing summary: ${stats.no_summary}`);
    console.log(`   Missing gallery website: ${stats.no_gallery_website}`);

    // Select diverse shows prioritizing those with missing data
    const result = await client.query(`
      SELECT s.*, g.name as gallery_name, g.website as gallery_website, g.address as gallery_address,
             ARRAY_AGG(a.name ORDER BY a.name) as artist_names
      FROM shows s 
      JOIN galleries g ON s.gallery_id = g.id
      JOIN artists a ON a.id = ANY(s.artist_ids)
      WHERE s.has_been_enriched = false
      AND g.website IS NOT NULL AND g.website != ''
      GROUP BY s.id, g.id, g.name, g.website, g.address
      ORDER BY 
        -- Prioritize shows missing press releases
        CASE WHEN (s.press_release IS NULL OR s.press_release = '') THEN 0 ELSE 1 END,
        -- Then shows missing summaries  
        CASE WHEN (s.show_summary IS NULL OR s.show_summary = '') THEN 0 ELSE 1 END,
        -- Diversify by gallery (one per gallery)
        g.name,
        s.start_date DESC
      LIMIT $1;
    `, [limit * 3]); // Get more to allow for diversity filtering

    // Filter to one show per gallery for diversity
    const galleryMap = new Map<string, LocalUnenrichedShow>();
    const selectedShows: LocalUnenrichedShow[] = [];

    result.rows.forEach(row => {
      const galleryName = row.gallery_name;
      if (!galleryMap.has(galleryName) && selectedShows.length < limit) {
        const show: LocalUnenrichedShow = {
          id: row.id,
          title: row.title,
          artist_names: row.artist_names,
          gallery_name: row.gallery_name,
          gallery_website: row.gallery_website,
          start_date: row.start_date,
          end_date: row.end_date,
          press_release: row.press_release,
          image_url: row.image_url,
          additional_images: row.additional_images,
          show_summary: row.show_summary,
          has_been_enriched: row.has_been_enriched,
          source_url: row.source_url,
          scraped_at: row.scraped_at,
          gallery_address: row.gallery_address
        };
        
        galleryMap.set(galleryName, show);
        selectedShows.push(show);
      }
    });

    console.log(`\n✅ Selected ${selectedShows.length} diverse unenriched shows:`);
    selectedShows.forEach((show, i) => {
      const missingData = [];
      if (!show.press_release) missingData.push('press_release');
      if (!show.image_url) missingData.push('image');
      if (!show.show_summary) missingData.push('summary');
      
      console.log(`   ${i + 1}. "${show.title}" by ${show.artist_names.join(', ')}`);
      console.log(`      Gallery: ${show.gallery_name}`);
      console.log(`      Missing: ${missingData.length > 0 ? missingData.join(', ') : 'none'}`);
    });

    const testSet: LocalTestSet = {
      selection_criteria: 'Unenriched shows prioritizing missing press_release, diverse galleries, has gallery_website',
      local_shows: selectedShows,
      selected_count: selectedShows.length,
      total_unenriched: parseInt(stats.total_unenriched),
      missing_data_analysis: {
        no_press_release: parseInt(stats.no_press_release),
        no_images: parseInt(stats.no_images),
        no_summary: parseInt(stats.no_summary),
        no_gallery_website: parseInt(stats.no_gallery_website)
      },
      extracted_at: new Date().toISOString()
    };

    const filename = `local_unenriched_test_set_${Date.now()}.json`;
    const outputPath = path.join('outputs', filename);
    fs.writeFileSync(outputPath, JSON.stringify(testSet, null, 2));

    console.log(`\n📁 Local test set saved to: ${filename}`);
    console.log(`🔗 Next step: npm run enrich-test-shows ${filename}`);

  } catch (error: any) {
    console.error(`❌ Local database query failed: ${error.message}`);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limit = args[0] ? parseInt(args[0]) : 10;
  
  if (limit <= 0 || limit > 50) {
    console.error('❌ Please provide a valid limit (1-50)');
    process.exit(1);
  }

  try {
    await queryUnenrichedShows(limit);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 