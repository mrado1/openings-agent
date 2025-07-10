import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

interface ProductionShow {
  id: number;
  title: string;
  artist_names: string[];
  gallery_name: string;
  start_date: string;
  end_date: string;
  press_release: string;
  image_url: string | null;
  additional_images: string[] | null;
  show_summary: string | null;
  has_been_enriched: boolean;
  source_url: string;
  scraped_at: string;
  gallery_website: string;
  gallery_address: string | null;
}

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
  unmatched_ids: number[];
  extracted_at: string;
}

async function queryLocalUnenriched(productionTestFile: string): Promise<void> {
  const productionPath = path.join('outputs', productionTestFile);
  if (!fs.existsSync(productionPath)) {
    throw new Error(`Production test file not found: ${productionPath}`);
  }

  const productionTest = JSON.parse(fs.readFileSync(productionPath, 'utf8'));
  const productionShows: ProductionShow[] = productionTest.selected_shows;
  const productionIds = productionShows.map(show => show.id);

  console.log(`📋 Loaded ${productionShows.length} production shows from: ${productionTestFile}`);
  console.log(`🔍 Finding same show IDs in local database (unenriched only)...`);
  console.log(`📊 Looking for IDs: [${productionIds.join(', ')}]`);

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

    // Query for same IDs but unenriched only
    const result = await client.query(`
      SELECT s.*, g.name as gallery_name, g.website as gallery_website, g.address as gallery_address,
             ARRAY_AGG(a.name ORDER BY a.name) as artist_names
      FROM shows s 
      JOIN galleries g ON s.gallery_id = g.id
      JOIN artists a ON a.id = ANY(s.artist_ids)
      WHERE s.id = ANY($1)
      AND s.has_been_enriched = false
      GROUP BY s.id, g.id, g.name, g.website, g.address
      ORDER BY s.id;
    `, [productionIds]);

    const localUnenrichedShows: LocalUnenrichedShow[] = result.rows.map(row => ({
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
    }));

    const foundIds = localUnenrichedShows.map(show => show.id);
    const unmatchedIds = productionIds.filter(id => !foundIds.includes(id));

    console.log(`\n✅ Found ${localUnenrichedShows.length}/${productionShows.length} local unenriched shows:`);
    localUnenrichedShows.forEach(show => {
      console.log(`   ${show.id}: "${show.title}" by ${show.artist_names.join(', ')}`);
    });

    if (unmatchedIds.length > 0) {
      console.log(`\n❌ Unmatched IDs: [${unmatchedIds.join(', ')}] (already enriched or missing)`);
    }

    const localTestSet: LocalTestSet = {
      production_reference: productionTestFile,
      local_unenriched_shows: localUnenrichedShows,
      match_criteria: 'Same show IDs + has_been_enriched=false',
      matched_count: localUnenrichedShows.length,
      unmatched_ids: unmatchedIds,
      extracted_at: new Date().toISOString()
    };

    const filename = `local_unenriched_set_${Date.now()}.json`;
    const outputPath = path.join('outputs', filename);
    fs.writeFileSync(outputPath, JSON.stringify(localTestSet, null, 2));

    console.log(`\n📁 Local test set saved to: ${filename}`);
    console.log(`🔗 Next step: npm run enrich-local-shows ${filename}`);

  } catch (error: any) {
    console.error(`❌ Local database query failed: ${error.message}`);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('❌ Please provide production test file name');
    process.exit(1);
  }

  try {
    await queryLocalUnenriched(args[0]);
  } catch (error: any) {
    console.error(`💥 Failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 