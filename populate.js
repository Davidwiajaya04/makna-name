// ================================================================
// MAKNANAME — Script Pre-Populate Database
// File: 03_populate.js
// Jalankan SEKALI untuk mengisi database awal
// Estimasi biaya: ~Rp 30.000-50.000 (pakai Claude Haiku)
// Waktu: ~1-2 jam untuk 1000 nama
// ================================================================
// Cara pakai:
//   npm install
//   node 03_populate.js
// ================================================================

import fetch from 'node-fetch';
import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const { Pool } = pg;
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ================================================================
// DAFTAR 1000+ NAMA UNTUK DI-GENERATE
// ================================================================
const NAMA_LIST = {
  islami_laki: [
    'Abdurrahman','Abdullah','Abdul Aziz','Abdul Karim','Abdul Malik',
    'Abu Bakar','Akbar','Alif','Alwi','Amiruddin','Anwar','Arif',
    'Arsyad','Athallah','Azzam','Badar','Bahri','Bilal','Burhan',
    'Daffa','Dzikri','Fadli','Fadillah','Faisal','Farid','Faris',
    'Farhan','Fatah','Fathur','Fuad','Ghani','Ghazi','Gibran',
    'Habib','Hamdan','Hamid','Hamka','Haris','Harun','Hasyim',
    'Hilmy','Humam','Husain','Husein','Idris','Ihsan','Ilham',
    'Imran','Irfan','Ismail','Jabir','Jalal','Jamaluddin','Kamil',
    'Karim','Khalid','Khoirul','Luthfi','Mahfud','Mansur','Marwan',
    'Miftah','Muhaimin','Musa','Mustafa','Nafi','Naufal','Naufan',
    'Nawawi','Nizar','Rafiq','Raihan','Rajab','Ramadan','Rasyid',
    'Ridho','Rifqi','Riza','Rusdi','Sabri','Safwan','Salim',
    'Salman','Samir','Sholeh','Sidiq','Sulaiman','Syafi\'i','Syahrul',
    'Syarif','Taufik','Usman','Wahid','Walid','Yahya','Yazid',
    'Zakariya','Zaidan','Zaki','Zulkifli','Azzam','Hanif','Habib',
    'Nabil','Maulana','Anwar','Ikhsan','Daffa','Farhan','Fikri',
    'Farel','Raffa','Rafi','Naufal','Asyraf',
  ],
  islami_perempuan: [
    'Aisah','Aliya','Amira','Anisa','Annisa','Aqila','Arafah',
    'Arini','Asma','Atika','Azizah','Badriyah','Dina','Dzakiyah',
    'Fadhilah','Faizah','Fariha','Fauziah','Fitriah','Ghina',
    'Hadijah','Hafshah','Halimah','Hamidah','Hanifah','Hasanah',
    'Hasnah','Hayati','Hilwana','Humairah','Husna','Inayah',
    'Isna','Istiqomah','Jazilah','Jihan','Khadijah','Khoiriyah',
    'Laila','Latifah','Lina','Lubna','Luthfiah','Madinah',
    'Maimunah','Malika','Mariam','Marwa','Mawaddah','Mutiara',
    'Nadhira','Naila','Najwa','Naura','Nazira','Nisa','Nisrina',
    'Nur Aini','Nur Azizah','Nur Hidayah','Nurhayati','Rahmawati',
    'Raisa','Rania','Raudah','Rifda','Robiatul','Romlah',
    'Ruqayyah','Safa','Safura','Sahla','Salsabila','Salwa',
    'Samira','Sarah','Shafira','Shifa','Shofia','Silmi',
    'Sumayyah','Syarifah','Ulfa','Uswatun','Wardah','Wardatun',
    'Widad','Wulandari','Yasmin','Yuhanida','Zainab','Zakiyah',
    'Zulfah','Zulfa','Khairunisa','Halimah','Laila','Mariam',
    'Nadia','Hana','Zahra','Fatimah','Nayla','Keisha','Zara',
  ],
  jawa: [
    'Agus','Anom','Aris','Arjo','Arso','Bagus','Bambang',
    'Basuki','Bekti','Bimo','Cahyo','Cipto','Darmo','Darsono',
    'Dasuki','Didik','Didit','Dimas','Dono','Edhi','Edy',
    'Endro','Galuh','Gandung','Gareng','Gatot','Ginanjar',
    'Handoko','Hargo','Harjono','Harno','Harto','Heru','Imam',
    'Iwan','Jatmiko','Joko','Jumadi','Kahono','Kalono','Kuncoro',
    'Kusno','Laksono','Lantip','Mardi','Margono','Mulyadi',
    'Mulyono','Nono','Panji','Parno','Parto','Poniman',
    'Prasetyo','Prayogo','Priyo','Priyono','Pudjo','Purwanto',
    'Raharjo','Rajo','Rano','Ranto','Rejo','Rino','Rinto',
    'Rohmad','Sarwono','Setyawan','Sigit','Slamet','Sugeng',
    'Suharto','Suhud','Sujono','Sukamto','Sukarno','Sukoco',
    'Sulistyo','Sumadi','Sumardi','Sumarno','Sunaryo','Sunarto',
    'Supardi','Suryadi','Suryanto','Sutarno','Sutejo','Sutikno',
    'Sutopo','Sutrisno','Suwandi','Suwanto','Tohari','Triyanto',
    'Warsito','Widodo','Widyanto','Winarto','Wiranto','Wisnu',
    'Wuryanto','Yanto','Yudi','Yulianto','Yuwono','Zaenal',
    'Setyawati','Suci','Sunarti','Supartini','Supini','Supriyati',
    'Suryani','Susanti','Susilawati','Suwarti','Tini','Tuminah',
    'Tutik','Wahyuni','Wati','Widyawati','Wulan','Yayuk',
    'Yeti','Yuli','Endah','Larasati','Sekar','Sri Wahyuni',
    'Setianingsih','Saraswati','Firman','Cahyo','Galih','Bagas',
    'Gilang','Bayu','Tegar','Gunawan','Andika','Prasetyo',
  ],
  sansekerta: [
    'Abhirama','Adhi','Adhitya','Aditya','Agni','Ananda',
    'Anindya','Anjali','Arjuna','Artha','Baskara','Bhaskara',
    'Brahmantyo','Cakra','Citrawati','Damar','Dharma','Dharmawan',
    'Diwangkara','Dyah','Gandewa','Hendra','Herawan','Indira',
    'Intan','Jayanti','Jendra','Karna','Kartika','Kesuma',
    'Kumara','Kumari','Laksmi','Lila','Lingga','Mahendra',
    'Maheswara','Mandala','Maya','Padma','Pandu','Paramita',
    'Parwati','Pasupati','Prabawa','Prabowo','Pradipa','Pradipta',
    'Prajna','Prana','Prasasti','Pratama','Prithvi','Puja',
    'Purna','Putu','Radhe','Rajendra','Ratih','Ratna Dewi',
    'Ratnasari','Rendra','Restu','Rudra','Saraswati','Satria',
    'Satrya','Shakti','Shanty','Sita','Siwa','Subhadra',
    'Subrata','Sukma','Sumitra','Sunita','Supraba','Supriya',
    'Swastika','Tara','Trisna','Uma','Utama','Utami','Veda',
    'Vidya','Vikrama','Virama','Wibisono','Widura','Wirawan',
    'Wisesa','Yama','Yudha','Yudhistira','Yoga','Raka','Gita',
    'Citra','Ratna','Kusuma','Mahendra','Pradita','Arya',
  ],
  modern: [
    'Abel','Adam','Adela','Adeline','Adriel','Agatha','Agnes',
    'Alan','Albert','Albet','Alden','Alek','Alena','Alexa',
    'Alexander','Alexia','Alfred','Alice','Alicia','Alika',
    'Alina','Alisa','Alisha','Alissa','Allen','Alma','Alvin',
    'Alvino','Alya','Alyssa','Amanda','Amara','Amber','Amelie',
    'Amelia','Andrea','Andrew','Angel','Angela','Angeline',
    'Angelique','Angie','Anita','Anna','Annabel','Anne',
    'Annelies','Anthony','Antonius','Anya','April','Ara','Ariel',
    'Armand','Arthur','Arvin','Asher','Ashley','Astrid','Athena',
    'Atticus','Austin','Autumn','Ava','Axel','Azel','Bela',
    'Benedict','Benjamin','Betty','Bianca','Billy','Brandon',
    'Brian','Brianna','Brielle','Bryan','Bryant','Calvin',
    'Camille','Carla','Carlos','Carmen','Carol','Caroline',
    'Catharina','Catherine','Charles','Charlotte','Chelsea',
    'Cheryl','Chris','Christian','Christina','Christine',
    'Christopher','Clara','Clarissa','Claudia','Clement',
    'Daniel','Daniella','Debora','Dennis','Derrick','Dessy',
    'Diana','Dinda','Dion','Dira','Donald','Donna','Edward',
    'Edwin','Eleanor','Elena','Elias','Elisabeth','Elisa',
    'Elizabeth','Ella','Ellen','Elsa','Emily','Emma','Eric',
    'Erica','Ernest','Erwin','Ethan','Eva','Evan','Faith',
    'Felix','Fiona','Frances','Francis','Frank','Frederick',
    'Gabriel','Gabriella','George','Gerald','Geraldine','Gloria',
    'Grace','Hannah','Henry','Hugo','Irene','Ivan','James',
    'Jane','Jason','Jennifer','Jeremy','Jonathan','Joseph',
    'Joshua','Julia','Julian','Karen','Katherine','Laura',
    'Lauren','Leonard','Linda','Lisa','Lucas','Luke','Marco',
    'Maria','Mark','Martin','Matthew','Michael','Michelle',
    'Natasha','Nicholas','Nicole','Olivia','Oscar','Patrick',
    'Paul','Peter','Philip','Rachel','Rebecca','Richard',
    'Robert','Ronald','Ryan','Samuel','Sandra','Sara','Sophia',
    'Stefan','Steven','Susan','Thomas','Timothy','Tony','Victor',
    'Victoria','Vincent','William','Yvonne',
  ],
  daerah: [
    'Asep','Ujang','Neng','Dede','Euis','Eni','Cecep',
    'Hasibuan','Situmorang','Pardede','Nauli','Siagian','Lumbantobing',
    'Andi','Tenri','Daeng','Puang','Karaeng',
    'Sutan','Puti','Malin','Cindua',
    'Wayan','Made','Nyoman','Ketut','Agung','Alit','Gde','Ngurah',
    'Ni Luh','Ni Made','Ni Putu','Ni Wayan',
    'Raden','Gusti','Ida Bagus','Tjokorda',
    'Boru','Nai','Ompu',
  ],
};

// ================================================================
// GENERATE BATCH DENGAN CLAUDE HAIKU (LEBIH MURAH)
// ================================================================
async function generateBatch(namaList, kategori) {
  const prompt = `Kamu ahli onomastik Indonesia. Berikan data LENGKAP dan AKURAT untuk nama-nama berikut.
Kembalikan HANYA JSON array valid (tanpa markdown, tanpa backtick, tanpa komentar):

[
  {
    "nama": "nama persis seperti di input",
    "asal_bahasa": "Arab/Jawa/Sansekerta/Modern/Ibrani/Sunda/Batak/Bugis/Bali/Minang/Inggris/dll",
    "kode_bahasa": "ar/jv/sa/en/he/su/btk/bug/ban/ms/nl",
    "makna_singkat": "makna dalam 10-20 kata, akurat dan puitis",
    "makna_detail": "penjelasan lengkap 2-3 kalimat mencakup etimologi dan filosofi nama",
    "arti_arab": "tulisan Arab jika nama Arab, KOSONG jika bukan Arab",
    "transliterasi": "transliterasi Arab jika ada, KOSONG jika tidak ada",
    "gender": "L atau P atau N",
    "kategori": "${kategori}",
    "agama": "Islam/Kristen/Hindu/Universal",
    "sifat_positif": ["sifat1","sifat2","sifat3"],
    "sifat_perhatian": ["perhatian1","perhatian2"]
  }
]

Nama yang harus dianalisis: ${namaList.join(', ')}

WAJIB: Setiap nama HARUS ada datanya. Jika nama kurang dikenal, analisis dari konteks budaya dan bahasa asalnya.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', // Haiku: lebih murah untuk batch
          max_tokens: 4096,
          temperature: 0.2,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const raw   = data.content.map(c => c.text || '').join('');
      let jsonStr = raw.replace(/```json|```/g, '').trim();
      const s = jsonStr.indexOf('[');
      const e = jsonStr.lastIndexOf(']');
      if (s !== -1 && e !== -1) jsonStr = jsonStr.slice(s, e + 1);

      return JSON.parse(jsonStr);
    } catch (err) {
      console.error(`  Attempt ${attempt + 1} error:`, err.message);
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return [];
}

async function simpanBatch(items) {
  let sukses = 0;
  for (const item of items) {
    try {
      await db.query(
        `INSERT INTO nama_dasar
           (nama, asal_bahasa, kode_bahasa, makna_singkat, makna_detail,
            arti_arab, transliterasi, gender, kategori, agama,
            sifat_positif, sifat_perhatian, sumber, terverifikasi)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ai',false)
         ON CONFLICT (nama) DO NOTHING`,
        [
          item.nama, item.asal_bahasa, item.kode_bahasa,
          item.makna_singkat, item.makna_detail,
          item.arti_arab || '', item.transliterasi || '',
          item.gender || 'N', item.kategori || 'Umum',
          item.agama || 'Universal',
          item.sifat_positif || [], item.sifat_perhatian || [],
        ]
      );
      sukses++;
    } catch (err) {
      console.error(`    ❌ "${item.nama}": ${err.message}`);
    }
  }
  return sukses;
}

// ================================================================
// MAIN
// ================================================================
async function main() {
  console.log('🚀 MaknaName — Pre-populate Database');
  console.log('======================================');
  console.log('Model  : Claude Haiku (lebih hemat)');
  console.log('Target : ~1000 nama Indonesia');
  console.log('======================================\n');

  // Test koneksi
  try {
    await db.query('SELECT 1');
    console.log('✅ Database connected\n');
  } catch (err) {
    console.error('❌ Database failed:', err.message);
    process.exit(1);
  }

  const log     = { mulai: new Date().toISOString(), detail: [] };
  let totalOK   = 0;
  let totalFail = 0;
  const BATCH   = 15;   // 15 nama per request
  const DELAY   = 1500; // 1.5 detik antar batch

  for (const [kat, daftar] of Object.entries(NAMA_LIST)) {
    console.log(`\n📦 Kategori: ${kat} (${daftar.length} nama)`);
    console.log('─'.repeat(45));

    const katLog = { kategori: kat, sukses: 0, gagal: 0 };

    for (let i = 0; i < daftar.length; i += BATCH) {
      const batch    = daftar.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;
      const total    = Math.ceil(daftar.length / BATCH);

      process.stdout.write(`  [${batchNum}/${total}] ${batch[0]}... `);

      const hasil = await generateBatch(batch, kat);
      if (hasil.length > 0) {
        const ok = await simpanBatch(hasil);
        totalOK     += ok;
        katLog.sukses += ok;
        console.log(`✅ ${ok}/${batch.length}`);
      } else {
        totalFail += batch.length;
        katLog.gagal += batch.length;
        console.log('❌');
      }

      if (i + BATCH < daftar.length) {
        await new Promise(r => setTimeout(r, DELAY));
      }
    }

    log.detail.push(katLog);
  }

  // Statistik akhir
  const statsRes = await db.query('SELECT * FROM v_statistik');
  const stats    = statsRes.rows[0];

  const summary = {
    ...log,
    selesai: new Date().toISOString(),
    hasil: { sukses: totalOK, gagal: totalFail },
    total_db: stats,
  };

  await fs.writeFile('populate_log.json', JSON.stringify(summary, null, 2));

  console.log('\n\n══════════════════════════════════════');
  console.log('✅ Pre-populate SELESAI!');
  console.log('══════════════════════════════════════');
  console.log(`Sukses     : ${totalOK} nama`);
  console.log(`Gagal      : ${totalFail} nama`);
  console.log(`Total DB   : ${stats.total_nama} nama`);
  console.log(`Log        : populate_log.json`);
  console.log('══════════════════════════════════════\n');

  await db.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
