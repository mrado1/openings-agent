import { Client } from 'pg';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface BaselineRow {
  id: number;
  title: string;
  artist_name: string;
  gallery_name: string;
  address: string;
  website: string;
  hours: string;
  start_date: string;
  end_date: string;
  press_release: string;
  image_url: string;
  source_url: string;
  has_been_enriched?: boolean;
}

interface BaselineData {
  existing_data: {
    show_id: number;
    title: string;
    artist_names: string[];
    gallery_name: string;
    gallery_address: string;
    gallery_website: string;
    start_date: string;
    end_date: string;
    press_release: string;
    image_url: string;
    source_url: string;
    has_been_enriched: boolean;
  };
  extraction_target: {
    gallery_url: string;
    expected_show_title: string;
    expected_artist: string;
  };
}

async function queryBaseline(): Promise<void> {
  const client = new Client({
    host: 'localhost',
    port: 5433,
    database: 'scene_dev',
    user: 'scene',
    password: 'dev_password',
  });

  try {
    await client.connect();
    console.log('🔗 Connected to Scene database');

    // Query for Alicja Kwade shows with "Telos" in title
    const result = await client.query<BaselineRow>(`
      SELECT s.*, g.name as gallery_name, g.address, g.website, g.hours, a.name as artist_name
      FROM shows s 
      JOIN galleries g ON s.gallery_id = g.id
      JOIN artists a ON a.id = ANY(s.artist_ids)
      WHERE s.title ILIKE '%telos%' 
      AND a.name ILIKE '%kwade%'
      ORDER BY s.id;
    `);

    if (result.rows.length === 0) {
      console.log('⚠️ No Alicja Kwade Telos Tales show found. Searching for similar shows...');
      
      // Broader search for Alicja Kwade shows
      const backupResult = await client.query<BaselineRow>(`
        SELECT s.*, g.name as gallery_name, g.address, g.website, g.hours, a.name as artist_name
        FROM shows s 
        JOIN galleries g ON s.gallery_id = g.id
        JOIN artists a ON a.id = ANY(s.artist_ids)
        WHERE a.name ILIKE '%kwade%'
        ORDER BY s.id
        LIMIT 5;
      `);
      
      console.log(`Found ${backupResult.rows.length} Alicja Kwade shows:`);
      backupResult.rows.forEach(row => {
        console.log(`- "${row.title}" at ${row.gallery_name}`);
      });
      
      if (backupResult.rows.length > 0) {
        const baselineData = createBaselineData(backupResult.rows[0]);
        fs.writeFileSync('./baseline_show_data.json', JSON.stringify(baselineData, null, 2));
        console.log('✅ Saved baseline data to baseline_show_data.json');
      }
    } else {
      console.log(`✅ Found ${result.rows.length} matching shows`);
      
      const baselineData = createBaselineData(result.rows[0]);
      fs.writeFileSync('./baseline_show_data.json', JSON.stringify(baselineData, null, 2));
      console.log('✅ Saved baseline data to baseline_show_data.json');
    }

  } catch (error) {
    console.error('❌ Database query failed:', (error as Error).message);
  } finally {
    await client.end();
  }
}

function createBaselineData(row: BaselineRow): BaselineData {
  return {
    existing_data: {
      show_id: row.id,
      title: row.title,
      artist_names: [row.artist_name],
      gallery_name: row.gallery_name,
      gallery_address: row.address,
      gallery_website: row.website,
      start_date: row.start_date,
      end_date: row.end_date,
      press_release: row.press_release,
      image_url: row.image_url,
      source_url: row.source_url,
      has_been_enriched: row.has_been_enriched || false
    },
    extraction_target: {
      gallery_url: row.website || "extracted_gallery_website_url",
      expected_show_title: row.title,
      expected_artist: row.artist_name
    }
  };
}

if (require.main === module) {
  queryBaseline().catch(console.error);
} 