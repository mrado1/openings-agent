"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs = __importStar(require("fs"));
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config({ path: '.env.local' });
async function queryBaseline() {
    const client = new pg_1.Client({
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
                const baselineData = createBaselineData(backupResult.rows[0]);
                fs.writeFileSync('./baseline_show_data.json', JSON.stringify(baselineData, null, 2));
                console.log('✅ Saved baseline data to baseline_show_data.json');
            }
        }
        else {
            console.log(`✅ Found ${result.rows.length} matching shows`);
            const baselineData = createBaselineData(result.rows[0]);
            fs.writeFileSync('./baseline_show_data.json', JSON.stringify(baselineData, null, 2));
            console.log('✅ Saved baseline data to baseline_show_data.json');
        }
    }
    catch (error) {
        console.error('❌ Database query failed:', error.message);
    }
    finally {
        await client.end();
    }
}
function createBaselineData(row) {
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
