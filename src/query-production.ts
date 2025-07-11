import { Client } from 'pg';
import * as fs from 'fs';

interface ProductionShow {
  id: number;
  title: string;
  artist_ids: number[];
  gallery_id: number;
  start_date: string;
  end_date: string;
  press_release: string | null;
  image_url: string | null;
  additional_images: string[] | null;
  show_summary: string | null;
  has_been_enriched: boolean;
  source_url: string;
  scraped_at: string;
  gallery_name: string;
  artist_names: string[];
  gallery_website: string | null;
  gallery_address: string | null;
}

interface ProductionTestSet {
  selected_shows: ProductionShow[];
  selection_criteria: string;
  total_enriched_shows: number;
  diversity_metrics: {
    galleries: string[];
    artists: string[];
    date_range: string;
  };
  extracted_at: string;
}

async function queryProductionShows(): Promise<void> {
  // Production database connection from environment
  const productionConnectionString = process.env.PRODUCTION_DATABASE_URL;
  
  if (!productionConnectionString) {
    console.error('❌ PRODUCTION_DATABASE_URL environment variable is required');
    console.log('💡 Please set: export PRODUCTION_DATABASE_URL="your-neon-connection-string"');
    console.log('📝 Get it from: Vercel Dashboard → Project → Settings → Environment Variables');
    process.exit(1);
  }

  const client = new Client({
    connectionString: productionConnectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('🔗 Connected to Production Scene database');

    // First, check how many shows are enriched
    const enrichedCountResult = await client.query(`
      SELECT COUNT(*) as total_enriched
      FROM shows 
      WHERE has_been_enriched = true;
    `);

    const totalEnriched = parseInt(enrichedCountResult.rows[0].total_enriched);
    console.log(`📊 Found ${totalEnriched} enriched shows in production`);

    if (totalEnriched === 0) {
      console.log('⚠️ No enriched shows found in production database');
      console.log('💡 Make sure you\'re connected to the correct production database');
      return;
    }

    // Query for 10 diverse enriched shows with gallery and artist details
    const diverseShowsQuery = `
      WITH diverse_shows AS (
        SELECT DISTINCT ON (s.gallery_id) 
          s.*,
          g.name as gallery_name,
          g.website as gallery_website,
          g.address as gallery_address,
          ARRAY_AGG(a.name ORDER BY a.name) as artist_names
        FROM shows s 
        JOIN galleries g ON s.gallery_id = g.id
        JOIN artists a ON a.id = ANY(s.artist_ids)
        WHERE s.has_been_enriched = true
        AND s.press_release IS NOT NULL
        AND s.press_release != ''
        AND g.website IS NOT NULL
        AND g.website != ''
        GROUP BY s.id, g.id, g.name, g.website, g.address
        ORDER BY s.gallery_id, s.start_date DESC
        LIMIT 10
      )
      SELECT * FROM diverse_shows
      ORDER BY start_date DESC;
    `;

    const result = await client.query<ProductionShow>(diverseShowsQuery);

    if (result.rows.length === 0) {
      console.log('⚠️ No suitable enriched shows found with required data');
      console.log('💡 Shows need: enriched=true, press_release, gallery_website');
      return;
    }

    console.log(`✅ Selected ${result.rows.length} diverse enriched shows:`);
    
    const galleries = new Set<string>();
    const artists = new Set<string>();
    let earliestDate = '';
    let latestDate = '';

    result.rows.forEach((show, index) => {
      console.log(`${index + 1}. "${show.title}" by ${show.artist_names.join(', ')}`);
      console.log(`   at ${show.gallery_name} (${show.gallery_website})`);
      console.log(`   ${show.start_date} to ${show.end_date}`);
      console.log('');
      
      galleries.add(show.gallery_name);
      show.artist_names.forEach(artist => artists.add(artist));
      
      if (!earliestDate || show.start_date < earliestDate) earliestDate = show.start_date;
      if (!latestDate || show.end_date > latestDate) latestDate = show.end_date;
    });

    const testSet: ProductionTestSet = {
      selected_shows: result.rows,
      selection_criteria: 'One show per gallery, enriched=true, has press_release and gallery_website',
      total_enriched_shows: totalEnriched,
      diversity_metrics: {
        galleries: Array.from(galleries),
        artists: Array.from(artists),
        date_range: `${earliestDate} to ${latestDate}`
      },
      extracted_at: new Date().toISOString()
    };

    // Save the production test set
    const filename = `production_test_set_${Date.now()}.json`;
    const outputPath = `./outputs/${filename}`;
    fs.writeFileSync(outputPath, JSON.stringify(testSet, null, 2));

    console.log(`📁 Production test set saved to: ${outputPath}`);
    console.log(`📊 Diversity: ${galleries.size} galleries, ${artists.size} artists`);
    console.log(`📅 Date range: ${testSet.diversity_metrics.date_range}`);
    
    return;

  } catch (error: any) {
    console.error(`❌ Production database query failed: ${error.message}`);
    if (error.message?.includes('connect')) {
      console.log('💡 Check your PRODUCTION_DATABASE_URL connection string');
      console.log('🔗 Format: postgresql://user:pass@host.neon.tech/dbname?sslmode=require');
    }
    throw error;
  } finally {
    await client.end();
  }
}

// CLI interface
if (require.main === module) {
  console.log('🔍 Querying production database for enriched shows...');
  console.log('');
  
  queryProductionShows().catch(console.error);
}

export { queryProductionShows }; 