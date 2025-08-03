// src/app/api/upload/route.ts (Versi Lengkap dengan Login Pengguna & CSV)

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";
import fs from "fs";
import { promises as fsPromises } from "fs";
import path from "path";
import csv from "csv-parser";

// =================================================================
// FUNGSI-FUNGSI HELPER
// =================================================================

/**
 * Mengubah Web Stream (dari file upload) menjadi Node.js Readable Stream
 * yang bisa dibaca oleh Google API.
 */
function webStreamToNodeStream(
  webStream: ReadableStream<Uint8Array>
): NodeJS.ReadableStream {
  const reader = webStream.getReader();
  return new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) {
        this.push(null); // Menandakan akhir dari stream
      } else {
        this.push(Buffer.from(value));
      }
    },
  });
}

/**
 * Tipe data untuk setiap baris di file CSV.
 */
interface GameData {
  appid: string;
  name: string;
}

/**
 * Membaca dan mem-parsing file game_data.csv dari root proyek.
 * Mengembalikan array objek data game.
 */
const readGameDataFromCSV = (): Promise<GameData[]> => {
  return new Promise((resolve, reject) => {
    const results: GameData[] = [];
    const filePath = path.join(process.cwd(), "game_data.csv");

    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => {
        resolve(results);
      })
      .on("error", (error) => {
        reject(error);
      });
  });
};

// =================================================================
// FUNGSI UTAMA API (ENDPOINT)
// =================================================================

export async function POST(req: NextRequest) {
  try {
    // 1. Dapatkan Token Otorisasi dari Pengguna
    // ---------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token otorisasi tidak valid atau tidak ditemukan." },
        { status: 401 }
      );
    }
    const accessToken = authHeader.split(" ")[1];

    // 2. Siapkan Klien Google API dengan Token Pengguna
    // ----------------------------------------------------
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    // Buat instance Google Drive yang sudah terotentikasi sebagai pengguna
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!;

    // 3. Proses File yang Di-upload
    // -------------------------------
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "File tidak ditemukan di dalam request." },
        { status: 400 }
      );
    }

    // 4. Dapatkan Nama Game Baru dari File CSV
    // -----------------------------------------
    const originalFilename = file.name;
    const matches = originalFilename.match(/_(\d+)_/);
    if (!matches || !matches[1]) {
      return NextResponse.json(
        {
          error: `Format nama file salah. AppID tidak ditemukan pada: ${originalFilename}`,
        },
        { status: 400 }
      );
    }
    const appId = matches[1];

    const gameDatabase = await readGameDataFromCSV();
    const game = gameDatabase.find((g) => g.appid === appId);

    if (!game) {
      return NextResponse.json(
        {
          error: `Game dengan AppID ${appId} tidak ditemukan di file game_data.csv.`,
        },
        { status: 404 }
      );
    }

    // Bersihkan nama game dari karakter ilegal untuk nama file
    const gameName = game.name.replace(/[^\w\s.-]/gi, "_");
    const newFileName = `${gameName}.zip`;

    // 5. Cek Duplikat File di Google Drive
    // --------------------------------------
    const listResponse = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name='${newFileName}' and trashed=false`,
      fields: "files(id)",
    });

    if (listResponse.data.files && listResponse.data.files.length > 0) {
      return NextResponse.json(
        { error: `File "${newFileName}" sudah ada di Google Drive Anda.` },
        { status: 409 }
      );
    }

    // 6. Upload File ke Google Drive
    // --------------------------------
    const driveResponse = await drive.files.create({
      requestBody: {
        name: newFileName,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: file.type,
        body: webStreamToNodeStream(file.stream()),
      },
      fields: "id, webViewLink",
    });

    // 7. Simpan Riwayat ke File JSON Lokal
    // ------------------------------------
    const historyFilePath = path.join(
      process.cwd(),
      "src",
      "data",
      "history.json"
    );
    const currentHistoryRaw = await fsPromises.readFile(
      historyFilePath,
      "utf8"
    );
    const currentHistory = JSON.parse(currentHistoryRaw);

    const newHistoryEntry = {
      _id: new Date().getTime().toString(), // Membuat ID unik sederhana
      gameName: gameName,
      driveLink: driveResponse.data.webViewLink,
      uploadDate: new Date().toISOString(),
    };

    currentHistory.unshift(newHistoryEntry); // Tambahkan entri baru ke awal array

    // Tulis kembali seluruh data riwayat ke file
    await fsPromises.writeFile(
      historyFilePath,
      JSON.stringify(currentHistory, null, 2)
    );

    // 8. Kirim Respon Sukses
    // -----------------------
    return NextResponse.json(
      {
        message: `File "${newFileName}" berhasil diupload ke Google Drive Anda!`,
        data: newHistoryEntry,
      },
      { status: 201 }
    );
  } catch (error: any) {
    // Penanganan Error
    console.error(
      "SERVER ERROR:",
      error.response?.data || error.message || error
    );
    return NextResponse.json(
      {
        error: "Terjadi kesalahan internal pada server.",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
