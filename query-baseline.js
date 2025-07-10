const { Client } = require('pg');
const fs = require('fs');

async function queryBaseline() {
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
    const result = await client.query(`
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
      const backupResult = await client.query(`
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
        const baselineData = {
          existing_data: {
            show_id: backupResult.rows[0].id,
            title: backupResult.rows[0].title,
            artist_names: [backupResult.rows[0].artist_name],
            gallery_name: backupResult.rows[0].gallery_name,
            gallery_address: backupResult.rows[0].address,
            gallery_website: backupResult.rows[0].website,
            start_date: backupResult.rows[0].start_date,
            end_date: backupResult.rows[0].end_date,
            press_release: backupResult.rows[0].press_release,
            image_url: backupResult.rows[0].image_url,
            source_url: backupResult.rows[0].source_url,
            has_been_enriched: backupResult.rows[0].has_been_enriched || false
          },
          extraction_target: {
            gallery_url: backupResult.rows[0].website || "extracted_gallery_website_url",
            expected_show_title: backupResult.rows[0].title,
            expected_artist: backupResult.rows[0].artist_name
          }
        };

        fs.writeFileSync('baseline_show_data.json', JSON.stringify(baselineData, null, 2));
        console.log('✅ Saved baseline data to baseline_show_data.json');
      }
    } else {
      console.log(`✅ Found ${result.rows.length} matching shows`);
      
      const baselineData = {
        existing_data: {
          show_id: result.rows[0].id,
          title: result.rows[0].title,
          artist_names: [result.rows[0].artist_name],
          gallery_name: result.rows[0].gallery_name,
          gallery_address: result.rows[0].address,
          gallery_website: result.rows[0].website,
          start_date: result.rows[0].start_date,
          end_date: result.rows[0].end_date,
          press_release: result.rows[0].press_release,
          image_url: result.rows[0].image_url,
          source_url: result.rows[0].source_url,
          has_been_enriched: result.rows[0].has_been_enriched || false
        },
        extraction_target: {
          gallery_url: result.rows[0].website || "extracted_gallery_website_url",
          expected_show_title: result.rows[0].title,
          expected_artist: result.rows[0].artist_name
        }
      };

      fs.writeFileSync('baseline_show_data.json', JSON.stringify(baselineData, null, 2));
      console.log('✅ Saved baseline data to baseline_show_data.json');
    }

  } catch (error) {
    console.error('❌ Database query failed:', error.message);
  } finally {
    await client.end();
  }
}

queryBaseline().catch(console.error); 