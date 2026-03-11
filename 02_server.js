// ================================================================
// MAKNANAME — Backend Server (Node.js + Express)
// File: server.js
// Sistem 3 Lapis: Database → Wikidata → Claude AI
// JAMINAN: Setiap nama PASTI mendapat hasil — tidak pernah gagal
// ================================================================

import express from 'express';
import pg from 'pg';
import fetch from 'node-fetch';
import crypto from 'crypto';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app  = express();
const { Pool } = pg;

// ================================================================
// DATABASE CONNECTION
// ================================================================
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on('error', (err) => console.error('DB Pool Error:', err.message));

// ================================================================
// MIDDLEWARE
// ================================================================
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// Rate limiting — cegah abuse
const limiter = rateLimit({
  windowMs: 60 * 1000,      // 1 menit
  max: 30,                   // max 30 request per menit per IP
  message: { error: 'Terlalu banyak permintaan. Coba lagi dalam 1 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ================================================================
// UTILITY
// ================================================================
const md5 = (str) => crypto.createHash('md5').update(str.toLowerCase().trim()).digest('hex');
const normalize = (str) => str.toLowerCase().trim().replace(/\s+/g, ' ');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Pythagoras numerologi
function hitungNumerologi(nama) {
  const map = { a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:8,i:9,
                j:1,k:2,l:3,m:4,n:5,o:6,p:7,q:8,r:9,
                s:1,t:2,u:3,v:4,w:5,x:6,y:7,z:8 };
  const digits = nama.toLowerCase().replace(/[^a-z]/g,'').split('').map(c => map[c] || 0);
  let sum = digits.reduce((a,b) => a+b, 0);
  while (sum > 9) sum = String(sum).split('').reduce((a,b) => a + parseInt(b), 0);
  return sum;
}

// ================================================================
// LAPIS 1 — DATABASE LOKAL
// ================================================================
async function dariDatabase(namaBagian) {
  try {
    const { rows } = await db.query(
      `SELECT * FROM nama_dasar WHERE LOWER(nama) = LOWER($1) LIMIT 1`,
      [namaBagian.trim()]
    );
    if (rows.length > 0) {
      db.query(
        `UPDATE nama_dasar SET popularitas = popularitas + 1 WHERE LOWER(nama) = LOWER($1)`,
        [namaBagian.trim()]
      ).catch(() => {});
      return { sumber: 'db', data: rows[0] };
    }
    return null;
  } catch { return null; }
}

async function cekCache(namaLengkap) {
  try {
    const { rows } = await db.query(
      `SELECT hasil_json FROM cache_analisis
       WHERE nama_hash = $1
       AND dibuat_pada > NOW() - INTERVAL '60 days'
       LIMIT 1`,
      [md5(namaLengkap)]
    );
    if (rows.length > 0) {
      db.query(
        `UPDATE cache_analisis SET jumlah_akses = jumlah_akses + 1,
         terakhir_akses = NOW() WHERE nama_hash = $1`,
        [md5(namaLengkap)]
      ).catch(() => {});
      return rows[0].hasil_json;
    }
    return null;
  } catch { return null; }
}

async function simpanCache(namaLengkap, json, sumber = 'ai') {
  try {
    await db.query(
      `INSERT INTO cache_analisis (nama_lengkap, nama_hash, hasil_json, sumber)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (nama_hash) DO UPDATE
       SET hasil_json=$3, sumber=$4, terakhir_akses=NOW(),
           jumlah_akses = cache_analisis.jumlah_akses + 1`,
      [namaLengkap.trim(), md5(namaLengkap), JSON.stringify(json), sumber]
    );
  } catch (err) {
    console.error('simpanCache error:', err.message);
  }
}

async function simpanNamaBaru(nama, data) {
  try {
    await db.query(
      `INSERT INTO nama_dasar
         (nama, asal_bahasa, kode_bahasa, makna_singkat, makna_detail,
          arti_arab, transliterasi, gender, kategori, agama,
          sifat_positif, sifat_perhatian, sumber, terverifikasi, popularitas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ai',false,1)
       ON CONFLICT (nama) DO NOTHING`,
      [
        nama,
        data.asalBahasa    || 'Universal',
        data.kodeBahasa    || null,
        data.makna         || data.maknaSingkat || null,
        data.maknaDetail   || null,
        data.artiArab      || null,
        data.transliterasi || null,
        data.gender        || 'N',
        data.kategori      || 'Modern',
        data.agama         || 'Universal',
        data.sifatPositif  || [],
        data.sifatPerhatian|| [],
      ]
    );
  } catch (err) {
    console.error('simpanNamaBaru error:', err.message);
  }
}

// ================================================================
// LAPIS 2 — WIKIDATA (GRATIS)
// ================================================================
async function dariWikidata(namaBagian) {
  try {
    const query = `
      SELECT DISTINCT ?itemLabel ?desc ?originLabel WHERE {
        { ?item wdt:P31 wd:Q202444 . ?item rdfs:label "${namaBagian}"@id . }
        UNION
        { ?item wdt:P31 wd:Q202444 . ?item rdfs:label "${namaBagian}"@en . }
        OPTIONAL { ?item wdt:P364 ?origin }
        OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc)="id") }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "id,en" }
      } LIMIT 2
    `;
    const url  = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 4000);

    const res  = await fetch(url, {
      headers: { 'User-Agent': 'MaknaName/2.0 (+https://maknaname.id)', Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);

    const data = await res.json();
    const b    = data?.results?.bindings?.[0];
    if (!b) return null;

    return {
      sumber: 'wikidata',
      data: {
        nama:         namaBagian,
        makna:        b.desc?.value || b.itemLabel?.value || null,
        asalBahasa:   b.originLabel?.value || null,
      },
    };
  } catch {
    return null;
  }
}

// ================================================================
// LAPIS 3 — CLAUDE AI (JAMINAN 100% BERHASIL)
// ================================================================

// Prompt sangat detail agar AI selalu menghasilkan data valid
function buatPromptAnalisis(namaLengkap, konteksNama) {
  return `Kamu adalah Dr. Ahmad Fauzi, ahli onomastik (ilmu nama) dan linguistik Indonesia paling terkemuka dengan 30 tahun pengalaman. Kamu telah meneliti lebih dari 500.000 nama Indonesia dari berbagai suku, agama, dan budaya.

TUGAS: Analisis nama lengkap "${namaLengkap}" secara SANGAT MENDALAM dan AKURAT.

KONTEKS YANG SUDAH DIKETAHUI:
${konteksNama.length > 0 ? konteksNama.map(n => `- "${n.nama}": ${n.info}`).join('\n') : '- Belum ada data, silakan analisis dari awal'}

ATURAN PENTING:
1. Setiap nama HARUS memiliki data — tidak boleh ada yang "tidak diketahui"
2. Jika nama berasal dari bahasa asing, jelaskan asal usulnya
3. Jika nama tidak ditemukan dalam database, analisis berdasarkan fonologi dan konteks budaya Indonesia
4. Untuk nama yang sangat umum di Indonesia tapi tidak tercatat, tetap berikan analisis bermakna
5. Numerologi menggunakan sistem Pythagorean
6. Tokoh terkenal harus NYATA dan bisa diverifikasi

Kembalikan HANYA JSON valid (tanpa markdown, tanpa backtick, tanpa komentar, tanpa penjelasan):

{
  "namaLengkap": "${namaLengkap}",
  "ringkasan": "satu kalimat puitis yang menggambarkan esensi nama ini secara menyeluruh",
  "kategoriJenis": "Islami/Jawa/Sansekerta/Modern/Nasional/Campuran/Kristen/Batak/Sunda/Bali",
  "cocokUntuk": "Laki-laki/Perempuan/Netral",
  "bagianNama": [
    {
      "nama": "nama bagian pertama",
      "asalBahasa": "Arab/Jawa/Sansekerta/Ibrani/Inggris/Belanda/Batak/Sunda/Bugis/Bali/Modern",
      "badge": "arabic/java/sanskrit/hebrew/english/dutch/local/modern",
      "makna": "penjelasan makna mendalam 2-3 kalimat, mencakup etimologi dan filosofi di balik nama",
      "artiArab": "tulisan Arab jika nama berasal dari bahasa Arab, kosongkan jika tidak",
      "transliterasi": "cara baca Arab jika ada, kosongkan jika tidak"
    }
  ],
  "maknaMenyeluruh": "paragraf 4-5 kalimat yang mengintegrasikan makna semua bagian nama secara puitis, bermakna, dan relevan dengan harapan orang tua Indonesia. Ceritakan narasi yang indah tentang siapa pemilik nama ini seharusnya",
  "numerologi": {
    "angkaJiwa": 7,
    "angkaEkspresi": 3,
    "angkaTakdir": 5,
    "penjelasanJiwa": "karakter jiwa pemilik angka ini (2 kalimat)",
    "penjelasanEkspresi": "bagaimana ia mengekspresikan diri (2 kalimat)",
    "penjelasanTakdir": "perjalanan takdir dan tujuan hidup (2 kalimat)"
  },
  "sifatPositif": ["sifat1", "sifat2", "sifat3", "sifat4", "sifat5", "sifat6"],
  "catatanKarakter": ["hal yang perlu diwaspadai 1", "hal yang perlu diwaspadai 2"],
  "unsurAlam": "Tanah/Air/Api/Udara/Eter — unsur alam yang dominan",
  "warnaNama": "warna yang merepresentasikan nama ini",
  "tokohTerkenal": [
    {
      "nama": "nama tokoh Indonesia yang nyata",
      "peran": "profesi atau peran yang dikenal",
      "inisial": "2-3 huruf kapital inisial"
    }
  ],
  "doa": "doa atau harapan yang terkandung dalam nama ini dalam 1 kalimat"
}

CATATAN NUMEROLOGI PYTHAGOREAN:
A=1,B=2,C=3,D=4,E=5,F=6,G=7,H=8,I=9,J=1,K=2,L=3,M=4,N=5,O=6,P=7,Q=8,R=9,S=1,T=2,U=3,V=4,W=5,X=6,Y=7,Z=8
Jumlahkan nilai huruf, lalu reduksi ke 1-9 (kecuali 11, 22, 33 = angka master).
Angka Jiwa = hanya vokal, Angka Ekspresi = semua huruf, Angka Takdir = tanggal lahir (jika tidak ada, gunakan angka ekspresi).`;
}

async function dariClaude(namaLengkap, konteksNama, retryCount = 0) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0.3,   // rendah = konsisten, tidak halusinasi
        messages: [{
          role: 'user',
          content: buatPromptAnalisis(namaLengkap, konteksNama),
        }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Claude API ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const raw  = data.content.map(c => c.text || '').join('');

    // Ekstrak JSON dari response
    let jsonStr = raw.trim();

    // Hapus markdown code block jika ada
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();

    // Cari kurung kurawal pertama
    const start = jsonStr.indexOf('{');
    const end   = jsonStr.lastIndexOf('}');
    if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1);

    const parsed = JSON.parse(jsonStr);

    // Validasi field wajib
    const required = ['namaLengkap', 'bagianNama', 'maknaMenyeluruh', 'numerologi'];
    for (const field of required) {
      if (!parsed[field]) throw new Error(`Field "${field}" tidak ada`);
    }

    return parsed;

  } catch (err) {
    console.error(`Claude error (attempt ${retryCount + 1}):`, err.message);

    if (retryCount < 2) {
      await sleep(1500 * (retryCount + 1));
      return dariClaude(namaLengkap, konteksNama, retryCount + 1);
    }

    // FALLBACK DARURAT — jika Claude gagal 3x, buat data minimal yang valid
    console.warn('FALLBACK DARURAT digunakan untuk:', namaLengkap);
    return buatFallbackData(namaLengkap);
  }
}

// Fallback darurat — dipastikan selalu return data valid
function buatFallbackData(namaLengkap) {
  const bagian = namaLengkap.trim().split(/\s+/).map(n => ({
    nama: n,
    asalBahasa: 'Indonesia',
    badge: 'local',
    makna: `${n} adalah nama yang indah yang dipakai di Indonesia. Nama ini memiliki keunikan tersendiri yang mencerminkan identitas dan harapan orang tua bagi sang pemilik nama.`,
    artiArab: '',
    transliterasi: '',
  }));

  const angka = hitungNumerologi(namaLengkap);
  const penjelasanAngka = {
    1: 'Jiwa pemimpin yang mandiri dan penuh inisiatif',
    2: 'Jiwa yang diplomatis, sensitif, dan penuh kasih',
    3: 'Jiwa yang kreatif, ekspresif, dan penuh inspirasi',
    4: 'Jiwa yang terstruktur, disiplin, dan dapat diandalkan',
    5: 'Jiwa yang bebas, adaptif, dan penuh petualangan',
    6: 'Jiwa yang penuh kasih, pengasuh, dan bertanggung jawab',
    7: 'Jiwa yang spiritual, analitis, dan pencari kebenaran',
    8: 'Jiwa yang ambisius, praktis, dan berorientasi sukses',
    9: 'Jiwa yang bijaksana, humanis, dan penuh kasih universal',
  };

  return {
    namaLengkap,
    ringkasan: `${namaLengkap} adalah nama yang mengandung harapan indah dan doa yang tulus dari orang tua.`,
    kategoriJenis: 'Nasional',
    cocokUntuk: 'Netral',
    bagianNama: bagian,
    maknaMenyeluruh: `Nama ${namaLengkap} merupakan perpaduan indah yang mencerminkan harapan dan doa tulus orang tua Indonesia. Setiap unsur dalam nama ini dipilih dengan penuh kasih, membawa serta doa agar sang pemilik nama tumbuh menjadi pribadi yang mulia, bermanfaat, dan dicintai oleh sesama. Nama ini adalah warisan paling berharga yang diberikan orang tua kepada anak, mengandung seluruh harapan dan cinta yang tidak terhingga.`,
    numerologi: {
      angkaJiwa: angka,
      angkaEkspresi: angka,
      angkaTakdir: angka,
      penjelasanJiwa: penjelasanAngka[angka] || 'Jiwa yang unik dan penuh potensi',
      penjelasanEkspresi: 'Mengekspresikan diri dengan cara yang khas dan berpengaruh pada orang sekitar.',
      penjelasanTakdir: 'Perjalanan hidup penuh makna menuju tujuan mulia yang telah digariskan.',
    },
    sifatPositif: ['Unik', 'Berpotensi', 'Penuh semangat', 'Adaptif', 'Bermakna'],
    catatanKarakter: ['Perlu mengenali diri lebih dalam', 'Kembangkan keunikan sebagai kekuatan'],
    unsurAlam: 'Tanah',
    warnaNama: 'Biru',
    tokohTerkenal: [{ nama: 'Berbagai tokoh Indonesia', peran: 'Berbagi nama yang sama', inisial: 'ID' }],
    doa: `Semoga ${namaLengkap} tumbuh menjadi pribadi yang mulia, bermanfaat, dan dicintai oleh semua.`,
  };
}

// ================================================================
// ENGINE UTAMA — 3 Lapis
// ================================================================
async function analisaNama(namaLengkap) {
  const bagianNama = namaLengkap.trim().split(/\s+/);

  // Resolve setiap bagian nama secara paralel
  const resolveAll = bagianNama.map(async (nama) => {
    const fromDB = await dariDatabase(nama);
    if (fromDB) return { nama, sumber: 'db', info: fromDB.data.makna_singkat || nama };

    const fromWD = await dariWikidata(nama);
    if (fromWD) {
      await simpanNamaBaru(nama, fromWD.data);
      return { nama, sumber: 'wikidata', info: fromWD.data.makna || nama };
    }

    return { nama, sumber: 'ai_needed', info: null };
  });

  const konteks = await Promise.all(resolveAll);

  // Semua nama → analisis lengkap Claude
  const hasil = await dariClaude(namaLengkap, konteks);

  // Auto-simpan nama baru ke database
  for (const bagian of (hasil.bagianNama || [])) {
    const sudahAda = konteks.find(k => k.nama.toLowerCase() === bagian.nama.toLowerCase() && k.sumber === 'db');
    if (!sudahAda) {
      await simpanNamaBaru(bagian.nama, {
        asalBahasa: bagian.asalBahasa,
        makna: bagian.makna,
        artiArab: bagian.artiArab,
        transliterasi: bagian.transliterasi,
      });
    }
  }

  return hasil;
}

// ================================================================
// ROUTES
// ================================================================

// Health check
app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// MAIN: Analisis nama lengkap
app.post('/api/analisis', async (req, res) => {
  const t0 = Date.now();
  try {
    const { nama } = req.body;
    if (!nama || typeof nama !== 'string' || nama.trim().length < 2) {
      return res.status(400).json({ error: 'Nama minimal 2 karakter.' });
    }
    if (nama.trim().length > 200) {
      return res.status(400).json({ error: 'Nama terlalu panjang (max 200 karakter).' });
    }

    const namaLengkap = nama.trim();

    // Cek cache dulu
    const cached = await cekCache(namaLengkap);
    if (cached) {
      return res.json({
        ...cached,
        _meta: { sumber: 'cache', durasi: Date.now() - t0 },
      });
    }

    const hasil = await analisaNama(namaLengkap);
    await simpanCache(namaLengkap, hasil, 'ai');

    // Log (non-blocking)
    db.query(
      `INSERT INTO log_pencarian (nama_dicari, durasi_ms, sumber) VALUES ($1,$2,'ai')`,
      [namaLengkap, Date.now() - t0]
    ).catch(() => {});

    res.json({ ...hasil, _meta: { sumber: 'ai', durasi: Date.now() - t0 } });

  } catch (err) {
    console.error('POST /api/analisis error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan server. Silakan coba lagi.', detail: err.message });
  }
});

// Lookup satu nama
app.get('/api/nama/:nama', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM nama_dasar WHERE LOWER(nama) = LOWER($1) LIMIT 1`,
      [req.params.nama]
    );
    if (!rows.length) return res.status(404).json({ error: 'Nama tidak ditemukan.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Statistik database
app.get('/api/statistik', async (_req, res) => {
  try {
    const [stats, cache, terpopuler] = await Promise.all([
      db.query('SELECT * FROM v_statistik'),
      db.query('SELECT * FROM v_cache_stats'),
      db.query('SELECT nama, popularitas, asal_bahasa FROM nama_dasar ORDER BY popularitas DESC LIMIT 20'),
    ]);
    res.json({
      database: stats.rows[0],
      cache:    cache.rows[0],
      terpopuler: terpopuler.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Nama populer dengan filter
app.get('/api/populer', async (req, res) => {
  try {
    const { kategori, gender, limit = '20', q } = req.query;
    const params = [];
    const conds  = [];

    if (kategori) { params.push(kategori); conds.push(`kategori=$${params.length}`); }
    if (gender)   { params.push(gender);   conds.push(`gender=$${params.length}`);   }
    if (q)        { params.push(`%${q}%`); conds.push(`LOWER(nama) LIKE LOWER($${params.length})`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(Math.min(parseInt(limit) || 20, 100));

    const { rows } = await db.query(
      `SELECT nama, asal_bahasa, gender, kategori, makna_singkat, popularitas
       FROM nama_dasar ${where}
       ORDER BY popularitas DESC LIMIT $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Autocomplete
app.get('/api/autocomplete', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const { rows } = await db.query(
      `SELECT nama, makna_singkat, asal_bahasa, gender FROM nama_dasar
       WHERE LOWER(nama) LIKE LOWER($1)
       ORDER BY popularitas DESC LIMIT 8`,
      [`${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// ================================================================
// START
// ================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🌟 MaknaName Backend v2.0             ║
║   Port    : ${PORT}                        ║
║   Sistem  : DB → Wikidata → Claude AI   ║
║   Jaminan : 100% nama PASTI ada data    ║
╚══════════════════════════════════════════╝
  `);
});

export default app;
